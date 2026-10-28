/**
 * =============================================================================================
 * Matter - Bridge core: handling of Matter nodes
 * ==============================================
 */

const BRIDGE_PREFIX = "matter";

const NODE_CONNECTION_CONNECTED = 0; // Node connection state indicating the node is connected

/**
 * Core of the Matter bridge. Handles registration, connection, values and removal of Matter nodes
 * independently of the HTTP server and the MQTT client, so it can be tested separately.
 * @class
 * @property {Object} mqttClient - The MQTT client used for publishing messages.
 * @property {Object} converter - The default converter, used if no specific converter is known for a device.
 * @property {Object} converters - The list of converters (used to find the converter for a node).
 * @property {Object} bridgeStatus - The status object of the bridge (devices, cached values, ...).
 * @property {Function} log - Function for logging error messages.
 */
class MatterBridgeCore {
  constructor({ mqttClient, converter, converters, bridgeStatus, log }) {
    this.mqttClient       = mqttClient;
    this.converter        = converter;
    this.converters       = converters;
    this.bridgeStatus     = bridgeStatus;
    this.log              = log;
    this.observedNodes    = new WeakSet(); // nodes which already have event listeners attached
    this.deviceConverters = new Map();     // Map of UUID -> converter of the device
    this.pendingEnables   = new WeakMap(); // nodes which are currently being enabled
  }

  /**
   * Gets the converter for a node.
   * @param {Object} node - The Matter node.
   * @returns {Object} The matching converter (or the default converter).
   */
  converterForNode(node) {
    return this.converters ? this.converters.findForNode(node) : this.converter;
  }

  /**
   * Gets the converter of a registered device.
   * @param {string} uuid - The device UUID.
   * @returns {Object} The converter of the device (or the default converter).
   */
  getConverter(uuid) {
    return this.deviceConverters.get(uuid) || this.converter;
  }

  /**
   * Enables a node (if not already connected). Parallel calls share the same promise.
   * @param {Object} node - The Matter node.
   * @returns {Promise<void>} A promise that resolves when the node is enabled.
   */
  ensureNodeEnabled(node) {
    if (node.lifecycle?.isConnected || typeof node.enable !== "function") {
      return Promise.resolve();
    }

    const pendingEnable = this.pendingEnables.get(node); // Check if the node is already being enabled
    if (pendingEnable) {
      return pendingEnable;
    }

    const enablePromise = Promise.resolve().then(() => node.enable()).finally(() => this.pendingEnables.delete(node)); // Enable the node and remove it from pendingEnables once done
    this.pendingEnables.set(node, enablePromise);
    return enablePromise;
  }

  /**
   * Commissions a new node and registers it.
   * @param {Object} controller - The Matter controller.
   * @param {Object} options - The commissioning options (id, pairingCode, ...).
   * @param {Object|Function} metadataForNode - The metadata of the device or a function which returns it.
   * @param {Object} registrationOptions - The options for registering the node.
   * @returns {Promise<Object>} A promise that resolves to the commissioned node.
   */
  async commission(controller, options, metadataForNode, registrationOptions = {}) {
    const node      = await controller.peers.commission(options);
    const converter = this.converterForNode(node);
    const metadata  = typeof metadataForNode === "function" ? metadataForNode(node, converter) : metadataForNode; // Get metadata for the node, either from the function or directly provided object
    this.registerNode(node, options.id, metadata, registrationOptions, converter);
    return node;
  }

  /**
   * Registers a node: adds it to the connected and registered devices and listens for attribute and connection changes.
   * @param {Object} node - The Matter node.
   * @param {string} uuid - The device UUID.
   * @param {Object} metadata - The metadata of the device.
   * @param {Object} options - The options (reportInitialStatus, enableNode).
   * @param {Object} converter - The converter of the device.
   */
  registerNode(node, uuid, metadata = {}, { reportInitialStatus = true, enableNode = true } = {}, converter = this.converterForNode(node)) {
    this.deviceConverters.set(uuid, converter);
    this.bridgeStatus.devicesConnected.set(uuid, node);
    this.bridgeStatus.devicesRegisteredAtServer.set(uuid, { uuid, bridge: BRIDGE_PREFIX, ...metadata });

    const core = this; // "this" is not available inside the function callbacks below

    if (!this.observedNodes.has(node)) { // Only observe the node if it hasn't been observed before
      this.observedNodes.add(node);
      this.observeAttributes(node, uuid, converter);

      node.lifecycle?.connectionStateChanged.on(function (state) {
        core.publishDeviceStatus(uuid, state === NODE_CONNECTION_CONNECTED ? "online" : "offline");
      });
    }

    if (enableNode && !node.lifecycle?.isConnected) { // If the node should be enabled but is not currently connected, attempt to enable it
      this.ensureNodeEnabled(node).catch(function (error) {
        core.log("Matter: Could not re-enable device " + uuid + ": " + error.message);
      });
    }
    else if (reportInitialStatus && node.lifecycle?.isConnected) {
      this.publishDeviceStatus(uuid, "online"); // If the node is already connected and initial status should be reported, publish it as online
    }
  }

  /**
   * Listens for changes of all attributes the converter of the device knows.
   * matter.js has no generic "attribute changed" event for a node, so every attribute is observed on its own
   * (event "<attribute>$Changed" of the cluster behavior of each endpoint).
   * @param {Object} node - The Matter node.
   * @param {string} uuid - The device UUID.
   * @param {Object} converter - The converter of the device.
   */
  observeAttributes(node, uuid, converter) {
    const core = this; // "this" is not available inside the function callbacks below

    for (const endpoint of node.endpoints || []) {
      for (const [clusterId, attributeNames] of converter.readableAttributes()) {
        const behavior = endpoint.behaviors.forCluster(clusterId); // Get the behavior object for the cluster ID on this endpoint
        if (!behavior) {
          continue;
        }

        const events = endpoint.eventsOf(behavior);
        for (const attributeName of attributeNames) {
          const event = events[attributeName + "$Changed"];
          if (!event) {
            continue;
          }

          event.on(function (value) {
            core.publishAttribute(uuid, converter, endpoint.number, clusterId, attributeName, value);
          });
        }
      }
    }
  }

  /**
   * Converts a changed attribute to a property value, caches it and publishes it to the MQTT broker.
   * @param {string} uuid - The device UUID.
   * @param {Object} converter - The converter of the device.
   * @param {number} endpointId - The endpoint of the attribute.
   * @param {number} clusterId - The Matter cluster ID of the attribute.
   * @param {string} attributeName - The name of the attribute.
   * @param {*} value - The new Matter value of the attribute.
   */
  publishAttribute(uuid, converter, endpointId, clusterId, attributeName, value) {
    const property = converter.getPropertyByAttribute(clusterId, attributeName); // Get the property corresponding to the cluster ID and attribute name
    if (!property) {
      return;
    }

    const converted = converter.get(property, value, { endpointId });
    if (converted === undefined) {
      return;
    }

    const propertyName = endpointId > 1 ? property.name + "_endpoint_" + endpointId : property.name; // Append endpoint ID to property name for secondary endpoints
    const values       = this.bridgeStatus.lastKnownValues.get(uuid) || {}; // cache last known values for this device
    values[propertyName] = {
      value:          converted.value,
      valueAsNumeric: converted.valueAsNumeric,
      valueType:      converted.valueType,
      endpointId:     endpointId,
    };
    this.bridgeStatus.lastKnownValues.set(uuid, values);

    let message      = {};
    message.uuid     = uuid;
    message.bridge   = BRIDGE_PREFIX;
    message.values   = { [propertyName]: values[propertyName] };
    this.mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
  }

  /**
   * Registers a node and connects to it.
   * @param {Object} node - The Matter node.
   * @param {string} uuid - The device UUID.
   * @param {Object} metadata - The metadata of the device.
   */
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

  /**
   * Disconnects a connected node.
   * @param {string} uuid - The device UUID.
   */
  async disconnectNode(uuid) {
    const node = this.bridgeStatus.devicesConnected.get(uuid);
    if (!node) {
      throw new Error("Matter device is not connected");
    }

    await node.disable();
    this.bridgeStatus.devicesConnected.delete(uuid);
  }

  /**
   * Sets values of a connected node.
   * @param {string} uuid - The device UUID.
   * @param {Object} requestedValues - The requested values (property name -> value).
   * @param {Function} clientGet - Async function which returns the Matter client for a cluster name (e.g. "onOff"), as given by the converter in `client`.
   * @returns {Promise<Object>} A promise that resolves to the updated values.
   */
  async setValues(uuid, requestedValues, clientGet) {
    const node = this.bridgeStatus.devicesConnected.get(uuid);
    if (!node || !requestedValues || typeof requestedValues !== "object" || Array.isArray(requestedValues)) { // Ensure the node is connected and requested values are provided as an object
      throw new Error("Matter device is not connected or no values were provided");
    }

    const converter = this.getConverter(uuid);
    const commands  = Object.entries(requestedValues).map(([property, requestedValue]) => {
      const match = /^(.*?)(?:_endpoint_(\d+))?$/.exec(property); // Extract the base property name and optional endpoint ID from the property string
      if (!match) {
        throw new Error("Matter property is not writable: " + property);
      }
      
      const value              = requestedValue && typeof requestedValue === "object" ? requestedValue.value : requestedValue; // Extract the actual value from the requested value object if present
      const propertyName       = match[1]; // Base property name without endpoint suffix
      const endpointId         = Number(match[2] || requestedValue?.endpointId || 1); // Determine the endpoint ID, defaulting to 1 if not specified
      const propertyMetadata   = converter.getPropertyByName(propertyName); // Get the property metadata for the base property name
      if (!propertyMetadata) {
        throw new Error("Matter property is not writable: " + property);
      }

      const writeCommand = converter.set(propertyMetadata, value);
      if (!writeCommand) {
        throw new Error("Matter property is not writable: " + property);
      }

      const endpoint = node.parts.get(endpointId); // Get the endpoint object for the specified endpoint ID
      if (!endpoint) {
        throw new Error("Matter endpoint not found: " + endpointId);
      }

      return { property, propertyMetadata, endpoint, endpointId, writeCommand };
    });

    for (const command of commands) { // resolve all clients BEFORE sending the first command, so an unavailable client does not leave the device half-changed
      command.client = await clientGet(command.writeCommand.client);
      if (!command.client) {
        throw new Error("Matter client is unavailable: " + command.writeCommand.client);
      }
    }

    const updates = {};
    for (const { property, propertyMetadata, endpoint, endpointId, writeCommand, client } of commands) {
      const command = endpoint.commandsOf(client)[writeCommand.commandName];
      if (typeof command !== "function") {
        throw new Error("Matter command is not supported: " + writeCommand.commandName);
      }

      await command(...writeCommand.args); // Execute the Matter command with the provided arguments

      const converted = converter.get(propertyMetadata, writeCommand.attributeValue, { endpointId }); // Convert the written value back to the format used by the bridge for consistency
      if (!converted) {
        throw new Error("Matter property cannot be read after write: " + property);
      }
      updates[property] = {
        value:          converted.value,
        valueAsNumeric: converted.valueAsNumeric,
        valueType:      converted.valueType,
        endpointId:     endpointId,
      };
    }

    const values = this.bridgeStatus.lastKnownValues.get(uuid) || {};
    Object.assign(values, updates);
    this.bridgeStatus.lastKnownValues.set(uuid, values); // update last known values cache
    return updates;
  }

  /**
   * Gets the values of a node. If the node is not connected, the last known values are returned.
   * @param {string} uuid - The device UUID.
   * @returns {Promise<Object>} A promise that resolves to the values (property name -> { value, valueAsNumeric, valueType, endpointId }).
   */
  async getValues(uuid) {
    const node = this.bridgeStatus.devicesConnected.get(uuid);
    if (!node) {
      return this.bridgeStatus.lastKnownValues.get(uuid) || {};
    }

    const converter = this.getConverter(uuid);
    const values    = this.bridgeStatus.lastKnownValues.get(uuid) || {};

    for (const endpoint of node.endpoints) {
      for (const [clusterId, attributeNames] of converter.readableAttributes()) { // read all attributes the converter of this device knows
        const behavior = endpoint.behaviors.forCluster(clusterId); // Get the behavior object for the specified cluster ID on this endpoint
        if (!behavior) {
          continue;
        }

        const supportedAttributes = endpoint.behaviors.elementsOf(behavior).attributes; // Get the set of supported attributes for this behavior on the endpoint
        for (const attributeName of attributeNames) {
          if (!supportedAttributes.has(attributeName)) {
            continue;
          }

          try {
            const state    = await endpoint.getStateOf(behavior, [attributeName]);
            const property = converter.getPropertyByAttribute(clusterId, attributeName);
            if (!property) {
              continue;
            }

            const converted = converter.get(property, state[attributeName], { endpointId: endpoint.number });
            if (converted) {
              const propertyName = endpoint.number > 1 ? property.name + "_endpoint_" + endpoint.number : property.name;
              values[propertyName] = {
                value:          converted.value,
                valueAsNumeric: converted.valueAsNumeric,
                valueType:      converted.valueType,
                endpointId:     endpoint.number,
              };
            }
          }
          catch (error) {
            this.log("Matter: Could not read " + attributeName + " from " + uuid + ": " + error.message);
          }
        }
      }
    }

    this.bridgeStatus.lastKnownValues.set(uuid, values); // update last known values cache
    return values;
  }

  /**
   * Removes a node (decommissions it, unless forced) and all information about it.
   * @param {string} uuid - The device UUID.
   * @param {Object} options - The options (force: only delete the node without decommissioning it).
   */
  async removeNode(uuid, { force = false } = {}) {
    const node = this.bridgeStatus.devicesConnected.get(uuid);
    if (node) {
      if (force) {
        await node.delete();
      }
      else {
        await node.decommission();
        await node.delete();
      }
    }

    this.bridgeStatus.devicesConnected.delete(uuid);
    this.deviceConverters.delete(uuid);
    this.bridgeStatus.devicesRegisteredAtServer.delete(uuid);
    this.bridgeStatus.lastKnownValues.delete(uuid);
  }

  /**
   * Publishes the status of a device to the MQTT broker (only for devices registered at the server).
   * @param {string} uuid - The device UUID.
   * @param {string} status - The status of the device ("online" or "offline").
   */
  publishDeviceStatus(uuid, status) {
    if (!this.bridgeStatus.devicesRegisteredAtServer.has(uuid)) {
      return;
    }

    let message    = {};
    message.uuid   = uuid;
    message.bridge = BRIDGE_PREFIX;
    message.status = status;
    this.mqttClient.publish("server/devices/status", JSON.stringify(message)); // ... publish to MQTT broker
  }
}

/**
 * Gets the module path and export name of the Matter client behavior for a cluster name, following the naming of matter.js
 * (cluster "levelControl" -> "@matter/main/behaviors/level-control", export "LevelControlClient").
 * @param {string} clusterName - The cluster name in camelCase (e.g. "onOff").
 * @returns {{path: string, exportName: string}|undefined} The module path and export name, or `undefined` if the cluster name is invalid.
 */
function matterClientModule(clusterName) {
  if (typeof clusterName !== "string" || !/^[a-z][a-zA-Z]*$/.test(clusterName)) { // only plain camelCase names, so no arbitrary module can be imported
    return undefined;
  }

  return {
    path:       "@matter/main/behaviors/" + clusterName.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()),
    exportName: clusterName.charAt(0).toUpperCase() + clusterName.slice(1) + "Client",
  };
}

module.exports = { MatterBridgeCore, matterClientModule };
