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
database.pragma("foreign_keys = ON");

/**
 * Database migration, if needed
 */
const databaseMigrationEngine = require("./libs/DatabaseMigrationEngine");
databaseMigrationEngine.runMigrations();

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
      response.json(data);
    }
  });

  /**
   * API Key Authentication
   */
  const apiKeyAuth = require("./middleware/auth");

  const infoData = require("./routes/info"); // import routes for server info
  app.use("/info", apiKeyAuth, infoData);

  const routesData = require("./routes/data"); // import routes for data manipulation
  app.use("/data", apiKeyAuth, routesData);

  const routesDevices = require("./routes/devices"); // import routes for devices manipulation
  app.use("/devices", apiKeyAuth, routesDevices);

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
    const fs    = require("fs");
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
  cron.schedule("* * * * *", async () => {
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
   * MQTT client
   */
  const mqtt       = require("mqtt");
  let mqttOptions  = { clientId: "server", username: appConfig.CONF_brokerUsername, password: appConfig.CONF_brokerPassword };
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

  /**
   * =============================================================================================
   * Helper functions
   * ================
   */

  /**
   *  Check if a device is registered in the database
   * @param {string} uuid - The device UUID to check.
   * @returns {boolean} - Returns true if the device is registered, false otherwise.
   */
  async function deviceCheckRegistered(uuid, bridge) {
      uuid = uuid.trim();

      const result = database.prepare("SELECT deviceID FROM devices WHERE uuid = ? AND bridge = ? LIMIT 1").get(uuid, bridge);
      if (!result) { // could not find device
          common.conLog("Server: Check device: not found in database device with UUID " + uuid, "red");
          return false;
      } else {
          common.conLog("Server: Check device: found in database device with UUID " + uuid, "gre");
          return true;
      }
  }
  
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

      switch (topic) {
        case "server/devices/refresh":
          await mqttDevicesRefresh(data);
          break;
        case "server/devices/create":
          await mqttDevicesCreate(data);
          break;
        case "server/devices/remove":
          await mqttDevicesRemove(data);
          break;
        case "server/devices/update":
          await mqttDevicesUpdate(data);
          break;
        case "server/devices/values/get":
          await mqttDevicesValuesGet(data);
          break;
        case "server/devices/strength":
          await mqttDevicesStrength(data);
          break;
        case "server/devices/status":
          await mqttDevicesStatus(data);
          break;
        case "server/integrations/accounts/list":
          await mqttIntegrationsAccountsList(data);
          break;
        case "server/integrations/accounts/tokens/set":
          await mqttIntegrationsAccountsTokensSet(data);
          break;
        case "server/integrations/syncrun/start":
          await mqttIntegrationsSyncRunStart(data);
          break;
        case "server/integrations/syncrun/finish":
          await mqttIntegrationsSyncRunFinish(data);
          break;
        case "server/bridge/status":
          mqttBridgeStatusUpdate(data);
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
   * Updates the in-memory bridge status map when a bridge publishes its online/offline status.
   * Called when a bridge connects (status: "online") or when the MQTT LWT fires (status: "offline").
   * @param {Object} data - Message payload; data.bridge and data.status are required.
   */
  function mqttBridgeStatusUpdate(data) {
    if (data.bridge && data.status) {
      const bridgeKey = String(data.bridge).trim().toLowerCase();

      global.mqttBridgeStatus[bridgeKey] = data.status; // normalized key; used by GET /info for MQTT-only bridges
      common.conLog("Server: Bridge status updated: " + bridgeKey + " = " + data.status, "yel");
    }
  }

  /**
   * Refreshed devices IN the bridge
   * @param {Object} data - The data object containing the bridge information.
   */
  async function mqttDevicesRefresh(data) {
    let message = {};

    if (data.bridge) {
      const results = await database.prepare("SELECT * FROM devices WHERE bridge = ?").all(data.bridge);
      message.devices = results;

      if (data.forceReconnect === true)  { // if forceReconnect is true, publish to reconnect topic
        mqttClient.publish(data.bridge + "/devices/reconnect", JSON.stringify(message));
      }
      else {
        mqttClient.publish(data.bridge + "/devices/refresh", JSON.stringify(message));
      }
    }
    else {
      common.conLog("Server: bridge is missing in message for devices list", "red");
    }
  }    

  /**
   * Create a new device
   * @param {Object} data - The data object containing the device information.
   */
  async function mqttDevicesCreate(data) {
    let message = {};

    if (data.bridge) {
      if (data.uuid && data.productName) {
        if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is already registered
          common.conLog("Server: Device with UUID " + data.uuid + " is already registered", "red");
          message.status  = "error";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          message.error   = "Device already registered";
        }
        else {
          const result = database.prepare("INSERT INTO devices (uuid, bridge, powerType, vendorName, productName, name, description, properties, dateTimeAdded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))").run(
            data.uuid, data.bridge, data.powerType || "?", data.vendorName || "", data.productName, data.name || "", data.description || "", JSON.stringify(data.properties) || "");

          message.status    = "ok";
          message.deviceID  = result.lastInsertRowid;
          message.uuid      = data.uuid;
          message.bridge    = data.bridge;

          if (data.forceReconnect === undefined || data.forceReconnect === null) { // set forceReconnect to true if not provided
            data.forceReconnect = true;
          }

          common.conLog("Server: Created device with UUID " + data.uuid + " (deviceID: " + result.lastInsertRowid + ")", "gre");
          mqttDevicesRefresh({ bridge: data.bridge, forceReconnect: data.forceReconnect }); // publish updated device list to bridge and force reconnect if requested
        }
      }
      else {
        common.conLog("Server: Device UUID or product name is missing in message for device creation", "red");
        message.status  = "error";
        message.uuid    = data.uuid;
        message.error   = "Device UUID or product name is missing";
      }
    }
    else {
        common.conLog("Server: bridge is missing in message for device creation", "red");
        message.status  = "error";
        message.error   = "Bridge missing";
    }

    mqttClient.publish(data.bridge + "/devices/create/response", JSON.stringify(message));
  }   

  /**
   * Remove a device
   * @param {Object} data - The data object containing the device information.
   */
  async function mqttDevicesRemove(data) {
    let message = {};

    if (data.bridge) {
      if (data.uuid) {
        if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
          database.prepare("DELETE FROM devices WHERE uuid = ? AND bridge = ?").run(data.uuid, data.bridge); // remove device from database
          message.status  = "ok";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          common.conLog("Server: Removed device with UUID " + data.uuid, "gre");
        }
        else {
          common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
          message.status  = "error";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          message.error   = "Device not registered";
        }
      }
      else {
        common.conLog("Server: Device UUID is missing in message for device removal", "red");
        message.status  = "error";
        message.bridge  = data.bridge;
        message.error   = "Device UUID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device removal", "red");
      message.status  = "error";
      message.error   = "Bridge missing";
    }
    mqttClient.publish(data.bridge + "/devices/remove/response", JSON.stringify(message));
  }   

  /**
   * Fetch device values
   * @param {Object} data - The data object containing the device information.
   */
  async function mqttDevicesValuesGet(data) {
    let message = {};
    if (data.bridge) {
      if (data.uuid) {
        if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
          message.status     = "ok";
          message.uuid       = data.uuid;
          message.bridge     = data.bridge;
          message.properties = data.properties;

          common.conLog("Server: Fetched values for device with UUID " + data.uuid, "gre");

          /**
           * Evaluate scenarios based on the fetched values
           */
          if (data.values !== undefined) {
            Object.keys(data.values).forEach((property) => {
              const valueData = data.values[property];

              scenarios.handleEvent("device_value", {
                uuid:      data.uuid,
                bridge:    data.bridge,
                property:  property,
                value:     valueData.value,
                valueType: valueData.valueType || "string"
              });

              if (property === "battery") { // if battery level is fetched, trigger battery_low event for scenarios if value is below threshold
                scenarios.handleEvent("battery_low", {
                  uuid:     data.uuid,
                  bridge:   data.bridge,
                  property: "battery",
                  value:    valueData.value
                });
              }
            });

            await global.alerts.handleDeviceValues(data); // handle alerts based on device values
          }
        }
        else {
          common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
          message.status  = "error";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          message.error   = "Device not registered";
        }
      }
      else {
        common.conLog("Server: Device UUID is missing in message for device values", "red");
        message.status  = "error";
        message.bridge  = data.bridge;
        message.error   = "Device UUID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device values", "red");
      message.status  = "error";
      message.error   = "Bridge missing";
    }

    mqttClient.publish(data.bridge + "/devices/values/get/response", JSON.stringify(message));
  }

  /**
   * Update device information
   * @param {Object} data - The data object containing the device information.
   */
  async function mqttDevicesUpdate(data) {
    let message = {};

    if (data.bridge) {
      if (data.uuid) {
        if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
          // delete non-updatable fields
          delete data.updates.deviceID;
          delete data.updates.uuid;
          delete data.updates.bridge;
          delete data.updates.powerType;
          delete data.updates.properties;
          delete data.updates.productName;
          delete data.updates.vendorName;

          const safeNameRegex = /^[a-zA-Z0-9_]+$/;
          const fields        = Object.keys(data.updates).filter(field => safeNameRegex.test(field));

          if (fields.length === 0) {
            message.status = "error";
            message.error  = "No valid fields to update";
            mqttClient.publish(data.bridge + "/devices/update/response", JSON.stringify(message));
            return;
          }

          const placeholders  = fields.map(field => field + " = ?").join(", ");
          const values        = fields.map(field => data.updates[field]);

          database.prepare("UPDATE devices SET " + placeholders + " WHERE uuid = ? AND bridge = ?").run(...values, data.uuid, data.bridge);

          message.status  = "ok";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          common.conLog("Server: Updated device with UUID " + data.uuid, "gre");
        }
        else {
          common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
          message.status  = "error";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          message.error   = "Device not registered";
        }
      }
      else {
        common.conLog("Server: Device UUID is missing in message for device update", "red");
        message.status  = "error";
        message.bridge  = data.bridge;
        message.error   = "Device UUID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device update", "red");
      message.status  = "error";
      message.error   = "Bridge missing";
    }
    mqttClient.publish(data.bridge + "/devices/update/response", JSON.stringify(message));
  }

  /**
   * Update device signal strength
   * @param {*} data - The data object containing the device information. 
   */
  async function mqttDevicesStrength(data) {
    let message = {};
    if (data.bridge) {
      if (data.uuid) {
        if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
          message.status    = "ok";
          message.uuid      = data.uuid;
          message.bridge    = data.bridge;
          message.strength  = data.strength;
          common.conLog("Server: Updated signal strength for device with UUID " + data.uuid + ": " + data.strength + "%", "gre");

          database.prepare("UPDATE devices SET strength = ? WHERE uuid = ? AND bridge = ?").run(data.strength, data.uuid, data.bridge);
        }
        else {
          common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
          message.status  = "error";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          message.error   = "Device not registered";
        }
      }
      else {
        common.conLog("Server: Device UUID is missing in message for device strength", "red");
        message.status  = "error";
        message.bridge  = data.bridge;
        message.error   = "Device UUID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device strength", "red");
      message.status  = "error";
      message.error   = "Bridge missing";
    }
    mqttClient.publish(data.bridge + "/devices/strength/response", JSON.stringify(message));
  }

  /**
   * Handle device status events (online/offline)
   * @param {Object} data - { device UUID, bridge, status: "online"|"offline" }
   */
  async function mqttDevicesStatus(data) {
    let message = {};
    if (data.bridge) {
      if (data.uuid) {
        if (data.status) {
          if (await deviceCheckRegistered(data.uuid, data.bridge)) { // check if device is registered
            const type      = data.status === "online" ? "device_connected" : "device_disconnected";
            message.status  = "ok";
            message.uuid    = data.uuid;
            message.bridge  = data.bridge;
            common.conLog("Server: Device " + data.uuid + " status: " + data.status, "yel");

            scenarios.handleEvent(type, {
              uuid:   data.uuid,
              bridge: data.bridge
            });

            global.alerts.handleDeviceStatus(data); // handle alerts based on device status
          }
          else {
            common.conLog("Server: Device with UUID " + data.uuid + " is not registered", "red");
            message.status  = "error";
            message.uuid    = data.uuid;
            message.bridge  = data.bridge;
            message.error   = "Device not registered";
          }
        }
        else {
          common.conLog("Server: Status is missing in message for device status", "red");
          message.status  = "error";
          message.uuid    = data.uuid;
          message.bridge  = data.bridge;
          message.error   = "Status missing";
        }
      }
      else {
        common.conLog("Server: Device UUID is missing in message for device status", "red");
        message.status  = "error";
        message.bridge  = data.bridge;
        message.error   = "Device UUID missing";
      }
    }
    else {
      common.conLog("Server: Bridge is missing in message for device status", "red");
      message.status  = "error";
      message.error   = "Bridge missing";
    }
    mqttClient.publish(data.bridge + "/devices/status/response", JSON.stringify(message));
  }

  /**
   * =============================================================================================
   * Integration handlers — persistent state for external provider sync
   * ==================================================================
   */

  /**
   * Emits a standardised integration response back to the originating bridge.
   * @param {Object} data      - Original request data (must contain bridge and callID).
   * @param {string} action    - The action suffix for the response topic (e.g. "accounts/list").
   * @param {Object} payload   - Fields to merge into the response.
   */
  function integrationRespond(data, action, payload) {
    const message          = Object.assign({}, payload);
    message.callID         = data.callID;
    message.bridge         = data.bridge;
    const responseTopic    = data.bridge + "/integrations/" + action + "/response";
    mqttClient.publish(responseTopic, JSON.stringify(message));
  }

  /**
   * List all enabled integration accounts.
   * Required: bridge, callID
   */
  async function mqttIntegrationsAccountsList(data) {
    if (!data.bridge || !data.callID) {
      common.conLog("Server: integrations/accounts/list: missing bridge or callID", "red");
      return;
    }
    try {
      const accounts = credentialEngine.listAccounts();
      integrationRespond(data, "accounts/list", { status: "ok", accounts });
    }
    catch (error) {
      common.conLog("Server: integrations/accounts/list error: " + error.message, "red");
      integrationRespond(data, "accounts/list", { status: "error", error: error.message });
    }
  }

  /**
   * Persist a refreshed access token for an account.
   * Required: bridge, callID, accountID, accessToken
   * Optional: expiresAt
   */
  async function mqttIntegrationsAccountsTokensSet(data) {
    if (!data.bridge || !data.callID) {
      common.conLog("Server: integrations/accounts/tokens/set: missing bridge or callID", "red");
      return;
    }

    if (!data.accountID || !data.accessToken) {
      integrationRespond(data, "accounts/tokens/set", { status: "error", error: "accountID and accessToken are required" });
      return;
    }

    try {
      credentialEngine.setToken(data.accountID, data.accessToken, data.expiresAt || null);
      integrationRespond(data, "accounts/tokens/set", { status: "ok", accountID: data.accountID });
    }
    catch (error) {
      common.conLog("Server: integrations/accounts/tokens/set error: " + error.message, "red");
      integrationRespond(data, "accounts/tokens/set", { status: "error", error: error.message });
    }
  }

  /**
   * Start a sync run record for an account.
   * Required: bridge, callID, accountID
   * Returns: syncRunID
   */
  async function mqttIntegrationsSyncRunStart(data) {
    if (!data.bridge || !data.callID) {
      common.conLog("Server: integrations/syncrun/start: missing bridge or callID", "red");
      return;
    }

    if (!data.accountID) {
      integrationRespond(data, "syncrun/start", { status: "error", error: "accountID is required" });
      return;
    }

    try {
      const syncRunID = credentialEngine.syncRunStart(data.accountID);
      integrationRespond(data, "syncrun/start", { status: "ok", accountID: data.accountID, syncRunID });
    }
    catch (error) {
      common.conLog("Server: integrations/syncrun/start error: " + error.message, "red");
      integrationRespond(data, "syncrun/start", { status: "error", error: error.message });
    }
  }

  /**
   * Mark a sync run as finished (success or error).
   * Required: bridge, callID, syncRunID
   * Optional: error (string, null means success)
   */
  async function mqttIntegrationsSyncRunFinish(data) {
    if (!data.bridge || !data.callID) {
      common.conLog("Server: integrations/syncrun/finish: missing bridge or callID", "red");
      return;
    }

    if (!data.syncRunID) {
      integrationRespond(data, "syncrun/finish", { status: "error", error: "syncRunID is required" });
      return;
    }
    
    try {
      credentialEngine.syncRunFinish(data.syncRunID, data.error || null);
      integrationRespond(data, "syncrun/finish", { status: "ok", syncRunID: data.syncRunID });
    }
    catch (error) {
      common.conLog("Server: integrations/syncrun/finish error: " + error.message, "red");
      integrationRespond(data, "syncrun/finish", { status: "error", error: error.message });
    }
  }

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