/**
 * =============================================================================================
 * Server - Main file
 * ==================
 */
const appConfig   = require("../config");
const common      = require("../common");

const fs          = require("fs");
const path        = require("path");

global.common     = common; // make Common functions global

/**
 * Database
 */
const databasePathCurrent   = path.resolve(__dirname, "../healthcore_database.db");
const databasePathSchema    = path.resolve(__dirname, "../healthcore_database.db-schema");
if (!fs.existsSync(databasePathCurrent)) { // if database file does not exist, copy schema file to create it
  fs.copyFileSync(databasePathSchema, databasePathCurrent);
  common.conLog("Server: Database not found, file created from schema", "yel");
}
else {
  common.conLog("Server: Database file found", "gre");
}

const database  = require("better-sqlite3")(databasePathCurrent);
global.database = database; // make SQLite database global
database.pragma("foreign_keys = ON");

/**
 * Database migration, if needed
 */
const databaseMigrationEngine = require("./libs/DatabaseMigrationEngine");
database.pragma("foreign_keys = OFF"); // migrations may rebuild tables referenced by existing foreign keys
databaseMigrationEngine.runMigrations();
database.pragma("foreign_keys = ON");

/**
 * Start server
 * @async
 * @function startServer
 */
async function startServer() {
  /**
   * Date and time
   */
  const dayjs   = require("dayjs");
  global.dayjs  = dayjs;   

  /**
   * Middleware
   */
  const express     = require("express");
  const cors        = require("cors");
  const bodyParser  = require("body-parser");

  const app = express();

  app.use(bodyParser.json());

  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin)
          return callback(null, true); // allow requests with no origin (native apps, curl, server-to-server)       
        if ((!appConfig.CONF_corsURL || String(appConfig.CONF_corsURL).trim() === "") || appConfig.CONF_corsURL.includes(origin))
          return callback(null, true);       
        callback(new Error("CORS: Origin '" + origin + "' not allowed"));
      }
    }),
    bodyParser.urlencoded({
      extended: true,
    })
  );

  app.use(function (error, request, response, next) { // if request contains JSON and the JSON is invalid
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      let data    = {};
      data.status = "error";
      data.error  = "JSON in request is invalid";
      return response.status(400).json(data);
    }

    next(error);
  });

  /**
   * API Key Authentication
   */
  const apiKeyAuth = require("./middleware/auth");

  const routesInfo = require("./routes/info"); // import routes for server info
  app.use("/info", apiKeyAuth, routesInfo);

  const routesData = require("./routes/data"); // import routes for data manipulation
  app.use("/data", apiKeyAuth, routesData);

  const routesDevices = require("./routes/devices"); // import routes for devices manipulation
  app.use("/devices", apiKeyAuth, routesDevices);

  const routesDevicesGroups = require("./routes/devices-groups"); // import routes for device groups
  app.use("/devices-groups", apiKeyAuth, routesDevicesGroups);

  const routesScenarios = require("./routes/scenarios"); // import routes for scenarios manipulation
  app.use("/scenarios", apiKeyAuth, routesScenarios);

  const routesAlerts = require("./routes/alerts"); // import routes for alerts
  app.use("/alerts", apiKeyAuth, routesAlerts);

  const routesReports = require("./routes/reports"); // import routes for reporting
  app.use("/reports", apiKeyAuth, routesReports);

  const routesUpdate = require("./routes/update"); // import routes for updates
  app.use("/update", apiKeyAuth, routesUpdate);

  /**
   * Swagger
   */
  const swaggerDocs = require("./routes/_swagger");
  swaggerDocs(app);

  /**
   * Server (HTTPS if TLS is configured, otherwise HTTP)
   */
  let server;
  if (appConfig.CONF_tlsPath) {
    const https = require("https");
    try {
      const tlsOptions = {
        cert: fs.readFileSync(appConfig.CONF_tlsPath + "cert.pem"),
        key:  fs.readFileSync(appConfig.CONF_tlsPath + "key.pem"),
      };
      server = https.createServer(tlsOptions, app);
      common.conLog("Server: TLS enabled (HTTPS)", "gre");
    }
    catch (error) {
      common.conLog("Server: TLS files not found, falling back to HTTP", "red");
      server = require("http").createServer(app);
    }
  }
  else {
    server = require("http").createServer(app);
  }

  await new Promise((resolve) => {
    server.listen(appConfig.CONF_portServer, function () {
      common.logoShow("Server",             appConfig.CONF_portServer); // show logo
      common.conLog("  Server ID: " +       appConfig.CONF_serverID, "mag", false);
      common.conLog("  Server version: " +  appConfig.CONF_serverVersion, "mag", false);
      resolve();
    });
  });

  /**
   * Security hints (CORS, API, MQTT, HTTPS)
   */
  if (!appConfig.CONF_corsURL || String(appConfig.CONF_corsURL).trim() === "") { // if no CORS URLs configured, log warning and allow (development mode)
   common.conLog("Security: No CORS URLs configured. All URLs are allowed. Set CONF_corsURL in .env.local", "red");
  }
  else {
    common.conLog("Security: CORS allowed for: " + appConfig.CONF_corsURL, "gre");
  }

  if (!appConfig.CONF_apiKey) { // if no key configured, log warning and allow (development mode)
    common.conLog("Security: No API key configured. All requests are allowed. Set CONF_apiKey in .env.local", "red");
  }
  else {
    common.conLog("Security: API key authentication enabled", "gre");
  }

  if (!appConfig.CONF_brokerUsername && !appConfig.CONF_brokerPassword) { // if no MQTT credentials configured, log warning and allow (development mode)
    common.conLog("Security: No MQTT broker credentials configured. All clients are allowed. Set CONF_brokerUsername and CONF_brokerPassword in .env.local", "red");
  }
  
  if (!appConfig.CONF_tlsPath) { // if TLS not configured, log warning and use HTTP (development mode)
    common.conLog("Security: TLS certificate or key path not configured. Using HTTP. Set CONF_tlsPath in .env.local", "red");
  }

  /**
   * Bonjour service
   */
  try {
    const bonjourService = require("bonjour-service");
    const bonjourCtor = bonjourService.Bonjour || bonjourService.default || bonjourService; // support different import styles of bonjour-service (depending on version)
    const bonjour = new bonjourCtor();

    bonjour.publish({
      name: appConfig.CONF_serverIDBonjour,
      type: "http",
      port: appConfig.CONF_portServer,
      txt: {
        server: appConfig.CONF_serverID,
        version: appConfig.CONF_serverVersion
      },
    });
  }
  catch (error) {
    common.conLog("Server: Bonjour init failed, continuing without Bonjour advertisement", "yel");
    common.conLog(error, "std", false);
  }

  /**
   * Scenario Engine
   */
  const ScenarioEngine = require("./libs/ScenarioEngine");
  global.scenarios     = new ScenarioEngine();

  /**
   * Time-based scenario scheduler (fires once per minute via node-cron)
   */
  const cron = require("node-cron");
  cron.schedule("* * * * *", async function () { // runs every minute to handle time-based scenarios
    const now     = new Date();
    const hours   = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    try {
      await scenarios.handleTimeEvent(hours + ":" + minutes);
    }
    catch (error) {
      common.conLog("Scenarios: Error in time-based scheduler: " + error.message, "red");
    }
  });

  /**
   * Inactivity alerts need a clock-driven evaluation because a missing sensor
  * event cannot invoke AlertsEngine.deviceValuesHandle().
   */
  cron.schedule("* * * * *", function () { // runs every minute to evaluate inactivity rules
    try {
      global.alerts.inactivityRulesEvaluate();
    }
    catch (error) {
      common.conLog("Alerts: Error in inactivity scheduler: " + error.message, "red");
    }
  });

  /**
   * Reporting engine and reporting service
   */
  const ReportingEngine   = require("./libs/ReportingEngine");
  const ReportingService  = require("./libs/ReportingEngineService");
  const reportingEngine   = new ReportingEngine();
  global.reportingService = new ReportingService(reportingEngine);

  if (appConfig.CONF_reportingEnabled === true) {
    try {
      await reportingEngine.initialize(appConfig.CONF_reportingEngineModel);
      common.conLog("Reporting: Engine ready", "gre");
    }
    catch (error) {
      common.conLog("Reporting: Engine initialization failed: " + error.message, "red");
    }

    cron.schedule(appConfig.CONF_reportingCron, async () => {
      try {
        await reportingService.generateAndStoreReports();
      }
      catch (error) {
        common.conLog("Reporting: Generation failed: " + error.message, "red");
      }
    });
    common.conLog("Reporting: Cron scheduled with '" + appConfig.CONF_reportingCron + "'", "yel");
  }

  /**
   * Alerts Engine
   */
  const AlertsEngine = require("./libs/AlertsEngine");
  global.alerts      = new AlertsEngine();

  /*
   * Credential Engine
   */
  const credentialEngine  = require("./libs/CredentialEngine");
  global.credentialEngine = credentialEngine;

  /**
   * Push notifications
   */
  const PushEngine      = require("./libs/PushEngine");
  const pushEngine      = new PushEngine();
  scenarios.pushEngine  = pushEngine; // make push engine available in scenarios
  
  /**
   * Loading settings from database
   */
  try {
    const result = await database.prepare("SELECT * FROM settings LIMIT 1").get();
    if (result) {
      appConfig.CONF_settings = result;
      common.conLog("Server: Settings loaded from database", "gre");
    }
    else {
      common.conLog("Server: No settings found in database", "red");
    } 
  }
  catch (error) {
    common.conLog("Server: Error loading settings from database: " + error, "red");
  }

  /**
   * Plexus Engine (WebSocket connection to Plexus)
   */
  const PlexusEngine = require("./libs/PlexusEngine");
  global.plexusEngine = new PlexusEngine();
  if (global.plexusEngine.active === true) {
    global.plexusEngine.connect();
  }

  /**
   * MQTT client
   */
  const mqtt       = require("mqtt");
  let mqttOptions  = { clientId: "server", username: appConfig.CONF_brokerUsername, password: appConfig.CONF_brokerPassword };
  if (appConfig.CONF_tlsPath) { // if TLS path is configured, try to load CA cert for secure connection (if cert not found, will log warning and continue without CA cert)
    try {
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
  * Connects the MQTT client and subscribes to all topics.
  * @function
  */
  function mqttConnect() {
    mqttClient.subscribe("server/#", function (error, granted) { // ... and subscribe to all topics
      common.conLog("MQTT: Subscribed to all topics from broker", "yel"); 

      const message   = {};
      message.status  = "online";
      mqttClient.publish("server/status", JSON.stringify(message)); // publish online status to MQTT broker

      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
      }
    });
  }
  mqttClient.on("connect", mqttConnect);
  global.mqttClient           = mqttClient; // make MQTT client global
  global.mqttPendingResponses = {}; // store pending MQTT responses (used for API calls, that wait for an MQTT response)
  global.mqttBridgeStatus     = {}; // in-memory bridge status map (keyed by bridge name); populated via MQTT LWT / online messages

  const mqttDeviceHandlers = require("./appMQTTDeviceHandlers");

  /**
   * Process incoming MQTT messages
   * @function
   * @param {string} topic - The topic of the incoming MQTT message
   * @param {string} message - The message payload of the incoming MQTT message
   */
  mqttClient.on("message", async function (topic, message) { // getting a message from MQTT broker
    common.conLog("MQTT: Getting incoming message from broker", "yel");
    common.conLog("Topic: " + topic.toString(), "std", false);
    common.conLog("Message: " + message.toString(), "std", false);

    try {
      const data = JSON.parse(message); // parse message to JSON

      if (data.callID && mqttPendingResponses[data.callID]) { // check if callID is present and if there's a matching pending response through an API call
        mqttPendingResponses[data.callID](data);
        delete mqttPendingResponses[data.callID];
      }

      await mqttDeviceHandlers.handleMessage(topic, data);
    }
    catch (error) { // if error while parsing message, log error
      common.conLog("MQTT: Error while parsing message:", "red");
      common.conLog(error, "std", false);
    }
  });

  /**
   * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
   * Logs a message indicating that the server is closed and exits the process.
   */    
  process.on("SIGINT", function () {
    common.conLog("Server: Graceful shutdown initiated ...", "yel");

    const message   = {};
    message.status  = "offline";
    mqttClient.publish("server/status", JSON.stringify(message)); // publish offline status to MQTT broker

    mqttClient.end(false, {}, function () {
      database.close();
      common.conLog("Server: MQTT and database connection closed, shutdown complete", "mag");
      process.exit(0);
    });

    setTimeout(function () {  // fallback exit in case MQTT end callback never fires
      common.conLog("Server: Shutdown timeout - forcing exit", "red");
      process.exit(1);
    }, appConfig.CONF_bridgesWaitShutdownSeconds * 1000);
  });
}

/** 
 * Unhandled errors
 */
process.on("unhandledRejection", function (reason) {
  common.conLog("Server: Unhandled promise rejection: " + reason, "red");
});

/** 
 * Uncaught exceptions
 */
process.on("uncaughtException", function (error) {
  common.conLog("Server: Uncaught exception: " + error.message, "red");
  common.conLog(error.stack, "std", false);
});

startServer();