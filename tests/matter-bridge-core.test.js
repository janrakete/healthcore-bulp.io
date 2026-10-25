const { MatterBridgeCore } = require("../bridge-matter/app");
const { ConverterStandard } = require("../bridge-matter/converters/ConverterStandard");
const { ConverterExampleColorLamp } = require("../bridge-matter/converters/ConverterExampleColorLamp");
const { Converters } = require("../bridge-matter/converters");

function createFixture({ connected = true, converter = new ConverterStandard(), converters } = {}) {
  const mqttClient = { publish: jest.fn() };
  const bridgeStatus = {
    devicesConnected: new Map(),
    devicesRegisteredAtServer: new Map(),
    scannedDevices: new Map(),
    lastKnownValues: new Map()
  };
  const listeners = { attributes: undefined, connection: undefined };
  const node = {
    events: { attributeChanged: { on: handler => { listeners.attributes = handler; } } },
    lifecycle: {
      isConnected: connected,
      connectionStateChanged: { on: handler => { listeners.connection = handler; } }
    },
    enable: jest.fn().mockResolvedValue(undefined),
    disable: jest.fn().mockResolvedValue(undefined),
    decommission: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    parts: { get: jest.fn() }
  };
  const core = new MatterBridgeCore({
    mqttClient,
    converter,
    converters,
    bridgeStatus,
    log: jest.fn()
  });
  return { core, bridgeStatus, mqttClient, node, listeners };
}

describe("MatterBridgeCore", () => {
  test("registers a commissioned peer and forwards endpoint-specific values", async () => {
    const { core, bridgeStatus, mqttClient, node, listeners } = createFixture();
    const controller = { peers: { commission: jest.fn().mockResolvedValue(node) } };

    await core.commission(controller, { id: "device-1", pairingCode: "12345678901" }, { productName: "Matter device" });
    listeners.attributes({
      path: { clusterId: 1026, attributeName: "measuredValue", endpointId: 2 },
      value: 2345
    });

    expect(controller.peers.commission).toHaveBeenCalledWith({ id: "device-1", pairingCode: "12345678901" });
    expect(bridgeStatus.devicesConnected.get("device-1")).toBe(node);
    expect(mqttClient.publish).toHaveBeenCalledWith("server/devices/values/get", expect.stringContaining("temperature_endpoint_2"));
  });

  test("does not register a peer when commissioning fails", async () => {
    const { core, bridgeStatus } = createFixture();
    const controller = { peers: { commission: jest.fn().mockRejectedValue(new Error("pairing failed")) } };

    await expect(core.commission(controller, { id: "device-1" }, {})).rejects.toThrow("pairing failed");
    expect(bridgeStatus.devicesConnected.size).toBe(0);
  });

  test("selects the example lamp converter when commissioning a matching Matter node", async () => {
    const { core, bridgeStatus, node } = createFixture({ converters: new Converters() });
    const colorAttributes = new Set(["currentHue", "currentSaturation", "colorTemperatureMireds"]);
    const colorCommands = new Set(["moveToHue", "moveToSaturation"]);
    node.endpoints = [{
      behaviors: {
        forCluster: clusterId => [6, 8, 768].includes(clusterId) ? {} : undefined,
        elementsOf: () => ({ attributes: colorAttributes, commands: colorCommands })
      }
    }];
    const controller = { peers: { commission: jest.fn().mockResolvedValue(node) } };

    await core.commission(controller, { id: "lamp-1" }, (commissionedNode, converter) => ({
      productName: converter.constructor.productName
    }));

    expect(core.getConverter("lamp-1")).toBeInstanceOf(ConverterExampleColorLamp);
    expect(bridgeStatus.devicesRegisteredAtServer.get("lamp-1").productName).toBe("Matter example color lamp");
  });

  test("re-enables restored peers and publishes connection transitions", async () => {
    const { core, bridgeStatus, mqttClient, node, listeners } = createFixture({ connected: false });

    core.registerNode(node, "device-1", {});
    await Promise.resolve();
    listeners.connection(0);
    listeners.connection(1);

    expect(node.enable).toHaveBeenCalledTimes(1);
    expect(mqttClient.publish).toHaveBeenCalledWith("server/devices/status", expect.stringContaining('"status":"online"'));
    expect(mqttClient.publish).toHaveBeenCalledWith("server/devices/status", expect.stringContaining('"status":"offline"'));
    expect(bridgeStatus.devicesRegisteredAtServer.has("device-1")).toBe(true);
  });

  test("connects and disconnects a Matter peer without removing its registration", async () => {
    const { core, bridgeStatus, node } = createFixture({ connected: false });
    core.registerNode(node, "device-1", {});

    await core.connectNode(node, "device-1", {});
    await core.disconnectNode("device-1");

    expect(node.enable).toHaveBeenCalledTimes(1);
    expect(node.disable).toHaveBeenCalledTimes(1);
    expect(bridgeStatus.devicesConnected.has("device-1")).toBe(false);
    expect(bridgeStatus.devicesRegisteredAtServer.has("device-1")).toBe(true);
  });

  test("does not leave a peer connected when enabling it fails", async () => {
    const { core, bridgeStatus, node } = createFixture({ connected: false });
    node.enable.mockRejectedValue(new Error("device unreachable"));

    await expect(core.connectNode(node, "device-1", {})).rejects.toThrow("device unreachable");

    expect(bridgeStatus.devicesConnected.has("device-1")).toBe(false);
    expect(bridgeStatus.devicesRegisteredAtServer.has("device-1")).toBe(true);
  });

  test("keeps peer state when decommissioning fails", async () => {
    const { core, bridgeStatus, node } = createFixture();
    node.decommission.mockRejectedValue(new Error("device unreachable"));
    core.registerNode(node, "device-1");

    await expect(core.removeNode("device-1")).rejects.toThrow("device unreachable");
    expect(node.delete).not.toHaveBeenCalled();
    expect(bridgeStatus.devicesConnected.has("device-1")).toBe(true);
  });

  test("force-removes a peer without decommissioning", async () => {
    const { core, bridgeStatus, node } = createFixture();
    core.registerNode(node, "device-1");

    await core.removeNode("device-1", { force: true });

    expect(node.decommission).not.toHaveBeenCalled();
    expect(node.delete).toHaveBeenCalledTimes(1);
    expect(bridgeStatus.devicesConnected.has("device-1")).toBe(false);
  });

  test("writes on/off to the requested Matter endpoint", async () => {
    const { core, bridgeStatus, node } = createFixture();
    const turnOff = jest.fn().mockResolvedValue(undefined);
    const endpoint = { commandsOf: jest.fn(() => ({ off: turnOff })) };
    const onOffClient = { id: "on-off" };
    node.parts.get.mockReturnValue(endpoint);
    core.registerNode(node, "device-1");

    const updates = await core.setValues("device-1", { power_endpoint_2: "off" }, { onOff: onOffClient });

    expect(node.parts.get).toHaveBeenCalledWith(2);
    expect(endpoint.commandsOf).toHaveBeenCalledWith(onOffClient);
    expect(turnOff).toHaveBeenCalledTimes(1);
    expect(updates.power_endpoint_2).toMatchObject({ value: "off", endpointId: 2 });
    expect(bridgeStatus.lastKnownValues.get("device-1").power_endpoint_2.value).toBe("off");
  });

  test("sets lamp brightness, hue, and saturation with Matter cluster commands", async () => {
    const { core, node } = createFixture({ converter: new ConverterExampleColorLamp() });
    const setLevel = jest.fn().mockResolvedValue(undefined);
    const setHue = jest.fn().mockResolvedValue(undefined);
    const setSaturation = jest.fn().mockResolvedValue(undefined);
    const levelControlClient = { id: "level-control" };
    const colorControlClient = { id: "color-control" };
    const endpoint = {
      commandsOf: jest.fn(client => client === levelControlClient
        ? { moveToLevelWithOnOff: setLevel }
        : { moveToHue: setHue, moveToSaturation: setSaturation })
    };
    node.parts.get.mockReturnValue(endpoint);
    core.registerNode(node, "lamp-1");

    const updates = await core.setValues("lamp-1", { brightness: 50, hue: 180, saturation: 75 }, {
      levelControl: levelControlClient,
      colorControl: colorControlClient
    });

    expect(setLevel).toHaveBeenCalledWith({ level: 127, transitionTime: 0, optionsMask: 0, optionsOverride: 0 });
    expect(setHue).toHaveBeenCalledWith({ hue: 127, direction: 0, transitionTime: 0, optionsMask: 0, optionsOverride: 0 });
    expect(setSaturation).toHaveBeenCalledWith({ saturation: 191, transitionTime: 0, optionsMask: 0, optionsOverride: 0 });
    expect(updates).toMatchObject({
      brightness: { value: 50, valueAsNumeric: 50 },
      hue: { value: 180, valueAsNumeric: 180 },
      saturation: { value: 75.2, valueAsNumeric: 75.2 }
    });
  });

  test("reads current Matter lamp values from supported endpoint attributes", async () => {
    const { core, bridgeStatus, node } = createFixture({ converter: new ConverterExampleColorLamp() });
    const clusterValues = {
      6: { onOff: true },
      8: { currentLevel: 127 },
      768: { currentHue: 127, currentSaturation: 254, colorTemperatureMireds: 250 }
    };
    const endpoint = {
      number: 1,
      behaviors: {
        forCluster: clusterId => clusterValues[clusterId] ? { clusterId } : undefined,
        elementsOf: behavior => ({ attributes: new Set(Object.keys(clusterValues[behavior.clusterId])) })
      },
      getStateOf: jest.fn(async (behavior, attributes) => ({
        [attributes[0]]: clusterValues[behavior.clusterId][attributes[0]]
      }))
    };
    node.endpoints = [endpoint];
    core.registerNode(node, "lamp-1");

    const values = await core.getValues("lamp-1");

    expect(endpoint.getStateOf).toHaveBeenCalledTimes(5);
    expect(values).toMatchObject({
      power: { value: "on" },
      brightness: { value: 50 },
      hue: { value: 180 },
      saturation: { value: 100 },
      colorTemperature: { value: 4000 }
    });
    expect(bridgeStatus.lastKnownValues.get("lamp-1")).toBe(values);
  });
});