/**
 * =============================================================================================
 * Google Health adapter
 * =====================
 * Adapter contract:
 *   ensureAccessToken(context)  → { accessToken, expiresAt }
 *   pullChanges(context, opts)  → { events[], nextCursor, hasMore }
 *   getProperties()             → [{ name, valueType }]
 *
 * context = { accountID, provider, accessToken, refreshToken, expiresAt, metadata }
 * opts    = { cursor, pageLimit }
 *
 * Events use uuid = context.accountID so each Google Health account maps to exactly
 * one device in the devices table. Multiple data streams become multiple properties
 * on that single device.
 *
 * All persistence is done by the caller (integrations bridge) via MQTT-RPC to the server.
 */

const https = require("https");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"; // Google OAuth token endpoint

const DATA_STREAM_MAP = { // Supported data streams mapped to canonical property names
  "derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm":       "heartRate",
  "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps":           "steps",
  "derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended":  "caloriesExpended",
  "derived:com.google.sleep.segment:com.google.android.gms:merged":                       "sleepSegment",
};

/**
 * Performs an HTTPS request and returns the parsed JSON body.
 * For POST, pass opts.body (object) — it will be form-encoded.
 * For GET, pass opts.token — it will be sent as a Bearer header.
 * Rejects with a descriptive error on 401, 429, or ≥500 status codes.
 * @param {string} method - "GET" or "POST"
 * @param {string} url
 * @param {{body?: Object, token?: string}} [opts]
 * @returns {Promise<Object>} Parsed response body.
 */
function httpsRequest(method, url, opts = {}) {
  return new Promise(function (resolve, reject) {
    const parsedUrl  = new URL(url);
    const bodyString = opts.body ? new URLSearchParams(opts.body).toString() : null;

    const requestOptions = { // Build headers: add Authorization for authenticated GET requests, Content-Type/Length for POST with body
      hostname: parsedUrl.hostname,
      path:     parsedUrl.pathname + parsedUrl.search,
      method:   method,
      headers:  Object.assign(
        opts.token ? { Authorization: "Bearer " + opts.token, Accept: "application/json" } : {},
        bodyString ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(bodyString) } : {}
      ),
    };

    const request = https.request(requestOptions, function (response) {
      let responseBody = ""; // combine response chunks into a single string

      response.on("data", function (chunk) {
        responseBody += chunk;
      });

      response.on("end", function () {
        if (response.statusCode === 401) {
          return reject(new Error("Google Health: 401 Unauthorized — access token may be expired"));
        }

        if (response.statusCode === 429) {
          return reject(new Error("Google Health: 429 Too Many Requests — provider rate limit hit"));
        }

        if (response.statusCode >= 500) {
          return reject(new Error("Google Health: server error " + response.statusCode + " from API"));
        }

        try {
          resolve(JSON.parse(responseBody));
        }
        catch (error) {
          reject(new Error("Google Health: invalid JSON in response: " + responseBody.slice(0, 128)));
        }
      });
    });

    request.on("error", reject);
    if (bodyString) {
      request.write(bodyString);
    }
    request.end();
  });
}

/**
 * Refreshes a Google OAuth access token using the refresh token stored in the account context.
 * Returns the new accessToken and its expiry timestamp (ISO string).
 * Throws if the refresh fails (e.g. revoked grant).
 * @param {Object} context - Account context object.
 * @param {string} context.refreshToken
 * @param {Object} context.metadata - Must contain clientID and clientSecret.
 * @returns {Promise<{accessToken: string, expiresAt: string}>}
 */
async function ensureAccessToken(context) {
  const nowMs     = Date.now();
  const expiresAt = context.expiresAt ? new Date(context.expiresAt).getTime() : 0;
  
  if (context.accessToken && expiresAt - nowMs > 60_000) { // Token is still valid with 60 s margin — reuse it
    return { accessToken: context.accessToken, expiresAt: context.expiresAt };
  }

  if (!context.refreshToken) {
    throw new Error("Google Health: no refresh token available for account " + context.accountID);
  }

  const meta = context.metadata || {};
  if (!meta.clientID || !meta.clientSecret) {
    throw new Error("Google Health: clientID/clientSecret missing in account metadata for " + context.accountID);
  }

  const body = {
    client_id:     meta.clientID,
    client_secret: meta.clientSecret,
    refresh_token: context.refreshToken,
    grant_type:    "refresh_token",
  };

  const result = await httpsRequest("POST", GOOGLE_TOKEN_URL, { body });

  if (result.error) {
    throw new Error("Google Health: token refresh failed for account " + context.accountID + ": " + result.error);
  }

  const newExpiresAt = new Date(nowMs + result.expires_in * 1000).toISOString();
  return { accessToken: result.access_token, expiresAt: newExpiresAt };
}

/**
 * Maps a raw Google Fitness data point to a canonical metric event.
 * The event uuid equals accountID so it maps directly to the registered device.
 * @param {string} streamName - Data stream identifier.
 * @param {Object} point      - Raw data point from the Fitness API.
 * @param {string} accountID  - Account identifier (used as device UUID).
 * @returns {Object|null} Canonical event or null if the point cannot be mapped.
 */
function mapDataPoint(streamName, point, accountID) {
  const property = DATA_STREAM_MAP[streamName];
  if (!property) {
    return null;
  }

  const value = point.value && point.value[0];
  if (value === undefined || value === null) {
    return null;
  }
 
  let numericValue = value.fpVal !== undefined ? value.fpVal : (value.intVal !== undefined ? value.intVal : null); // fpVal = floating-point container, intVal = integer container (Google Fitness value schema)
  if (numericValue === null) {
    return null;
  }

  const timestampMs = Math.floor(parseInt(point.startTimeNanos, 10) / 1_000_000);

  return {
    uuid:      accountID,  // one device per account — UUID matches the devices table row
    property:  property,
    value:     numericValue,
    valueType: "number",
    timestamp: new Date(timestampMs).toISOString(),
  };
}

/**
 * Pulls changed data points from Google Fitness for all supported data streams.
 * Uses the cursor as a millisecond Unix timestamp marking the end of the last successful window.
 * Returns up to opts.pageLimit events per stream.
 *
 * @param {Object} context - Account context including a valid accessToken.
 * @param {Object} opts
 * @param {string|null} opts.cursor    - ISO timestamp of last sync end (or null for 24 h lookback).
 * @param {number} opts.pageLimit      - Max events to return across all streams.
 * @returns {Promise<{events: Object[], nextCursor: string, hasMore: boolean}>}
 */
async function pullChanges(context, opts) {
  const pageLimit = opts.pageLimit || 100;
 
  const endMs   = Date.now(); // Define the time window: cursor → now
  const startMs = opts.cursor ? new Date(opts.cursor).getTime() : endMs - 24 * 60 * 60 * 1000; // 24 h default lookback

  const events  = [];
  let   hasMore = false;

  for (const streamName of Object.keys(DATA_STREAM_MAP)) {
    if (events.length >= pageLimit) {
      hasMore = true;
      break;
    }
    
    const url = "https://www.googleapis.com/fitness/v1/users/me/dataSources/" + encodeURIComponent(streamName) + "/datasets/" + startMs + "000000-" + endMs + "000000"; // Google Fitness dataset ranges use nanosecond timestamps; append 6 zeros to convert ms → ns

    let result;

    try {
      result = await httpsRequest("GET", url, { token: context.accessToken });
    }
    catch (error) {
      common.conLog("Google Health: stream fetch error [" + streamName + "]: " + error.message, "red"); // Log and skip this stream; do not abort the full sync
      continue;
    }

    if (result.point && Array.isArray(result.point)) { // Map each data point to a canonical event, filter out unmapped points, and respect the page limit across all streams
      for (const point of result.point) {
        const event = mapDataPoint(streamName, point, context.accountID);
        if (event) {
          events.push(event);
          if (events.length >= pageLimit) {
            hasMore = true;
            break;
          }
        }
      }
    }
  }

  const nextCursor = new Date(endMs).toISOString();
  return { events, nextCursor, hasMore };
}

/**
 * Returns the list of properties this adapter can emit, derived from DATA_STREAM_MAP.
 * Used by the server to populate the device's property list.
 * @returns {{ name: string, valueType: string }[]}
 */
function getProperties() {
  return Object.values(DATA_STREAM_MAP).map(function (name) {
    return { name: name, valueType: "number" };
  });
}

module.exports = { ensureAccessToken, pullChanges, getProperties };
