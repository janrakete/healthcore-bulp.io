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

    const routesData  = require("./routes/data"); // import routes for data manipulation
    app.use("/data", routesData);
    const routesMqtt  = require("./routes/mqtt"); // import routes for MQTT
    app.use("/mqtt", routesMqtt);

    /**
     * Server
     */
    const server = require("http").createServer(app);
    server.listen(appConfig.portServer, function () {
      common.logoShow("Server",             appConfig.CONF_portServer); // show bulp logo
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
      mqttClient.subscribe("#", function (error, granted) { // ... and subscribe to all topics
      common.conLog("MQTT: Subscribed to all topics from broker", "yel"); 
      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
      }
      });
    }
    mqttClient.on("connect", mqttConnect);

    global.mqttClient = mqttClient; // make MQTT client global

    const mqttSSE = require("./sse/mqtt"); // import relevant SSE that are related to MQTT
    
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
        mysqlConnection.query("INSERT INTO mqtt_history (topic, message) VALUES (" + mysqlConnection.escape(topic.toString()) + "," + mysqlConnection.escape(message.toString()) + ")");
      }
      catch (error) {
        common.conLog("MQTT: Error while inserting topic and message into history:", "red");
        common.conLog(error, "std", false);
      }
      mqttSSE.mqttProcessIncomingMessages(topic.toString(), message.toString()); // process incoming MQTT message
    });

    // create Server Side Events channel
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