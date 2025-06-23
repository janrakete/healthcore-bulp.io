/**
 * =============================================================================================
 * LoRa - Bridge: LoRa <-> MQTT
 * ============================
 */

const appConfig       = require("../config");
const common          = require("../common");

const BRIDGE_PREFIX   = "lora"; 

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
  server.listen(appConfig.CONF_portBridgeLoRa, function () {
    common.logoShow(BRIDGE_PREFIX, appConfig.CONF_portBridgeLoRa); // show bulp logo
  });

  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt       = require("mqtt");
  const mqttClient = mqtt.connect(appConfig.CONF_brokerAddress, { clientId: BRIDGE_PREFIX }); // connect to broker ...

  function mqttConnect() {
    mqttClient.subscribe(BRIDGE_PREFIX + "/#", function (error, granted) { // ... and subscribe to LoRa topics
      common.conLog("MQTT: Subscribed to LoRa topics from broker", "yel"); 
      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
      }

      /**
       * If MQTT is started, request all registered devices from server
       */
      common.conLog("LoRa: Bridge is online - request all registered LoRa devices from server", "yel");
      let message     = {};
      message.bridge  = BRIDGE_PREFIX;
      mqttClient.publish("server/devices/list", JSON.stringify(message)); // request all registered LoRa devices from server via MQTT broker 

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
   * Class representing the status of the LoRa bridge. Contains arrays for connected devices and registered devices at the server.
   * @class
   * @property {Object[]} devicesConnected - Array of currently connected LoRa devices.
   * @property {Object[]} devicesRegisteredAtServer - Array of devices registered at the server
   * @property {boolean} portOpened - Indicates whether the serial port for the LoRa adapter is opened.
   * @description This class is used to manage the status of the LoRa bridge, including connected devices and those registered at the server.
   */
  class BridgeStatus {
    constructor() {
      this.devicesConnected          = [];
      this.devicesRegisteredAtServer = [];
      this.portOpened                = false;
    }
  }
  const bridgeStatus = new BridgeStatus(); // create new object for bridge status

  /**
   * =============================================================================================
   * Events at serial port
   * =====================
   */  
  const { SerialPort }      = require("serialport");
  const { ReadlineParser }  = require("@serialport/parser-readline");

  const loRa            = new SerialPort({ path: appConfig.CONF_loRaAdapterPath, baudRate: parseInt(appConfig.CONF_loRaAdapterBaudRate), autoOpen: true });
  const loRaDataParser  = loRa.pipe(new ReadlineParser({ delimiter: "\r\n" }));

  /**
   * If the serial port is opened, send configuration commands to LoRa adapter and set portOpened to true.
   * @event open
   * @description This event is triggered when the serial port for the LoRa adapter is successfully opened.
  */
  loRa.on("open", async function () {
    common.conLog("LoRa: serial port for LoRa Adapter opened", "gre");
    bridgeStatus.portOpened = true; // set port opened to true

    (async function () { // send configuration commands to LoRa adapter
      loRa.write("AT+FRE=" + appConfig.CONF_loRaAdapterFRE + "\r\n");
      await common.pause(300);
      loRa.write("AT+SF=" + appConfig.CONF_loRaAdapterSF + "\r\n");
      await common.pause(300);
      loRa.write("AT+BW=" + appConfig.CONF_loRaAdapterBW + "\r\n");
      await common.pause(300);
      loRa.write("AT+POWER=" + appConfig.CONF_loRaAdapterPOWER + "\r\n");
      await common.pause(300);
      loRa.write("AT+CRC=" + appConfig.CONF_loRaAdapterCRC + "\r\n");
      await common.pause(300);
      loRa.write("AT+RXMOD=" + appConfig.CONF_loRaAdapterRXMOD + "\r\n");
      await common.pause(300);
      loRa.write("ATZ" + "\r\n"); // restart LoRa adapter
      await common.pause(300);
    })();
  });

  /**
   * If the serial port is closed, log message and set portOpened to false.
   * @event close
   * @description This event is triggered when the serial port for the LoRa adapter is closed.
   */
  loRa.on("error", (error) => {
    common.conLog("LoRa: serial port for LoRa Adapter closed with error", "red");
    common.conLog(error.message, "std", false);
    bridgeStatus.portOpened = false; // set port opened to false
  });

  /**
   * If the serial port is receiving data
   * @event data
   * @description This event is triggered when the serial port for the LoRa adapter receives data.
   */  
  loRaDataParser.on("data", (data) => {
    if (bridgeStatus.portOpened === false) {
      common.conLog("LoRa: serial port for LoRa Adapter is not opened", "red");
    }
    else {
      common.conLog("LoRa: receiving data", "yel");
      common.conLog(data, "std", false);

      if (data.startsWith("Data: (HEX:) ")) { // if data starts with "Data: (HEX:) ", its a message
        common.conLog("LoRa: data is from device", "yel");
        data = data.replace("Data: (HEX:) ", ""); // remove "Data: (HEX:) " from data
        data = data.replace(/ /g,""); // remove spaces from hex string
        data = Buffer.from(data, "hex").toString("utf8");

        const deviceID = data.substring(0, 16); // get device ID from data (first 16 characters)
        const device = deviceSearchInArray(deviceID, bridgeStatus.devicesConnected); 

        if (device) { // if device is in array of connected devices, build message and send it to MQTT broker
          common.conLog("LoRa: Device " + deviceID + " is connected - trying to convert data", "yel");

          let message        = {};
          message.deviceID   = deviceID;
          message.bridge     = BRIDGE_PREFIX;
          message.values     = data.substring(16);

          common.conLog("LoRa: Request for sending values of device " + deviceID, "yel", false);

          mqttClient.publish("lora/device/get", JSON.stringify(message)); // ... publish to MQTT broker
        }
        else { // if device is not in array of connected devices, send error message
          common.conLog("LoRa: Device is not connected or registered at server", "red");
        }
      }
    }
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
      message = JSON.parse(message); // parse message to JSON

      switch (topic) {
        case "lora/device/create":
          mqttDeviceCreate(message);
          break;
        case "lora/device/remove":
          mqttDeviceRemove(message);
          break;
        case "lora/device/get":
          mqttDeviceGet(message);
          break;
        case "lora/devices/connect":
          mqttDeviceConnect(message);
          break;
        default:
          common.conLog("LoRa: NOT found matching message handler for " + topic, "red");
      }
    }
    catch (error) { // if error while parsing message, log error
      common.conLog("MQTT: Error while parsing message:", "red");     
      common.conLog(error, "std", false);
    }  
  });

  /**
   * If message is for adding devices (this message ist sent AFTER server created device)
   */
  function mqttDeviceCreate(data) {
    // TODO: add to arrays

  }

  /**
   * If message is for removing devices (this message ist sent AFTER server removed device)
   */
  function mqttDeviceRemove(data) {
    // TODO: remove from arrays
  }

  /**
   * If message is for connecting to registered devices, add them list of connected devices
   * @param {Object} data - The data object containing the devices to connect.
   * @description This function updates the bridge status with the devices that are connected. It also assigns a converter to each device based on its product name. If no converter is found, it logs an error message.
   */
  function mqttDeviceConnect(data) {
    // because LoRa devices have no pairing mode, connected devices are the same as registered devices
    bridgeStatus.devicesRegisteredAtServer   = data.devices; // save all devices registered at server in array
    bridgeStatus.devicesConnected            = data.devices; // save all devices connected in array 

    for (let device of bridgeStatus.devicesConnected) { // for each device in array of connected devices
      device.DeviceConverter = convertersList.find(device.productName); // get converter for device from list of converters

      if (device.DeviceConverter === undefined) { 
        common.conLog("LoRa: No converter found for " + device.productName, "red");
      }
      else {
        common.conLog("LoRa: Converter found for " + device.productName, "gre");
      }
    }

    common.conLog("LoRa: Connected to devices", "gre");
  }

  /**
   * If message is for getting properties and values of a connected device
   * @param {Object} data - The data object containing the device ID and values
   * @description This function retrieves the properties and values of a connected device based on its ID
   */
  function mqttDeviceGet(data) {
    let message                   = {};
    message.deviceID              = data.deviceID;
    message.propertiesAndValues   = [];

    const device = deviceSearchInArray(message.deviceID, bridgeStatus.devicesConnected);  
    if (device) { // if device is in array of connected devices, convert values

      const propertiesAndValues    = device.DeviceConverter.getConvertedValuesForProperties(data.values);
      message.propertiesAndValues  = propertiesAndValues;
    }
    else { // if device is not in array of connected devices, send error message
      common.conLog("LoRa: Device is not connected or registered at server", "red");
    }

    mqttClient.publish("lora/device/values", JSON.stringify(message)); // ... publish to MQTT broker
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