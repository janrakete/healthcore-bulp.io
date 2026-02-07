/**
 * =============================================================================================
 * API Key Authentication Middleware
 * =================================
 */

const appConfig = require("../../config");

/**
 * Middleware to check for a valid API key in the request headers.
 * @param {Object} request - Express request object
 * @param {Object} response - Express response object
 * @param {Function} next - Express next function
 * @returns {void}
 * @description Checks the 'x-api-key' header against the configured API key. If no API key is configured, requests pass through (development mode).
 */
function apiKeyAuth(request, response, next) {
  if (!appConfig.CONF_apiKey) { // if no key configured, log warning and allow (development mode)
    common.conLog("Auth: No API key configured. All requests are allowed. Set CONF_apiKey in .env.local", "red");
    return next();
  }

  const providedKey = request.headers["x-api-key"];

  if (!providedKey) {
    let data    = {};
    data.status = "error";
    data.error  = "Authentication required. Provide 'x-api-key' header.";
    return response.status(401).json(data); 
  }

  if (providedKey !== appConfig.CONF_apiKey) {
    let data    = {};
    data.status = "error";
    data.error  = "Invalid API key.";
    return response.status(403).json(data);
  }

  next();
}

module.exports = apiKeyAuth;
