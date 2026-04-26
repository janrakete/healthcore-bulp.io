/**
 * =============================================================================================
 * ZigBee - Bridge: ZigBee <-> MQTT
 * ================================
 */

const appConfig       = require("../config");
const common          = require("../common");

const BRIDGE_PREFIX = "zigbee"; 

/**
 * Load converters for devices
 */
const { Converters } = require("./Converters.js");
const convertersList = new Converters(); // create new object for converters

/**
 * Starts the ZigBee bridge and MQTT server.
 * Initializes the HTTP server, MQTT client, serial port for the ZigBee adapter, 
 * and defines all MQTT message handlers.
 * Automatically invoked on script startup.
 * @async
 * @function startBridgeAndServer
 * @description This function sets up the ZigBee bridge to listen for device discovery, connection, and disconnection events.
 */
async function startBridgeAndServer() {
  /**
   * =============================================================================================
   * Server
   * ======
  */
  const express = require("express");
  const app     = express();

  const server = require("http").createServer(app);
  server.listen(appConfig.CONF_portBridgeZigBee, function () {
    common.logoShow(BRIDGE_PREFIX, appConfig.CONF_portBridgeZigBee); // show logo
  });

  /**
   * Server info
   * @description Endpoint to retrieve basic information about the bridge.
   */
  app.get("/info", async function (request, response) {
    const data  = {};
    data.status = bridgeStatus.status;
    data.bridge = BRIDGE_PREFIX;
    data.port   = appConfig.CONF_portBridgeZigBee;
    common.conLog("Bridge info sent!", "gre");
    common.conLog("Bridge route 'Info' HTTP response: " + JSON.stringify(data), "std", false);
    return response.status(200).json(data);
  });  

  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt       = require("mqtt");
  let mqttOptions  = { clientId: BRIDGE_PREFIX, username: appConfig.CONF_brokerUsername, password: appConfig.CONF_brokerPassword };
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
   * Connects the MQTT client and subscribes to ZigBee-related topics.
   * @function
   * @description This function is called when the MQTT client successfully connects to the broker.
   */
  function mqttConnect() {
    mqttClient.subscribe(BRIDGE_PREFIX + "/#", function (error, granted) { // ... and subscribe to ZigBee topics
      common.conLog("MQTT: Subscribed to ZigBee topics from broker", "yel"); 
      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
      }
    });
  }
  mqttClient.on("connect", mqttConnect);

  /**
   * Handles MQTT reconnection events.
   * Re-subscribes to topics and re-publishes bridge status after broker reconnect.
   * @description The MQTT library auto-reconnects, but subscriptions may be lost. This handler ensures topics are re-subscribed and the server knows the current bridge state.
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
   * Helper functions
   * ================
   */

  /**
   * Searches for a device by its UUID within a given Map of devices.
   * @param {string} uuid - The device UUID to search for.
   * @param {Map<string, Object>} devices - The Map of known device objects (keyed by UUID).
   * @returns {Object|undefined} The matching device object, or `undefined` if not found.
   */
  function deviceFindByID(uuid, devices) {
    return devices.get(uuid);
  }

  /**
   * Get all information about a device
   * @param {string} uuid - The UUID of the device to get information for.
   * @param {Map<string, Object>} devices - The Map of known device objects (keyed by UUID).
   * @returns {Object|undefined} The device object with additional properties, or `undefined` if the device is not found or has no converter.
   * @description This function searches for a device by its ID in the provided Map of devices. If the device is found, it retrieves its converter from the converters list and checks if the device has a raw object and endpoints. If all checks pass, it returns the device object with additional properties; otherwise, it returns `undefined`.
  */
  function deviceGetInfo(uuid, devices) {
    let device = deviceFindByID(uuid, devices);
    if (device === undefined) {
      common.conLog("ZigBee: Device " + uuid + " not found in list", "red");
      return undefined; // if device is not in array, return undefined
    }
    else {
      device.deviceConverter = convertersList.find(device.productName);
      if (device.deviceConverter === undefined) { // if no converter is found for this device, set device to undefined
        common.conLog("ZigBee: No converter found for device " + uuid, "red");
        return undefined;
      }
      else {
        device.deviceRaw = zigBee.getDeviceByIeeeAddr(device.uuid); // save device object for later use
        if (device.deviceRaw === undefined) { // if device is not found, set device to undefined
          common.conLog("ZigBee: Cannot get raw data for device " + uuid, "red");
          return undefined;
        }
        else {
          if (device.deviceRaw.endpoints === undefined || device.deviceRaw.endpoints.length === 0) { // if device has no endpoints, set device to undefined
            common.conLog("ZigBee: Cannot get endpoint for device " + uuid, "red");
            return undefined;
          }
          else {
            device.endpoint = device.deviceRaw.endpoints[0];  // get first endpoint of the device
          }
        }
      }
    }
    return device;
  }

  /**
   * Check if device is wired
   * @param {Object} device - The device object to check.
   * @returns {boolean} True if the device is wired, false otherwise.
   */
  function deviceIsWired(device) {
    if (device.powerType && device.powerType === "MAINS") {
      return true;
    }
    else {
      return false;
    }
  }

  /**
   * Ping a device.
   * @param {Object} device - The device object to ping.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the device is pingable, or `false` if it is not.
   * @description This function attempts to read the "zclVersion" attribute from the device
  */
  async function deviceIsPingable(device) {
    try {
      const result = await device.endpoint.read("genBasic", ["zclVersion"]);
      return true;
    }
    catch (error) {
      return false;
    }
  }

  /**
   * Class representing the status of the ZigBee bridge. Contains arrays for connected devices and registered devices at the server.
   * @class
   * @property {Map<string, Object>} devicesConnected - Map of currently connected ZigBee devices (keyed by UUID).
   * @property {Map<string, Object>} devicesRegisteredAtServer - Map of devices registered at the server (keyed by UUID)
   * @property {string|null} deviceScanCallID - ID of the current device scan call, if any.
   * @property {string} status - Status of the bridge ("online" or "offline").
   * @description This class is used to manage the status of the ZigBee bridge, including connected devices and those registered at the server.
   */
  class BridgeStatus {
    constructor() {
      this.devicesConnected          = new Map();
      this.devicesRegisteredAtServer = new Map();
      this.lastKnownValues           = new Map(); // cache of last known values per device (keyed by UUID)
      this.deviceLastSeen            = new Map(); // Map of UUID -> timestamp of last data received (for watchdog)
      this.batteryAlertsSent         = new Map(); // Map of UUID -> timestamp of last battery alert (to prevent alert spam)
      this.devicesBlocklist          = new Map(); // Map of IEEE address -> timestamp, blocked from re-joining the network after removal
      this.maintenanceInterval       = undefined; // Interval timer for the maintenance loop (watchdog + signal strength)
      this.deviceScanCallID          = undefined;
      this.status                    = "offline";
    }
  }
  const bridgeStatus = new BridgeStatus(); // create new object for bridge status

  /**
   * Updates the last-seen timestamp for a device. Called whenever data is received from or read for a device.
   * @param {string} uuid - The device UUID.
   */
  function deviceUpdateLastSeen(uuid) {
    bridgeStatus.deviceLastSeen.set(uuid, Date.now());
  }

  /**
   * Checks if the given values contain a battery level reading and publishes a low-battery alert if the level is at or below the threshold. Alerts are rate-limited per device to avoid spam.
   * @param {string} uuid - The device UUID.
   * @param {Object} values - The values object (property name -> { value, valueAsNumeric }).
   */
  function deviceBatteryCheck(uuid, values) {
    if (!values || !values.battery) {
      return;
    }

    const batteryValue = values.battery.valueAsNumeric !== null ? values.battery.valueAsNumeric : values.battery.value; // prefer numeric value if available, otherwise use raw value
    if (typeof batteryValue !== "number") { // safety check
      return;
    }

    common.conLog("ZigBee: Battery level for " + uuid + ": " + batteryValue + "%", "std", false);

    if (batteryValue <= appConfig.CONF_devicesZigBeeBatteryThresholdPercent) {
      const lastAlert = bridgeStatus.batteryAlertsSent.get(uuid); // check when the last alert for this device was sent to prevent alert spam
      const now       = Date.now();

      if (lastAlert && (now - lastAlert) < appConfig.CONF_devicesZigBeeBatteryAlertCooldownHours * 60 * 60 * 1000) {
        common.conLog("ZigBee: Low battery alert for " + uuid + " suppressed (cooldown active)", "std", false);
        return;
      }

      bridgeStatus.batteryAlertsSent.set(uuid, now);

      const alert = {
        bridge:      BRIDGE_PREFIX,
        uuid:        uuid,
        type:        "low_battery",
        value:       batteryValue,
        threshold:   appConfig.CONF_devicesZigBeeBatteryThresholdPercent,
        timestamp:   now
      };

      mqttClient.publish("server/devices/alert", JSON.stringify(alert));

      common.conLog("ZigBee: Low battery alert for " + uuid + ": " + batteryValue + "% (threshold: " + appConfig.CONF_devicesZigBeeBatteryThresholdPercent + "%)", "red");
    }
  }

  /**
   * Starts the unified device maintenance loop that periodically performs ZigBee housekeeping
   * tasks sequentially in a single interval:
   *   1. Watchdog check (in-memory only) — alerts on unresponsive devices
   *   2. Signal strength polling for all connected mains-powered devices (LQI → normalized 0–100 %)
   */
  function deviceMaintenanceStart() {
    if (bridgeStatus.maintenanceInterval) { // already running
      return; 
    }

    common.conLog("ZigBee: Maintenance loop started (every " + appConfig.CONF_devicesZigBeeMaintenanceIntervalSeconds + "s)", "gre");

    bridgeStatus.maintenanceInterval = setInterval(async () => {
      if (bridgeStatus.status !== "online") {
        return;
      }

      common.conLog("ZigBee: Maintenance loop running ...", "yel", false);

      // Phase 1: Watchdog (pure in-memory check)
      if (Number(bridgeStatus.devicesConnected.size) > 0) {
        const now = Date.now();

        for (const device of bridgeStatus.devicesConnected.values()) {
          const lastSeen = bridgeStatus.deviceLastSeen.get(device.uuid);

          if (lastSeen === undefined) { // device just connected, no data yet — skip until first data arrives
            continue;
          }

          const silentDuration = now - lastSeen;

          if (silentDuration > appConfig.CONF_devicesZigBeeWatchdogTimeoutSeconds * 1000) {
            common.conLog("ZigBee: WATCHDOG - Device " + device.uuid + " (" + device.productName + ") is unresponsive (no data for " + Math.round(silentDuration / 1000) + "s)", "red");

            const alert = {
              bridge:         BRIDGE_PREFIX,
              uuid:           device.uuid,
              productName:    device.productName,
              type:           "unresponsive",
              silentSeconds:  Math.round(silentDuration / 1000),
              timeout:        appConfig.CONF_devicesZigBeeWatchdogTimeoutSeconds,
              timestamp:      now
            };

            mqttClient.publish("server/devices/alert", JSON.stringify(alert));
          }
        }
      }

      // Phase 2: Signal strength polling for connected mains-powered devices (LQI → normalized 0–100 %)
      for (const device of bridgeStatus.devicesConnected.values()) {
        if (deviceIsWired(device) && device.deviceRaw) {
          try {
            const lqi = device.deviceRaw.linkquality; // zigbee-herdsman getter: cached numeric LQI (0–255)

            if (typeof lqi === "number" && Number.isFinite(lqi)) {
              const strength = Math.round((lqi / 255) * 100); // normalize LQI (0–255) to percentage (0–100)

              const message = {
                uuid:        device.uuid,
                bridge:      BRIDGE_PREFIX,
                strength:    strength,
                timestamp:   Date.now()
              };

              mqttClient.publish("server/devices/strength", JSON.stringify(message));
              common.conLog("ZigBee: Signal strength for " + device.uuid + ": " + strength + "% (LQI: " + lqi + ")", "std", false);
            }
          }
          catch (error) {
            common.conLog("ZigBee: Error reading signal strength for " + device.uuid + ": " + error.message, "red");
          }
        }
      }
    }, appConfig.CONF_devicesZigBeeMaintenanceIntervalSeconds * 1000);
  }

  /**
   * Stops the unified device maintenance loop.
   */
  function deviceMaintenanceStop() {
    if (bridgeStatus.maintenanceInterval !== undefined) {
      clearInterval(bridgeStatus.maintenanceInterval);
      bridgeStatus.maintenanceInterval = undefined;
      common.conLog("ZigBee: Maintenance loop stopped", "yel");
    }
  }

  /**
   * =============================================================================================
   * Events at ZigBee adapter (but first, disable debug logging of zigbee-herdsman)
   * ==============================================================================
   */  
  const { setLogger } = require("zigbee-herdsman/dist/utils/logger");
  setLogger({
    debug: () => {},
    info: console.info,
    warning: console.warn,
    error: console.error,
  });

  const {Controller: ZigBeeController}  = require("zigbee-herdsman"); 
  const zigBee = new ZigBeeController({
    serialPort: { path: appConfig.CONF_zigBeeAdapterPort, adapter: appConfig.CONF_zigBeeAdapterName },
    databasePath: "./devices.db",
    acceptJoiningDeviceHandler: (ieeeAddr) => !bridgeStatus.devicesBlocklist.has(ieeeAddr) // reject devices on blocklist
  });

  /**
   * Reconnection state for the ZigBee adapter. Uses exponential backoff with a maximum delay.
   */
  let zigBeeReconnectAttempt = 0;
  let zigBeeReconnectTimer   = null;

  /**
   * Start ZigBee controller
   * @param {boolean} isReconnect - Whether this is a reconnect attempt.
   */
  async function zigBeeStart(isReconnect = false) {
    let data    = {};
    data.bridge = BRIDGE_PREFIX;

    try {
      await zigBee.start();
      data.status            = "online";
      zigBeeReconnectAttempt = 0; // reset backoff on success
      common.conLog("ZigBee: Bridge started" + (isReconnect ? " (reconnected)" : ""), "gre");

      deviceMaintenanceStart(); // start watchdog + signal strength maintenance loop

      if (isReconnect === true) { // after a successful reconnect, re-request device list and reconnect all devices
        let refreshMsg            = {};
        refreshMsg.bridge         = BRIDGE_PREFIX;
        refreshMsg.forceReconnect = true;
        mqttClient.publish("server/devices/refresh", JSON.stringify(refreshMsg));
      }
    }
    catch (error) {
      data.status = "offline";
      common.conLog("ZigBee: Error while starting ZigBee controller:", "red");
      common.conLog(error, "std", false);

      zigBeeScheduleReconnect(); // schedule a reconnect attempt with exponential backoff

    }
    bridgeStatus.status = data.status;
    mqttClient.publish("server/bridge/status", JSON.stringify(data)); // publish to MQTT broker
  }

  /**
   * Schedules a ZigBee adapter reconnect attempt with exponential backoff.
   * @function zigBeeScheduleReconnect
   */
  function zigBeeScheduleReconnect() {
    if (zigBeeReconnectTimer) {
      clearTimeout(zigBeeReconnectTimer); // clear any existing timer
    }
    const delay = Math.min(appConfig.CONF_devicesZigBeeAdapterReconnectBaseDelaySeconds * 1000 * Math.pow(2, zigBeeReconnectAttempt), appConfig.CONF_devicesZigBeeAdapterReconnectMaxDelaySeconds * 1000);
    zigBeeReconnectAttempt++;
    common.conLog("ZigBee: Scheduling reconnect attempt #" + zigBeeReconnectAttempt + " in " + (delay / 1000) + " seconds", "yel");
    zigBeeReconnectTimer = setTimeout(async function () {
      common.conLog("ZigBee: Reconnect attempt #" + zigBeeReconnectAttempt + " ...", "yel");
      try {
        await zigBee.stop();
      }
      catch (error) {
        // Ignore stop errors during reconnect — adapter may already be disconnected
      }
      await zigBeeStart(true);
    }, delay);
  }

  await zigBeeStart();

  /**
   * Request all registered ZigBee devices from server via MQTT broker
   */
  let message              = {};
  message.bridge           = BRIDGE_PREFIX;
  message.forceReconnect   = true;  
  mqttClient.publish("server/devices/refresh", JSON.stringify(message));
  
  /**
   * This event is triggered when a new device joins the ZigBee network.
   * It logs the device information and publishes a message to the MQTT broker.
   * @param {Object} data - The data object containing information about the device that has joined.
   * @event deviceJoin
   * @description This event is triggered when a new device joins the ZigBee network. It logs the device information and publishes a message to the MQTT broker.
  */
  zigBee.on("deviceInterview", async function (data) {
    try {
      let message                = {};
      message.uuid               = data.device.ieeeAddr;
      message.lastSeen           = data.device.lastSeen;
      message.vendorName         = data.device.manufacturerName;
      message.productName        = data.device.modelID;
      message.softwareBuildID    = data.device.softwareBuildID;
      message.type               = data.device.type;
      message.bridge             = BRIDGE_PREFIX;
      message.callID             = bridgeStatus.deviceScanCallID; // add callID if device is discovered during scanning

      if (data.device.interviewState === "PENDING") {
        common.conLog("ZigBee: device is currently interviewing", "yel");
        common.conLog(message, "std", false);

        mqttClient.publish("server/devices/discover", JSON.stringify(message)); // ... publish to MQTT broker
      }
      else if (data.device.interviewState === "SUCCESSFUL") {
        common.conLog("ZigBee: device has joined and been interviewed", "gre");

        const deviceConverter = convertersList.find(message.productName); // get converter for device from list of converters
        if (deviceConverter === undefined) { 
          common.conLog("ZigBee: No converter found for " + message.productName, "red");
          message.powerType = "?"; 
        }
        else {
          common.conLog("ZigBee: Converter found for " + message.productName, "gre");
          message.powerType   = deviceConverter.powerType;
          message.properties  = common.devicePropertiesToArray(deviceConverter.properties);        
        }

        common.conLog(message, "std", false);
        mqttClient.publish("server/devices/discover", JSON.stringify(message)); // make a final publish with all information about the device after interview is complete (including converter info if available)

        message.forceReconnect = true; // because this is ZigBee, reconnect device after creation

        mqttClient.publish("server/devices/create", JSON.stringify(message)); // ... publish to MQTT broker
      }
    }
    catch (error) {
      common.conLog("ZigBee: Error in deviceInterview event handler: " + error.message, "red");
    }
  });

  /**
   * This event is triggered when a device leaves the ZigBee network. It logs the device information and publishes a message to the MQTT broker.
   * @param {Object} data - The data object containing information about the device that has left.
   * @event deviceLeave
   * @description This event is triggered when a device leaves the ZigBee network. It logs the device information and publishes a message to the MQTT broker.
  */
  zigBee.on("deviceLeave", function (data) {
    try {
      common.conLog("ZigBee: device has left", "yel");
      common.conLog(data, "std", false);

      bridgeStatus.devicesConnected.delete(data.ieeeAddr); // remove device from map of connected devices
      bridgeStatus.devicesRegisteredAtServer.delete(data.ieeeAddr); // remove device from map of registered devices
      bridgeStatus.deviceLastSeen.delete(data.ieeeAddr); // remove device from watchdog tracking

      let message      = {};
      message.uuid     = data.ieeeAddr;
      message.bridge   = BRIDGE_PREFIX;
      mqttClient.publish("server/devices/remove", JSON.stringify(message)); // ... publish to MQTT broker

      message           = {}; // create message for MQTT broker about device status
      message.uuid      = data.ieeeAddr;
      message.bridge    = BRIDGE_PREFIX;
      message.status    = "offline";
      mqttClient.publish("server/devices/status", JSON.stringify(message));
    }
    catch (error) {
      common.conLog("ZigBee: Error in deviceLeave event handler: " + error.message, "red");
    }
  });

  /**
   * This event is triggered when a device announces itself on the ZigBee network. It checks if the device is registered at the server and attempts to add it to the list of connected devices.
   * @param {Object} data - The data object containing information about the device that has announced itself.
   * @event deviceAnnounce 
   * @description This event is triggered when a device announces itself on the ZigBee network.
   */
  zigBee.on("deviceAnnounce", function (data) {
    try {
      common.conLog("ZigBee: device has announced, try to add to connected devices", "yel");

      const uuid = data.device.ieeeAddr;

      deviceUpdateLastSeen(uuid);  // Update last-seen timestamp — device just announced, so it's alive
      
      let device = deviceFindByID(uuid, bridgeStatus.devicesRegisteredAtServer); // search device in map of registered devices
      if (device) { // if device is in array of registered devices, add to array connected devices
        common.conLog("ZigBee: Device " + device.uuid + " is registered at server - trying to connect", "yel");

        data = deviceGetInfo(uuid, bridgeStatus.devicesRegisteredAtServer);
        if (data === undefined) {
          common.conLog("ZigBee: Device " + uuid + " NOT added to list of connected devices", "red");
        }
        else {
          const deviceConnected = bridgeStatus.devicesConnected.get(uuid); // check if device is already in map of connected devices
          if (deviceConnected === undefined) { // if device is not in map of connected devices, add it
            common.conLog("ZigBee: Device " + data.uuid + " added to list of connected devices", "gre");
            bridgeStatus.devicesConnected.set(data.uuid, data); // add device to map of connected devices
          }
        }
      }
      else {
        common.conLog("... but is not registered at server", "std", false);      
      }
    
      let message      = {};
      message.uuid     = uuid;
      message.bridge   = BRIDGE_PREFIX;
      mqttClient.publish("zigbee/devices/announced", JSON.stringify(message)); // ... publish to MQTT broker

      message           = {}; // create message for MQTT broker about device status
      message.uuid      = uuid;
      message.bridge    = BRIDGE_PREFIX;
      message.status    = "online";
      mqttClient.publish("server/devices/status", JSON.stringify(message));
    }
    catch (error) {
      common.conLog("ZigBee: Error in deviceAnnounce event handler: " + error.message, "red");
    }
  });

  /**
   * This event is triggered when a device sends a message on the ZigBee network. It processes the message, retrieves the appropriate converter for the device, and publishes the message to the MQTT broker.
   * @param {Object} data - The data object containing information about the device and the message that has been sent.
   * @event message 
   * @description This event is triggered when a device sends a message on the ZigBee network. It processes the message, retrieves the appropriate converter for the device, and publishes the message to the MQTT broker.
  */
  zigBee.on("message", async function (data) {
    try {
      let message          = {};
      message.uuid         = data.device.ieeeAddr;
      message.productName  = data.device.modelID;
      message.values       = {};
      message.bridge       = BRIDGE_PREFIX;

      deviceUpdateLastSeen(message.uuid); // Update last-seen timestamp for watchdog

      common.conLog("ZigBee: Device " + message.uuid + " sends message", "yel");

      const device          = data.device;
      const deviceConverter = convertersList.find(device.modelID); // get converter for this device

      if (deviceConverter)  {
        common.conLog("ZigBee: Device converter found", "gre");
        const properties = deviceConverter.getPropertyByClusterName(data.cluster);

        if (properties) {
          for (const [attribute, property] of Object.entries(properties)) {
            common.conLog("ZigBee: Information about property name '" + property.name + "' (original attribute: '" + attribute + "')", "yel");
            common.conLog("ZigBee: Property details", "std", false);
            common.conLog(property, "std", false);
            common.conLog("ZigBee: data details", "std", false);
            common.conLog(data, "std", false);
            message.values[property.name] = deviceConverter.get(property, data.type, data.data); // get converted value for property
          }
        }
        else {
          common.conLog("ZigBee: No property found for cluster " + data.cluster, "red");
        }
      }
      else {
        common.conLog("ZigBee: No converter found for " + device.modelID, "red");
        message.message = "Device not supported";
      }

      mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker

      deviceBatteryCheck(message.uuid, message.values); // check for low battery and publish alert if needed

      if (message.values && Number(Object.keys(message.values).length) > 0) { // cache last known values for this device (useful for battery-powered devices that sleep)
        const cached = bridgeStatus.lastKnownValues.get(message.uuid) || {};
        bridgeStatus.lastKnownValues.set(message.uuid, { ...cached, ...message.values, _lastUpdated: Date.now() });
      }
    }
    catch (error) {
      common.conLog("ZigBee: Error in message event handler: " + error.message, "red");
    }
  });

  /**
   * This event is triggered when the permit join status of the ZigBee network changes. It logs the new status and publishes a message to the MQTT broker indicating whether joining is permitted or not.
   * @param {Object} data - The data object containing the new permit join status.
   * @event permitJoinChanged
   * @description This event is triggered when the permit join status of the ZigBee network changes. It logs the new status and publishes a message to the MQTT broker indicating whether joining is permitted or not.
  */
  zigBee.on("permitJoinChanged", function (data) {
    common.conLog("ZigBee: joining status has been changed to", "yel");
    common.conLog(data, "std", false);

    if (data.permitted === false) {
      bridgeStatus.deviceScanCallID = undefined;    
    }

    let message      = {};
    message.scanning = data.permitted;
    message.bridge   = BRIDGE_PREFIX;

    mqttClient.publish("server/devices/scan/status", JSON.stringify(message)); // ... publish to MQTT broker
  });

  /**
   * This event is triggered when the ZigBee adapter is disconnected. It logs the disconnection and publishes a message to the MQTT broker indicating that the bridge is offline.
   * @event adapterDisconnected
   * @description This event is triggered when the ZigBee adapter is disconnected. It logs the disconnection and publishes a message to the MQTT broker indicating that the bridge is offline.
  */
  zigBee.on("adapterDisconnected", function () {
    common.conLog("ZigBee: adapter has been disconnected", "red");

    let message    = {};
    message.status = "offline";
    message.bridge = BRIDGE_PREFIX;    
    
    bridgeStatus.deviceScanCallID   = undefined;
    bridgeStatus.status             = message.status;
    bridgeStatus.devicesConnected.clear(); // clear connected devices since adapter is gone

    deviceMaintenanceStop(); // stop the maintenance loop since adapter is gone
    
    mqttClient.publish("server/bridge/status", JSON.stringify(message)); // ... publish to MQTT broker

    // Automatically attempt to reconnect the ZigBee adapter
    common.conLog("ZigBee: Will attempt automatic reconnect ...", "yel");
    zigBeeScheduleReconnect();
  });

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

      switch (topic) {
        case "zigbee/devices/scan":
          mqttDevicesScan(data);
          break;
        case "zigbee/devices/reconnect": // this message is used to connect to ALL registered devices
          mqttDevicesReconnect(data);
          break;
        case "zigbee/devices/connect": // this message is used to connect to ONE specific device
          mqttDevicesConnect(data);
          break;
        case "zigbee/devices/remove":
          mqttDevicesRemove(data);
          break;
        case "zigbee/devices/values/set":
          mqttDevicesValuesSet(data);
          break;
        case "zigbee/devices/values/get":
          mqttDevicesValuesGet(data);
          break;
        case "zigbee/devices/refresh":
          mqttDevicesRefresh(data);
          break;
        case "zigbee/devices/list":
          mqttDevicesList(data);
          break;
        case "zigbee/devices/update":
          mqttDevicesUpdate(data);
          break;
        case "zigbee/devices/create":
          mqttDevicesCreate(data);
          break;
        default:
          common.conLog("ZigBee: NOT found matching message handler for " + topic, "red");
      }
    }
    catch (error) { // if error while parsing message, log error
      common.conLog("MQTT: Error while parsing message:", "red");     
      common.conLog(error, "std", false);
    }  
  });

  /**
   * If message is for scanning devices, then start ZigBee bridge to allow joining of devices
   * @param {Object} data - The data object containing the duration for which joining is permitted.
   * @description This function is called when a message is received on the "zigbee/devices/scan" topic. It allows the ZigBee bridge to permit joining of devices for a specified duration.
   */
  function mqttDevicesScan(data) {
    bridgeStatus.deviceScanCallID = data.callID;

    const duration = Math.max(0, Math.min(parseInt(data.duration) || 0, 254)); // ensure duration is a valid integer between 0 and 254 (ZigBee spec limit)

    if (duration <= 0) {
      common.conLog("ZigBee: Invalid scan duration requested (only 1-254 seconds allowed), ignoring", "red");
      return;
    }
   
    bridgeStatus.devicesBlocklist.clear(); // Clear the blocklist so previously removed devices can be re-added during this scan

    common.conLog("ZigBee: Joining possible for " + duration + " seconds", "yel");
    zigBee.permitJoin(duration);
    // -> MQTT publish is not needed here, because this is done in the event permitJoinChanged
  }

  /**
   * Gets the list of devices registered and connected at the bridge based on the provided data.
   * @param {Object} data 
   * @description This function sends OUT from the bridge the list of devices registered and connected at the bridge.
   */
  function mqttDevicesList(data) {
    let message                   = {};
    message.bridge                = BRIDGE_PREFIX;
    message.callID                = data.callID;

    message.devicesRegisteredAtServer  = [...bridgeStatus.devicesRegisteredAtServer.values()]; 
    message.devicesConnected           = [...bridgeStatus.devicesConnected.values()];
    message.devicesConnected = message.devicesConnected.map(device => { // delete deviceRaw, deviceConverter and endpoint from devicesConnected, because they cannot be stringified
      const deviceCopy = { ...device };
      delete deviceCopy.deviceRaw;
      delete deviceCopy.deviceConverter;
      delete deviceCopy.endpoint;
      return deviceCopy;
    });

    mqttClient.publish("server/devices/list", JSON.stringify(message)); // ... publish to MQTT broker
    common.conLog("ZigBee: Listed all registered and connected devices from server", "gre");
  }

  /**
   * Refreshes the list of devices registered at the server based on the provided data
   * @param {Object} data 
   * @description This function updates IN the bridge the list of devices registered at the server.
   */
  function mqttDevicesRefresh(data) {
    bridgeStatus.devicesRegisteredAtServer.clear();
    for (const device of data.devices) {
      bridgeStatus.devicesRegisteredAtServer.set(device.uuid, device);
    }
  }

  /**
   * If message is for reconnecting to registered devices, start scanning for devices
   * @param {Object} data - The data object containing the devices to connect to.
   * @description This function handles the request to connect to registered devices by scanning for them and publishing
   */
  function mqttDevicesReconnect(data) {
    bridgeStatus.devicesRegisteredAtServer.clear(); // reset map of registered devices
    for (const device of data.devices) {
      bridgeStatus.devicesRegisteredAtServer.set(device.uuid, device);
    }
    bridgeStatus.devicesConnected.clear(); // reset map of connected devices
    common.conLog("ZigBee: Request to connect to devices", "yel");
    
    for (const device of bridgeStatus.devicesRegisteredAtServer.values()) {
      mqttDevicesConnect(device); // try to connect to each device
    }
  }

  /**
   * Updates the information of a registered device.
   * @param {Object} data 
   * @description This function updates the information of a registered device.
   */
  function mqttDevicesUpdate(data) {
    common.conLog("ZigBee: Request to update device " + data.uuid, "yel");

    if (data && typeof data.updates === "object") {
      const deviceToUpdateReg = bridgeStatus.devicesRegisteredAtServer.get(data.uuid);
      if (deviceToUpdateReg) {
        bridgeStatus.devicesRegisteredAtServer.set(data.uuid, { ...deviceToUpdateReg, ...data.updates }); // update device with new data
      }
      const deviceToUpdateCon = bridgeStatus.devicesConnected.get(data.uuid);
      if (deviceToUpdateCon) {
        bridgeStatus.devicesConnected.set(data.uuid, { ...deviceToUpdateCon, ...data.updates }); // update device with new data
      }

      common.conLog("ZigBee: Updated bridge status (registered and connected devices)", "gre", false);
    }
    else {
      common.conLog("ZigBee: No updates provided, so not updated bridge status", "red", false);
    }

    mqttClient.publish("server/devices/update", JSON.stringify(data)); // publish updated device to MQTT broker
  }

  /**
   * If message is for connecting to registered devices, then try to connect to each device
   * @param {Object} data - The data object containing an array of devices to connect to.
   * @description This function is called when a message is received on the "zigbee/devices/connect" topic. It iterates through the array of devices provided in the message and attempts to connect to each device. If the device is mains-powered, it checks if the device is pingable before adding it to the list of connected devices.
   */
  async function mqttDevicesConnect(data) {
    const device = deviceGetInfo(data.uuid, bridgeStatus.devicesRegisteredAtServer); // get device information

    if (device) {
      device.callID = data.callID !== undefined ? data.callID : null; // add callID to device if provided
      common.conLog("ZigBee: Try to connect to device " + device.uuid + " ...", "yel");
      if (deviceIsWired(device)) { // if device is wired, then it's pingable
        common.conLog("... Device " + device.uuid + " is wired and pingable ...", "std", false);
        if (await deviceIsPingable(device)) {
          common.conLog("... and added " + device.uuid + " to list of connected devices", "gre", false);
          bridgeStatus.devicesConnected.set(device.uuid, device); // add device to map of connected devices
        }
        else {
          common.conLog("... but " + device.uuid + " was not pingable and added not to list of connected devices", "red", false);
        }
      }
      else {
        common.conLog("... Device " + device.uuid + " is not wired and not pingable ...", "std", false);
        common.conLog("... so just added to list of connected devices", "gre", false);
        bridgeStatus.devicesConnected.set(device.uuid, device); // add device to map of connected devices
      }

      common.conLog("ZigBee: Check if device converter has setupReporting function ...", "yel");
      if (device.deviceConverter !== undefined && device.deviceConverter.setupReporting !== undefined ) {
        common.conLog("ZigBee: Device converter has setupReporting function, trying to call it ...", "gre", false);

        try {
          const coordinatorDevice = zigBee.getDevices().find(zigBeeDevice => zigBeeDevice.type === "Coordinator");
          if (!coordinatorDevice) {
            common.conLog("ZigBee: Coordinator device not found, cannot setup reporting for " + device.uuid, "red");
            return;
          }

          const coordinatorEndpoint = coordinatorDevice.getEndpoint(1);
          if (!coordinatorEndpoint) {
            common.conLog("ZigBee: Could not get endpoint 1 from coordinator, cannot setup reporting for " + device.uuid, "red");
            return;
          }

          await device.deviceConverter.setupReporting(device.deviceRaw, coordinatorEndpoint);
        }
        catch (error) {
          common.conLog("ZigBee: Error setting up reporting for " + device.uuid + ": " + error.message, "red");
        }
      }
      else {
        common.conLog("ZigBee: Device converter has no setupReporting function", "std", false);
      }

      mqttClient.publish("server/devices/connect", JSON.stringify(device));        
    }
  }

  /**
   * If message is for removing a connected device (this message is sent AFTER server removed device)
   * @param {Object} data - The data object containing the device UUID to remove.
   * @description This function is called when a message is received on the "zigbee/device/remove" topic. It searches for the device in the array of connected devices and attempts to remove it from the network and database. 
   */
  async function mqttDevicesRemove(data) {
    common.conLog("ZigBee: Request for removing " + data.uuid, "yel");

    data.bridge  = BRIDGE_PREFIX;
    const device = bridgeStatus.devicesConnected.get(data.uuid); // search device in map of connected devices

    if (device) { // if device is in map of connected devices, try do disconnect
      bridgeStatus.devicesBlocklist.set(data.uuid, Date.now()); // Block device from re-joining BEFORE sending the leave command.
      common.conLog("ZigBee: Device " + data.uuid + " added to blocklist", "yel");

      try {
        await device.deviceRaw.removeFromNetwork();
      }
      catch (error) {
        common.conLog("ZigBee: Could not remove " + data.uuid + " from network (device may be unreachable): " + error.message, "red");
      }
      try {
        await device.deviceRaw.removeFromDatabase();
      }
      catch (error) {
        common.conLog("ZigBee: Could not remove " + data.uuid + " from database: " + error.message, "red");
      }
      bridgeStatus.devicesRegisteredAtServer.delete(data.uuid); // remove device from map of devices registered at server
      bridgeStatus.devicesConnected.delete(data.uuid); // remove device from map of connected devices
      common.conLog("ZigBee: Device disconnected and removed: " + data.uuid, "gre");

      mqttClient.publish("server/devices/remove", JSON.stringify(data)); // publish removed device to MQTT broker
    }
  }

  /**
   * If message is for getting properties and values of a connected device
   * @param {Object} data - The data object containing the device UUID and properties to get.
   * @description This function is called when a message is received on the "zigbee/device/get" topic. It attempts to read the specified properties of a connected ZigBee device and publishes the values to the MQTT broker.
   */
  async function mqttDevicesValuesGet(data) {
    common.conLog("ZigBee: Request for getting properties and values of " + data.uuid, "yel");
    const device = bridgeStatus.devicesConnected.get(data.uuid); // search device in map of connected devices

    let message                   = {};
    message.uuid                  = data.uuid;
    message.values                = {};
    message.bridge                = BRIDGE_PREFIX;
    message.callID                = data.callID;

    if (device) { // if device is in array of connected devices, try do get desired values
      if (deviceIsWired(device)) { // if device is wired, then it's pingable and able to read values
        common.conLog("... Device " + device.uuid + " is wired and pingable ...", "std", false);
        if (await deviceIsPingable(device)) {

          if (!data.properties) { // if no properties are defined, then read all properties
            data.properties = []; // create array for properties
            for (const [clusterName, properties] of Object.entries(device.deviceConverter.properties)) { // for each cluster in converter
              for (const [attributeName, property] of Object.entries(properties)) { // for each property in cluster
                data.properties.push(property.name);
              }
            }
          }

          if (data.properties) { // if properties are defined, then read these properties
            for (const propertyName of data.properties) { // for each property in requested properties
              const cluster = device.deviceConverter.getClusterAndAttributeByPropertyName(propertyName); // get cluster and attribute by property name from converter
              
              if (cluster === undefined) { // if cluster is not found, log error
                common.conLog("ZigBee: No cluster found for property " + propertyName, "red");
              }
              else {
                try {
                  const attribute              = await device.endpoint.read(cluster.cluster, [cluster.attribute]);
                  message.values[propertyName] = device.deviceConverter.get(device.deviceConverter.getPropertyByAttributeName(cluster.attribute), attribute[cluster.attribute]); // get converted value for property
                }
                catch (error) {
                  common.conLog("ZigBee: Error reading property " + propertyName + " from device " + data.uuid + ": " + error.message, "red");
                }
              }
            }

            // Update last known values cache with successfully read values
            if (Number(Object.keys(message.values).length) > 0) {
              const cached = bridgeStatus.lastKnownValues.get(data.uuid) || {};
              bridgeStatus.lastKnownValues.set(data.uuid, { ...cached, ...message.values, _lastUpdated: Date.now() });
            }

            mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
          }
        }
        else {
          common.conLog("... but " + device.uuid + " was not pingable, serving last known values", "yel", false);
          const cached = bridgeStatus.lastKnownValues.get(data.uuid);
          if (cached) {
            message.values = { ...cached };
            delete message.values._lastUpdated;
            message.cached = true;
          }
          mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
        }
      }
      else {
        common.conLog("... Device " + device.uuid + " is not wired, serving last known values", "yel", false);
        const cached = bridgeStatus.lastKnownValues.get(data.uuid);
        if (cached) {
          message.values = { ...cached };
          delete message.values._lastUpdated;
          message.cached = true;
        }
        mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
      }
    }
  }  

  /**
   * If message is for setting values of a connected device
   * @param {Object} data - The data object containing the device UUID and properties to set.
   * @description This function is called when a message is received on the "zigbee/device/set" topic. It attempts to set the specified properties of a connected ZigBee device.
   */
  async function mqttDevicesValuesSet(data) {
    common.conLog("ZigBee: Request for setting values of " + data.uuid, "yel");

    if (data.values) {
      const device = bridgeStatus.devicesConnected.get(data.uuid); // search device in map of connected devices

      if (device) { // if device is in map of connected devices, try do get desired values
        if (deviceIsWired(device)) { // if device is wired, then it's pingable and able to read values
          common.conLog("... Device " + device.uuid + " is wired and pingable ...", "std", false);
          if (await deviceIsPingable(device)) {
            for (const [propertyName, value] of Object.entries(data.values)) { // for each property in requested properties
              
              const property = device.deviceConverter.getPropertyByPropertyName(propertyName); // get property by name from converter
              
              if (property === undefined) { // if property is not found, log error
                common.conLog("ZigBee: No property found for " + propertyName, "red");
              }
              else {
                if (property.write === true) { // if property is writable, then write value
                  common.conLog("ZigBee: Set value for " + propertyName + " to " + value, "gre", false);
                  try {
                    const valueConverted = device.deviceConverter.set(property, value);
                    await device.endpoint.command(property.cluster, valueConverted.command, valueConverted.anyValue,  { disableDefaultResponse: true });
                    mqttDevicesValuesGet(data); // get new value after setting it
                  }
                  catch (error) {
                    common.conLog("ZigBee: Error setting property " + propertyName + " on device " + data.uuid + ": " + error.message, "red");
                  }
                }
                else {
                  common.conLog("ZigBee: Property " + propertyName + " is not writable", "red", false);
                }
              }
            }
          }
          else {
            common.conLog("... but " + device.uuid + " was not pingable", "red", false);
          } 
        }
        else {
          common.conLog("... but " + device.uuid + " is not wired", "red", false);
        }
      }
      else {
        common.conLog("ZigBee: Device " + data.uuid + " is not connected", "red");
      }
    }
    else {
      common.conLog("ZigBee: No properties given", "red");
    }
  }

  /**
  * Create a new device
  * @param {Object} data 
  * @description This function creates the information of a registered device.
  */
  function mqttDevicesCreate(data) {
    common.conLog("ZigBee: Request to create device " + data.uuid + ", but creating here will have no effect, because bridgeStatus is refreshed automatically by server", "red");

    const deviceConverter = convertersList.find(data.productName); // get converter for device from list of converters
    if (deviceConverter === undefined) { 
      common.conLog("ZigBee: No converter found for " + data.productName, "red");
      data.powerType = "?"; 
    }
    else {
      common.conLog("ZigBee: Converter found for " + data.productName, "gre");
      data.powerType  = deviceConverter.powerType;
      data.properties = common.devicePropertiesToArray(deviceConverter.properties);      
    }

    data.forceReconnect = true; // because this is ZigBee, reconnect devices after creation
    
    mqttClient.publish("server/devices/create", JSON.stringify(data)); // publish created device to MQTT broker
  } 

  /**
   * Shutdown
   */
  process.on("SIGINT", async function () {
    common.conLog("ZigBee: Graceful shutdown initiated ...", "yel");
    deviceMaintenanceStop();
    
    if (zigBeeReconnectTimer) { // Cancel any pending adapter reconnect attempt
      clearTimeout(zigBeeReconnectTimer);
      zigBeeReconnectTimer = null;
      common.conLog("ZigBee: Pending reconnect cancelled", "yel");
    }
    
    try { // Stop the ZigBee controller (cleanly shuts down the coordinator and all device connections)
      await zigBee.stop();
      common.conLog("ZigBee: Controller stopped", "mag");
    }
    catch (error) {
      common.conLog("ZigBee: Error stopping controller: " + error.message, "red");
    }

    bridgeStatus.devicesConnected.clear();

    const message  = {};
    message.bridge = BRIDGE_PREFIX;
    message.status = "offline";
    
    mqttClient.publish("server/bridge/status", JSON.stringify(message)); // publish offline status to MQTT broker

    mqttClient.end(false, {}, function () {
      common.conLog("ZigBee: MQTT connection closed, shutdown complete", "mag");
      process.exit(0);
    });

    setTimeout(function () {  // fallback exit in case MQTT end callback never fires
      common.conLog("ZigBee: Shutdown timeout - forcing exit", "red");
      process.exit(1);
    }, appConfig.CONF_bridgesWaitShutdownSeconds * 1000);
  });
}

/** 
 * Unhandled errors
 */
process.on("unhandledRejection", function (reason) {
  common.conLog("ZigBee Bridge: Unhandled promise rejection: " + reason, "red");
});

/** 
 * Uncaught exceptions
 */
process.on("uncaughtException", function (error) {
  common.conLog("ZigBee Bridge: Uncaught exception: " + error.message, "red");
  common.conLog(error.stack, "std", false);
});

startBridgeAndServer();