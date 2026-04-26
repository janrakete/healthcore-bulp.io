/**
 * DeviceLookup — translates uuid+bridge → numeric deviceID at the system boundary.
 *
 * In-memory cache keyed by "bridge::uuid" → numeric deviceID.
 * Call invalidateCache() after device create/delete to keep it consistent.
 * The cache is critical on the broker hot path: every MQTT value message needs
 * a uuid→numeric lookup before inserting into mqtt_history_devices_values.
 */

const cache = new Map();

function _key(uuid, bridge) {
  return bridge + "::" + uuid;
}

/**
 * Returns the numeric deviceID for a given uuid+bridge, or null if not found.
 * Uses the cache; falls through to DB on miss and populates the cache.
 */
function getDeviceIDByUUID(database, uuid, bridge) {
  const k = _key(uuid, bridge);
  if (cache.has(k)) return cache.get(k);

  const row = database.prepare(
    "SELECT deviceID FROM devices WHERE uuid = ? AND bridge = ? LIMIT 1"
  ).get(uuid, bridge);

  if (!row) return null;

  cache.set(k, row.deviceID);
  return row.deviceID;
}

/**
 * Returns the full device row for a given uuid+bridge, or null if not found.
 * Also populates the cache with the numeric deviceID.
 */
function getDeviceByUUID(database, uuid, bridge) {
  const row = database.prepare(
    "SELECT * FROM devices WHERE uuid = ? AND bridge = ? LIMIT 1"
  ).get(uuid, bridge);

  if (!row) return null;

  cache.set(_key(uuid, bridge), row.deviceID);
  return row;
}

/**
 * Removes a uuid+bridge entry from the cache.
 * Call this after creating or deleting a device.
 */
function invalidateCache(uuid, bridge) {
  cache.delete(_key(uuid, bridge));
}

module.exports = { getDeviceIDByUUID, getDeviceByUUID, invalidateCache };
