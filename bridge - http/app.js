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

  app.use(function (error, request, response, next) { // if request contains JSON and the JSON is invalid
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      let data    = {};
      data.status = "error";
      data.error  = "JSON in request is invalid";
      response.json(data);
    }
  });

  const router = require("express").Router();
  app.use("/", router);

  const server = require("http").createServer(app);
  server.listen(appConfig.CONF_portBridgeHTTP, function () {
    common.logoShow(BRIDGE_PREFIX, appConfig.CONF_portBridgeHTTP); // show logo
    bridgeStatus.status = "online"; // set bridge status to online - this is here because server is started and there is no other peripheral connection
  });

  /**
   * Server info
   * @description Endpoint to retrieve basic information about the bridge.
   */
  app.get("/info", async function (request, response) {
    const data  = {};
    data.status = bridgeStatus.status;
    data.bridge = BRIDGE_PREFIX;
    data.port   = appConfig.CONF_portBridgeHTTP;
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
      mqttClient.publish("server/devices/refresh", JSON.stringify(message)); // then request all registered HTTP devices from server via MQTT broker 
    });
  }
  mqttClient.on("connect", mqttConnect);

  /**
   * =============================================================================================
   * Helper functions
   * ================
   */

  /**
   * Searches for a device by its ID within a given Map of devices.
   * @param {string} deviceID - The device ID to search for.
   * @param {Map<string, Object>} devices - The Map of known device objects (keyed by deviceID).
   * @returns {Object|undefined} The matching device object, or `undefined` if not found.
   */
  function deviceSearchInMap(deviceID, devices) {
    return devices.get(deviceID);
  }

  /**
   * Class representing the status of the HTTP bridge. Contains arrays for connected devices and registered devices at the server.
   * @class
   * @property {Map<string, Object>} devicesConnected - Map of currently connected HTTP devices (keyed by deviceID).
   * @property {Map<string, Object>} devicesRegisteredAtServer - Map of devices registered at the server (keyed by deviceID)
   * @propery {string} status - The current status of the bridge (e.g., "online", "offline").
   * @description This class is used to manage the status of the HTTP bridge, including connected devices and those registered at the server.
   */
  class BridgeStatus {
    constructor() {
      this.devicesConnected          = new Map();
      this.devicesRegisteredAtServer = new Map();
      this.status                    = "offline";
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
        const device = bridgeStatus.devicesConnected.get(payload.deviceID);  
        
        if (device) { // if device is in map of connected devices, build message and send it to MQTT broker
          common.conLog("HTTP: Device " + payload.deviceID + " is connected - trying to remove", "yel");

          message.productName  = payload.productName;
          message.deviceID     = payload.deviceID;
          message.bridge       = BRIDGE_PREFIX;

          mqttDevicesRemove(message); // remove device from bridge status immediately (because server will not send a message back after removing device)

          common.conLog("HTTP: Request for deleting device " + message.deviceID, "yel", false);

          mqttClient.publish("server/devices/remove", JSON.stringify(message));
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
        data.error   = "No payload given";
      }
      else { // if payload exists, fill message and send it to MQTT broker
        if (payload.deviceID !== undefined && payload.productName !== undefined && payload.powerType !== undefined) {
          message.productName  = payload.productName;
          message.deviceID     = payload.deviceID;
          message.powerType    = payload.powerType;
          message.bridge       = BRIDGE_PREFIX;

          message.forceReconnect = false; // because this is HTTP, just refresh devices after creation and do not reconnect

          common.conLog("HTTP: Request for creating a device " + message.deviceID, "yel");

          mqttClient.publish("server/devices/create", JSON.stringify(message));
          data.status = "ok";
        }
        else {
          data.status  = "error";
          data.error   = "No deviceID or productName or powerType given";
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
      else {// if payload exists, validate payload structure first
        if (!payload.deviceID || typeof payload.deviceID !== "string") {
          data.status = "error";
          data.error  = "deviceID must be a non-empty string";
        }
        else if (!payload.values || typeof payload.values !== "object" || Array.isArray(payload.values)) {
          data.status = "error";
          data.error  = "Values must be a non-empty object";
        }
        else if (Object.keys(payload.values).length === 0) {
          data.status = "error";
          data.error  = "Values must contain at least one property";
        }
        else { // payload structure is valid, check if device is in array of connected devices
          const device = bridgeStatus.devicesConnected.get(payload.deviceID);  
          if (device) { // if device is in map of connected devices, build message and send it to MQTT broker
            common.conLog("HTTP: Device " + payload.deviceID + " is connected - trying to get and convert data", "yel");

            message.deviceID     = payload.deviceID;
            message.bridge       = BRIDGE_PREFIX;
            message.values       = payload.values;

            common.conLog("HTTP: Request for sending values of device " + message.deviceID, "yel", false);

            mqttDevicesValuesGet(message);
            data.status = "ok";
          }
          else { // if device is not in array of connected devices, send error message
            common.conLog("HTTP: Device is not connected or registered at server", "red");
            data.status = "error";
            data.error  = "Device " + payload.deviceID + " is not registered at server";
          }
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
        case "http/devices/create":
          mqttDevicesCreate(message);
          break;
        case "http/devices/remove":
          mqttDevicesRemove(message);
          break;
        case "http/devices/values/get":
          mqttDevicesValuesGet(message);
          break;
        case "http/devices/refresh":
          mqttDevicesRefresh(message);
          break;
        case "http/devices/list":
          mqttDevicesList(message);
          break;
        case "http/devices/update":
          mqttDevicesUpdate(message);
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
   * Create a new device
   * @param {Object} data 
   * @description This function creates the information of a registered device.
   */
  function mqttDevicesCreate(data) {
    common.conLog("HTTP: Request to create device " + data.deviceID + ", but creating here will have no effect, because bridgeStatus is refreshed automatically by server", "red");
    
    const deviceConverter = convertersList.find(data.productName); // get converter for device from list of converters
    if (deviceConverter === undefined) { 
      common.conLog("HTTP: No converter found for " + data.productName, "red");
      data.powerType = "?"; 
    }
    else {
      common.conLog("HTTP: Converter found for " + data.productName, "gre");
      data.powerType  = deviceConverter.powerType;
      data.properties = common.devicePropertiesToArray(deviceConverter.properties);      
    }

    data.forceReconnect = false; // because this is HTTP, just refresh devices after creation and do not reconnect

    mqttClient.publish("server/devices/create", JSON.stringify(data)); // publish created device to MQTT broker
  }

  /**
   * If message is for removing devices (this message ist sent AFTER server removed device)
   * @param {Object} data
   * @description This function removes a device from the bridge status.
   */
  function mqttDevicesRemove(data) {
    bridgeStatus.devicesConnected.delete(data.deviceID); // remove device from map of connected devices
    bridgeStatus.devicesRegisteredAtServer.delete(data.deviceID); // remove device from map of registered devices
      mqttClient.publish("server/devices/remove", JSON.stringify(data)); // publish removed device to MQTT broker    
  }

  /**
   * Updates the information of a registered device.
   * @param {Object} data 
   * @description This function updates the information of a registered device.
   */
  function mqttDevicesUpdate(data) {
    common.conLog("HTTP: Request to update device " + data.deviceID, "yel");
    
    if (data && typeof data.updates === "object") {
      const deviceToUpdateReg = bridgeStatus.devicesRegisteredAtServer.get(data.deviceID);
      if (deviceToUpdateReg) {
        bridgeStatus.devicesRegisteredAtServer.set(data.deviceID, { ...deviceToUpdateReg, ...data.updates }); // update device with new data
      }
      const deviceToUpdate = bridgeStatus.devicesConnected.get(data.deviceID);
      if (deviceToUpdate) {
        bridgeStatus.devicesConnected.set(data.deviceID, { ...deviceToUpdate, ...data.updates }); // update device with new data
      }

      common.conLog("HTTP: Updated bridge status (registered and connected devices)", "gre", false);
    }
    else {
      common.conLog("HTTP: No updates provided, so not updated bridge status", "red", false);
    }

    mqttClient.publish("server/devices/update", JSON.stringify(data)); // publish updated device to MQTT broker
  }

  /**
   * Refreshes the list of devices registered at the server based on the provided data.
   * @param {Object} data
   * @description This function updates IN the bridge the list of devices registered at the server.
   */
  function mqttDevicesRefresh(data) {
    bridgeStatus.devicesRegisteredAtServer.clear();
    for (const device of data.devices) {
      bridgeStatus.devicesRegisteredAtServer.set(device.deviceID, device);
    }
    bridgeStatus.devicesConnected.clear(); // reset map of connected devices
    for (const device of bridgeStatus.devicesRegisteredAtServer.values()) { // rebuild map of connected devices
      bridgeStatus.devicesConnected.set(device.deviceID, device);
    }

    for (let device of bridgeStatus.devicesConnected.values()) { // for each device in map of connected devices
      device.deviceConverter = convertersList.find(device.productName); // get converter for device from list of converters

      if (device.deviceConverter === undefined) { 
        common.conLog("HTTP: No converter found for " + device.productName, "red");
      }
      else {
        common.conLog("HTTP: Converter found for " + device.productName, "gre");
      }
    }

    common.conLog("HTTP: Listed all registered HTTP devices from server and set bridge status", "gre");
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
    message.devicesConnected = message.devicesConnected.map(device => { // delete deviceConverter from devicesConnected, because they cannot be stringified
      const deviceCopy = { ...device };
      delete deviceCopy.deviceConverter;
      return deviceCopy;
    });      

    mqttClient.publish("server/devices/list", JSON.stringify(message)); // ... publish to MQTT broker
    common.conLog("HTTP: Listed all registered and connected devices from server", "gre");
  }

  /**
   * If message is for getting properties and values of a connected device
   * @param {Object} data - The data object containing the device ID and values to be converted.
   * @description This function retrieves the properties and values of a connected device, converts them using the device's converter, and publishes the results to the MQTT broker.
   */
  function mqttDevicesValuesGet(data) {
    let message        = {};
    message.deviceID   = data.deviceID;
    message.bridge     = BRIDGE_PREFIX;
    message.callID     = data.callID;
    message.values     = {};

    if (!data.values || typeof data.values !== "object" || Array.isArray(data.values) || Object.keys(data.values).length === 0) {
      common.conLog("HTTP: Invalid or empty values object for device " + message.deviceID, "red");
      mqttClient.publish("server/devices/values/get", JSON.stringify(message));
      return;
    }

    const device = bridgeStatus.devicesConnected.get(message.deviceID);  
    if (device) { // if device is in map of connected devices, validate and convert values
      if (!device.deviceConverter) {
        common.conLog("HTTP: No converter available for device " + message.deviceID + ", skipping value conversion", "red");
      }
      else {
        for (const [property, value] of Object.entries(data.values)) {
          const validation = device.deviceConverter.validate(property, value);
          if (!validation.valid) {
            common.conLog("HTTP: Validation failed for device " + message.deviceID + ", property \"" + property + "\": " + validation.error, "red");
            continue; // skip invalid values
          }
          message.values[property] = device.deviceConverter.get(property, value);
        }
      }
    }
    else { // if device is not in array of connected devices, send error message
      common.conLog("HTTP: Device is not connected or registered at server", "red");
    }

    mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
  }

  /**
   * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
   * Logs a message indicating that the server is closed and exits the process.
   */  
  process.on("SIGINT", function () {
    common.conLog("HTTP: Graceful shutdown initiated ...", "yel");

    const message = {};
    message.bridge  = BRIDGE_PREFIX;
    message.status = "offline";
    
    mqttClient.publish("server/bridge/status", JSON.stringify(message)); // publish offline status to MQTT broker

    mqttClient.end(false, {}, function () {
      common.conLog("HTTP: MQTT connection closed, shutdown complete", "mag");
      process.exit(0);
    });

    setTimeout(function () {  // fallback exit in case MQTT end callback never fires
      common.conLog("HTTP: Shutdown timeout - forcing exit", "red");
      process.exit(1);
    }, appConfig.CONF_bridgesWaitShutdownSeconds * 1000);
  });
}

startBridgeAndServer();

