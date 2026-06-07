/**
 * =============================================================================================
 * Google Health converter
 * =======================
 * Converter contract:
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

const https   = require("https");
const common  = require("../../common");

const GOOGLE_TOKEN_URL       = "https://oauth2.googleapis.com/token"; // Google OAuth token endpoint
const GOOGLE_HEALTH_BASE_URL = "https://health.googleapis.com/v4";   // Google Health API v4 base URL

// Maps exercise metricsSummary fields to canonical property names.
// Note: Google's API uses "distanceMillimiters" (their spelling) in the response.
const METRICS_SUMMARY_MAP = {
  steps:                          "steps",
  caloriesKcal:                   "caloriesExpended",
  distanceMillimiters:            "distance",
  averageHeartRateBeatsPerMinute: "heartRate",
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
        common.conLog("Integrations (Google Health): " + method + " " + url, "yel");
        common.conLog("Status: " + response.statusCode, "std", false);
        common.conLog("Response: " + responseBody, "std", false);

        if (response.statusCode === 401) {
          return reject(new Error("Integrations (Google Health): 401 Unauthorized — access token may be expired"));
        }

        if (response.statusCode === 429) {
          return reject(new Error("Integrations (Google Health): 429 Too Many Requests — provider rate limit hit"));
        }

        if (response.statusCode >= 500) {
          return reject(new Error("Integrations (Google Health): server error " + response.statusCode + " from API"));
        }

        try {
          resolve(JSON.parse(responseBody));
        }
        catch (error) {
          reject(new Error("Integrations (Google Health): invalid JSON in response: " + responseBody.slice(0, 128)));
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
    throw new Error("Integrations (Google Health): no refresh token available for account " + context.accountID);
  }

  const meta = context.metadata || {};

  if (!meta.clientID || !meta.clientSecret) {
    throw new Error("Integrations (Google Health): clientID/clientSecret missing in account metadata for " + context.accountID);
  }

  const body = {
    client_id:     meta.clientID,
    client_secret: meta.clientSecret,
    refresh_token: context.refreshToken,
    grant_type:    "refresh_token",
  };

  const result = await httpsRequest("POST", GOOGLE_TOKEN_URL, { body });

  if (result.error) {
    throw new Error("Integrations (Google Health): token refresh failed for account " + context.accountID + ": " + result.error);
  }

  const newExpiresAt = new Date(nowMs + result.expires_in * 1000).toISOString();
  return { accessToken: result.access_token, expiresAt: newExpiresAt };
}

/**
 * Maps a Google Health API v4 exercise data point to an array of canonical metric events.
 * Each metricsSummary field that is present in METRICS_SUMMARY_MAP yields one event.
 * The event uuid equals accountID so it maps directly to the registered device.
 * @param {Object} point     - Raw data point from the Health API v4 (exercise type).
 * @param {string} accountID - Account identifier (used as device UUID).
 * @returns {Object[]} Array of canonical events (may be empty if no metrics found).
 */
function mapExerciseDataPoint(point, accountID) {
  const events   = [];
  const exercise = point.exercise;

  if (!exercise || !exercise.metricsSummary) {
    return events;
  }

  // Use the exercise start time as the event timestamp
  const timestamp = exercise.interval && exercise.interval.startTime
    ? exercise.interval.startTime
    : new Date().toISOString();

  for (const [summaryKey, property] of Object.entries(METRICS_SUMMARY_MAP)) {
    const rawValue = exercise.metricsSummary[summaryKey];
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    const numericValue = Number(rawValue); // metricsSummary values may be strings (e.g. steps)
    if (isNaN(numericValue)) {
      continue;
    }

    events.push({
      uuid:      accountID, // one device per account — UUID matches the devices table row
      property:  property,
      value:     numericValue,
      valueType: "Numeric",
      timestamp: timestamp,
    });
  }

  return events;
}

/**
 * Pulls changed exercise data points from Google Health API v4.
 * Uses the cursor as the start of the time window for the civil_start_time filter.
 * Paginates through all pages up to opts.pageLimit total events.
 *
 * @param {Object} context - Account context including a valid accessToken.
 * @param {Object} opts
 * @param {string|null} opts.cursor    - ISO timestamp of last sync end (or null for 24 h lookback).
 * @param {number} opts.pageLimit      - Max events to return in total.
 * @returns {Promise<{events: Object[], nextCursor: string, hasMore: boolean}>}
 */
async function pullChanges(context, opts) {
  const pageLimit = opts.pageLimit || 100;

  const endMs   = Date.now(); // Define the time window: cursor → now
  const startMs = opts.cursor ? new Date(opts.cursor).getTime() : endMs - 24 * 60 * 60 * 1000; // 24 h default lookback

  // Build the civil_start_time filter (format: "YYYY-MM-DDTHH:MM:SS", no trailing Z)
  const startCivil = new Date(startMs).toISOString().slice(0, 19);
  const filter     = "exercise.interval.civil_start_time >= \"" + startCivil + "\"";
  const baseUrl    = GOOGLE_HEALTH_BASE_URL + "/users/me/dataTypes/exercise/dataPoints?filter=" + encodeURIComponent(filter);

  const events  = [];
  let   hasMore = false;
  let   nextPageToken = null;

  do {
    const url = nextPageToken ? baseUrl + "&pageToken=" + encodeURIComponent(nextPageToken) : baseUrl;

    let result;
    try {
      result = await httpsRequest("GET", url, { token: context.accessToken });
    }
    catch (error) {
      common.conLog("Integrations (Google Health): exercise fetch error: " + error.message, "red"); // Log and abort pagination; return what we have so far
      break;
    }

    if (result.dataPoints && Array.isArray(result.dataPoints)) { // Map each exercise data point to one event per available metric
      for (const point of result.dataPoints) {
        const pointEvents = mapExerciseDataPoint(point, context.accountID);
        for (const event of pointEvents) {
          events.push(event);
          if (events.length >= pageLimit) {
            hasMore = true;
            break;
          }
        }
        if (events.length >= pageLimit) {
          break;
        }
      }
    }

    nextPageToken = result.nextPageToken || null;
  } while (nextPageToken && events.length < pageLimit);

  if (nextPageToken && events.length >= pageLimit) {
    hasMore = true; // more pages exist that we did not fetch
  }

  const nextCursor = new Date(endMs).toISOString();
  return { events, nextCursor, hasMore };
}

/**
 * Returns the list of properties this converter can emit, derived from METRICS_SUMMARY_MAP.
 * Used by the server to populate the device's property list.
 * @returns {{ name: string, standard: boolean, notify: boolean, read: boolean, write: boolean, anyValue: any, valueType: string }[]}
 */
function getProperties() {
  return Object.values(METRICS_SUMMARY_MAP).map(function (name) {
    return {
      name:      name,
      standard:  false,
      notify:    true,
      read:      true,
      write:     false,
      anyValue:  0,
      valueType: "Numeric"
    };
  });
}

module.exports = { ensureAccessToken, pullChanges, getProperties };
