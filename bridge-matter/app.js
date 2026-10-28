/**
 * =============================================================================================
 * Matter - Bridge: Matter <-> MQTT
 * ================================
 *
 * A matter device is added once through "commissioning" with its pairing code and is then called a "node".
 * A node has endpoints, an endpoint has clusters (e.g. onOff), and a cluster has attributes and commands.
 * This bridge acts as Matter controller and translates between nodes and MQTT messages for the server.
 */

const appConfig       = require("../config");
const common          = require("../common");

const BRIDGE_PREFIX = "matter";

const apiKeyAuth      = require("../server/middleware/auth");
const { randomUUID }  = require("crypto");

/**
 * Load the core of the bridge (handling of Matter nodes)
 */
const { MatterBridgeCore, matterClientModule } = require("./MatterBridgeCore.js");

/**
 * Load converters for devices
 */
const { ConverterStandard, Converters } = require("./converters.js");
const convertersList = new Converters(); // create new object for converters
const converter      = convertersList.find(ConverterStandard.productName); // default converter, used if no specific converter is found for a node

/**
 * Starts the Matter bridge and MQTT server.
 * Initializes the HTTP server, MQTT client, Matter controller,
 * and defines all MQTT message handlers.
 * Automatically invoked on script startup.
 * @async
 * @function startBridgeAndServer
 */
async function startBridgeAndServer() {
  /**
   * =============================================================================================
   * Server
   * ======
  */
  const express = require("express");
  const app     = express();

  app.use(express.json());

  const server = require("http").createServer(app);
  server.listen(appConfig.CONF_portBridgeMatter, function () {
    common.logoShow(BRIDGE_PREFIX, appConfig.CONF_portBridgeMatter); // show logo
  });

  /**
   * Server info
   */
  app.get("/info", async function (request, response) {
    const data  = {};
    data.status = bridgeStatus.status;
    data.bridge = BRIDGE_PREFIX;
    data.port   = appConfig.CONF_portBridgeMatter;
    common.conLog("Matter: Bridge info sent!", "gre");
    common.conLog("Matter: Bridge route 'Info' HTTP response: " + JSON.stringify(data), "std", false);
    return response.status(200).json(data);
  });

  /**
   * Commission a new Matter device (pairing code, optionally with Wi-Fi or Thread network credentials).
   * Called by the server (POST /devices/matter/commission), which forwards the request via HTTP, so credentials never pass through the MQTT broker.
   */
  app.post("/commission", apiKeyAuth, async function (request, response) {
    const pairingCode = request.body?.pairingCode;
    if (typeof pairingCode !== "string" || pairingCode.trim() === "") {
      return response.status(400).json({ status: "error", error: "A Matter pairingCode is required" });
    }

    const wifiNetwork   = request.body.wifiNetwork; // Wi-Fi network credentials provided in the request body, if any
    const threadNetwork = request.body.threadNetwork; // Thread network credentials provided in the request body, if any

    if (wifiNetwork !== undefined) { // Validate the Wi-Fi network credentials if provided
      let wifiNetworkValid = false;

      if (wifiNetwork) {
        if (typeof wifiNetwork.wifiSsid === "string") {
          if (typeof wifiNetwork.wifiCredentials === "string") {
            wifiNetworkValid = true;
          }
        }
      }

      if (wifiNetworkValid === false) {
        return response.status(400).json({ status: "error", error: "wifiNetwork requires wifiSsid and wifiCredentials" });
      }
    }

    if (threadNetwork !== undefined) { // Validate the Thread network credentials if provided
      let threadNetworkValid = false;

      if (threadNetwork) {
        if (threadNetwork.networkName === undefined || typeof threadNetwork.networkName === "string") { // networkName is optional, matter.js derives it from the dataset
          if (typeof threadNetwork.operationalDataset === "string") {
            if (/^[0-9a-fA-F]+$/.test(threadNetwork.operationalDataset)) {
              threadNetworkValid = true;
            }
          }
        }
      }

      if (threadNetworkValid === false) {
        return response.status(400).json({ status: "error", error: "threadNetwork requires a hexadecimal operationalDataset (networkName is optional)" });
      }
    }

    if (wifiNetwork !== undefined || threadNetwork !== undefined) { // Network credentials are only accepted if an API key is configured
      if (!appConfig.CONF_apiKey) {
        return response.status(403).json({ status: "error", error: "Configure CONF_apiKey before submitting network credentials" });
      }
    }

    try {
      const matterController     = await getMatterController();
      const uuid                 = randomUUID();
      const commissioningOptions = {
        id:          uuid,
        pairingCode: pairingCode.trim(),
      };

      if (wifiNetwork !== undefined) {
        commissioningOptions.wifiNetwork = wifiNetwork;
      }

      if (threadNetwork !== undefined) {
        commissioningOptions.threadNetwork = threadNetwork;
      }

      let metadata = {}; // metadata of the device, built once by the callback below and reused for the message to the server
      await matterBridge.commission(
        matterController,
        commissioningOptions,
        function (commissionedNode, deviceConverter) { // Callback function to handle the commissioned device and extract its metadata
          const properties = deviceConverter.propertiesForEndpoints(
            commissionedNode.endpoints.map((endpoint) => endpoint.number), // Extract the endpoint numbers from the commissioned node
          );
          
          metadata = {
            productName: deviceConverter.constructor.productName,
            vendorName:  "Matter",
            name:        request.body.name || "",
            description: request.body.description || "",
            powerType:   deviceConverter.powerType,
            properties:  common.devicePropertiesToArray(properties),
          };
          return metadata;
        },
        { reportInitialStatus: false },
      );

      let message            = { uuid: uuid, bridge: BRIDGE_PREFIX, ...metadata };
      message.forceReconnect = false; // because this is Matter, the device is already connected after commissioning

      mqttClient.publish("server/devices/create", JSON.stringify(message)); // ... publish to MQTT broker

      return response.status(200).json({ status: "ok", uuid: uuid });
    }
    catch (error) {
      common.conLog("Matter: Commissioning failed: " + error.message, "red");
      return response.status(400).json({ status: "error", error: error.message });
    }
  });

  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt       = require("mqtt");
  let mqttOptions  = { clientId: BRIDGE_PREFIX, username: appConfig.CONF_brokerUsername, password: appConfig.CONF_brokerPassword,
    will: {  // LWT: broker publishes this automatically if the bridge disconnects unexpectedly (e.g. crash)
      topic:   "server/bridge/status",
      payload: JSON.stringify({ bridge: BRIDGE_PREFIX, status: "offline" }),
      retain:  true,
    },
  };
  
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
   * Connects the MQTT client and subscribes to Matter-related topics.
   * @function
   */
  function mqttConnect() {
    mqttClient.subscribe(BRIDGE_PREFIX + "/#", function (error) { // ... and subscribe to Matter topics
      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
        return;
      }

      common.conLog("MQTT: Subscribed to Matter topics from broker", "yel");

      let message    = {};
      message.bridge = BRIDGE_PREFIX;
      mqttClient.publish("server/devices/refresh", JSON.stringify(message)); // request all registered Matter devices from server
    });

    common.conLog("Matter: Bridge is online - announcing bridge status", "yel");
    let statusMessage    = {};
    statusMessage.bridge = BRIDGE_PREFIX;
    statusMessage.status = "online";
    bridgeStatus.status  = statusMessage.status;
    mqttClient.publish("server/bridge/status", JSON.stringify(statusMessage), { retain: true }); // announce online status so server can track it
  }
  mqttClient.on("connect", mqttConnect);

  /**
   * Handles MQTT reconnection events.
   * Fired at the start of each reconnection attempt. Re-subscription and bridge status
   * publishing happen automatically via the "connect" event handler (mqttConnect) once
   * the connection is re-established.
   */
  mqttClient.on("reconnect", function () {
    common.conLog("MQTT: Reconnecting to broker ...", "yel");
  });

  mqttClient.on("offline", function () {
    common.conLog("MQTT: Broker connection lost, client is offline", "red");
    bridgeStatus.status = "offline";
  });

  mqttClient.on("error", function (error) {
    common.conLog("MQTT: Connection error:", "red");
    common.conLog(error, "std", false);
  });

  /**
   * =============================================================================================
   * Helper functions
   * ================
   */

  /**
   * Class representing the status of the Matter bridge.
   * Contains maps for connected devices and registered devices at the server.
   * @class
   * @property {Map<string, Object>} devicesConnected - Map of currently connected Matter nodes (keyed by UUID).
   * @property {Map<string, Object>} devicesRegisteredAtServer - Map of devices registered at the server (keyed by UUID)
   * @property {Map<string, Object>} lastKnownValues - Cache of last known values per device (keyed by UUID).
   * @property {string} status - Status of the bridge ("online" or "offline").
   */
  class BridgeStatus {
    constructor() {
      this.devicesConnected          = new Map();
      this.devicesRegisteredAtServer = new Map();
      this.lastKnownValues           = new Map(); // cache of last known values per device (keyed by UUID)
      this.status                    = "offline";
    }
  }
  const bridgeStatus = new BridgeStatus(); // create new object for bridge status

  const matterBridge = new MatterBridgeCore({
    mqttClient:   mqttClient,
    converter:    converter,
    converters:   convertersList,
    bridgeStatus: bridgeStatus,
    log:          (message) => common.conLog(message, "red"),
  }); // create new object for the bridge core

  /**
   * =============================================================================================
   * Matter controller
   * =================
   */
  let matterControllerPromise;

  /**
   * Gets the Matter controller. The controller is created on first use (with Bluetooth for commissioning).
   * @async
   * @function getMatterController
   * @returns {Promise<Object>} A promise that resolves to the Matter controller.
   */
  async function getMatterController() {
    if (!matterControllerPromise) {
      matterControllerPromise = (async function () {
        const [{ Environment, ServerNode, singleton }, { Ble }, { NodeJsBle }] = await Promise.all([
          import("@matter/main"),
          import("@matter/main/protocol"),
          import("@matter/nodejs-ble"),
        ]);
        const environment = Environment.default;
        Ble.get           = singleton(() => new NodeJsBle({ environment }));
        return ServerNode.create({ id: "healthcore-matter" });
      })();
    }
    return matterControllerPromise;
  }

  /**
   * Gets the Matter client behavior for a cluster, so commands can be sent to a node of that cluster.
   * The client is loaded on first use and cached, so every cluster the converters write to is supported without changing this file.
   * @async
   * @function matterClientGet
   * @param {string} clusterName - The cluster name given by the converter (e.g. "onOff").
   * @returns {Promise<Function|undefined>} A promise that resolves to the client, or `undefined` if the cluster has no client.
   */
  const matterClients = new Map(); // Map of cluster name -> client
  async function matterClientGet(clusterName) {
    if (!matterClients.has(clusterName)) {
      const clientModule = matterClientModule(clusterName);
      if (!clientModule) {
        return undefined;
      }

      try {
        const behaviors = await import(clientModule.path);
        matterClients.set(clusterName, behaviors[clientModule.exportName]);
      }
      catch (error) {
        common.conLog("Matter: Could not load client for cluster " + clusterName + ": " + error.message, "red");
        return undefined;
      }
    }
    return matterClients.get(clusterName);
  }

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
        case "matter/devices/scan":
          await mqttDevicesScan(data);
          break;
        case "matter/devices/reconnect": // this message is used to connect to ALL registered devices
          await mqttDevicesReconnect(data);
          break;
        case "matter/devices/connect": // this message is used to connect to ONE specific device
          await mqttDevicesConnect(data);
          break;
        case "matter/devices/disconnect": // this message is used to disconnect ONE specific device
          await mqttDevicesDisconnect(data);
          break;
        case "matter/devices/remove":
          await mqttDevicesRemove(data);
          break;
        case "matter/devices/values/set":
          await mqttDevicesValuesSet(data);
          break;
        case "matter/devices/values/get":
          await mqttDevicesValuesGet(data);
          break;
        case "matter/devices/refresh":
          await mqttDevicesRefresh(data);
          break;
        case "matter/devices/list":
          mqttDevicesList(data);
          break;
        case "matter/devices/update":
          mqttDevicesUpdate(data);
          break;
        case "matter/devices/create":
          mqttDevicesCreate(data);
          break;
        default:
          common.conLog("Matter: NOT found matching message handler for " + topic, "red");
      }
    }
    catch (error) { // if error while parsing or handling message, log error
      common.conLog("MQTT: Error while handling message:", "red");
      common.conLog(error, "std", false);
    }
  });

  /**
   * If message is for scanning devices, then start discovery of Matter devices
   * @param {Object} data - The data object containing the duration for which discovery is running.
   */
  async function mqttDevicesScan(data) {
    const matterController = await getMatterController();

    const duration = data.duration || appConfig.CONF_scanTimeDefaultSeconds;
    common.conLog("Matter: Discovery running for " + duration + " seconds", "yel");

    const discovery = matterController.peers.discover({ timeout: duration * 1000 });
    discovery.discovered.on(function (node) {
      const uuid            = String(node.id);
      const deviceConverter = convertersList.findForNode(node);

      let message         = {};
      message.uuid        = uuid;
      message.bridge      = BRIDGE_PREFIX;
      message.vendorName  = "Matter";
      message.productName = deviceConverter.constructor.productName;
      message.powerType   = deviceConverter.powerType;
      message.connectable = true;
      message.callID      = data.callID; // add callID so the discovered device can be assigned to this scan

      mqttClient.publish("server/devices/discover", JSON.stringify(message)); // ... publish to MQTT broker
    });

    try {
      await discovery;
    }
    catch (error) {
      common.conLog("Matter: Device discovery ended: " + error.message, "yel");
    }
  }

  /**
   * Gets the list of devices registered and connected at the bridge based on the provided data.
   * @param {Object} data
   */
  function mqttDevicesList(data) {
    let message                        = {};
    message.bridge                     = BRIDGE_PREFIX;
    message.callID                     = data.callID;

    message.devicesRegisteredAtServer  = [...bridgeStatus.devicesRegisteredAtServer.values()];
    message.devicesConnected           = [...bridgeStatus.devicesConnected.keys()].map(uuid => { // only UUID and bridge, because the node objects cannot be stringified
      return { uuid: uuid, bridge: BRIDGE_PREFIX };
    });

    mqttClient.publish("server/devices/list", JSON.stringify(message)); // ... publish to MQTT broker
    common.conLog("Matter: Listed all registered and connected devices from server", "gre");
  }

  /**
   * Refreshes the list of devices registered at the server based on the provided data
   * @param {Object} data
   */
  async function mqttDevicesRefresh(data) {
    bridgeStatus.devicesRegisteredAtServer.clear();
    const matterController = await getMatterController();

    for (const device of data.devices || []) {
      bridgeStatus.devicesRegisteredAtServer.set(device.uuid, device);

      const node = matterController.peers.get(device.uuid);
      if (node) {
        matterBridge.registerNode(node, device.uuid, device);
      }
    }
  }

  /**
   * If message is for reconnecting to registered devices, then try to connect to each device
   * @param {Object} data - The data object containing the devices to connect to.
   */
  async function mqttDevicesReconnect(data) {
    bridgeStatus.devicesRegisteredAtServer.clear(); // reset map of registered devices
    bridgeStatus.devicesConnected.clear(); // reset map of connected devices
    common.conLog("Matter: Request to connect to devices", "yel");

    const matterController = await getMatterController();

    for (const device of data.devices || []) {
      bridgeStatus.devicesRegisteredAtServer.set(device.uuid, device);

      const node = matterController.peers.get(device.uuid);
      if (node) {
        try {
          await matterBridge.connectNode(node, device.uuid, device); // try to connect to each device
        }
        catch (error) {
          common.conLog("Matter: Could not reconnect device " + device.uuid + ": " + error.message, "red");
        }
      }
    }
  }

  /**
   * Updates the information of a registered device.
   * @param {Object} data
   */
  function mqttDevicesUpdate(data) {
    common.conLog("Matter: Request to update device " + data.uuid, "yel");

    if (data && data.uuid && typeof data.updates === "object" && data.updates !== null) {
      const deviceToUpdateReg = bridgeStatus.devicesRegisteredAtServer.get(data.uuid);
      if (deviceToUpdateReg) {
        bridgeStatus.devicesRegisteredAtServer.set(data.uuid, { ...deviceToUpdateReg, ...data.updates }); // update device with new data
      }

      common.conLog("Matter: Updated bridge status (registered devices)", "gre", false);

      data.bridge = BRIDGE_PREFIX;
      mqttClient.publish("server/devices/update", JSON.stringify(data)); // publish updated device to MQTT broker
    }
    else {
      common.conLog("Matter: No updates provided, so not updated bridge status", "red", false);
    }
  }

  /**
   * If message is for connecting to a registered device, then try to connect to the device
   * @param {Object} data - The data object containing the device UUID to connect to.
   */
  async function mqttDevicesConnect(data) {
    let message         = {};
    message.uuid        = data.uuid;
    message.bridge      = BRIDGE_PREFIX;
    message.callID      = data.callID;

    try {
      const device           = bridgeStatus.devicesRegisteredAtServer.get(data.uuid); // get device from map of registered devices
      const matterController = await getMatterController();
      const node             = matterController.peers.get(data.uuid);
      if (!device || !node) {
        throw new Error("Matter device is not registered or paired with this bridge");
      }

      common.conLog("Matter: Try to connect to device " + data.uuid + " ...", "yel");
      await matterBridge.connectNode(node, data.uuid, device);
      common.conLog("... and added " + data.uuid + " to list of connected devices", "gre", false);

      message.productName = matterBridge.getConverter(data.uuid).constructor.productName;
    }
    catch (error) {
      common.conLog("Matter: Could not connect to device " + data.uuid + ": " + error.message, "red");
      message.status = "error";
      message.error  = error.message;
    }

    mqttClient.publish("server/devices/connect", JSON.stringify(message)); // ... publish to MQTT broker
  }

  /**
   * If message is for disconnecting a connected device
   * @param {Object} data - The data object containing the device UUID to disconnect.
   */
  async function mqttDevicesDisconnect(data) {
    let message         = {};
    message.uuid        = data.uuid;
    message.bridge      = BRIDGE_PREFIX;
    message.callID      = data.callID;

    try {
      await matterBridge.disconnectNode(data.uuid);
      common.conLog("Matter: Device disconnected: " + data.uuid, "gre");
    }
    catch (error) {
      common.conLog("Matter: Could not disconnect device " + data.uuid + ": " + error.message, "red");
      message.status = "error";
      message.error  = error.message;
    }

    mqttClient.publish("server/devices/disconnect", JSON.stringify(message)); // ... publish to MQTT broker
  }

  /**
   * If message is for removing a connected device (this message is sent AFTER server removed device)
   * @param {Object} data - The data object containing the device UUID to remove.
   */
  async function mqttDevicesRemove(data) {
    common.conLog("Matter: Request for removing " + data.uuid, "yel");

    let message    = {};
    message.status = "error";
    message.uuid   = data.uuid;
    message.bridge = BRIDGE_PREFIX;
    message.callID = data.callID;

    try {
      await matterBridge.removeNode(data.uuid, { force: data.force === true });
      message.status = "ok";
      if (data.force === true) {
        message.warning = "The Matter device may need a factory reset before it can be paired again";
      }
      common.conLog("Matter: Device disconnected and removed: " + data.uuid, "gre");

      data.bridge = BRIDGE_PREFIX;
      mqttClient.publish("server/devices/remove", JSON.stringify(data)); // publish removed device to MQTT broker
    }
    catch (error) {
      message.error = error.message;
      common.conLog("Matter: Removal failed for " + data.uuid + ": " + error.message, "red");
    }

    mqttClient.publish("matter/devices/remove/response", JSON.stringify(message)); // ... publish response to MQTT broker
  }

  /**
   * If message is for getting properties and values of a connected device
   * @param {Object} data - The data object containing the device UUID and properties to get.
   */
  async function mqttDevicesValuesGet(data) {
    common.conLog("Matter: Request for getting properties and values of " + data.uuid, "yel");

    let message                   = {};
    message.uuid                  = data.uuid;
    message.values                = await matterBridge.getValues(data.uuid); // read values from device (or serve last known values if not connected)
    message.bridge                = BRIDGE_PREFIX;
    message.callID                = data.callID;

    mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
  }

  /**
   * If message is for setting values of a connected device
   * @param {Object} data - The data object containing the device UUID and properties to set.
   */
  async function mqttDevicesValuesSet(data) {
    common.conLog("Matter: Request for setting values of " + data.uuid, "yel");

    let response    = {};
    response.status = "error";
    response.bridge = BRIDGE_PREFIX;
    response.uuid   = data.uuid;
    response.callID = data.callID;

    try {
      const updates = await matterBridge.setValues(data.uuid, data.values, matterClientGet);
      response.status = "ok";

      let message    = {};
      message.uuid   = data.uuid;
      message.bridge = BRIDGE_PREFIX;
      message.values = updates;
      mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // publish new values to MQTT broker
    }
    catch (error) {
      common.conLog("Matter: Error setting values of " + data.uuid + ": " + error.message, "red");
      response.error = error.message;
    }

    mqttClient.publish("matter/devices/values/set/response", JSON.stringify(response)); // ... publish response to MQTT broker
  }

  /**
  * Create a new device
  * @param {Object} data
  */
  function mqttDevicesCreate(data) {
    common.conLog("Matter: Request to create device " + data.uuid + ", but creating here is not possible, Matter devices must be commissioned through POST /devices/matter/commission", "red");

    let message    = {};
    message.status = "error";
    message.bridge = BRIDGE_PREFIX;
    message.uuid   = data.uuid;
    message.callID = data.callID;
    message.error  = "Commission Matter devices through POST /devices/matter/commission with a pairingCode";

    mqttClient.publish("matter/devices/create/response", JSON.stringify(message)); // ... publish response to MQTT broker
  }

  /**
   * Shutdown
   */
  process.on("SIGINT", async function () {
    common.conLog("Matter: Graceful shutdown initiated ...", "yel");

    try { // Close the Matter controller (cleanly shuts down all node connections)
      if (matterControllerPromise) {
        const controller = await matterControllerPromise;
        await controller.close();
        common.conLog("Matter: Controller stopped", "mag");
      }
    }
    catch (error) {
      common.conLog("Matter: Error stopping controller: " + error.message, "red");
    }

    bridgeStatus.status = "offline";
    bridgeStatus.devicesConnected.clear();

    const message  = {};
    message.bridge = BRIDGE_PREFIX;
    message.status = "offline";

    mqttClient.publish("server/bridge/status", JSON.stringify(message), { retain: true }); // publish offline status to MQTT broker

    mqttClient.end(false, {}, function () {
      server.close(function () {
        common.conLog("Matter: MQTT connection closed, shutdown complete", "mag");
        process.exit(0);
      });
    });

    setTimeout(function () {  // fallback exit in case MQTT end callback never fires
      common.conLog("Matter: Shutdown timeout - forcing exit", "red");
      process.exit(1);
    }, appConfig.CONF_bridgesWaitShutdownSeconds * 1000);
  });
}

/**
 * Unhandled errors
 */
process.on("unhandledRejection", function (reason) {
  common.conLog("Matter Bridge: Unhandled promise rejection: " + reason, "red");
});

/**
 * Uncaught exceptions
 */
process.on("uncaughtException", function (error) {
  common.conLog("Matter Bridge: Uncaught exception: " + error.message, "red");
  common.conLog(error.stack, "std", false);
});

startBridgeAndServer();
