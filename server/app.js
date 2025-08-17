/**
 * =============================================================================================
 * Server - Main file
 * ==================
 */
const appConfig   = require("../config");
const common      = require("../common");
global.common     = common; // make Common functions global

/**
 * SQLite
 */
const database  = require("better-sqlite3")(appConfig.CONF_databaseFilename);
global.database = database; // make SQLite database global

/**
 * Start SQLite and server
 * @async
 * @function startDatabaseAndServer
 * @description This function establishes a SQLite connection, sets up the server with middleware, routes, and MQTT client, and starts the server.
 */
async function startDatabaseAndServer() {
  /**
   * Date and time
   */
  const moment  = require("moment");
  global.moment = moment;   

  /**
   * Translations
   */
  const translations = new common.Translations();
  await translations.build();
  global.translations = translations;

  /**
   * Middleware
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
      let data           = {};
      data.status        = "error";
      data.errorMessage  = "JSON in request is invalid";
      res.json(data);
    }
  });

  const routesData = require("./routes/data"); // import routes for data manipulation
  app.use("/data", routesData);
  const routesDevices = require("./routes/devices"); // import routes for devices manipulation
  app.use("/devices", routesDevices);

  /**
   * Server
   */
  const server = require("http").createServer(app);
  server.listen(appConfig.CONF_portServer, function () {
    common.logoShow("Server",             appConfig.CONF_portServer); // show logo
    common.conLog("  Server ID: " +       appConfig.CONF_serverID, "mag", false);
    common.conLog("  Server version: " +  appConfig.CONF_serverVersion, "mag", false);
  });

  /**
   * Anomaly detection
   */
  const { IsolationForest } = require("isolation-forest");
  const anomalyModel    = new IsolationForest();

  /**
   * Anomaly detection
   * @param {Object} data
   * @description This function checks for anomalies in the data properties using the Isolation Forest algorithm.
   */
  function anomalyCheck(data) {
    const propertyKeys  = data.properties.map(property => Object.keys(property)[0]); // prepare all queries in one go to reduce database calls
    const queries       = propertyKeys.map(property => database.prepare("SELECT valueAsNumeric FROM mqtt_devices_values WHERE deviceID = ? AND bridge = ? AND property = ? ORDER BY dateTimeAsNumeric DESC LIMIT ?").all(data.deviceID, data.bridge, property, appConfig.CONF_anomalyDetectionHistorySize));

    queries.forEach((results, index) => { // fit and predict in batch
      if (!results || results.length === 0) {
        return;
      }

      const values = results.map(result => result.valueAsNumeric);
      anomalyModel.fit(values.map(value => [value]));
      const scores = anomalyModel.scores();

      console.log(scores);

      const lastScore = scores[scores.length - 1]; // only check the last value for anomaly (most recent)
      if (lastScore > appConfig.CONF_anomalyDetectionThreshold) {
        common.conLog("Server: Anomaly detected for property " + propertyKeys[index] + " with score " + lastScore, "gre");

        let message       = {};
        message.deviceID  = data.deviceID;
        message.bridge    = data.bridge;
        message.property  = propertyKeys[index];
        message.score     = lastScore;

        mqttClient.publish("server/device/anomaly", JSON.stringify(message));
      }
    });
  }

  /**
   * MQTT client
   */
  const mqtt       = require("mqtt");
  const mqttClient = mqtt.connect(appConfig.CONF_brokerAddress, { clientId: "server" }); // connect to broker ...

  /**
  * Connects the MQTT client and subscribes to all topics.
  * @function
  * @description This function is called when the MQTT client successfully started.
  */
  function mqttConnect() {
    mqttClient.subscribe("server/#", function (error, granted) { // ... and subscribe to all topics
    common.conLog("MQTT: Subscribed to all topics from broker", "yel"); 
    if (error) {
      common.conLog("MQTT: Error while subscribing:", "red");
      common.conLog(error, "std", false);
    }
    });
  }
  mqttClient.on("connect", mqttConnect);
  global.mqttClient = mqttClient; // make MQTT client global
  
  /**
   * =============================================================================================
   * Helper functions
   * ================
   */

  /**
   *  Check if a device is registered in the database
   * @param {string} strDeviceID - The device ID to check.
   * @returns {boolean} - Returns true if the device is registered, false otherwise.
   * @description This function checks if a device with the given ID is registered in the database
   */
  async function deviceCheckRegistered(deviceID) {
      deviceID = deviceID.trim();

      const result = database.prepare("SELECT * FROM devices WHERE deviceID = ? LIMIT 1").get(deviceID);
      if (!result) { // could not find device
          common.conLog("Check device ID: not found in database device with ID " + deviceID, "red");
          return false;
      } else {
          common.conLog("Check device ID: found in database device with ID " + deviceID, "gre");
          return true;
      }
  }
  
  /**
   * Process incoming MQTT messages
   * @function
   * @param {string} topic - The topic of the incoming MQTT message
   * @param {string} message - The message payload of the incoming MQTT message
   * @description This function is called when a message is received from the MQTT broker.
   */
  mqttClient.on("message", function (topic, message) { // getting a message from MQTT broker
    common.conLog("MQTT: Getting incoming message from broker", "yel");
    common.conLog("Topic: " + topic.toString(), "std", false);
    common.conLog("Message: " + message.toString(), "std", false);

    try {
      const data = JSON.parse(message); // parse message to JSON

      switch (topic) {
        case "server/devices/list":
          mqttDevicesList(data);
          break;
        case "server/device/create":
          mqttDeviceCreate(data);
          break;
        case "server/device/remove":
          mqttDeviceRemove(data);
          break;
        case "server/device/update":
          mqttDeviceUpdate(data);
          break;
        case "server/device/values":
          mqttDeviceValues(data);
          break;
        default:
          common.conLog("Server: NOT found matching message handler for " + topic, "red");
      }
    }
    catch (error) { // if error while parsing message, log error
      common.conLog("MQTT: Error while parsing message:", "red");     
      common.conLog(error, "std", false);
    } 
  });

  /**
   * List devices based on the bridge
   * @param {Object} data - The data object containing the bridge information.
   * @description This function retrieves a list of devices associated with a specific bridge from the database and publishes the list to the MQTT topic for that bridge.
   */
  async function mqttDevicesList(data) {
    let message = {};

    if (data.bridge) {
      const results = database.prepare("SELECT * FROM devices WHERE bridge = ?").all(data.bridge);
      message.devices = results;

      if (data.forceReconnect === true)  { // if forceReconnect is true, publish to reconnect topic
        mqttClient.publish(data.bridge + "/devices/reconnect", JSON.stringify(message));
      }
      else {
        mqttClient.publish(data.bridge + "/devices/list", JSON.stringify(message));
      }
    }
    else {
      common.conLog("Server: bridge is missing in message for devices list", "red");
    }
  }    

  /**
   * Create a new device
   * @param {Object} data - The data object containing the device information.
   * @description This function creates a new device in the database and publishes a message to the MQTT topic for that device.
   */
  async function mqttDeviceCreate(data) {
    let message = {};

    if (data.bridge) {
      if (data.deviceID && data.vendorName && data.productName) {
        if (deviceCheckRegistered(data.deviceID)) { // check if device is already registered
          common.conLog("Server: Device with ID " + data.deviceID + " is already registered", "red");
          message.status      = "error";
          message.deviceID    = data.deviceID;
          message.bridge      = data.bridge;
          message.status      = "error";
          message.error       = "Device already registered";
        }
        else {
          // insert device into database
          database.prepare("INSERT INTO devices (deviceID, bridge, vendorName, productName, description, properties, dateTimeAdded) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))").run(
            data.deviceID, data.bridge, data.vendorName, data.productName, data.description || "", data.properties || "");

          message.status    = "ok";
          message.deviceID  = data.deviceID;
          message.bridge    = data.bridge;
          common.conLog("Server: Created device with ID " + data.deviceID, "gre");
        }
      }
      else {
        common.conLog("Server: bridge is missing in message for device creation", "red");
        message.status      = "error";
        message.deviceID    = data.deviceID;
        message.status      = "error";
        message.error       = "Bridge missing";
      }
    }
    else {
        common.conLog("Server: Device ID or product name or vendor name is missing in message for device creation", "red");
        message.status      = "error";
        message.deviceID    = data.deviceID;
        message.status      = "error";
        message.error       = "Bridge missing";        
    }
    
    mqttClient.publish(data.bridge + "/device/create", JSON.stringify(message));
  }   

  /**
   * Remove a device
   * @param {Object} data - The data object containing the device information.
   * @description This function removes a device from the database and publishes a message to the MQTT topic for that device.
   */
  async function mqttDeviceRemove(data) {
    let message = {};

    if (data.bridge) {
      if (data.deviceID) {
        if (deviceCheckRegistered(data.deviceID)) { // check if device is registered
          // remove device from database
          database.prepare("DELETE FROM devices WHERE deviceID = ? AND bridge = ?").run(
            data.deviceID, data.bridge
          );

          message.status    = "ok";
          message.deviceID  = data.deviceID;
          message.bridge    = data.bridge;
          common.conLog("Server: Removed device with ID " + data.deviceID, "gre");
        }
        else {
          common.conLog("Server: Device with ID " + data.deviceID + " is not registered", "red");
          message.status      = "error";
          message.deviceID    = data.deviceID;
          message.bridge      = data.bridge;
          message.error       = "Device not registered";
        }
      }
      else {
        common.conLog("Server: Device ID is missing in message for device removal", "red");
        message.status      = "error";
        message.deviceID    = data.deviceID;
        message.bridge      = data.bridge;
        message.error       = "Device ID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device removal", "red");
      message.status      = "error";
      message.deviceID    = data.deviceID;
      message.bridge      = data.bridge;
      message.error       = "Bridge missing";
    }

    mqttClient.publish(data.bridge + "/device/remove", JSON.stringify(message));
  }   

  /**
   * Fetch device values
   * @param {Object} data - The data object containing the device information.
   * @description This function fetches the current values of a device.
   */
  async function mqttDeviceValues(data) {
    let message = {};    
    if (data.bridge) {
      if (data.deviceID) {
        if (deviceCheckRegistered(data.deviceID)) { // check if device is registered
          message.status    = "ok";
          message.deviceID  = data.deviceID;
          message.bridge    = data.bridge;
          message.values    = data.values || undefined;
          common.conLog("Server: Fetched values for device with ID " + data.deviceID, "gre");
          
          if (appConfig.CONF_anomalyDetectionActive) {
            if (data.properties !== undefined) { // Check for anomalies in the fetched values
              anomalyCheck(data);
            }
          }
        }
        else {
          common.conLog("Server: Device with ID " + data.deviceID + " is not registered", "red");
          message.status      = "error";
          message.deviceID    = data.deviceID;
          message.bridge      = data.bridge;
          message.error       = "Device not registered";
        }
      }
      else {
        common.conLog("Server: Device ID is missing in message for device values", "red");
        message.status      = "error";
        message.deviceID    = data.deviceID;
        message.bridge      = data.bridge;
        message.error       = "Device ID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device values", "red");
      message.status      = "error";
      message.deviceID    = data.deviceID;
      message.bridge      = data.bridge;
      message.error       = "Bridge missing";
    }
  }

  /**
   * Update device information
   * @param {Object} data - The data object containing the device information.
   * @description This function updates the information of a device in the database and publishes a message to the MQTT topic for that device.
   */
  async function mqttDeviceUpdate(data) {
    let message = {};

    if (data.bridge) {
      if (data.deviceID) {
        if (deviceCheckRegistered(data.deviceID)) { // check if device is registered
          
          // update only fields that are defined in "data"
          const updateFields = [];
          const updateValues = [];

          if (data.properties) {
            updateFields.push("name = ?");
            updateValues.push(data.name);
          }
          updateValues.push(data.deviceID);
          updateValues.push(data.bridge);

          database.prepare("UPDATE devices SET ${updateFields.join(', ')} WHERE deviceID = ? AND bridge = ?").run(
            ...updateValues
          );

          message.status    = "ok";
          message.deviceID  = data.deviceID;
          message.bridge    = data.bridge;
          common.conLog("Server: Updated device with ID " + data.deviceID, "gre");
        }
        else {
          common.conLog("Server: Device with ID " + data.deviceID + " is not registered", "red");
          message.status      = "error";
          message.deviceID    = data.deviceID;
          message.bridge      = data.bridge;
          message.error       = "Device not registered";
        }
      }
      else {
        common.conLog("Server: Device ID is missing in message for device update", "red");
        message.status      = "error";
        message.deviceID    = data.deviceID;
        message.bridge      = data.bridge;
        message.error       = "Device ID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device update", "red");
      message.status      = "error";
      message.deviceID    = data.deviceID;
      message.bridge      = data.bridge;
      message.error       = "Bridge missing";
    }

    mqttClient.publish(data.bridge + "/device/update", JSON.stringify(message));
  }

  /**
   * Create Server Side Events channel
   */
  const sse         = require("better-sse"); 
  global.sse        = sse;
  global.sseChannel = global.sse.createChannel(); // make channel global
  
}

startDatabaseAndServer();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
  common.conLog("Server closed.", "mag", true);
  process.exit(0);
});