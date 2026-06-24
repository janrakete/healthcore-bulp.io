/**
 * =============================================================================================
 * Integrations bridge provider converter registry
 * ====================================
 * Maps productName strings (as stored in the devices table) to their converter modules.
 * Each converter must export:
 *   ensureAccessToken(context)   → { accessToken, expiresAt }
 *   pullChanges(context)         → { events[], nextCursor, hasMore }
 *   getProperties()              → [{ name, valueType }]
 *
 * context = { accountID, provider, accessToken, refreshToken, expiresAt, metadata }
 * events  = [{ uuid, property, value, valueType, timestamp }]
 *
 * "uuid" in an event equals the device UUID (= accountID) so it matches
 * the device row in the devices table without any further mapping.
 */

const googleHealth = require("./Converter_GoogleHealth");

const registry = {
  GoogleHealth: googleHealth
};

/**
 * Resolves a provider converter by productName.
 * @param {string} productName - Device productName as stored in devices table (e.g. "GoogleHealth").
 * @returns {Object|undefined} The converter module or undefined if not registered.
 */
function getConverter(productName) {
  return registry[productName];
}

module.exports = { getConverter };
