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
 * Cron jobs
 */
const cronJobs = require("node-cron");

/**
 * Start server
 * @async
 * @function startServer
 * @description This function establishes a SQLite connection, sets up the server with middleware, routes, and MQTT client, and starts the server.
 */
async function startServer() {
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
  const routesSSE = require("./routes/sse"); // import routes for server side events
  app.use("/sse", routesSSE);
  const routesScenarios = require("./routes/scenarios"); // import routes for scenarios manipulation
  app.use("/scenarios", routesScenarios);
  
  /**
   * Swagger
   */
  const swaggerDocs = require("./routes/_swagger");
  swaggerDocs(app);

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

  /**
   * Anomaly detection
   * @param {Object} data
   * @description This function checks for anomalies in the data properties using the Isolation Forest algorithm.
   */
  function anomalyCheck(data) { // TODO: convert to cron job
    const propertyKeys = data.properties.map(property => Object.keys(property)[0]);
    propertyKeys.forEach((property, index) => { // iterate over each property
      const results = database.prepare( // prepare SQL query to get historical data
        "SELECT valueAsNumeric FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? AND property = ? ORDER BY dateTimeAsNumeric DESC LIMIT ?"
      ).all(data.deviceID, data.bridge, property, appConfig.CONF_anomalyDetectionHistorySize);

      if (!results || results.length < 2) { // not enough data for anomaly detection
        return;
      }

      const values = results.map(result => { return { [property]: result.valueAsNumeric }} ); // map results to values  
      const model = new IsolationForest();

      model.fit(values.slice(1)); // Cut first entry of data, because if it is already in dataset then it will not be considered as anomaly
      const trainingScores = model.scores();
      const latestScore    = model.predict([{ [property]: values[0][property] }])[0]; // get score of latest entry
      if (latestScore > appConfig.CONF_anomalyDetectionThreshold) {
        common.conLog("Server: Anomaly detected for property " + property + " with score " + latestScore, "gre");
        let message         = {};
        message.deviceID    = data.deviceID;
        message.bridge      = data.bridge;
        message.property    = property;
        message.score       = latestScore;
        mqttClient.publish("server/devices/anomaly", JSON.stringify(message));
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
  global.mqttClient           = mqttClient; // make MQTT client global
  global.mqttPendingResponses = {}; // store pending MQTT responses (used for API calls, that wait for an MQTT response)

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

      const result = await database.prepare("SELECT * FROM devices WHERE deviceID = ? LIMIT 1").get(deviceID);
      if (!result) { // could not find device
          common.conLog("Server: Check device ID: not found in database device with ID " + deviceID, "red");
          return false;
      } else {
          common.conLog("Server: Check device ID: found in database device with ID " + deviceID, "gre");
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

      if (data.callID && mqttPendingResponses[data.callID]) { // check if callID is present and if there's a matching pending response through an API call
        mqttPendingResponses[data.callID](data);
        delete mqttPendingResponses[data.callID];
      }

      switch (topic) {
        case "server/devices/list":
          mqttDevicesList(data);
          break;
        case "server/devices/create":
          mqttDevicesCreate(data);
          break;
        case "server/devices/remove":
          mqttDevicesRemove(data);
          break;
        case "server/devices/update":
          mqttDevicesUpdate(data);
          break;
        case "server/devices/values":
          mqttDevicesValues(data);
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
      const results = await database.prepare("SELECT * FROM devices WHERE bridge = ?").all(data.bridge);
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
  async function mqttDevicesCreate(data) {
    let message = {};

    if (data.bridge) {
      if (data.deviceID && data.productName) {
        if (await deviceCheckRegistered(data.deviceID)) { // check if device is already registered
          common.conLog("Server: Device with ID " + data.deviceID + " is already registered", "red");
          message.status      = "error";
          message.deviceID    = data.deviceID;
          message.bridge      = data.bridge;
          message.status      = "error";
          message.error       = "Device already registered";
        }
        else {
          await database.prepare("INSERT INTO devices (deviceID, bridge, powerType, productName, name, description, properties, dateTimeAdded) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))").run(
            data.deviceID, data.bridge, data.powerType, data.productName, data.name || "", data.description || "", JSON.stringify(data.properties) || "");

          message.status    = "ok";
          message.deviceID  = data.deviceID;
          message.bridge    = data.bridge;
          common.conLog("Server: Created device with ID " + data.deviceID, "gre");
          mqttDevicesList({ bridge: data.bridge }); // publish updated device list to bridge
        }
      }
      else {
        common.conLog("Server: Device ID or product name is missing in message for device creation", "red");
        message.status      = "error";
        message.deviceID    = data.deviceID;
        message.error       = "Device ID or product name is missing";
      }
    }
    else {
        common.conLog("Server: bridge is missing in message for device creation", "red");
        message.status      = "error";
        message.error       = "Bridge missing";        
    }
    
    mqttClient.publish(data.bridge + "/devices/create", JSON.stringify(message));
  }   

  /**
   * Remove a device
   * @param {Object} data - The data object containing the device information.
   * @description This function removes a device from the database and publishes a message to the MQTT topic for that device.
   */
  async function mqttDevicesRemove(data) {
    let message = {};

    if (data.bridge) {
      if (data.deviceID) {
        if (await deviceCheckRegistered(data.deviceID)) { // check if device is registered
          // remove device from database
          await database.prepare("DELETE FROM devices WHERE deviceID = ? AND bridge = ?").run(
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
        message.bridge      = data.bridge;
        message.error       = "Device ID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device removal", "red");
      message.status      = "error";
      message.error       = "Bridge missing";
    }

    mqttClient.publish(data.bridge + "/devices/remove", JSON.stringify(message));
  }   

  /**
   * Fetch device values
   * @param {Object} data - The data object containing the device information.
   * @description This function fetches the current values of a device.
   */
  async function mqttDevicesValues(data) {
    let message = {};    
    if (data.bridge) {
      if (data.deviceID) {
        if (await deviceCheckRegistered(data.deviceID)) { // check if device is registered
          message.status    = "ok";
          message.deviceID  = data.deviceID;
          message.bridge    = data.bridge;
          message.values    = data.values || undefined;
          common.conLog("Server: Fetched values for device with ID " + data.deviceID, "gre");

          sseChannel.broadcast(JSON.stringify(data), "value"); // broadcast values to all clients, that are connect via SSE
          
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
        message.bridge      = data.bridge;
        message.error       = "Device ID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device values", "red");
      message.status      = "error";
      message.error       = "Bridge missing";
    }
  }

  /**
   * Update device information
   * @param {Object} data - The data object containing the device information.
   * @description This function updates the information of a device in the database and publishes a message to the MQTT topic for that device.
   */
  async function mqttDevicesUpdate(data) {
    let message = {};

    if (data.bridge) {
      if (data.deviceID) {
        if (await deviceCheckRegistered(data.deviceID)) { // check if device is registered
          // delete non-updatable fields
          delete data.updates.deviceID;
          delete data.updates.bridge;
          delete data.updates.powerType;
          delete data.updates.properties;
          delete data.updates.productName;
          
          const fields        = Object.keys(data.updates);
          const placeholders  = fields.map(field => field + " = ?").join(", ");
          const values        = Object.values(data.updates);

          await database.prepare("UPDATE devices SET " + placeholders + " WHERE deviceID = ? AND bridge = ? LIMIT 1").run(values, data.deviceID, data.bridge);

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
        message.bridge      = data.bridge;
        message.error       = "Device ID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device update", "red");
      message.status      = "error";
      message.error       = "Bridge missing";
    }
  }

  /**
   * Create Server Side Events channel
   */
  const sse         = require("better-sse"); 
  global.sse        = sse;
  global.sseChannel = sse.createChannel(); // make channel global
  
}

startServer();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
  common.conLog("Server closed.", "mag", true);
  process.exit(0);
});