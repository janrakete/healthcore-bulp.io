/**
 * =============================================================================================
 * Google Health converter
 * =======================
 * Converter contract:
 *   ensureAccessToken(context)  → { accessToken, expiresAt }
 *   pullChanges(context)        → { events[], nextCursor, hasMore }
 *   getProperties()             → [{ name, valueType }]
 *
 * context = { accountID, provider, accessToken, refreshToken, expiresAt, metadata }
 *
 * Events use uuid = context.accountID so each Google Health account maps to exactly
 * one device in the devices table. Multiple data streams become multiple properties
 * on that single device.
 */

const https   = require("https");
const common  = require("../../common");

const GOOGLE_TOKEN_URL       = "https://oauth2.googleapis.com/token"; // Google OAuth token endpoint
const GOOGLE_HEALTH_BASE_URL = "https://health.googleapis.com/v4";   // Google Health API v4 base URL

// Selected Google Health data types to poll each sync cycle.
const GOOGLE_DATA_TYPES = [
  { id: "heart-rate",             field: "heartRate" },
  { id: "oxygen-saturation",      field: "oxygenSaturation" },
  { id: "core-body-temperature",  field: "coreBodyTemperature" },
  { id: "active-energy-burned",   field: "activeEnergyBurned" },
  { id: "blood-glucose",          field: "bloodGlucose" }
];

// One canonical numeric metric per selected data type to avoid event spam.
const PRIMARY_METRIC_PATHS = {
  heartRate:            "beatsPerMinute",
  oxygenSaturation:     "percentage",
  coreBodyTemperature:  "temperatureCelsius",
  activeEnergyBurned:   "kcal",
  bloodGlucose:         "bloodGlucoseMilligramsPerDeciliter",
};

/**
 * Extracts a numeric value from Google metric payloads.
 * Supports plain numbers/strings and common wrapped shapes.
 * @param {*} rawValue
 * @returns {number|null}
 */
function extractNumericValue(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? rawValue : null;
  }

  if (typeof rawValue === "string") {
    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  if (typeof rawValue === "object") {
    const candidateKeys = ["value", "numericValue", "intValue", "floatValue", "doubleValue"];
    for (const key of candidateKeys) {
      if (rawValue[key] === undefined || rawValue[key] === null) {
        continue;
      }

      const parsedValue = Number(rawValue[key]);
      if (Number.isFinite(parsedValue)) {
        return parsedValue;
      }
    }
  }

  return null;
}

/**
 * Converts a Date object payload ({year, month, day}) to a UTC ISO timestamp.
 * @param {{year?: number, month?: number, day?: number}} dateObject
 * @returns {string|null}
 */
function dateObjectToIso(dateObject) {
  if (!dateObject || typeof dateObject !== "object") {
    return null;
  }

  const year  = Number(dateObject.year);
  const month = Number(dateObject.month);
  const day   = Number(dateObject.day);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || year <= 0 || month <= 0 || day <= 0) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).toISOString();
}

/**
 * Picks the best timestamp from a data point payload.
 * @param {Object} point
 * @param {Object} payload
 * @returns {string}
 */
function resolveDataPointTimestamp(point, payload) {
  const candidateTimestamps = [
    payload?.interval?.startTime,
    payload?.sampleTime?.physicalTime,
    payload?.eventTime,
    payload?.createTime,
    payload?.updateTime,
    point?.createTime,
    point?.updateTime,
  ];

  for (const timestamp of candidateTimestamps) {
    if (timestamp) {
      return timestamp;
    }
  }

  const dateTimestamp = dateObjectToIso(payload?.date);
  if (dateTimestamp) {
    return dateTimestamp;
  }

  return new Date().toISOString();
}

/**
 * Reads a nested object path like "a.b.c" safely.
 * @param {Object} objectValue
 * @param {string} path
 * @returns {*}
 */
function getValueAtPath(objectValue, path) {
  if (!objectValue || typeof objectValue !== "object" || !path) {
    return undefined;
  }

  const pathParts = path.split(".");
  let currentValue = objectValue;

  for (const part of pathParts) {
    if (currentValue === null || currentValue === undefined || typeof currentValue !== "object") {
      return undefined;
    }

    currentValue = currentValue[part];
  }

  return currentValue;
}

/**
 * Maps a raw Google Health data point into canonical numeric events.
 * @param {Object} point
 * @param {string} accountID
 * @param {string} dataField
 * @returns {Object[]}
 */
function mapDataPoint(point, accountID, dataField) {
  const payload = point[dataField];
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const metricPath = PRIMARY_METRIC_PATHS[dataField];
  if (!metricPath) {
    return [];
  }

  const rawMetricValue = getValueAtPath(payload, metricPath);
  const numericValue   = extractNumericValue(rawMetricValue);
  if (numericValue === null) {
    return [];
  }

  const timestamp = resolveDataPointTimestamp(point, payload);

  return [{
    uuid:      accountID,
    property:  dataField,
    value:     numericValue,
    valueType: "Numeric",
    timestamp: timestamp,
  }];
}

/**
 * Picks the latest data point by resolved timestamp.
 * @param {Object[]} points
 * @param {string} dataField
 * @returns {Object|null}
 */
function pickLatestDataPoint(points, dataField) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  let latestPoint = null;
  let latestMs    = -Infinity; // Initialize to -Infinity to ensure any valid timestamp is greater

  for (const point of points) {
    const payload = point && point[dataField];
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const timestamp = resolveDataPointTimestamp(point, payload);
    const parsedMs  = new Date(timestamp).getTime();
    const pointMs   = Number.isFinite(parsedMs) ? parsedMs : 0;

    if (latestPoint === null || pointMs > latestMs) {
      latestPoint = point;
      latestMs    = pointMs;
    }
  }

  return latestPoint;
}

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
        common.conLog("Response: " + responseBody, "std", false, false);

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
 * Pulls latest Google Health data points for the selected data types.
 * One request per data type per sync cycle; one latest numeric value per type.
 *
 * @param {Object} context - Account context including a valid accessToken.
 * @returns {Promise<{events: Object[], nextCursor: string, hasMore: boolean}>}
 */
async function pullChanges(context) {

  const endMs   = Date.now();
  const events  = [];

  for (const dataType of GOOGLE_DATA_TYPES) {
    const url = GOOGLE_HEALTH_BASE_URL + "/users/me/dataTypes/" + dataType.id + "/dataPoints?pageSize=1";

    let result;
    try {
      result = await httpsRequest("GET", url, { token: context.accessToken });
    }
    catch (error) {
      common.conLog("Integrations (Google Health): fetch error for " + dataType.id + ": " + error.message, "red");
      continue;
    }

    if (!Array.isArray(result.dataPoints) || result.dataPoints.length === 0) {
      continue;
    }

    const latestPoint = pickLatestDataPoint(result.dataPoints, dataType.field);
    if (!latestPoint) {
      continue;
    }

    const pointEvents = mapDataPoint(latestPoint, context.accountID, dataType.field);
    for (const event of pointEvents) {
      events.push(event);
    }
  }

  const nextCursor = new Date(endMs).toISOString();
  return { events, nextCursor, hasMore: false };
}

/**
 * Returns the list of properties this converter can emit for selected data types.
 * Used by the server to populate the device's property list.
 * @returns {{ name: string, standard: boolean, notify: boolean, read: boolean, write: boolean, anyValue: any, valueType: string }[]}
 */
function getProperties() {
  return GOOGLE_DATA_TYPES.map(function (dataType) {
    return {
      name:      dataType.field,
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
