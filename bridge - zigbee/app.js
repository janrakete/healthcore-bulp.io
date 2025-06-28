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
const { Converters } = require("./converters.js");
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
    common.logoShow(BRIDGE_PREFIX, appConfig.CONF_portBridgeZigBee); // show bulp logo
  });

  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt       = require("mqtt");
  const mqttClient = mqtt.connect(appConfig.CONF_brokerAddress, { clientId: BRIDGE_PREFIX }); // connect to broker ...

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
   * @description This class is used to manage the status of the ZigBee bridge, including connected devices and those registered at the server.
   */
  class BridgeStatus {
    constructor() {
      this.devicesConnected          = [];
      this.devicesRegisteredAtServer = [];
    }
  }
  const bridgeStatus = new BridgeStatus(); // create new object for bridge status

  /**
   * =============================================================================================
   * Events at ZigBee adapter
   * ========================
   */  
  const {Controller: ZigBeeController}  = require("zigbee-herdsman"); 
  const zigBee = new ZigBeeController({ serialPort: {path: appConfig.CONF_zigBeeAdapterPort, adapter: appConfig.CONF_zigBeeAdapterName}, databasePath: "./devices.db", log: { level: 'none' } }); // create new ZigBee controller

  /**
   * Start ZigBee controller
   */
  async function zigBeeStart() {
    await zigBee.start();
    common.conLog("ZigBee: Bridge started", "gre");

    let data       = {};
    data.status = "online";
    mqttClient.publish("zigbee/bridge/status", JSON.stringify(data)); // publish to MQTT broker
  }
  await zigBeeStart();

  /**
   * Request all registered ZigBee devices from server via MQTT broker
   */
  let message     = {};
  message.bridge  = BRIDGE_PREFIX;
  mqttClient.publish("server/devices/list", JSON.stringify(message));
  
  /**
   * This event is triggered when a new device joins the ZigBee network.
   * It logs the device information and publishes a message to the MQTT broker.
   * @param {Object} data - The data object containing information about the device that has joined.
   * @event deviceJoin
   * @description This event is triggered when a new device joins the ZigBee network. It logs the device information and publishes a message to the MQTT broker.
  */
  zigBee.on("deviceInterview", async function (data) { 
    let message = {};
    message.deviceID           = data.device.ieeeAddr;
    message.interviewCompleted = data.device.interviewCompleted;
    message.lastSeen           = data.device.lastSeen;
    message.vendorName         = data.device.manufacturerName;
    message.productName        = data.device.modelID;
    message.softwareBuildID    = data.device.softwareBuildID;
    message.type               = data.device.type;

    if (message.interviewCompleted) { // ... and has been interviewed ...
      common.conLog("ZigBee: device has joined and been interviewed", "yel");
      common.conLog(message, "std", false);
      
      mqttClient.publish("server/device/create", JSON.stringify(message)); // ... publish to MQTT broker
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

    let message      = {};
    message.deviceID = data.ieeeAddr;
    message.bridge   = BRIDGE_PREFIX;
    mqttClient.publish("server/device/remove", JSON.stringify(message)); // ... publish to MQTT broker
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
        common.conLog("ZigBee: Device " + data.deviceID + " added to list of connected devices", "gre");
        bridgeStatus.devicesConnected.push(data); // add device to array of connected devices
      }
    }
    else {
      common.conLog("... but is not registered at server", "std", false);      
    }
  
    let message      = {};
    message.deviceID = deviceID;
    mqttClient.publish("zigbee/device/announced", JSON.stringify(message)); // ... publish to MQTT broker
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
    message.properties   = [];
    
    common.conLog("ZigBee: Device " + message.deviceID + " sends message", "yel");

    const device          = data.device;
    const deviceConverter = convertersList.find(device.modelID); // get converter for this device

    if (deviceConverter)  {
      common.conLog("ZigBee: Device converter found", "gre");

      const property = deviceConverter.getPropertyByClusterName(data.cluster);
      if (property) {
        let propertyAndValue             = {};
        propertyAndValue[property.name]  = deviceConverter.getConvertedValueForProperty(property, data.type, data.data); // get converted value for property
        message.properties.push(propertyAndValue); // add property to array of properties for return
      }
      else {
        common.conLog("ZigBee: No property found for cluster " + data.cluster, "red");
      }
    }
    else {
      common.conLog("ZigBee: No converter found for " + device.modelID, "red");
      message.Message = "Device not supported";
    }

    mqttClient.publish("zigbee/device/values", JSON.stringify(message)); // ... publish to MQTT broker
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

    let message      = {};
    message.scanning = data.permitted;
    mqttClient.publish("zigbee/devices/scan/status", JSON.stringify(message)); // ... publish to MQTT broker
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
    mqttClient.publish("zigbee/bridge/status", JSON.stringify(message)); // ... publish to MQTT broker
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
          mqttDeviceScan(data);
          break;
        case "zigbee/devices/connect":
          mqttDeviceConnect(data);
          break;
        case "zigbee/device/remove":
          mqttDeviceRemove(data);
          break;
        case "zigbee/device/set":
          mqttDeviceSet(data);
          break;
        case "zigbee/device/get":
          mqttDeviceGet(data);
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
  function mqttDeviceScan(data) {
    let message = {};
    common.conLog("ZigBee: Joining possible for " + data.duration + " seconds", "yel");
    zigBee.permitJoin(data.duration);
    // -> MQTT publish is not needed here, because this is done in the event permitJoinChanged
  }

  /**
   * If message is for connecting to registered devices, then try to connect to each device
   * @param {Object} data - The data object containing an array of devices to connect to.
   * @description This function is called when a message is received on the "zigbee/devices/connect" topic. It iterates through the array of devices provided in the message and attempts to connect to each device. If the device is mains-powered, it checks if the device is pingable before adding it to the list of connected devices.
   */
  async function mqttDeviceConnect(data) {
    bridgeStatus.devicesRegisteredAtServer = data.devices; // save all devices registered at server in array

    for (let device of bridgeStatus.devicesRegisteredAtServer) {
      device = deviceGetInfo(device.deviceID, bridgeStatus.devicesRegisteredAtServer); // get device information

      if (device === undefined) { // if device is not found, continue with next device
        continue;
      }
      else {
        common.conLog("ZigBee: Try to connect to device " + device.deviceID + " ...", "yel");
        
        if (device.deviceConverter.powerType === "mains") { // if device is wired, then it's pingable
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
      }
    }
  }

  /**
   * If message is for removing a connected device (this message ist sent AFTER server removed device)
   * @param {Object} data - The data object containing the device ID to remove.
   * @description This function is called when a message is received on the "zigbee/device/remove" topic. It searches for the device in the array of connected devices and attempts to remove it from the network and database. 
   */
  function mqttDeviceRemove(data) {
    common.conLog("ZigBee: Request for removing " + data.deviceID, "yel");

    const device = deviceSearchInArray(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    if (device) { // if device is in array of connected devices, try do disconnect
      device.deviceRaw.removeFromDatabase();
      device.deviceRaw.removeFromNetwork();
      bridgeStatus.devicesRegisteredAtServer  = bridgeStatus.devicesRegisteredAtServer.filter(deviceConnected => deviceConnected.deviceID !== data.deviceID); // remove device from array of devices registed at server
      bridgeStatus.devicesConnected           = bridgeStatus.devicesConnected.filter(deviceConnected => deviceConnected.deviceID !== data.deviceID); // remove device from array of connected devices
      common.conLog("ZigBee: Device disconnected and removed: " + data.deviceID, "gre");

      mqttClient.publish("zigbee/device/removed", JSON.stringify(data)); // publish removed device to MQTT broker
    }
  }

  /**
   * If message is for getting properties and values of a connected device
   * @param {Object} data - The data object containing the device ID and properties to get.
   * @description This function is called when a message is received on the "zigbee/device/get" topic. It attempts to read the specified properties of a connected ZigBee device and publishes the values to the MQTT broker.
   */
  async function mqttDeviceGet(data) {
    common.conLog("ZigBee: Request for getting properties and values of " + data.deviceID, "yel");
    const device = deviceSearchInArray(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    let message                   = {};
    message.deviceID              = data.deviceID;
    message.propertiesAndValues   = [];

    if (device) { // if device is in array of connected devices, try do get desired values
      if (device.deviceConverter.powerType === "mains") { // if device is wired, then it's pingable and able to read values
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
              const attribute                 = await device.endpoint.read(cluster.cluster, [cluster.attribute]);
              let propertyAndValue            = {};
              propertyAndValue[propertyName]  = device.deviceConverter.getConvertedValueForProperty(device.deviceConverter.getPropertyByAttributeName(cluster.attribute), attribute[cluster.attribute]); // get converted value for property
              message.propertiesAndValues.push(propertyAndValue); // add property to array of properties for return
            }
          }
          mqttClient.publish("zigbee/device/values", JSON.stringify(message)); // ... publish to MQTT broker
        }
      }
      else {
        common.conLog("... but " + device.deviceID + " was not pingable, so send empty values", "red", false);
        mqttClient.publish("zigbee/device/values", JSON.stringify(message)); // ... publish to MQTT broker
      }
      }
      else {
        common.conLog("... but " + device.deviceID + " is not wired, so send empty values", "red", false);
        mqttClient.publish("zigbee/device/values", JSON.stringify(message)); // ... publish to MQTT broker
      }
    }
  }  

  /**
   * If message is for setting values of a connected device
   * @param {Object} data - The data object containing the device ID and properties to set.
   * @description This function is called when a message is received on the "zigbee/device/set" topic. It attempts to set the specified properties of a connected ZigBee device.
   */
  async function mqttDeviceSet(data) {
    common.conLog("ZigBee: Request for setting values of " + data.deviceID, "yel");

    if (data.properties) {
      const device = deviceSearchInArray(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

      if (device) { // if device is in array of connected devices, try do get desired values
        if (device.deviceConverter.powerType === "mains") { // if device is wired, then it's pingable and able to read values
          common.conLog("... Device " + device.deviceID + " is wired and pingable ...", "std", false);
          if (await deviceIsPingable(device)) {
            for (const propertyAndValue of data.properties) { // for each property in requested properties

              const propertyName  = Object.keys(propertyAndValue)[0]; // get property name from object
              const value         = propertyAndValue[propertyName]; // get value from object
              const property      = device.deviceConverter.getPropertyByPropertyName(propertyName); // get property by name from converter

              if (property === undefined) { // if property is not found, log error
                common.conLog("ZigBee: No property found for " + propertyName, "red");
              }
              else {
                if (property.write === true) { // if property is writable, then write value
                  common.conLog("ZigBee: Set value for " + propertyName + " to " + value, "gre", false);
                  const valueConverted = device.deviceConverter.setConvertedValueForProperty(property, value);
                  await device.endpoint.command(property.cluster, valueConverted.command, valueConverted.anyValue,  { disableDefaultResponse: true });
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