/**
 * =============================================================================================
 * Integrations Bridge: External API providers <-> MQTT
 * =====================================================
 */

const appConfig = require("../config");
const common    = require("../common");

const BRIDGE_PREFIX = "integrations";

/**
 * Adapter registry — maps productName values to provider adapter modules.
 * See bridge - integrations/converters/index.js for details.
 */
const { getAdapter } = require("./converters/index");

/**
 * Pending MQTT-RPC calls: callID -> { resolve, reject, timer }
 * Populated by rpcCall(); resolved/rejected when the matching /response message arrives.
 */
const rpcPending = {};

/**
 * Starts the integrations bridge.
 * Connects to the MQTT broker, subscribes to "integrations/#", requests the initial device list,
 * and starts the periodic sync scheduler that polls external API providers.
 * No HTTP server is needed — this bridge communicates via MQTT only.
 * @async
 * @function startBridge
 */
async function startBridge() {
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
   * @param {string} topic   - Server topic to publish to (e.g. "server/integrations/cursor/get").
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
   * =============================================================================================
   * External sync scheduler
   * =======================
   * Runs on a configurable interval and iterates over all devices registered under this bridge.
   * For each device it:
   *   1. Looks up credentials in integrations_accounts (accountID = device UUID).
   *   2. Refreshes the access token via the provider adapter.
   *   3. Persists the new token to the server (via MQTT-RPC).
   *   4. Reads the last cursor.
   *   5. Pulls changed events page by page (up to CONF_integrationsServiceMaxPages).
   *   6. Deduplicates each event before emitting.
   *   7. Emits device values via server/devices/values/get (device already exists — no create needed).
   *   8. Persists the new cursor.
   *   9. Records the sync run outcome.
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

      const adapter = getAdapter(device.productName); // find API adapter by productName (e.g. "GoogleHealth")
      if (!adapter) {
        common.conLog("Integrations: No adapter for productName \"" + device.productName + "\" (device: " + deviceUuid + ")", "red");
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
        const tokenResult = await adapter.ensureAccessToken(account); // 1. Ensure access token is fresh (adapter handles OAuth refresh if needed)
        
        if (tokenResult.accessToken !== account.accessToken || tokenResult.expiresAt !== account.expiresAt) { // 2. Persist updated token if the adapter refreshed it
          await rpcCall("server/integrations/accounts/tokens/set", {
            accountID:   deviceUuid,
            accessToken: tokenResult.accessToken,
            expiresAt:   tokenResult.expiresAt,
          });
          account.accessToken = tokenResult.accessToken; // update local copy so subsequent checks see the new value
          account.expiresAt   = tokenResult.expiresAt;
        }
        
        const cursorResp = await rpcCall("server/integrations/cursor/get", { accountID: deviceUuid }); // 3. Read cursor (marks the end of the last successful sync window)
        let   cursor     = cursorResp.cursor || null;

        const maxPages  = appConfig.CONF_integrationsServiceMaxPages  || 10;
        const pageLimit = appConfig.CONF_integrationsServicePageLimit  || 100;
        let   pageCount = 0;
        let   hasMore   = true;
        
        while (hasMore && pageCount < maxPages) { // 4. Pull pages until the adapter signals no more data or we hit the page cap
          const pullResult = await adapter.pullChanges(account, { cursor, pageLimit });
          pageCount++;
          
          for (const event of pullResult.events) { // 5 + 6. Deduplicate and emit each event
            const dedupeKey = event.uuid + "::" + event.property + "::" + event.timestamp; // unique per device + property + timestamp

            const dedupeResp = await rpcCall("server/integrations/dedupe/check", {
              accountID: deviceUuid,
              key:       dedupeKey,
            });

            if (dedupeResp.exists) {
              continue; // already emitted in a previous sync cycle
            }

            // 7. Emit via standard device values path (device already exists — no create needed)
            let message    = {};
            message.uuid   = event.uuid; // equals deviceUuid (one device per account)
            message.bridge = BRIDGE_PREFIX;
            message.values = { [event.property]: { value: event.value, valueType: event.valueType } };
            mqttClient.publish("server/devices/values/get", JSON.stringify(message));

            await rpcCall("server/integrations/dedupe/add", { // record dedupe key so it is not re-emitted in future cycles
              accountID: deviceUuid,
              key:       dedupeKey,
            });
          }

          cursor  = pullResult.nextCursor;
          hasMore = pullResult.hasMore;
        }
        
        await rpcCall("server/integrations/cursor/set", { // 8. Persist the new cursor so the next cycle starts from where we left off
          accountID: deviceUuid,
          cursor:    cursor,
        });
      }
      catch (error) {
        syncError = error.message;
        common.conLog("Integrations: Sync error for device " + deviceUuid + ": " + error.message, "red");
      }
      
      try { // 9. Finish the sync run record regardless of success or failure
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
  }

  /**
   * Removes a single device from the in-memory map (called after server confirms removal).
   * @param {Object} data - Message payload; data.uuid is the device UUID to remove.
   */
  function mqttDevicesRemove(data) {
    bridgeStatus.devicesRegisteredAtServer.delete(data.uuid); // remove device from map of registered devices
    common.conLog("Integrations: Device removed from bridge status: " + data.uuid, "yel");
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
