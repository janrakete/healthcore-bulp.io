/**
 * =============================================================================================
 * ZigBee - Bridge: ZigBee <-> MQTT
 * ================================
 */

const appConfig       = require("../config");
const common          = require("../common");

const BRIDGE_PREFIX = "zigbee"; 

/**
 * Load  converters for devices
 */
const { Converters } = require("./Converters.js");
const convertersList = new Converters(); // create new object for converters

/**
 * Starts the LoRa bridge and MQTT server.
 * Initializes the HTTP server, MQTT client, serial port for the LoRa adapter, 
 * and defines all MQTT message handlers.
 * Automatically invoked on script startup.
 * @async
 * @function startBridgeAndServer
 * @description This function sets up the LoRa bridge to listen for device discovery, connection, and disconnection events.
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
    common.conLog("Bridge info send!", "gre");
    common.conLog("Bridge route 'Info' HTTP response: " + JSON.stringify(data), "std", false);
    return response.status(200).json(data);
  });  

  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt       = require("mqtt");
  const mqttClient = mqtt.connect(appConfig.CONF_brokerAddress, { clientId: BRIDGE_PREFIX }); // connect to broker ...

  /**
   * Connects the MQTT client and subscribes to ZigBee-related topics.
   * @function
   * @description This function is called when the MQTT client successfully connects to the broker.
   */
  function mqttConnect() {
    mqttClient.subscribe(BRIDGE_PREFIX + "/#", function (error, granted) { // ... and subscribe to zigbee topics
      common.conLog("MQTT: Subscribed to ZigBee topics from broker", "yel"); 
      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
      }
    });
  }
  mqttClient.on("connect", mqttConnect);

  /**
   * =============================================================================================
   * Helper functions
   * ================
   */

  /**
   * Searches for a device by its ID within a given array of devices.
   * @param {string} deviceID - The device ID to search for.
   * @param {Object[]} devices - The array of known device objects.
   * @returns {Object|undefined} The matching device object, or `undefined` if not found.
   * @description This function iterates through the array of devices and returns the first device that matches the provided ID. If no matching device is found, it returns `undefined`.
   */
  function deviceSearchInArray(deviceID, devices) {
    let device = {};  

    const deviceFound = devices.find(device => device.deviceID === deviceID);
    if (deviceFound) { 
      device = deviceFound; // if device is in array, get first device (because there should be only one device with this ID)
    }
    else {
      device = undefined; // if device is not in array, set device to undefined
    }
    return device;
  }

  /**
   * Get all information about a device
   * @param {string} deviceID - The ID of the device to get information for.
   * @param {Object[]} devices - The array of known device objects.
   * @returns {Object|undefined} The device object with additional properties, or `undefined` if the device is not found or has no converter.
   * @description This function searches for a device by its ID in the provided array of devices. If the device is found, it retrieves its converter from the converters list and checks if the device has a raw object and endpoints. If all checks pass, it returns the device object with additional properties; otherwise, it returns `undefined`.
  */
  function deviceGetInfo(deviceID, devices) {
    let device = deviceSearchInArray(deviceID, devices);
    if (device === undefined) {
      common.conLog("ZigBee: Device " + deviceID + " not found list", "red");
      return undefined; // if device is not in array, return undefined
    }
    else {
      device.deviceConverter = convertersList.find(device.productName);
      if (device.deviceConverter === undefined) { // if no converter is found for this device, set device to undefined
        common.conLog("ZigBee: No converter found for device " + deviceID, "red");
        return undefined;
      }
      else {
        device.deviceRaw = zigBee.getDeviceByIeeeAddr(device.deviceID); // save device object for later use
        if (device.deviceRaw === undefined) { // if device is not found, set device to undefined
          common.conLog("ZigBee: Cannot get raw data for device " + deviceID, "red");
          return undefined;
        }
        else {
          if (device.deviceRaw.endpoints === undefined || device.deviceRaw.endpoints.length === 0) { // if device has no endpoints, set device to undefined
            common.conLog("ZigBee: Cannot get endpoint for device " + deviceID, "red");
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
   * @property {Object[]} devicesConnected - Array of currently connected ZigBee devices.
   * @property {Object[]} devicesRegisteredAtServer - Array of devices registered at the server
   * @property {string|null} deviceScanCallID - ID of the current device scan call, if any.
   * @property {string} status - Status of the bridge ("online" or "offline").
   * @description This class is used to manage the status of the ZigBee bridge, including connected devices and those registered at the server.
   */
  class BridgeStatus {
    constructor() {
      this.devicesConnected          = [];
      this.devicesRegisteredAtServer = [];
      this.deviceScanCallID          = undefined;
      this.status                    = "offline";
    }
  }
  const bridgeStatus = new BridgeStatus(); // create new object for bridge status

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
  const zigBee = new ZigBeeController({ serialPort: {path: appConfig.CONF_zigBeeAdapterPort, adapter: appConfig.CONF_zigBeeAdapterName}, databasePath: "./devices.db" }); // create new ZigBee controller

  /**
   * Start ZigBee controller
   */
  async function zigBeeStart() {
    let data    = {};
    data.bridge = BRIDGE_PREFIX;
    try {
      await zigBee.start();
      data.status         = "online";
      common.conLog("ZigBee: Bridge started", "gre");
    }
    catch (error) {
      data.status = "offline";
      common.conLog("ZigBee: Error while starting ZigBee controller:", "red");
      common.conLog(error, "std", false);
    }
    bridgeStatus.status = data.status;
    mqttClient.publish("server/bridge/status", JSON.stringify(data)); // publish to MQTT broker
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
    let message                = {};
    message.deviceID           = data.device.ieeeAddr;
    message.lastSeen           = data.device.lastSeen;
    message.vendorName         = data.device.manufacturerName;
    message.productName        = data.device.modelID;
    message.softwareBuildID    = data.device.softwareBuildID;
    message.type               = data.device.type;
    message.bridge             = BRIDGE_PREFIX;

    if (data.device.interviewState === "PENDING") {
      common.conLog("ZigBee: device is currently interviewing", "yel");
      common.conLog(message, "std", false);

      message.callID = bridgeStatus.deviceScanCallID; // add callID if device is discovered during scanning
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
        message.powerType = deviceConverter.powerType;
      }

      common.conLog(message, "std", false);

      message.forceReconnect = true; // because this is ZigBee, reconnect device after creation
      
      mqttClient.publish("server/devices/create", JSON.stringify(message)); // ... publish to MQTT broker
    }
  });

  /**
   * This event is triggered when a device leaves the ZigBee network. It logs the device information and publishes a message to the MQTT broker.
   * @param {Object} data - The data object containing information about the device that has left.
   * @event deviceLeave
   * @description This event is triggered when a device leaves the ZigBee network. It logs the device information and publishes a message to the MQTT broker.
  */
  zigBee.on("deviceLeave", function (data) {
    common.conLog("ZigBee: device has left", "yel");
    common.conLog(data, "std", false);

    bridgeStatus.devicesConnected = bridgeStatus.devicesRegisteredAtServer = bridgeStatus.devicesConnected.filter(deviceConnected => deviceConnected.deviceID !== data.ieeeAddr); // remove device from array of connected and registered devices

    let message      = {};
    message.deviceID = data.ieeeAddr;
    message.bridge   = BRIDGE_PREFIX;
    mqttClient.publish("server/devices/remove", JSON.stringify(message)); // ... publish to MQTT broker
  });

  /**
   * This event is triggered when a device announces itself on the ZigBee network. It checks if the device is registered at the server and attempts to add it to the list of connected devices.
   * @param {Object} data - The data object containing information about the device that has announced itself.
   * @event deviceAnnounce 
   * @description This event is triggered when a device announces itself on the ZigBee network.
   */
  zigBee.on("deviceAnnounce", function (data) { 
    common.conLog("ZigBee: device has announced, try to add to connected devices", "yel");

    const deviceID = data.device.ieeeAddr;
    
    let device = deviceSearchInArray(deviceID, bridgeStatus.devicesRegisteredAtServer); // search device in array of registered devices
    if (device) { // if device is in array of registered devices, add to array connected devices
      common.conLog("ZigBee: Device " + device.deviceID + " is registered at server - trying to connect", "yel");
      
      data = deviceGetInfo(deviceID, bridgeStatus.devicesRegisteredAtServer);
      if (data === undefined) { 
        common.conLog("ZigBee: Device " + deviceID + " NOT added to list of connected devices", "red");
      }
      else {
        const deviceConnected = deviceSearchInArray(deviceID, bridgeStatus.devicesConnected); // check if device is already in array of connected devices
        if (deviceConnected === undefined) { // if device is not in array of connected devices, add it
          common.conLog("ZigBee: Device " + data.deviceID + " added to list of connected devices", "gre");
          bridgeStatus.devicesConnected.push(data); // add device to array of connected devices
        }
      }
    }
    else {
      common.conLog("... but is not registered at server", "std", false);      
    }
  
    let message      = {};
    message.deviceID = deviceID;
    message.bridge   = BRIDGE_PREFIX;
    mqttClient.publish("zigbee/devices/announced", JSON.stringify(message)); // ... publish to MQTT broker
  });

  /**
   * This event is triggered when a device sends a message on the ZigBee network. It processes the message, retrieves the appropriate converter for the device, and publishes the message to the MQTT broker.
   * @param {Object} data - The data object containing information about the device and the message that has been sent.
   * @event message 
   * @description This event is triggered when a device sends a message on the ZigBee network. It processes the message, retrieves the appropriate converter for the device, and publishes the message to the MQTT broker.
  */
  zigBee.on("message", async function (data) { 
    let message          = {};
    message.deviceID     = data.device.ieeeAddr;
    message.productName  = data.device.modelID;
    message.values       = {};
    message.bridge       = BRIDGE_PREFIX;

    console.log(data);

    
    common.conLog("ZigBee: Device " + message.deviceID + " sends message", "yel");

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
    
    mqttClient.publish("server/bridge/status", JSON.stringify(message)); // ... publish to MQTT broker
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
    let message = {};

    bridgeStatus.deviceScanCallID = data.callID;

    common.conLog("ZigBee: Joining possible for " + data.duration + " seconds", "yel");
    zigBee.permitJoin(data.duration);
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

    message.devicesRegisteredAtServer  = bridgeStatus.devicesRegisteredAtServer; 
    message.devicesConnected           = bridgeStatus.devicesConnected;

    mqttClient.publish("server/devices/list", JSON.stringify(message)); // ... publish to MQTT broker
  }

  /**
   * Refreshes the list of devices registered at the server based on the provided data
   * @param {Object} data 
   * @description This function updates IN the bridge the list of devices registered at the server.
   */
  function mqttDevicesRefresh(data) {
    bridgeStatus.devicesRegisteredAtServer = data.devices; // save all devices registered at server in array
  }

  /**
   * If message is for reconnecting to registered devices, start scanning for devices
   * @param {Object} data - The data object containing the devices to connect to.
   * @description This function handles the request to connect to registered devices by scanning for them and publishing
   */
  function mqttDevicesReconnect(data) {
    bridgeStatus.devicesRegisteredAtServer   = data.devices; // save all devices registered at server in array
    bridgeStatus.devicesConnected            = []; // reset array of connected devices
    common.conLog("ZigBee: Request to connect to devices", "yel");
    
    for (const device of bridgeStatus.devicesRegisteredAtServer) {
      mqttDevicesConnect(device); // try to connect to each device
    }
  }

  /**
   * Updates the information of a registered device.
   * @param {Object} data 
   * @description This function updates the information of a registered device.
   */
  function mqttDevicesUpdate(data) {
    common.conLog("ZigBee: Request to update device " + data.deviceID, "yel");
    
    if (data && typeof data.updates === "object") {
      bridgeStatus.devicesRegisteredAtServer = bridgeStatus.devicesRegisteredAtServer.map(deviceRegistered => {
        if (deviceRegistered.deviceID === data.deviceID) {
          return { ...deviceRegistered, ...data.updates }; // update device with new data
        }
        return deviceRegistered;
      });
      bridgeStatus.devicesConnected = bridgeStatus.devicesConnected.map(deviceConnected => {
        if (deviceConnected.deviceID === data.deviceID) {
          return { ...deviceConnected, ...data.updates }; // update device with new data
        }
        return deviceConnected;
      });

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
    device = deviceGetInfo(data.deviceID, bridgeStatus.devicesRegisteredAtServer); // get device information

    if (device) {
      device.callID = data.callID !== undefined ? data.callID : null; // add callID to device if provided
      common.conLog("ZigBee: Try to connect to device " + device.deviceID + " ...", "yel");
      if (deviceIsWired(device)) { // if device is wired, then it's pingable
        common.conLog("... Device " + device.deviceID + " is wired and pingable ...", "std", false);
        if (await deviceIsPingable(device)) {
          common.conLog("... and added " + device.deviceID + " to list to list of connected devices", "gre", false);
          bridgeStatus.devicesConnected.push(device); // add device to array of connected devices
        }
        else {
          common.conLog("... but " + device.deviceID + " was not pingable and added not to list of connected devices", "red", false);
        }
      }
      else {
        common.conLog("... Device " + device.deviceID + " is not wired and not pingable ...", "std", false);
        common.conLog("... so just added to list to list of connected devices", "gre", false);
        bridgeStatus.devicesConnected.push(device); // add device to array of connected devices
      }

      common.conLog("ZigBee: Check if device converter has setupReporting function ...", "yel");
      if (device.deviceConverter !== undefined && device.deviceConverter.setupReporting !== undefined ) {
        common.conLog("ZigBee: Device converter has setupReporting function, trying to call it", "gre", false);

        try {
          const coordinatorDevice   = zigBee.getDevices().find(d => d.type === "Coordinator");
          const coordinatorEndpoint = coordinatorDevice.getEndpoint(1);

          await device.deviceConverter.setupReporting(device.deviceRaw, coordinatorEndpoint);
        }
        catch (error) {
          common.conLog("ZigBee: Error setting up reporting for " + device.deviceID + ": " + error.message, "red");
        }
      }
      else {
        common.conLog("ZigBee: Device converter has no setupReporting function", "std", false);
      }

      mqttClient.publish("server/devices/connect", JSON.stringify(device));        
    }
  }

  /**
   * If message is for removing a connected device (this message ist sent AFTER server removed device)
   * @param {Object} data - The data object containing the device ID to remove.
   * @description This function is called when a message is received on the "zigbee/device/remove" topic. It searches for the device in the array of connected devices and attempts to remove it from the network and database. 
   */
  function mqttDevicesRemove(data) {
    common.conLog("ZigBee: Request for removing " + data.deviceID, "yel");
    
    data.bridge  = BRIDGE_PREFIX;
    const device = deviceSearchInArray(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    if (device) { // if device is in array of connected devices, try do disconnect
      device.deviceRaw.removeFromNetwork();
      device.deviceRaw.removeFromDatabase();
      bridgeStatus.devicesRegisteredAtServer  = bridgeStatus.devicesRegisteredAtServer.filter(deviceConnected => deviceConnected.deviceID !== data.deviceID); // remove device from array of devices registed at server
      bridgeStatus.devicesConnected           = bridgeStatus.devicesConnected.filter(deviceConnected => deviceConnected.deviceID !== data.deviceID); // remove device from array of connected devices
      common.conLog("ZigBee: Device disconnected and removed: " + data.deviceID, "gre");

      mqttClient.publish("server/devices/remove", JSON.stringify(data)); // publish removed device to MQTT broker
    }
  }

  /**
   * If message is for getting properties and values of a connected device
   * @param {Object} data - The data object containing the device ID and properties to get.
   * @description This function is called when a message is received on the "zigbee/device/get" topic. It attempts to read the specified properties of a connected ZigBee device and publishes the values to the MQTT broker.
   */
  async function mqttDevicesValuesGet(data) {
    common.conLog("ZigBee: Request for getting properties and values of " + data.deviceID, "yel");
    const device = deviceSearchInArray(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    let message                   = {};
    message.deviceID              = data.deviceID;
    message.values                = {};
    message.bridge                = BRIDGE_PREFIX;
    message.callID                = data.callID;

    if (device) { // if device is in array of connected devices, try do get desired values
      if (deviceIsWired(device)) { // if device is wired, then it's pingable and able to read values
        common.conLog("... Device " + device.deviceID + " is wired and pingable ...", "std", false);
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
                const attribute              = await device.endpoint.read(cluster.cluster, [cluster.attribute]);
                message.values[propertyName] = device.deviceConverter.get(device.deviceConverter.getPropertyByAttributeName(cluster.attribute), attribute[cluster.attribute]); // get converted value for property
              }
            }
            mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
          }
        }
        else {
          common.conLog("... but " + device.deviceID + " was not pingable, so send empty values", "red", false);
          mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
        }
      }
      else {
        common.conLog("... but " + device.deviceID + " is not wired, so send empty values", "red", false);
        mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
      }
    }
  }  

  /**
   * If message is for setting values of a connected device
   * @param {Object} data - The data object containing the device ID and properties to set.
   * @description This function is called when a message is received on the "zigbee/device/set" topic. It attempts to set the specified properties of a connected ZigBee device.
   */
  async function mqttDevicesValuesSet(data) {
    common.conLog("ZigBee: Request for setting values of " + data.deviceID, "yel");

    if (data.values) {
      const device = deviceSearchInArray(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

      if (device) { // if device is in array of connected devices, try do get desired values
        if (deviceIsWired(device)) { // if device is wired, then it's pingable and able to read values
          common.conLog("... Device " + device.deviceID + " is wired and pingable ...", "std", false);
          if (await deviceIsPingable(device)) {
            for (const [propertyName, value] of Object.entries(data.values)) { // for each property in requested properties
              
              const property = device.deviceConverter.getPropertyByPropertyName(propertyName); // get property by name from converter
              
              if (property === undefined) { // if property is not found, log error
                common.conLog("ZigBee: No property found for " + propertyName, "red");
              }
              else {
                if (property.write === true) { // if property is writable, then write value
                  common.conLog("ZigBee: Set value for " + propertyName + " to " + value, "gre", false);
                  const valueConverted = device.deviceConverter.set(property, value);
                  await device.endpoint.command(property.cluster, valueConverted.command, valueConverted.anyValue,  { disableDefaultResponse: true });
                  mqttDevicesValuesGet(data); // get new value after setting it
                }
                else {
                  common.conLog("ZigBee: Property " + propertyName + " is not writable", "red", false);
                }
              }
            }
          }
          else {
            common.conLog("... but " + device.deviceID + " was not pingable", "red", false);
          } 
        }
        else {
          common.conLog("... but " + device.deviceID + " is not wired", "red", false);
        }
      }
      else { 
        common.conLog("ZigBee: Device " + data.deviceID + " is not connected", "red");
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
    common.conLog("Bluetooth: Request to create device " + data.deviceID + ", but creating here will have no effect, because bridgeStatus is refreshed automatically by server", "red");

    const deviceConverter = convertersList.find(data.productName); // get converter for device from list of converters
    if (deviceConverter === undefined) { 
      common.conLog("ZigBee: No converter found for " + data.productName, "red");
      data.powerType = "?"; 
    }
    else {
      common.conLog("ZigBee: Converter found for " + data.productName, "gre");
      data.powerType = deviceConverter.powerType;
    }

    data.forceReconnect = true; // because this is ZigBee, reconnect devices after creation
    
    mqttClient.publish("server/devices/create", JSON.stringify(data)); // publish created device to MQTT broker
  } 
}

startBridgeAndServer();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */  
process.on("SIGINT", function () {
  common.conLog("Server closed.", "mag", true);
  process.exit(0);
});