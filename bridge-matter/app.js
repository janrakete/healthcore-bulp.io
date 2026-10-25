/**
 * =============================================================================================
 * Matter - Bridge: Matter <-> MQTT
 * ===============================
 */

const appConfig       = require("../config");
const common          = require("../common");
const apiKeyAuth      = require("../server/middleware/auth");
const { randomUUID }  = require("crypto");

/**
 * =============================================================================================
 * Bridge status and Matter core
 * =============================
 */
const BRIDGE_PREFIX = "matter";

/**
 * Load converters for Matter devices
 */
const { ConverterStandard, Converters } = require("./converters");
const convertersList = new Converters();
const converter      = convertersList.find(ConverterStandard.productName);
const bridgeStatus   = {
  devicesConnected: new Map(),
  devicesRegisteredAtServer: new Map(),
  scannedDevices: new Map(),
  lastKnownValues: new Map(),
  deviceScanCallID: undefined,
  status: "offline",
};

const NODE_CONNECTION_CONNECTED = 0;

class MatterBridgeCore {
  constructor({ mqttClient, converter, converters, bridgeStatus, log }) {
    this.mqttClient    = mqttClient;
    this.converter     = converter;
    this.converters    = converters;
    this.bridgeStatus  = bridgeStatus;
    this.log           = log;
    this.observedNodes = new WeakSet();
    this.deviceConverters = new Map();
    this.pendingEnables = new WeakMap();
  }

  converterForNode(node) {
    return this.converters ? this.converters.findForNode(node) : this.converter;
  }

  getConverter(uuid) {
    return this.deviceConverters.get(uuid) || this.converter;
  }

  ensureNodeEnabled(node) {
    if (node.lifecycle?.isConnected || typeof node.enable !== "function") {
      return Promise.resolve();
    }

    const pendingEnable = this.pendingEnables.get(node);
    if (pendingEnable) {
      return pendingEnable;
    }

    const enablePromise = Promise.resolve()
      .then(() => node.enable())
      .finally(() => this.pendingEnables.delete(node));
    this.pendingEnables.set(node, enablePromise);
    return enablePromise;
  }

  async commission(controller, options, metadataForNode, registrationOptions = {}) {
    const node     = await controller.peers.commission(options);
    const converter = this.converterForNode(node);
    const metadata = typeof metadataForNode === "function" ? metadataForNode(node, converter) : metadataForNode;
    this.registerNode(node, options.id, metadata, registrationOptions, converter);
    return node;
  }

  registerNode(
    node,
    uuid,
    metadata = {},
    { reportInitialStatus = true, enableNode = true } = {},
    converter = this.converterForNode(node),
  ) {
    this.deviceConverters.set(uuid, converter);
    this.bridgeStatus.devicesConnected.set(uuid, node);
    this.bridgeStatus.devicesRegisteredAtServer.set(uuid, { uuid, bridge: BRIDGE_PREFIX, ...metadata });
    this.bridgeStatus.scannedDevices.delete(uuid);

    if (!this.observedNodes.has(node)) {
      this.observedNodes.add(node);
      node.events.attributeChanged.on(({ path, value }) => {
        if (path?.clusterId === undefined || path?.attributeName === undefined) {
          return;
        }

        const converted = converter.getAttribute(path.clusterId, path.attributeName, value, path.endpointId);
        if (converted === undefined) {
          return;
        }

        const values = this.bridgeStatus.lastKnownValues.get(uuid) || {};
        values[converted.property] = {
          value: converted.value,
          valueAsNumeric: converted.valueAsNumeric,
          valueType: converted.valueType,
          endpointId: converted.endpointId,
        };
        this.bridgeStatus.lastKnownValues.set(uuid, values);
        this.mqttClient.publish(
          "server/devices/values/get",
          JSON.stringify({
            uuid,
            bridge: BRIDGE_PREFIX,
            values: { [converted.property]: values[converted.property] },
          }),
        );
      });

      node.lifecycle?.connectionStateChanged.on((state) => {
        this.publishDeviceStatus(uuid, state === NODE_CONNECTION_CONNECTED ? "online" : "offline");
      });
    }

    if (enableNode && !node.lifecycle?.isConnected) {
      this.ensureNodeEnabled(node).catch((error) => {
        this.log("Matter: Could not re-enable device " + uuid + ": " + error.message);
      });
    } else if (reportInitialStatus && node.lifecycle?.isConnected) {
      this.publishDeviceStatus(uuid, "online");
    }
  }

  async connectNode(node, uuid, metadata = {}) {
    this.registerNode(node, uuid, metadata, { reportInitialStatus: false, enableNode: false });
    try {
      await this.ensureNodeEnabled(node);
    }
    catch (error) {
      this.bridgeStatus.devicesConnected.delete(uuid);
      throw error;
    }
  }

  async disconnectNode(uuid) {
    const node = this.bridgeStatus.devicesConnected.get(uuid);
    if (!node) {
      throw new Error("Matter device is not connected");
    }

    await node.disable();
    this.bridgeStatus.devicesConnected.delete(uuid);
  }

  async setValues(uuid, requestedValues, matterClients) {
    const node = this.bridgeStatus.devicesConnected.get(uuid);
    if (!node || !requestedValues || typeof requestedValues !== "object" || Array.isArray(requestedValues)) {
      throw new Error("Matter device is not connected or no values were provided");
    }

    const converter = this.getConverter(uuid);
    const commands = Object.entries(requestedValues).map(([property, requestedValue]) => {
      const match = /^(.*?)(?:_endpoint_(\d+))?$/.exec(property);
      if (!match) {
        throw new Error("Matter property is not writable: " + property);
      }

      const value = requestedValue && typeof requestedValue === "object" ? requestedValue.value : requestedValue;
      const propertyName = match[1];
      const endpointId = Number(match[2] || requestedValue?.endpointId || 1);
      const writeCommand = converter.getWriteCommand(propertyName, value);
      if (!writeCommand) {
        throw new Error("Matter property is not writable: " + property);
      }

      const endpoint = node.parts.get(endpointId);
      if (!endpoint) {
        throw new Error("Matter endpoint not found: " + endpointId);
      }

      const client = matterClients[writeCommand.client];
      if (!client) {
        throw new Error("Matter client is unavailable: " + writeCommand.client);
      }

      return { property, endpoint, endpointId, writeCommand, client };
    });

    const updates = {};
    for (const { property, endpoint, endpointId, writeCommand, client } of commands) {
      const command = endpoint.commandsOf(client)[writeCommand.commandName];
      if (typeof command !== "function") {
        throw new Error("Matter command is not supported: " + writeCommand.commandName);
      }
      await command(...writeCommand.args);
      const converted = converter.getAttribute(
        writeCommand.clusterId,
        writeCommand.attributeName,
        writeCommand.attributeValue,
        endpointId,
      );
      updates[property] = {
        value: converted.value,
        valueAsNumeric: converted.valueAsNumeric,
        valueType: converted.valueType,
        endpointId,
      };
    }

    const values = this.bridgeStatus.lastKnownValues.get(uuid) || {};
    Object.assign(values, updates);
    this.bridgeStatus.lastKnownValues.set(uuid, values);
    return updates;
  }

  async getValues(uuid) {
    const node = this.bridgeStatus.devicesConnected.get(uuid);
    if (!node) {
      return this.bridgeStatus.lastKnownValues.get(uuid) || {};
    }

    const converter = this.getConverter(uuid);
    const values = this.bridgeStatus.lastKnownValues.get(uuid) || {};
    const readableAttributes = [
      [6, ["onOff"]],
      [8, ["currentLevel"]],
      [47, ["batPercentRemaining"]],
      [768, ["currentHue", "currentSaturation", "colorTemperatureMireds"]],
      [1026, ["measuredValue"]],
      [1027, ["measuredValue"]],
      [1029, ["measuredValue"]],
      [1030, ["occupancy"]],
    ];

    for (const endpoint of node.endpoints) {
      for (const [clusterId, attributeNames] of readableAttributes) {
        const behavior = endpoint.behaviors.forCluster(clusterId);
        if (!behavior) {
          continue;
        }

        const supportedAttributes = endpoint.behaviors.elementsOf(behavior).attributes;
        for (const attributeName of attributeNames) {
          if (!supportedAttributes.has(attributeName)) {
            continue;
          }

          try {
            const state = await endpoint.getStateOf(behavior, [attributeName]);
            const converted = converter.getAttribute(clusterId, attributeName, state[attributeName], endpoint.number);
            if (converted) {
              values[converted.property] = {
                value: converted.value,
                valueAsNumeric: converted.valueAsNumeric,
                valueType: converted.valueType,
                endpointId: converted.endpointId,
              };
            }
          }
          catch (error) {
            this.log("Matter: Could not read " + attributeName + " from " + uuid + ": " + error.message);
          }
        }
      }
    }

    this.bridgeStatus.lastKnownValues.set(uuid, values);
    return values;
  }

  async removeNode(uuid, { force = false } = {}) {
    const node = this.bridgeStatus.devicesConnected.get(uuid);
    if (node) {
      if (force) {
        await node.delete();
      } else {
        await node.decommission();
        await node.delete();
      }
    }

    this.bridgeStatus.devicesConnected.delete(uuid);
    this.deviceConverters.delete(uuid);
    this.bridgeStatus.devicesRegisteredAtServer.delete(uuid);
    this.bridgeStatus.scannedDevices.delete(uuid);
    this.bridgeStatus.lastKnownValues.delete(uuid);
  }

  publishDeviceStatus(uuid, status) {
    if (!this.bridgeStatus.devicesRegisteredAtServer.has(uuid)) {
      return;
    }
    this.mqttClient.publish("server/devices/status", JSON.stringify({ uuid, bridge: BRIDGE_PREFIX, status }));
  }
}

async function startBridgeAndServer() {
  const express    = require("express");
  const app        = express();
  const httpServer = require("http").createServer(app);
  let mqttClient;
  let matterControllerPromise;

  /**
   * =============================================================================================
   * Server
   * ======
   */
  app.use(express.json());
  app.get("/info", function (request, response) {
    return response.status(200).json({
      status: bridgeStatus.status,
      bridge: BRIDGE_PREFIX,
      port: appConfig.CONF_portBridgeMatter,
    });
  });

  app.post("/commission", apiKeyAuth, async function (request, response) {
    const pairingCode = request.body?.pairingCode;
    if (typeof pairingCode !== "string" || pairingCode.trim() === "") {
      return response.status(400).json({ status: "error", error: "A Matter pairingCode is required" });
    }

    const wifiNetwork   = request.body.wifiNetwork;
    const threadNetwork = request.body.threadNetwork;
    if (
      wifiNetwork !== undefined &&
      (!wifiNetwork || typeof wifiNetwork.wifiSsid !== "string" || typeof wifiNetwork.wifiCredentials !== "string")
    ) {
      return response.status(400).json({ status: "error", error: "wifiNetwork requires wifiSsid and wifiCredentials" });
    }
    if (
      threadNetwork !== undefined &&
      (!threadNetwork ||
        typeof threadNetwork.networkName !== "string" ||
        typeof threadNetwork.operationalDataset !== "string" ||
        !/^[0-9a-fA-F]+$/.test(threadNetwork.operationalDataset))
    ) {
      return response
        .status(400)
        .json({ status: "error", error: "threadNetwork requires networkName and a hexadecimal operationalDataset" });
    }
    if ((wifiNetwork !== undefined || threadNetwork !== undefined) && !appConfig.CONF_apiKey) {
      return response
        .status(403)
        .json({ status: "error", error: "Configure CONF_apiKey before submitting network credentials" });
    }

    try {
      const matterController = await getMatterController();
      const uuid = randomUUID();
      const commissioningOptions = {
        id: uuid,
        pairingCode: pairingCode.trim(),
      };
      if (wifiNetwork !== undefined) {
        commissioningOptions.wifiNetwork = wifiNetwork;
      }
      if (threadNetwork !== undefined) {
        commissioningOptions.threadNetwork = threadNetwork;
      }
      const node = await matterBridge.commission(
        matterController,
        commissioningOptions,
        function (commissionedNode, deviceConverter) {
          const properties = deviceConverter.propertiesForEndpoints(
            commissionedNode.endpoints.map((endpoint) => endpoint.number),
          );
          return {
            productName: deviceConverter.constructor.productName,
            vendorName: "Matter",
            name: request.body.name || "",
            description: request.body.description || "",
            powerType: deviceConverter.powerType,
            properties: common.devicePropertiesToArray(properties),
          };
        },
        { reportInitialStatus: false },
      );
      const deviceConverter = matterBridge.getConverter(uuid);
      const properties = deviceConverter.propertiesForEndpoints(node.endpoints.map((endpoint) => endpoint.number));
      mqttClient.publish(
        "server/devices/create",
        JSON.stringify({
          uuid,
          bridge: BRIDGE_PREFIX,
          productName: deviceConverter.constructor.productName,
          vendorName: "Matter",
          name: request.body.name || "",
          description: request.body.description || "",
          powerType: deviceConverter.powerType,
          properties: common.devicePropertiesToArray(properties),
          forceReconnect: false,
        }),
      );

      return response.status(200).json({ status: "ok", uuid });
    } catch (error) {
      common.conLog("Matter: Commissioning failed: " + error.message, "red");
      return response.status(400).json({ status: "error", error: error.message });
    }
  });

  httpServer.listen(appConfig.CONF_portBridgeMatter, function () {
    common.logoShow(BRIDGE_PREFIX, appConfig.CONF_portBridgeMatter);
  });

  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt        = require("mqtt");
  const mqttOptions = {
    clientId: BRIDGE_PREFIX,
    username: appConfig.CONF_brokerUsername,
    password: appConfig.CONF_brokerPassword,
    will: {
      topic: "server/bridge/status",
      payload: JSON.stringify({ bridge: BRIDGE_PREFIX, status: "offline" }),
      retain: true,
    },
  };

  if (appConfig.CONF_tlsPath) {
    try {
      const fs = require("fs");
      mqttOptions.ca = [fs.readFileSync(appConfig.CONF_tlsPath + "cert.pem")];
      mqttOptions.rejectUnauthorized = appConfig.CONF_tlsRejectUnauthorized;
    } catch (error) {
      common.conLog("MQTT: TLS certificate not found, ignoring ...", "yel");
    }
  }

  mqttClient = mqtt.connect(appConfig.CONF_brokerAddress, mqttOptions);
  const matterBridge = new MatterBridgeCore({
    mqttClient,
    converter,
    converters: convertersList,
    bridgeStatus,
    log: (message) => common.conLog(message, "red"),
  });
  mqttClient.on("connect", function () {
    mqttClient.subscribe(BRIDGE_PREFIX + "/#", function (error) {
      if (error) {
        common.conLog("Matter: MQTT subscription failed: " + error.message, "red");
        return;
      }
      mqttClient.publish("server/devices/refresh", JSON.stringify({ bridge: BRIDGE_PREFIX }));
    });
    bridgeStatus.status = "online";
    mqttClient.publish("server/bridge/status", JSON.stringify({ bridge: BRIDGE_PREFIX, status: "online" }), {
      retain: true,
    });
  });

  mqttClient.on("reconnect", function () {
    common.conLog("Matter: Reconnecting to MQTT broker ...", "yel");
  });
  mqttClient.on("offline", function () {
    bridgeStatus.status = "offline";
  });
  mqttClient.on("error", function (error) {
    common.conLog("Matter: MQTT connection error: " + error.message, "red");
  });
  mqttClient.on("message", function (topic, payload) {
    try {
      matterMessageHandle(topic.toString(), JSON.parse(payload.toString())).catch(function (error) {
        common.conLog("Matter: MQTT handler failed: " + error.message, "red");
      });
    } catch (error) {
      common.conLog("Matter: Invalid MQTT message: " + error.message, "red");
    }
  });

  /**
   * =============================================================================================
   * Matter controller and device helpers
   * ====================================
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
        Ble.get = singleton(() => new NodeJsBle({ environment }));
        return ServerNode.create({ id: "healthcore-matter" });
      })();
    }
    return matterControllerPromise;
  }

  function matterNodeRegister(node, uuid, device = {}) {
    matterBridge.registerNode(node, uuid, device);
  }

  async function matterDevicesReconnect(data) {
    bridgeStatus.devicesRegisteredAtServer.clear();
    bridgeStatus.devicesConnected.clear();
    const matterController = await getMatterController();

    for (const device of data.devices || []) {
      bridgeStatus.devicesRegisteredAtServer.set(device.uuid, device);
      const node = matterController.peers.get(device.uuid);
      if (node) {
        try {
          await matterBridge.connectNode(node, device.uuid, device);
        }
        catch (error) {
          common.conLog("Matter: Could not reconnect device " + device.uuid + ": " + error.message, "red");
        }
      }
    }
  }

  async function matterDeviceConnect(data) {
    try {
      const device = bridgeStatus.devicesRegisteredAtServer.get(data.uuid);
      const matterController = await getMatterController();
      const node = matterController.peers.get(data.uuid);
      if (!device || !node) {
        throw new Error("Matter device is not registered or paired with this bridge");
      }

      await matterBridge.connectNode(node, data.uuid, device);
      mqttClient.publish("server/devices/connect", JSON.stringify({
        uuid: data.uuid,
        bridge: BRIDGE_PREFIX,
        callID: data.callID,
        productName: matterBridge.getConverter(data.uuid).constructor.productName,
      }));
    }
    catch (error) {
      mqttClient.publish("server/devices/connect", JSON.stringify({
        status: "error",
        uuid: data.uuid,
        bridge: BRIDGE_PREFIX,
        callID: data.callID,
        error: error.message,
      }));
    }
  }

  async function matterDeviceDisconnect(data) {
    try {
      await matterBridge.disconnectNode(data.uuid);
      mqttClient.publish("server/devices/disconnect", JSON.stringify({
        uuid: data.uuid,
        bridge: BRIDGE_PREFIX,
        callID: data.callID,
      }));
    }
    catch (error) {
      mqttClient.publish("server/devices/disconnect", JSON.stringify({
        status: "error",
        uuid: data.uuid,
        bridge: BRIDGE_PREFIX,
        callID: data.callID,
        error: error.message,
      }));
    }
  }

  async function matterScan(data) {
    const matterController = await getMatterController();
    bridgeStatus.deviceScanCallID = data.callID;
    bridgeStatus.scannedDevices.clear();

    const discovery = matterController.peers.discover({
      timeout: (data.duration || appConfig.CONF_scanTimeDefaultSeconds) * 1000,
    });
    discovery.discovered.on(function (node) {
      const uuid = String(node.id);
      const deviceConverter = convertersList.findForNode(node);
      bridgeStatus.scannedDevices.set(uuid, node);
      mqttClient.publish(
        "server/devices/discover",
        JSON.stringify({
          uuid,
          bridge: BRIDGE_PREFIX,
          vendorName: "Matter",
          productName: deviceConverter.constructor.productName,
          powerType: deviceConverter.powerType,
          connectable: true,
          callID: data.callID,
        }),
      );
    });

    try {
      await discovery;
    } catch (error) {
      common.conLog("Matter: Device discovery ended: " + error.message, "yel");
    } finally {
      bridgeStatus.deviceScanCallID = undefined;
    }
  }

  /**
   * =============================================================================================
   * MQTT: incoming messages handler
   * ===============================
   */
  async function matterMessageHandle(topic, data) {
    switch (topic) {
      case "matter/devices/scan":
        await matterScan(data);
        break;
      case "matter/devices/reconnect":
        await matterDevicesReconnect(data);
        break;
      case "matter/devices/connect":
        await matterDeviceConnect(data);
        break;
      case "matter/devices/disconnect":
        await matterDeviceDisconnect(data);
        break;
      case "matter/devices/refresh":
        bridgeStatus.devicesRegisteredAtServer.clear();
        const matterController = await getMatterController();
        for (const device of data.devices || []) {
          bridgeStatus.devicesRegisteredAtServer.set(device.uuid, device);
          const node = matterController.peers.get(device.uuid);
          if (node) {
            matterNodeRegister(node, device.uuid, device);
          }
        }
        break;
      case "matter/devices/create":
        mqttClient.publish(
          "matter/devices/create/response",
          JSON.stringify({
            status: "error",
            bridge: BRIDGE_PREFIX,
            uuid: data.uuid,
            callID: data.callID,
            error: "Commission Matter devices through POST /commission with a pairingCode",
          }),
        );
        break;
      case "matter/devices/update":
        if (data.uuid && data.updates && typeof data.updates === "object") {
          const registeredDevice = bridgeStatus.devicesRegisteredAtServer.get(data.uuid);
          if (registeredDevice) {
            bridgeStatus.devicesRegisteredAtServer.set(data.uuid, { ...registeredDevice, ...data.updates });
          }
          mqttClient.publish("server/devices/update", JSON.stringify({ ...data, bridge: BRIDGE_PREFIX }));
        }
        break;
      case "matter/devices/remove":
        await matterDeviceRemove(data);
        break;
      case "matter/devices/values/set":
        await matterDevicesValuesSet(data);
        break;
      case "matter/devices/values/get":
        await matterDevicesValuesGet(data);
        break;
      case "matter/devices/list":
        mqttClient.publish(
          "server/devices/list",
          JSON.stringify({
            bridge: BRIDGE_PREFIX,
            callID: data.callID,
            devicesRegisteredAtServer: [...bridgeStatus.devicesRegisteredAtServer.values()],
            devicesConnected: [...bridgeStatus.devicesConnected.keys()].map((uuid) => ({
              uuid,
              bridge: BRIDGE_PREFIX,
            })),
          }),
        );
        break;
      default:
        common.conLog("Matter: No MQTT handler for " + topic, "yel");
    }
  }

  async function matterDevicesValuesSet(data) {
    const response = {
      status: "error",
      bridge: BRIDGE_PREFIX,
      uuid: data.uuid,
      callID: data.callID,
    };
    try {
      const [{ OnOffClient }, { LevelControlClient }, { ColorControlClient }] = await Promise.all([
        import("@matter/main/behaviors/on-off"),
        import("@matter/main/behaviors/level-control"),
        import("@matter/main/behaviors/color-control"),
      ]);
      const updates = await matterBridge.setValues(data.uuid, data.values, {
        onOff: OnOffClient,
        levelControl: LevelControlClient,
        colorControl: ColorControlClient,
      });
      response.status = "ok";
      mqttClient.publish(
        "server/devices/values/get",
        JSON.stringify({
          uuid: data.uuid,
          bridge: BRIDGE_PREFIX,
          values: updates,
        }),
      );
    } catch (error) {
      response.error = error.message;
    }
    mqttClient.publish("matter/devices/values/set/response", JSON.stringify(response));
  }

  async function matterDevicesValuesGet(data) {
    const values = await matterBridge.getValues(data.uuid);
    mqttClient.publish("server/devices/values/get", JSON.stringify({
      uuid: data.uuid,
      bridge: BRIDGE_PREFIX,
      callID: data.callID,
      values,
    }));
  }

  async function matterDeviceRemove(data) {
    const response = { status: "error", uuid: data.uuid, bridge: BRIDGE_PREFIX, callID: data.callID };
    try {
      await matterBridge.removeNode(data.uuid, { force: data.force === true });
      response.status = "ok";
      if (data.force === true) {
        response.warning = "The Matter device may need a factory reset before it can be paired again";
      }
      mqttClient.publish("server/devices/remove", JSON.stringify({ ...data, bridge: BRIDGE_PREFIX }));
    } catch (error) {
      response.error = error.message;
      common.conLog("Matter: Removal failed for " + data.uuid + ": " + error.message, "red");
    }
    mqttClient.publish("matter/devices/remove/response", JSON.stringify(response));
  }

  /**
   * =============================================================================================
   * Graceful shutdown
   * =================
   */
  process.on("SIGINT", async function () {
    common.conLog("Matter: Graceful shutdown initiated ...", "yel");
    bridgeStatus.status = "offline";
    mqttClient.publish("server/bridge/status", JSON.stringify({ bridge: BRIDGE_PREFIX, status: "offline" }), {
      retain: true,
    });
    if (matterControllerPromise) {
      const controller = await matterControllerPromise;
      await controller.close();
    }
    mqttClient.end(false, {}, function () {
      httpServer.close(() => process.exit(0));
    });
  });
}

if (require.main === module) {
  process.on("unhandledRejection", function (reason) {
    common.conLog("Matter Bridge: Unhandled promise rejection: " + reason, "red");
  });

  process.on("uncaughtException", function (error) {
    common.conLog("Matter Bridge: Uncaught exception: " + error.message, "red");
  });

  startBridgeAndServer();
}

module.exports = { MatterBridgeCore };
