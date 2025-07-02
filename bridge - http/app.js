/**
 * =============================================================================================
 * HTTP - Bridge: HTTP <-> MQTT
 * ============================
 */
const appConfig       = require("../config");
const common          = require("../common");

const BRIDGE_PREFIX = "http"; 

/**
 * Load converters for devices
 */
const { Converters } = require("./Converters.js");
const convertersList = new Converters(); // create new object for converters

/**
 * Starts the HTTP bridge and MQTT server.
 * This function initializes an Express server, sets up CORS and body parsing middleware, and listens for incoming HTTP requests.
 * It also connects to an MQTT broker and subscribes to specific topics for device management.
 * @async
 * @function startBridgeAndServer
 * @description This function sets up the HTTP bridge.
 */

async function startBridgeAndServer() {
  /**
   * =============================================================================================
   * Server
   * ======
  */
  const express     = require("express");
  const cors        = require("cors");
  const bodyParser  = require("body-parser");

  const app = express();

  app.use(bodyParser.json());

  app.use(
    cors(),
    bodyParser.urlencoded({
      extended: true,
    })
  );

  app.use(function (error, req, res, next) { // if request contains JSON and the JSON is invalid
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      let data    = {};
      data.status = "error";
      data.error  = "JSON in request is invalid";
      res.json(data);
    }
  });

  const router = require("express").Router();
  app.use("/", router);

  const server = require("http").createServer(app);
  server.listen(appConfig.CONF_portBridgeHTTP, function () {
    common.logoShow(BRIDGE_PREFIX, appConfig.CONF_portBridgeHTTP); // show bulp logo
  });

  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt       = require("mqtt");
  const mqttClient = mqtt.connect(appConfig.CONF_brokerAddress, { clientId: BRIDGE_PREFIX }); // connect to broker ...

  /**
   * Connects the MQTT client and subscribes to HTTP-related topics.
   * @function
   * @description This function is called when the MQTT client successfully connects to the broker.
   */
  function mqttConnect() {
    mqttClient.subscribe(BRIDGE_PREFIX + "/#", function (error, granted) { // ... and subscribe to HTTP topics
      common.conLog("MQTT: Subscribed to HTTP topics from broker", "yel"); 
      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
      }

      /**
       * If MQTT is started, request all registered devices from server
       */
      common.conLog("HTTP: Bridge (= this web server) is online - request all registered HTTP devices from server", "yel");
      let message     = {};
      message.bridge  = BRIDGE_PREFIX;
      mqttClient.publish("server/devices/list", JSON.stringify(message)); // then request all registered HTTP devices from server via MQTT broker 
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
   * Class representing the status of the HTTP bridge. Contains arrays for connected devices and registered devices at the server.
   * @class
   * @property {Object[]} devicesConnected - Array of currently connected HTTP devices.
   * @property {Object[]} devicesRegisteredAtServer - Array of devices registered at the server
   * @description This class is used to manage the status of the HTTP bridge, including connected devices and those registered at the server.
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
   * Events at web server
   * ====================
   */

  /**
   * If call is for deleting a device
   * @param {Object} req - The HTTP request object containing the device ID and product name in the body.
   * @param {Object} res - The HTTP response object used to send the response back to the client.  
   * @description This function handles the deletion of a device by checking if it exists in the array of connected devices. If the device is found, it constructs a message and publishes it to the MQTT broker to remove the device. If the device is not found, it sends an error response.
   * @returns {Object} - Returns a JSON response indicating the status of the operation, either "ok" or "error" with an appropriate message.
   */
  router.delete("/message", async function (req, res) {
    const payload       = req.body;
    let message         = {}; // create new object for MQTT message
    let data            = {}; // create new object for HTTP response

    try {
      if (payload === undefined) { // if no payload is given, send error message
        data.status = "error";
        data.error  = "No payload given";
      }
      else { // if payload exists, check if device is in array of connected devices
        const device = deviceSearchInArray(payload.deviceID, bridgeStatus.devicesConnected);  
        
        if (device) { // if device is in array of connected devices, build message and send it to MQTT broker
          common.conLog("HTTP: Device " + payload.deviceID + " is connected - trying to remove", "yel");

          message.productName  = payload.productName;
          message.deviceID     = payload.deviceID;
          message.bridge       = BRIDGE_PREFIX;

          common.conLog("HTTP: Request for deleting device " + message.deviceID, "yel", false);

          mqttClient.publish("server/device/remove", JSON.stringify(message));
          data.status = "ok";
        }
        else { // if device is not in array of connected devices, send error message
          common.conLog("HTTP: Device is not connected or registered at server", "red");
          data.status = "error";
          data.error  = "Device " + payload.deviceID + " is not registered at server";
        }
      }
    }
    catch (error) {
      data.status = "error";
      data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }
      
    common.conLog("HTTP response: " + JSON.stringify(data), "std", false);
    res.json(data);
  });

  /**
   * If call is for creating a device
   * @param {Object} req - The HTTP request object containing the device information in the body.
   * @param {Object} res - The HTTP response object used to send the response back
   * @description This function handles the creation of a device by checking if the payload is provided. If it is, it constructs a message with the device information and publishes it to the MQTT broker to create the device. If no payload is provided, it sends an error response.
   * @returns {Object} - Returns a JSON response indicating the status of the operation.
  */
  router.put("/message", async function (req, res) {
    const payload       = req.body;
    let message         = {}; // create new object for MQTT message
    let data            = {}; // create new object for HTTP response

    try {
      if (payload === undefined) { // if no payload is given, send error message
        data.status  = "error";
        data.error  = "No payload given";
      }
      else { // if payload exists, fill message and send it to MQTT broker
        message.productName  = payload.productName;
        message.deviceID     = payload.deviceID;
        message.bridge       = BRIDGE_PREFIX;

        common.conLog("HTTP: Request for creating a device " + message.deviceID, "yel");

        mqttClient.publish("server/device/create", JSON.stringify(message));
        data.status = "ok";
      }
    }
    catch (error) {
      data.status = "error";
      data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }
      
    common.conLog("HTTP response: " + JSON.stringify(data), "std", false);
    res.json(data);
  });

  /**
   * If call is for sending values of a device to the server
   * @param {Object} req - The HTTP request object containing the device information and values in the body.
   * @param {Object} res - The HTTP response object used to send the response back
   * @description This function handles the request to send values of a device. It checks if the payload is provided and if the device is connected. If both conditions are met, it constructs a message with the device information and values, then publishes it to the MQTT broker. If the device is not found or no payload is provided, it sends an error response.
   * @returns {Object} - Returns a JSON response indicating the status of the operation, either "ok" or "error" with an appropriate message.
   */
  router.post("/message", async function (req, res) {
    const payload       = req.body;
    let message         = {}; // create new object for MQTT message
    let data            = {}; // create new object for HTTP response

    try {
      if (payload === undefined) { // if no payload is given, send error message
        data.status = "error";
        data.error  = "No payload given";
      }
      else {// if payload exists, check if device is in array of connected devices
        const device = deviceSearchInArray(payload.deviceID, bridgeStatus.devicesConnected);  
        if (device) { // if device is in array of connected devices, build message and send it to MQTT broker
          common.conLog("HTTP: Device " + payload.deviceID + " is connected - trying to get and convert data", "yel");

          message.productName  = payload.productName;
          message.deviceID     = payload.deviceID;
          message.bridge       = BRIDGE_PREFIX;
          message.values       = payload.values;

          common.conLog("HTTP: Request for sending values of device " + message.deviceID, "yel", false);

          mqttDeviceGet(message);
          data.status = "ok";
        }
        else { // if device is not in array of connected devices, send error message
          common.conLog("HTTP: Device is not connected or registered at server", "red");
          data.status = "error";
          data.error  = "Device " + payload.deviceID + " is not registered at server";
        }
      }
    }
    catch (error) {
      data.status = "error";
      data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }
      
    common.conLog("HTTP response: " + JSON.stringify(data), "std", false);
    res.json(data);
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
        case "http/device/create":
          mqttDeviceCreate(message);
          break;
        case "http/device/remove":
          mqttDeviceRemove(message);
          break;
        case "http/device/get":
          mqttDeviceGet(message);
          break;
        case "http/devices/connect":
          mqttDeviceConnect(message);
          break;
        default:
          common.conLog("HTTP: NOT found matching message handler for " + topic, "red");
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
    // TODO: zu arrays hinzufügen
  }

  /**
   * If message is for removing devices (this message ist sent AFTER server removed device)
   */
  function mqttDeviceRemove(data) {
    // TODO: aus arrays löschen
  }

  /**
   * If message is for connecting to registered devices, add them list of connected devices
   * @param {Object} data - The data object containing the devices to be connected.
   * @description This function updates the bridge status with the devices that are connected. It also checks if a converter exists for each device and logs the status. It iterates through the devices and assigns the appropriate converter from the converters list.
   */
  function mqttDeviceConnect(data) {
    // because HTTP bridge is not a real bridge, connected devices are the same as registered devices
    bridgeStatus.devicesRegisteredAtServer   = data.devices; // save all devices registered at server in array
    bridgeStatus.devicesConnected            = data.devices; // save all devices connected in array 

    for (let device of bridgeStatus.devicesConnected) { // for each device in array of connected devices
      device.deviceConverter = convertersList.find(device.productName); // get converter for device from list of converters

      if (device.deviceConverter === undefined) { 
        common.conLog("HTTP: No converter found for " + device.productName, "red");
      }
      else {
        common.conLog("HTTP: Converter found for " + device.productName, "gre");
      }
    }

    common.conLog("HTTP: Connected to devices", "gre");
  }

  /**
   * If message is for getting properties and values of a connected device
   * @param {Object} data - The data object containing the device ID and values to be converted.
   * @description This function retrieves the properties and values of a connected device, converts them using the device's converter, and publishes the results to the MQTT broker.
   */
  function mqttDeviceGet(data) {
    let message                   = {};
    message.deviceID              = data.deviceID;
    message.propertiesAndValues   = [];
    message.bridge                = BRIDGE_PREFIX;

    const device = deviceSearchInArray(message.deviceID, bridgeStatus.devicesConnected);  
    if (device) { // if device is in array of connected devices, convert values
      for (const [property, value] of Object.entries(data.values)) { // for each value key in data      
        let propertyAndValue      = {};
        propertyAndValue[property]  = device.deviceConverter.get(property, value);
        message.propertiesAndValues.push(propertyAndValue); // add property to array of properties for return
      }
    }
    else { // if device is not in array of connected devices, send error message
      common.conLog("HTTP: Device is not connected or registered at server", "red");
    }

    mqttClient.publish("server/device/values", JSON.stringify(message)); // ... publish to MQTT broker
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