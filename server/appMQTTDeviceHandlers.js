/**
 * =============================================================================================
 * MQTT Device and integration handlers
 * ====================================
 */
const common = require("../common");

/**
 *  Check if a device is registered in the database
 * @param {string} uuid - The device UUID to check.
 * @returns {boolean} - Returns true if the device is registered, false otherwise.
 */
async function deviceCheckRegistered(uuid, bridge) {
    uuid = uuid.trim();

    const result = database.prepare("SELECT deviceID FROM devices WHERE uuid = ? AND bridge = ? LIMIT 1").get(uuid, bridge);
    if (!result) { // could not find device
        common.conLog("Server: Check device: not found in database device with UUID " + uuid, "red");
        return false;
    } else {
        common.conLog("Server: Check device: found in database device with UUID " + uuid, "gre");
        return true;
    }
}

/**
 * Updates the in-memory bridge status map when a bridge publishes its online/offline status.
 * Called when a bridge connects (status: "online") or when the MQTT LWT fires (status: "offline").
 * @param {Object} data - Message payload; data.bridge and data.status are required.
 */
function mqttBridgeStatusUpdate(data) {
  if (data.bridge && data.status) {
    const bridgeKey = String(data.bridge).trim().toLowerCase();

    global.mqttBridgeStatus[bridgeKey] = data.status; // normalized key; used by GET /info for MQTT-only bridges
    common.conLog("Server: Bridge status updated: " + bridgeKey + " = " + data.status, "yel");
  }
}

/**
 * Refreshed devices IN the bridge
 * @param {Object} data - The data object containing the bridge information.
 */
async function mqttDevicesRefresh(data) {
  let message = {};

  if (data.bridge) {
    const results = await database.prepare("SELECT * FROM devices WHERE bridge = ?").all(data.bridge);
    message.devices = results;

    if (data.forceReconnect === true)  { // if forceReconnect is true, publish to reconnect topic
      mqttClient.publish(data.bridge + "/devices/reconnect", JSON.stringify(message));
    }
    else {
      mqttClient.publish(data.bridge + "/devices/refresh", JSON.stringify(message));
    }
  }
  else {
    common.conLog("Server: bridge is missing in message for devices list", "red");
  }
}

/**
 * Create a new device
 * @param {Object} data - The data object containing the device information.
 */
async function mqttDevicesCreate(data) {
  let message = {};

  if (data.bridge) {
    if (data.uuid && data.productName) {
      if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is already registered
        common.conLog("Server: Device with UUID " + data.uuid + " is already registered", "red");
        message.status  = "error";
        message.uuid    = data.uuid;
        message.bridge  = data.bridge;
        message.error   = "Device already registered";
      }
      else {
        const result = database.prepare("INSERT INTO devices (uuid, bridge, powerType, vendorName, productName, name, description, properties, dateTimeAdded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))").run(
          data.uuid, data.bridge, data.powerType || "?", data.vendorName || "", data.productName, data.name || "", data.description || "", JSON.stringify(data.properties) || "");

        message.status    = "ok";
        message.deviceID  = result.lastInsertRowid;
        message.uuid      = data.uuid;
        message.bridge    = data.bridge;

        if (data.forceReconnect === undefined || data.forceReconnect === null) { // set forceReconnect to true if not provided
          data.forceReconnect = true;
        }

        common.conLog("Server: Created device with UUID " + data.uuid + " (deviceID: " + result.lastInsertRowid + ")", "gre");
        mqttDevicesRefresh({ bridge: data.bridge, forceReconnect: data.forceReconnect }); // publish updated device list to bridge and force reconnect if requested
      }
    }
    else {
      common.conLog("Server: Device UUID or product name is missing in message for device creation", "red");
      message.status  = "error";
      message.uuid    = data.uuid;
      message.error   = "Device UUID or product name is missing";
    }
  }
  else {
      common.conLog("Server: bridge is missing in message for device creation", "red");
      message.status  = "error";
      message.error   = "Bridge missing";
  }

  mqttClient.publish(data.bridge + "/devices/create/response", JSON.stringify(message));
}

/**
 * Remove a device
 * @param {Object} data - The data object containing the device information.
 */
async function mqttDevicesRemove(data) {
  let message = {};

  if (data.bridge) {
    if (data.uuid) {
      if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
        database.prepare("DELETE FROM devices WHERE uuid = ? AND bridge = ?").run(data.uuid, data.bridge); // remove device from database
        message.status  = "ok";
        message.uuid    = data.uuid;
        message.bridge  = data.bridge;
        common.conLog("Server: Removed device with UUID " + data.uuid, "gre");
      }
      else {
        common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
        message.status  = "error";
        message.uuid    = data.uuid;
        message.bridge  = data.bridge;
        message.error   = "Device not registered";
      }
    }
    else {
      common.conLog("Server: Device UUID is missing in message for device removal", "red");
      message.status  = "error";
      message.bridge  = data.bridge;
      message.error   = "Device UUID missing";
    }
  }
  else {
    common.conLog("Server: Bridge is missing in message for device removal", "red");
    message.status  = "error";
    message.error   = "Bridge missing";
  }
  mqttClient.publish(data.bridge + "/devices/remove/response", JSON.stringify(message));
}

/**
 * Fetch device values
 * @param {Object} data - The data object containing the device information.
 */
async function mqttDevicesValuesGet(data) {
  let message = {};
  if (data.bridge) {
    if (data.uuid) {
      if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
        message.status     = "ok";
        message.uuid       = data.uuid;
        message.bridge     = data.bridge;
        message.properties = data.properties;

        common.conLog("Server: Fetched values for device with UUID " + data.uuid, "gre");

        /**
         * Two independent systems react to these values: Scenarios (user-defined "if X
         * then Y" automations) are evaluated per property right below; the Alerts Engine
         * (built-in threshold/anomaly/inactivity detection) is evaluated once for the whole
         * payload afterwards. A scenario action can itself create an alert, but AlertsEngine
         * won't forward that back to Scenarios (see AlertsEngine.triggerScenarioEvent) - this
         * avoids an infinite alert <-> scenario loop.
         */
        if (data.values !== undefined) {
          Object.keys(data.values).forEach((property) => {
            const valueData = data.values[property];

            scenarios.handleEvent("device_value", {
              uuid:      data.uuid,
              bridge:    data.bridge,
              property:  property,
              value:     valueData.value,
              valueType: valueData.valueType || "string"
            });

            if (property === "battery") { // if battery level is fetched, trigger battery_low event for scenarios if value is below threshold
              scenarios.handleEvent("battery_low", {
                uuid:     data.uuid,
                bridge:   data.bridge,
                property: "battery",
                value:    valueData.value
              });
            }
          });

          await global.alerts.deviceValuesHandle(data); // handle alerts based on device values
        }
      }
      else {
        common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
        message.status  = "error";
        message.uuid    = data.uuid;
        message.bridge  = data.bridge;
        message.error   = "Device not registered";
      }
    }
    else {
      common.conLog("Server: Device UUID is missing in message for device values", "red");
      message.status  = "error";
      message.bridge  = data.bridge;
      message.error   = "Device UUID missing";
    }
  }
  else {
    common.conLog("Server: Bridge is missing in message for device values", "red");
    message.status  = "error";
    message.error   = "Bridge missing";
  }

  mqttClient.publish(data.bridge + "/devices/values/get/response", JSON.stringify(message));
}

/**
 * Update device information
 * @param {Object} data - The data object containing the device information.
 */
async function mqttDevicesUpdate(data) {
  let message = {};

  if (data.bridge) {
    if (data.uuid) {
      if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
        // delete non-updatable fields
        delete data.updates.deviceID;
        delete data.updates.uuid;
        delete data.updates.bridge;
        delete data.updates.powerType;
        delete data.updates.properties;
        delete data.updates.productName;
        delete data.updates.vendorName;

        const safeNameRegex = /^[a-zA-Z0-9_]+$/;
        const fields        = Object.keys(data.updates).filter(field => safeNameRegex.test(field));

        if (fields.length === 0) {
          message.status = "error";
          message.error  = "No valid fields to update";
          mqttClient.publish(data.bridge + "/devices/update/response", JSON.stringify(message));
          return;
        }

        const placeholders  = fields.map(field => field + " = ?").join(", ");
        const values        = fields.map(field => data.updates[field]);

        database.prepare("UPDATE devices SET " + placeholders + " WHERE uuid = ? AND bridge = ?").run(...values, data.uuid, data.bridge);

        message.status  = "ok";
        message.uuid    = data.uuid;
        message.bridge  = data.bridge;
        common.conLog("Server: Updated device with UUID " + data.uuid, "gre");
      }
      else {
        common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
        message.status  = "error";
        message.uuid    = data.uuid;
        message.bridge  = data.bridge;
        message.error   = "Device not registered";
      }
    }
    else {
      common.conLog("Server: Device UUID is missing in message for device update", "red");
      message.status  = "error";
      message.bridge  = data.bridge;
      message.error   = "Device UUID missing";
    }
  }
  else {
    common.conLog("Server: Bridge is missing in message for device update", "red");
    message.status  = "error";
    message.error   = "Bridge missing";
  }
  mqttClient.publish(data.bridge + "/devices/update/response", JSON.stringify(message));
}

/**
 * Update device signal strength
 * @param {*} data - The data object containing the device information.
 */
async function mqttDevicesStrength(data) {
  let message = {};
  if (data.bridge) {
    if (data.uuid) {
      if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
        message.status    = "ok";
        message.uuid      = data.uuid;
        message.bridge    = data.bridge;
        message.strength  = data.strength;
        common.conLog("Server: Updated signal strength for device with UUID " + data.uuid + ": " + data.strength + "%", "gre");

        database.prepare("UPDATE devices SET strength = ? WHERE uuid = ? AND bridge = ?").run(data.strength, data.uuid, data.bridge);
      }
      else {
        common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
        message.status  = "error";
        message.uuid    = data.uuid;
        message.bridge  = data.bridge;
        message.error   = "Device not registered";
      }
    }
    else {
      common.conLog("Server: Device UUID is missing in message for device strength", "red");
      message.status  = "error";
      message.bridge  = data.bridge;
      message.error   = "Device UUID missing";
    }
  }
  else {
    common.conLog("Server: Bridge is missing in message for device strength", "red");
    message.status  = "error";
    message.error   = "Bridge missing";
  }
  mqttClient.publish(data.bridge + "/devices/strength/response", JSON.stringify(message));
}

/**
 * Handle device status events (online/offline)
 * @param {Object} data - { device UUID, bridge, status: "online"|"offline" }
 */
async function mqttDevicesStatus(data) {
  let message = {};
  if (data.bridge) {
    if (data.uuid) {
      if (data.status) {
        if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
          const type      = data.status === "online" ? "device_connected" : "device_disconnected";
          message.status  = "ok";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          common.conLog("Server: Device " + data.uuid + " status: " + data.status, "yel");

          scenarios.handleEvent(type, {
            uuid:   data.uuid,
            bridge: data.bridge
          });

          global.alerts.deviceStatusHandle(data); // handle alerts based on device status
        }
        else {
          common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
          message.status  = "error";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          message.error   = "Device not registered";
        }
      }
      else {
        common.conLog("Server: Status is missing in message for device status", "red");
        message.status  = "error";
        message.uuid    = data.uuid;
        message.bridge  = data.bridge;
        message.error   = "Status missing";
      }
    }
    else {
      common.conLog("Server: Device UUID is missing in message for device status", "red");
      message.status  = "error";
      message.bridge  = data.bridge;
      message.error   = "Device UUID missing";
    }
  }
  else {
    common.conLog("Server: Bridge is missing in message for device status", "red");
    message.status  = "error";
    message.error   = "Bridge missing";
  }
  mqttClient.publish(data.bridge + "/devices/status/response", JSON.stringify(message));
}

/**
 * Handles alerts from the device bridge.
 * @param {*} data - Alert data from the device bridge
 */
async function mqttDevicesAlert(data) {
  global.alerts.deviceBridgeAlertHandle(data);
}

/**
 * =============================================================================================
 * Integration handlers — persistent state for external provider sync
 * ==================================================================
 */

/**
 * Emits a standardised integration response back to the originating bridge.
 * @param {Object} data      - Original request data (must contain bridge and callID).
 * @param {string} action    - The action suffix for the response topic (e.g. "accounts/list").
 * @param {Object} payload   - Fields to merge into the response.
 */
function integrationRespond(data, action, payload) {
  const message          = Object.assign({}, payload);
  message.callID         = data.callID;
  message.bridge         = data.bridge;
  const responseTopic    = data.bridge + "/integrations/" + action + "/response";
  mqttClient.publish(responseTopic, JSON.stringify(message));
}

/**
 * List all enabled integration accounts.
 * Required: bridge, callID
 */
async function mqttIntegrationsAccountsList(data) {
  if (!data.bridge || !data.callID) {
    common.conLog("Server: integrations/accounts/list: missing bridge or callID", "red");
    return;
  }
  try {
    const accounts = credentialEngine.listAccounts();
    integrationRespond(data, "accounts/list", { status: "ok", accounts });
  }
  catch (error) {
    common.conLog("Server: integrations/accounts/list error: " + error.message, "red");
    integrationRespond(data, "accounts/list", { status: "error", error: error.message });
  }
}

/**
 * Persist a refreshed access token for an account.
 * Required: bridge, callID, accountID, accessToken
 * Optional: expiresAt
 */
async function mqttIntegrationsAccountsTokensSet(data) {
  if (!data.bridge || !data.callID) {
    common.conLog("Server: integrations/accounts/tokens/set: missing bridge or callID", "red");
    return;
  }

  if (!data.accountID || !data.accessToken) {
    integrationRespond(data, "accounts/tokens/set", { status: "error", error: "accountID and accessToken are required" });
    return;
  }

  try {
    credentialEngine.setToken(data.accountID, data.accessToken, data.expiresAt || null);
    integrationRespond(data, "accounts/tokens/set", { status: "ok", accountID: data.accountID });
  }
  catch (error) {
    common.conLog("Server: integrations/accounts/tokens/set error: " + error.message, "red");
    integrationRespond(data, "accounts/tokens/set", { status: "error", error: error.message });
  }
}

/**
 * Start a sync run record for an account.
 * Required: bridge, callID, accountID
 * Returns: syncRunID
 */
async function mqttIntegrationsSyncRunStart(data) {
  if (!data.bridge || !data.callID) {
    common.conLog("Server: integrations/syncrun/start: missing bridge or callID", "red");
    return;
  }

  if (!data.accountID) {
    integrationRespond(data, "syncrun/start", { status: "error", error: "accountID is required" });
    return;
  }

  try {
    const syncRunID = credentialEngine.syncRunStart(data.accountID);
    integrationRespond(data, "syncrun/start", { status: "ok", accountID: data.accountID, syncRunID });
  }
  catch (error) {
    common.conLog("Server: integrations/syncrun/start error: " + error.message, "red");
    integrationRespond(data, "syncrun/start", { status: "error", error: error.message });
  }
}

/**
 * Mark a sync run as finished (success or error).
 * Required: bridge, callID, syncRunID
 * Optional: error (string, null means success)
 */
async function mqttIntegrationsSyncRunFinish(data) {
  if (!data.bridge || !data.callID) {
    common.conLog("Server: integrations/syncrun/finish: missing bridge or callID", "red");
    return;
  }

  if (!data.syncRunID) {
    integrationRespond(data, "syncrun/finish", { status: "error", error: "syncRunID is required" });
    return;
  }

  try {
    credentialEngine.syncRunFinish(data.syncRunID, data.error || null);
    integrationRespond(data, "syncrun/finish", { status: "ok", syncRunID: data.syncRunID });
  }
  catch (error) {
    common.conLog("Server: integrations/syncrun/finish error: " + error.message, "red");
    integrationRespond(data, "syncrun/finish", { status: "error", error: error.message });
  }
}

/**
 * Dispatches an already-parsed MQTT message to the handler for its topic.
 * @param {string} topic
 * @param {Object} data - Parsed JSON payload of the message.
 * @returns {Promise<void>}
 */
async function handleMessage(topic, data) {
  switch (topic) {
    case "server/devices/refresh":
      await mqttDevicesRefresh(data);
      break;
    case "server/devices/create":
      await mqttDevicesCreate(data);
      break;
    case "server/devices/remove":
      await mqttDevicesRemove(data);
      break;
    case "server/devices/update":
      await mqttDevicesUpdate(data);
      break;
    case "server/devices/values/get":
      await mqttDevicesValuesGet(data);
      break;
    case "server/devices/strength":
      await mqttDevicesStrength(data);
      break;
    case "server/devices/status":
      await mqttDevicesStatus(data);
      break;
    case "server/devices/alert":
      await mqttDevicesAlert(data);
      break;
    case "server/integrations/accounts/list":
      await mqttIntegrationsAccountsList(data);
      break;
    case "server/integrations/accounts/tokens/set":
      await mqttIntegrationsAccountsTokensSet(data);
      break;
    case "server/integrations/syncrun/start":
      await mqttIntegrationsSyncRunStart(data);
      break;
    case "server/integrations/syncrun/finish":
      await mqttIntegrationsSyncRunFinish(data);
      break;
    case "server/bridge/status":
      mqttBridgeStatusUpdate(data);
      break;
    default:
      common.conLog("Server: NOT found matching message handler for " + topic, "red");
  }
}

module.exports = {
  handleMessage,
  deviceCheckRegistered,
  mqttBridgeStatusUpdate,
  mqttDevicesRefresh,
  mqttDevicesCreate,
  mqttDevicesRemove,
  mqttDevicesValuesGet,
  mqttDevicesUpdate,
  mqttDevicesStrength,
  mqttDevicesStatus,
  mqttDevicesAlert,
  integrationRespond,
  mqttIntegrationsAccountsList,
  mqttIntegrationsAccountsTokensSet,
  mqttIntegrationsSyncRunStart,
  mqttIntegrationsSyncRunFinish
};
