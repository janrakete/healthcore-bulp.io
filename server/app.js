/**
 * =============================================================================================
 * Main file
 * =========
 */
const appConfig   = require("../config");
const common      = require("../common");

global.common = common; // make Common functions global

/**
 * MySQL
 */
const mysql = require("mysql2/promise");

/**
 * Start MySQL and server
 * @async
 * @function startMySQLAndServer
 * @description This function establishes a MySQL connection, sets up the server with middleware, routes, and MQTT client, and starts the server.
 */
async function startMySQLAndServer() {
  await mysql.createConnection({ // establish MySQL connection
  host        : appConfig.CONF_dbHost,
  user        : appConfig.CONF_dbUser,
  password    : appConfig.CONF_dbPass,
  database    : appConfig.CONF_dbName,
  port        : appConfig.CONF_dbPort,
  dateStrings : true
  }).then(async function(mysqlConnection){
   
    global.mysqlConnection = mysqlConnection; // make MySQL connection global

    /**
     * Date and time
     */
    const moment = require("moment");
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
        let data = {};
        data.status        = "error";
        data.errorMessage  = "JSON in request is invalid";
        res.json(data);
      }
    });

    const routesData = require("./routes/data"); // import routes for data manipulation
    app.use("/data", routesData);
    const routesDevices = require("./routes/devices"); // import routes for devices manipulation
    app.use("/devices", routesDevices);

    //const routesMqtt  = require("./routes/mqtt"); // import routes for MQTT
    //app.use("/mqtt", routesMqtt);

    /**
     * Server
     */
    const server = require("http").createServer(app);
    server.listen(appConfig.portServer, function () {
      common.logoShow("Server",             appConfig.CONF_portServer); // show logo
      common.conLog("  Server ID: " +       appConfig.CONF_serverID, "mag", false);
      common.conLog("  Server version: " +  appConfig.CONF_serverVersion, "mag", false);
    });

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

        const [results] = await MySQLConnection.query("SELECT * FROM devices WHERE deviceID=" + mysqlConnection.escape(deviceID) + " LIMIT 1");
        if (results.length === 0) // could not find device 
        {
            Common.conLog("Check device ID: not found in database device with ID " + deviceID, "red");
            return false;
        }
        else {
            Common.conLog("Check device ID: found in database device with ID " + deviceID, "gre");
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

      if (message == "") {
        message = "{}";
      }

      try {
        mysqlConnection.query("INSERT INTO mqtt_history (topic, message) VALUES (" + 
        mysqlConnection.escape(topic.toString()) + "," +
        mysqlConnection.escape(message.toString()) + ")");
      }
      catch (error) {
        common.conLog("Server: Error while inserting topic and message into history:", "red");
        common.conLog(error, "std", false);
      }
      
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
     * @description This function retrieves a list of devices associated with a specific bridge from the MySQL database and publishes the list to the MQTT topic for that bridge.
     */
    async function mqttDevicesList(data) {
      let message = {};

      if (data.bridge) {
          const [results] = await mysqlConnection.query("SELECT * FROM devices WHERE bridge=" +
                                  mysqlConnection.escape(data.bridge));
          message.devices = results;

          mqttClient.publish(data.bridge + "/devices/connect", JSON.stringify(message));
      } else {
          Common.conLog("Server: bridge is missing in message for devices list", "red");
      }
    }    

    /**
     * Create a new device
     * @param {Object} data - The data object containing the device information.
     * @description This function creates a new device in the MySQL database and publishes a message to the MQTT topic for that device.
     */
    async function mqttDeviceCreate(data) {
      let message = {};

      if (data.bridge) {
        if (data.deviceID && data.vendorName && data.productName) {
          if (deviceCheckRegistered(deviceID)) { // check if device is already registered
            Common.conLog("Server: Device with ID " + data.deviceID + " is already registered", "red");
            message.status      = "error";
            message.deviceID    = data.deviceID;
            message.bridge      = data.bridge;
            message.status      = "error";
            message.error       = "Device already registered";
          }
          else {
            // insert device into database
            await mysqlConnection.query("INSERT INTO devices (deviceID, bridge, vendorName, productName, description, properties, dateTimeAdded) VALUES (" + 
                  mysqlConnection.escape(data.deviceID) + ", " + 
                  mysqlConnection.escape(data.bridge) + ", " + 
                  mysqlConnection.escape(data.vendorName) + ", " + 
                  mysqlConnection.escape(data.productName) + ", " +
                  mysqlConnection.escape(data.description) + ", " +
                  mysqlConnection.escape(data.properties) + ", " + 
                  NOW()
                  + ")");

            message.status    = "ok";
            message.deviceID  = data.deviceID;
            message.bridge    = data.bridge;
            Common.conLog("Server: Created device with ID " + data.deviceID, "gre");
          }
        }
        else {
          Common.conLog("Server: bridge is missing in message for device creation", "red");
          message.status      = "error";
          message.deviceID    = data.deviceID;
          message.status      = "error";
          message.error       = "Bridge missing";
        }
      }
      else {
          Common.conLog("Server: Device ID or product name or vendor name is missing in message for device creation", "red");
          message.status      = "error";
          message.deviceID    = data.deviceID;
          message.status      = "error";
          message.error       = "Bridge missing";        
      }
      
      mqttClient.publish(data.bridge + "/device/create", JSON.stringify(message));
    }   

    /**
     * Create Server Side Events channel
     */
    const sse         = require("better-sse"); 
    global.sse        = sse;
    global.sseChannel = global.sse.createChannel(); // make channel global
  });
}

startMySQLAndServer();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
  common.conLog("Server closed.", "mag", true);
  process.exit(0);
});