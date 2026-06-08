/**
 * =============================================================================================
 * Integrations Bridge: External API providers <-> MQTT
 * =====================================================
 */

const appConfig = require("../config");
const common    = require("../common");

const BRIDGE_PREFIX = "integrations";

const { getConverter } = require("./converters/index");

const rpcPending = {}; // Pending MQTT-RPC calls: callID -> { resolve, reject, timer }. Populated by rpcCall(); resolved/rejected when the matching /response message arrives.

/**
 * Starts the integrations bridge.
 * Connects to the MQTT broker, subscribes to "integrations/#", requests the initial device list,
 * and starts the periodic sync scheduler that polls external API providers.
 * No HTTP server is needed — this bridge communicates via MQTT only.
 * @async
 * @function startBridge
 */
async function startBridge() {
   common.logoShow(BRIDGE_PREFIX, "-"); // show logo

  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt       = require("mqtt");
  let mqttOptions  = { clientId: BRIDGE_PREFIX, username: appConfig.CONF_brokerUsername, password: appConfig.CONF_brokerPassword,
    will: {  // LWT: broker publishes this automatically if the bridge disconnects unexpectedly (e.g. crash)
      topic:   "server/bridge/status",
      payload: JSON.stringify({ bridge: BRIDGE_PREFIX, status: "offline" }),
      retain:  true,
    },
  };

  if (appConfig.CONF_tlsPath) { // if TLS path is configured, try to load CA cert for secure connection (if cert not found, will log warning and continue without CA cert)
    try {
      const fs                       = require("fs");
      mqttOptions.ca                 = [ fs.readFileSync(appConfig.CONF_tlsPath + "cert.pem") ];
      mqttOptions.rejectUnauthorized = appConfig.CONF_tlsRejectUnauthorized;
      common.conLog("MQTT: TLS certificate loaded, using secure connection to broker", "gre");
    }
    catch (error) {
      common.conLog("MQTT: TLS certificate not found, ignoring ...", "yel");
    }
  }
  const mqttClient = mqtt.connect(appConfig.CONF_brokerAddress, mqttOptions); // connect to broker ...

  /**
   * Connects the MQTT client and subscribes to integrations-related topics.
   * Requests the current device list from the server immediately after subscribing.
   * @function
   */
  function mqttConnect() {
    mqttClient.subscribe(BRIDGE_PREFIX + "/#", function (error, granted) { // ... and subscribe to external topics
      common.conLog("MQTT: Subscribed to integrations topics from broker", "yel");
      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
      }
    });

    common.conLog("Integrations: Bridge is online - requesting registered integrations devices from server", "yel");
    let statusMessage    = {};
    statusMessage.bridge = BRIDGE_PREFIX;
    statusMessage.status = "online";
    mqttClient.publish("server/bridge/status", JSON.stringify(statusMessage), { retain: true }); // announce online status so server can track it

    let message    = {};
    message.bridge = BRIDGE_PREFIX;
    mqttClient.publish("server/devices/refresh", JSON.stringify(message)); // request all registered external devices from server via MQTT broker
  }
  mqttClient.on("connect", mqttConnect);

  /**
   * Handles MQTT reconnection events.
   */
  mqttClient.on("reconnect", function () {
    common.conLog("MQTT: Reconnecting to broker ...", "yel");
  });

  mqttClient.on("offline", function () {
    common.conLog("MQTT: Broker connection lost, client is offline", "red");
  });

  mqttClient.on("error", function (error) {
    common.conLog("MQTT: Connection error:", "red");
    common.conLog(error, "std", false);
  });

  /**
   * =============================================================================================
   * MQTT-RPC helper
   * ===============
   * Publishes a request to a server/integrations/* topic and returns a Promise that resolves
   * when the matching /response message arrives (correlated by callID).
  * @param {string} topic   - Server topic to publish to (e.g. "server/integrations/accounts/list").
   * @param {Object} payload - Request payload; callID and bridge are added automatically.
   * @returns {Promise<Object>} Resolved with the parsed response payload.
   */
  function rpcCall(topic, payload) {
    return new Promise(function (resolve, reject) {
      const callID    = common.randomHash(16);
      const timeoutMs = appConfig.CONF_integrationsServiceRpcTimeoutMs;

      const timer = setTimeout(function () { // reject the promise if no response arrives within the timeout
        delete rpcPending[callID];
        reject(new Error("RPC timeout for topic " + topic + " (callID: " + callID + ")"));
      }, timeoutMs);

      rpcPending[callID] = { resolve, reject, timer }; // register pending call; will be resolved when /response arrives

      const message  = Object.assign({}, payload);
      message.callID = callID;
      message.bridge = BRIDGE_PREFIX;
      mqttClient.publish(topic, JSON.stringify(message));
    });
  }

  /**
   * =============================================================================================
   * Helper functions
   * ================
   */

  /**
   * Class representing the status of the integrations bridge.
   * Tracks devices registered at the server (keyed by UUID).
   * @class
   * @property {Map<string, Object>} devicesRegisteredAtServer - Map of devices registered at the server (keyed by UUID).
   */
  class BridgeStatus {
    constructor() {
      this.devicesRegisteredAtServer = new Map();
    }
  }
  const bridgeStatus = new BridgeStatus(); // create new object for bridge status

  /**
   * Normalizes a property value type to the format used by scenario UI logic.
   * @param {string|undefined|null} valueType
   * @returns {string}
   */
  function normalizePropertyValueType(valueType) {
    const normalizedValueType = String(valueType || "").toLowerCase();

    if (["numeric", "number", "float", "double", "int", "integer"].includes(normalizedValueType)) {
      return "Numeric";
    }

    if (["options", "option", "enum"].includes(normalizedValueType)) {
      return "Options";
    }

    return "String";
  }

  /**
   * Builds device properties for integrations devices.
   * Prefers converter.getProperties(), falls back to payload properties if present.
   * @param {string} productName
   * @param {Array|undefined} fallbackProperties
   * @returns {Array}
   */
  function buildDeviceProperties(productName, fallbackProperties) {
    const converter = getConverter(productName);

    let sourceProperties = [];
    if (converter && typeof converter.getProperties === "function") {
      try {
        sourceProperties = converter.getProperties();
      }
      catch (error) {
        common.conLog("Integrations: Could not load properties from converter \"" + productName + "\": " + error.message, "red");
      }
    }

    if (!Array.isArray(sourceProperties) || sourceProperties.length === 0) {
      sourceProperties = Array.isArray(fallbackProperties) ? fallbackProperties : [];
    }

    return sourceProperties
      .filter(function (property) {
        return property && typeof property === "object" && String(property.name || "").trim() !== "";
      })
      .map(function (property) {
        const normalizedProperty = {
          name:      String(property.name).trim(),
          valueType: normalizePropertyValueType(property.valueType),
          standard:  property.standard === true,
          notify:    property.notify === true,
          read:      property.read !== false,
          write:     property.write === true,
        };

        if (property.unit !== undefined) {
          normalizedProperty.unit = property.unit;
        }

        if (property.anyValue !== undefined) {
          normalizedProperty.anyValue = property.anyValue;
        }

        return normalizedProperty;
      });
  }

  /**
   * =============================================================================================
   * External sync scheduler
   * =======================
   * Runs on a configurable interval and iterates over all devices registered under this bridge.
   * For each device it:
   *   1. Looks up credentials in integrations_accounts (accountID = device UUID).
   *   2. Refreshes the access token via the provider converter.
   *   3. Persists the new token to the server (via MQTT-RPC).
   *   4. Pulls the latest events from the provider converter.
   *   5. Emits device values via server/devices/values/get (device already exists — no create needed).
   *   6. Records the sync run outcome.
   */
  let syncRunning = false; // guard to prevent overlapping sync cycles

  /**
   * Runs one full integrations sync cycle across all registered devices.
   * @async
   * @function runIntegrationsSync
   */
  async function runIntegrationsSync() {
    if (syncRunning) {
      common.conLog("Integrations: Sync already running, skipping this cycle", "yel");
      return;
    }
    syncRunning = true;
    common.conLog("Integrations: Sync cycle starting", "yel");
    
    let accountMap = new Map(); // Fetch all credential records once for this cycle and index them by accountID

    try {
      const listResp = await rpcCall("server/integrations/accounts/list", {});
      for (const account of (listResp.accounts || [])) {
        accountMap.set(account.accountID, account);
      }
    }
    catch (error) {
      common.conLog("Integrations: Failed to list integration accounts: " + error.message, "red");
      syncRunning = false; // release guard before early return so next cycle can run
      return;
    }

    // Iterate registered devices; each device UUID equals the accountID in integrations_accounts
    for (const [deviceUuid, device] of bridgeStatus.devicesRegisteredAtServer.entries()) {
      const account = accountMap.get(deviceUuid); // look up credentials by device UUID = accountID
      if (!account) {
        common.conLog("Integrations: No credentials for device " + deviceUuid + " — skipping (add account via API)", "yel");
        continue;
      }

      const converter = getConverter(device.productName); // find API converter by productName (e.g. "GoogleHealth")
      if (!converter) {
        common.conLog("Integrations: No converter for productName \"" + device.productName + "\" (device: " + deviceUuid + ")", "red");
        continue;
      }

      let syncRunID = null;
      try {
        const startResp = await rpcCall("server/integrations/syncrun/start", { accountID: deviceUuid });
        syncRunID       = startResp.syncRunID;
      }
      catch (error) {
        common.conLog("Integrations: Could not start sync run for device " + deviceUuid + ": " + error.message, "red");
        continue;
      }

      let syncError = null;

      try {
        const tokenResult = await converter.ensureAccessToken(account); // 1. Ensure access token is fresh (converter handles OAuth refresh if needed)
        
        if (tokenResult.accessToken !== account.accessToken || tokenResult.expiresAt !== account.expiresAt) { // 2. Persist updated token if the converter refreshed it
          await rpcCall("server/integrations/accounts/tokens/set", {
            accountID:   deviceUuid,
            accessToken: tokenResult.accessToken,
            expiresAt:   tokenResult.expiresAt,
          });
          
          common.conLog("Integrations: Access token refreshed for device " + deviceUuid, "gre");
          account.accessToken = tokenResult.accessToken; // update local copy so subsequent checks see the new value
          account.expiresAt   = tokenResult.expiresAt;
        }
        
        const pullResult = await converter.pullChanges(account); // 4. Pull latest provider values once per sync cycle

        for (const event of pullResult.events) { // 5. Emit each event via standard device values path
          let message    = {};
          message.uuid   = event.uuid; // equals deviceUuid (one device per account)
          message.bridge = BRIDGE_PREFIX;
          message.values = { [event.property]: { value: event.value, valueAsNumeric: Number(event.value), valueType: event.valueType } };
          mqttClient.publish("server/devices/values/get", JSON.stringify(message));
        }
      }
      catch (error) {
        syncError = error.message;
        common.conLog("Integrations: Sync error for device " + deviceUuid + ": " + error.message, "red");
      }
      
      try { // 6. Finish the sync run record regardless of success or failure
        await rpcCall("server/integrations/syncrun/finish", {
          syncRunID: syncRunID,
          error:     syncError,
        });
      }
      catch (error) {
        common.conLog("Integrations: Could not finish sync run " + syncRunID + ": " + error.message, "red");
      }
    }

    syncRunning = false;
    common.conLog("Integrations: Sync cycle finished", "yel");
  }

  /**
   * Starts the periodic sync scheduler.
   * Interval is read from config; default 5 minutes.
   * Guard ensures the scheduler is only started once even if reconnect fires.
   * @function startSyncScheduler
   */
  let syncIntervalHandle = null;

  function startSyncScheduler() {
    if (syncIntervalHandle !== null)
    {
      return; // already running
    }

    const intervalMs = appConfig.CONF_integrationsServiceSyncIntervalMs;

    common.conLog("Integrations: Sync scheduler started (interval: " + intervalMs + " ms)", "gre");
    syncIntervalHandle = setInterval(runIntegrationsSync, intervalMs);
    runIntegrationsSync(); // run one cycle immediately so we don't wait a full interval on startup
  }

  // Re-register the connect handler so the scheduler starts on every (re)connect. We remove the original listener first to avoid calling mqttConnect twice.
  const savedMqttConnect = mqttConnect;
  mqttClient.removeListener("connect", mqttConnect);

  function mqttConnectWithScheduler() {
    savedMqttConnect();   // run original subscribe + device list request
    startSyncScheduler(); // then start the sync scheduler
  }
  mqttClient.on("connect", mqttConnectWithScheduler);

  /**
   * =============================================================================================
   * MQTT: incoming messages handler
   * ===============================
   */
  mqttClient.on("message", async function (topic, message) {
    topic    = topic.toString();
    message  = message.toString();

    common.conLog("MQTT: Getting incoming message from broker", "yel");
    common.conLog("Topic: " + topic, "std", false);
    common.conLog("Message: " + message, "std", false);

    try {
      const data = JSON.parse(message); // parse message to JSON
      
      if (data.callID && rpcPending[data.callID]) { // Correlate MQTT-RPC responses before the topic switch
        const pending = rpcPending[data.callID];
        clearTimeout(pending.timer);
        delete rpcPending[data.callID];
        pending.resolve(data);
        return; // response consumed; no further routing needed
      }

      switch (topic) {
        case "integrations/devices/refresh":
          mqttDevicesRefresh(data);
          break;
        case "integrations/devices/create":
          mqttDevicesCreate(data);
          break;
        case "integrations/devices/remove":
          mqttDevicesRemove(data);
          break;
        case "integrations/devices/update":
          mqttDevicesUpdate(data);
          break;
        case "integrations/devices/list":
          mqttDevicesList(data);
          break;
        default:
          common.conLog("Integrations: NOT found matching message handler for " + topic, "red");
      }
    }
    catch (error) { // if error while parsing message, log error
      common.conLog("MQTT: Error while parsing message:", "red");
      common.conLog(error, "std", false);
    }
  });

  /**
   * Refreshes the in-memory device list with the snapshot received from the server.
   * Called when the server sends a device list after our refresh request or after
   * any device was created or removed.
   * @param {Object} data - Message payload; data.devices is the array of device objects.
   */
  function mqttDevicesRefresh(data) {
    bridgeStatus.devicesRegisteredAtServer.clear();
    for (const device of data.devices) {
      bridgeStatus.devicesRegisteredAtServer.set(device.uuid, device);
    }
    common.conLog("Integrations: Listed all registered integrations devices from server and set bridge status", "gre");

    // Refreshing the device list can arrive after the scheduler already started.
    // Kick off a sync immediately so newly available accounts do not wait for the next interval.
    runIntegrationsSync();
  }

  /**
   * Handles a device creation request from the server route.
   * Forwards the full payload (including callID) to server/devices/create so the server
   * creates the device in the DB and resolves the pending HTTP response via callID.
   * No bridge-specific setup is needed for pull-based integrations devices.
   * @param {Object} data - Message payload forwarded from the server route.
   */
  function mqttDevicesCreate(data) {
    data.properties = buildDeviceProperties(data.productName, data.properties);

    common.conLog("Integrations: Request to create device " + data.uuid + ", forwarding to server", "yel");

    data.forceReconnect = false; // because this is HTTP, just refresh devices after creation and do not reconnect

    mqttClient.publish("server/devices/create", JSON.stringify(data)); // callID is preserved so the server resolves the pending HTTP response
  }

  /**
   * Removes a single device from the in-memory map and forwards the removal to the server.
   * The callID is preserved so the server resolves the pending HTTP response.
   * @param {Object} data - Message payload; data.uuid is the device UUID to remove.
   */
  function mqttDevicesRemove(data) {
    bridgeStatus.devicesRegisteredAtServer.delete(data.uuid); // remove device from map of registered devices
    common.conLog("Integrations: Device removed from bridge status: " + data.uuid, "yel");
    mqttClient.publish("server/devices/remove", JSON.stringify(data)); // callID is preserved so the server resolves the pending HTTP response
  }

  /**
   * Applies partial updates to a device entry in the in-memory map and forwards to the server.
   * @param {Object} data - Message payload; data.uuid and data.updates.
   */
  function mqttDevicesUpdate(data) {
    common.conLog("Integrations: Request to update device " + data.uuid, "yel");

    if (data && typeof data.updates === "object") {
      const existing = bridgeStatus.devicesRegisteredAtServer.get(data.uuid);
      if (existing) {
        bridgeStatus.devicesRegisteredAtServer.set(data.uuid, { ...existing, ...data.updates }); // update device with new data
      }
      common.conLog("Integrations: Updated bridge status (registered devices)", "gre", false);
    }
    else {
      common.conLog("Integrations: No updates provided, so not updated bridge status", "red", false);
    }

    mqttClient.publish("server/devices/update", JSON.stringify(data)); // forward to server so the devices table is updated
  }

  /**
   * Gets the list of devices registered at the bridge and sends it to the server.
   * @param {Object} data - Message payload; data.callID is echoed in the response.
   */
  function mqttDevicesList(data) {
    let message                       = {};
    message.bridge                    = BRIDGE_PREFIX;
    message.callID                    = data.callID;
    message.devicesRegisteredAtServer = [...bridgeStatus.devicesRegisteredAtServer.values()];
    message.devicesConnected          = [...bridgeStatus.devicesRegisteredAtServer.values()]; // all registered integrations devices are "connected"

    mqttClient.publish("server/devices/list", JSON.stringify(message)); // ... publish to MQTT broker
    common.conLog("Integrations: Listed all registered and connected devices from server", "gre");
  }

  /**
   * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the bridge.
   * Logs a message indicating that the bridge is closed and exits the process.
   */
  process.on("SIGINT", function () {
    common.conLog("Integrations: Graceful shutdown initiated ...", "yel");

    if (syncIntervalHandle !== null) { // stop the periodic sync scheduler
      clearInterval(syncIntervalHandle);
      syncIntervalHandle = null;
    }

    for (const callID of Object.keys(rpcPending)) { // drain outstanding RPC calls so their timers don't fire after exit
      clearTimeout(rpcPending[callID].timer);
      rpcPending[callID].reject(new Error("Integrations bridge shutting down"));
      delete rpcPending[callID];
    }

    let message    = {};
    message.bridge = BRIDGE_PREFIX;
    message.status = "offline";
    mqttClient.publish("server/bridge/status", JSON.stringify(message)); // publish offline status to MQTT broker

    mqttClient.end(false, {}, function () {
      common.conLog("Integrations: MQTT connection closed, shutdown complete", "mag");
      process.exit(0);
    });

    setTimeout(function () { // fallback exit in case MQTT end callback never fires
      common.conLog("Integrations: Shutdown timeout - forcing exit", "red");
      process.exit(1);
    }, appConfig.CONF_bridgesWaitShutdownSeconds * 1000);
  });
}

/**
 * Unhandled errors
 */
process.on("unhandledRejection", function (reason) {
  common.conLog("Integrations Bridge: Unhandled promise rejection: " + reason, "red");
});

/**
 * Uncaught exceptions
 */
process.on("uncaughtException", function (error) {
  common.conLog("Integrations Bridge: Uncaught exception: " + error.message, "red");
  common.conLog(error.stack, "std", false);
});

startBridge();
