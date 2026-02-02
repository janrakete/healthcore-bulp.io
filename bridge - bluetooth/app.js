/**
 * =============================================================================================
 * Bluetooth - Bridge: Bluetooth <-> MQTT
 * ======================================
 */

const appConfig       = require("../config");
const common          = require("../common");

const BRIDGE_PREFIX   = "bluetooth"; 

/**
 * Load  converters for devices
 */
const { Converters } = require("./converters.js");
const convertersList = new Converters(); // create new object for converters

/**
 * Starts the Bluetooth bridge and MQTT server.
 * Initializes the HTTP server, MQTT client, Bluetooth adapter listeners, 
 * and defines all MQTT message handlers.
 * Automatically invoked on script startup.
 * @async
 * @function startBridgeAndServer
 * @description This function sets up the Bluetooth bridge to listen for device discovery, connection, and disconnection events.
 */
async function startBridgeAndServer() {
  /**
   * =============================================================================================
   * Server
   * ======
  */
  const express = require("express");
  const app     = express();

  const server = require("http").createServer(app);
  server.listen(appConfig.CONF_portBridgeBluetooth, function () {
    common.logoShow(BRIDGE_PREFIX, appConfig.CONF_portBridgeBluetooth); // show logo
  });

  /**
   * Server info
   * @description Endpoint to retrieve basic information about the bridge.
   */
  app.get("/info", async function (request, response) {
    const data  = {};
    data.status = bridgeStatus.status;
    data.bridge = BRIDGE_PREFIX;
    data.port   = appConfig.CONF_portBridgeBluetooth;
    common.conLog("Bridge info send!", "gre");
    common.conLog("Bridge route 'Info' HTTP response: " + JSON.stringify(data), "std", false);
    return response.status(200).json(data);
  });
  
  /**
   * =============================================================================================
   * MQTT client - subscribe to specific topics
   * ==========================================
   */
  const mqtt       = require("mqtt");
  const mqttClient = mqtt.connect(appConfig.CONF_brokerAddress, { clientId: BRIDGE_PREFIX }); // connect to broker ...

  /**
   * Connects the MQTT client and subscribes to Bluetooth-related topics.
   * @function
   * @description This function is called when the MQTT client successfully connects to the broker.
   */
  function mqttConnect() {
    mqttClient.subscribe(BRIDGE_PREFIX + "/#", function (error, granted) { // ... and subscribe to Bluetooth topics
      common.conLog("MQTT: Subscribed to Bluetooth topics from broker", "yel"); 
      if (error) {
        common.conLog("MQTT: Error while subscribing:", "red");
        common.conLog(error, "std", false);
      }
    });
  }
  mqttClient.on("connect", mqttConnect);

  /**
   * =============================================================================================
   * Helper functions
   * ================
   */

  /**
   * Searches for a device by its ID within a given array of devices.
   * @param {string} deviceID - The device ID to search for.
   * @param {Object[]} devices - The array of known device objects.
   * @returns {Object|undefined} The matching device object, or `undefined` if not found.
   * @description This function iterates through the array of devices and returns the first device that matches the provided ID. If no matching device is found, it returns `undefined`.
   */
  function deviceSearchInArrayByID(deviceID, devices) {
    const deviceFound = devices.find(device => device.deviceID === deviceID);
    return deviceFound || undefined;
  }

  /**
   * Searches for a device by its productName within a given array of devices.
   * @param {string} productName - The device product name to search for.
   * @param {Object[]} devices - The array of known device objects.
   * @returns {Object|undefined} The matching device object, or `undefined` if not found.
   * @description This function iterates through the array of devices and returns the first device that matches the provided product name. If no matching device is found, it returns `undefined`.
   */
  function deviceSearchInArrayByProductName(productName, devices) {
    const deviceFound = devices.find(device => device.productName === productName);
    return deviceFound || undefined;
  }

  /**
   * Connects to a Bluetooth device, discovers its services and characteristics, subscribes to notifications, and updates bridge status.
   * @param {Object} device - Device metadata (deviceID, name, etc.).
   * @param {Object} deviceRaw - The raw Bluetooth device object.
   * @description This function attempts to connect to a Bluetooth device, discovers its services and characteristics, and subscribes to notifications for properties defined in the device converter. It also handles disconnection events and publishes connection status to the MQTT broker.
   */
  function deviceConnectAndDiscover(device, deviceRaw, callID = "", addDeviceToServer = false) {
    delete device.deviceRaw; // remove deviceRaw from device, because it cannot be stringified

    device.callID = callID; // add callID to device if provided

    if (device.connectable === true) {
      deviceRaw.connect(function (error) { 
        if (error) {    
          common.conLog("Bluetooth: Error while connecting to device:", "red");
          common.conLog(error, "std", false);
        }
        else {
          deviceRaw.once("disconnect", function (error) { // if device is connect, set event handler for disconnecting
            common.conLog("Bluetooth: Device disconnected: " + device.deviceID + " (" + device.productName + ")", "red");
            bridgeStatus.devicesConnected = bridgeStatus.devicesConnected.filter(deviceConnected => deviceConnected.deviceID !== device.deviceID); // remove device from array of connected devices

            delete device.deviceRaw; // remove device object from device, because stringify will not work with object
            delete device.deviceConverter; // remove device converter from device, because stringify will not work with object
            mqttClient.publish("server/devices/disconnect", JSON.stringify(device)); // publish disconnected device to MQTT broker
          });

          deviceRaw.discoverAllServicesAndCharacteristics(function (error, services) { // discover services and characteristics of device
            if (error || services.length === 0) {
              common.conLog("Bluetooth: Ghost connection? - no services found", "yel");
              deviceRaw.disconnect();
            }
            else {
              device.deviceConverter = convertersList.find(device.productName); // get converter for device from list of converters

              if (device.deviceConverter === undefined) { 
                common.conLog("Bluetooth: No converter found for " + device.productName, "red");
              }
              else
              {
                for (const service of services) { // for each service of device
                  common.conLog("Bluetooth: " + device.deviceID + " - Service found: " + service.uuid, "yel");
                  for (const characteristic of service.characteristics) { // for each characteristic of service
                    common.conLog("Bluetooth: " + device.deviceID + " - Characteristic found: " + characteristic.uuid, "yel");
                    const property = device.deviceConverter.getPropertyByUUID(characteristic.uuid); // get property by UUID from converter
                    if (property !== undefined) {
                      if ((property.notify === true) && characteristic.properties.includes("notify")) { // if characteristic has notify value, subscribe to it
                        characteristic.subscribe(function (error) { 
                          if (error) {
                            common.conLog("Bluetooth: Error while subscribing to characteristic:", "red");
                            common.conLog(error, "std", false);
                          }
                          else {
                            common.conLog("Bluetooth: Subscribed to characteristic " + characteristic.uuid, "gre");
                            characteristic.on("data", function (value) { // if value is received from device, log it
                              let message                     = {};
                              message.deviceID                = device.deviceID;
                              message.values                  = {}; // create empty array for properties
                              message.bridge                  = BRIDGE_PREFIX;

                              if (property.valueType === "Subproperties") { // if property has multiple subproperties
                                const subproperty = device.deviceConverter.getSubproperty(property, value);
                                if (subproperty !== undefined) { // if subproperty is found in converter
                                  message.values[subproperty.name] = { value: subproperty.value, valueAsNumeric: subproperty.valueAsNumeric };
                                }
                              }
                              else {
                                message.values[property.name]   = device.deviceConverter.get(property, value);
                              }

                              mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker    
                            }); 
                          }
                        });
                      }
                    }
                    else { // if characteristic is not in converter propery list
                      common.conLog("Bluetooth: Characteristic " + characteristic.uuid + " not found in converter list", "red");
                    }
                  }
                }
              }

              common.conLog("Bluetooth: Device connected: " + device.deviceID + " (" + device.productName + ")", "gre");
              mqttClient.publish("server/devices/connect", JSON.stringify(device)); // publish connected device to MQTT broker

              if (addDeviceToServer === true) { // if device should be added to server (only if it was connected via mqtt message with addDeviceToServer flag)
                  let message         = {};
                  message.deviceID    = device.deviceID;
                  message.bridge      = device.bridge || "";
                  message.powerType   = device.deviceConverter.powerType || "";
                  message.productName = device.productName || "";
                  message.properties  = common.devicePropertiesToArray(device.deviceConverter.properties) || "";
                  message.name        = device.name || "";
                  message.description = device.description || "";

                  message.forceReconnect = true; // because this is Bluetooth, reconnect devices after creation

                  mqttClient.publish("server/devices/create", JSON.stringify(message)); // ... publish to MQTT broker
                  common.conLog("Try to add device " + message.deviceID + " to server", "yel");
              }                 

              device.deviceRaw = deviceRaw; // save device object for later use
              bridgeStatus.devicesConnected.push(device); // add device to array of connected devices
            }
          });
        }
      });
    }
    else {
      common.conLog("Bluetooth: Device " + device.deviceID + " (" + device.productName + ") is not connectable", "red"); 
    }
  }

  /**
   * Creates a fingerprint object from the Bluetooth device advertisement.
   * @param {Object} deviceRaw - The Bluetooth device object.
   * @returns {Object} - The fingerprint object containing relevant advertisement data.
   * @description This function extracts the local name, service UUIDs, manufacturer data, and TX power level from the Bluetooth peripheral advertisement and returns them in a structured object.
   */
  function fingerprintCreate(deviceRaw) {
    const advertisement = deviceRaw.advertisement;

    let data              = {};
    data.localName        = advertisement.localName || "";
    data.serviceUuids     = (advertisement.serviceUuids || []).sort();
    data.manufacturerData = advertisement.manufacturerData?.toString("hex") || "";
    data.txPowerLevel     = advertisement.txPowerLevel ?? null;

    let fingerprint = JSON.stringify(data);

    fingerprint = common.createHashFromString(fingerprint, "sha256", 64); // create hash from fingerprint and cut it to 64 characters
    return fingerprint;
  }


  /**
   * Class representing the status of the Bluetooth bridge. Contains arrays for connected devices and registered devices at the server.
   * @class
   * @property {Object[]} devicesConnected - Array of currently connected Bluetooth devices.
   * @property {Object[]} devicesRegisteredAtServer - Array of devices registered at the server
   * @property {Object[]} devicesFoundViaScan - Array of devices found via scanning.
   * @property {boolean} devicesRegisteredReconnect - Flag indicating if the bridge is set to connect to registered devices.
   * @property {number|null} deviceScanCallID - ID of call if scanning is initiated.
   * @property {string} status - Status of the bridge ("online" or "offline").
   * @description This class is used to manage the status of the Bluetooth bridge, including connected devices and those registered at the server.
   */
  class BridgeStatusClass {
    constructor() {
      this.devicesConnected              = []; // Array of currently connected Bluetooth devices
      this.devicesRegisteredAtServer     = []; // Array of devices registered at the server
      this.devicesFoundViaScan           = []; // Array of devices found via scanning
      this.devicesRegisteredReconnect    = false; // Flag indicating if the bridge is set to reconnect to registered devices
      this.deviceScanCallID              = undefined; // ID of call if scanning is initiated
      this.status                        = "offline"; // Status of the bridge
    }
  }
  const bridgeStatus = new BridgeStatusClass(); // create new object for bridge status

  /**
   * =============================================================================================
   * Events at Bluetooth adapter
   * ===========================
   */
  const bluetooth = require("@abandonware/noble");

  /**
   * Initializes the Bluetooth adapter and sets up event listeners for device discovery and state changes.
   * Listens for discovered devices and attempts to connect to them if they are registered at the server.
   * Publishes device discovery, connection, and disconnection events to the MQTT broker.
   * @event discover
   * @param {Object} deviceRaw - The raw device object containing information about the discovered Bluetooth device.
   * @description This function sets up the Bluetooth adapter to listen for device discovery events and state changes. When a device is discovered, it checks if the device is registered at the server and attempts to connect to it. If connected, it subscribes to the device's characteristics and publishes relevant information to the MQTT broker.
   */
  bluetooth.on("discover", function (deviceRaw) {
    let data             = {};

    data.deviceID        = (process.platform === "darwin") ? fingerprintCreate(deviceRaw) : deviceRaw.uuid; // if platform is macOS, create fingerprint from deviceRaw, otherwise use uuid
    data.productName     = deviceRaw.advertisement.localName; 
    data.rssi            = deviceRaw.rssi;
    data.connectable     = deviceRaw.connectable;
    data.bridge          = BRIDGE_PREFIX;

    if (((data.deviceID !== undefined) && (data.deviceID.trim() !== "")) && ((data.productName !== undefined) && (data.productName.trim() !== ""))) {
      common.conLog("Bluetooth: Device " + data.deviceID + " (" + data.productName + ") discovered", "yel");

      if (bridgeStatus.devicesRegisteredReconnect === true) { // if message also was used to connect to registered devices
        const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesRegisteredAtServer);

        if (device) { // if device is in array of devices registered at server, connect to it
          common.conLog("Bluetooth: Device " + data.deviceID + " (" + data.productName + ") is registered at server - trying to connect", "yel");
          deviceConnectAndDiscover(data, deviceRaw); 
        }
        else {
          common.conLog("... but is not registered at server", "std", false);
        }
      }
      else { // if message was not used to connect to registered devices, just save device in array of devices found via scan
        const deviceIndex           = bridgeStatus.devicesFoundViaScan.findIndex(device => device.deviceID === data.deviceID);
        const previouslyConnectable = deviceIndex !== -1 && bridgeStatus.devicesFoundViaScan[deviceIndex].connectable === true; // check if device was already found in previous scan and if it was connectable, because it can change during scan

        const nowConnectable  = deviceRaw.connectable === true;
        data.connectable      = nowConnectable || previouslyConnectable;
        data.deviceRaw        = deviceRaw;

        if (deviceIndex !== -1) { // if device is already in array of devices found via scan, update it
          bridgeStatus.devicesFoundViaScan[deviceIndex] = data;
        } 
        else { // if device is not in array of devices found via scan, add it
          bridgeStatus.devicesFoundViaScan.push(data);
        }

        const deviceWithoutRaw = { ...data }; // create a copy of the device object without the raw device object, because it cannot be stringified
        delete deviceWithoutRaw.deviceRaw;

        deviceWithoutRaw.callID = bridgeStatus.deviceScanCallID; // add call ID to device object
        mqttClient.publish("server/devices/discover", JSON.stringify(deviceWithoutRaw));
      }
    }
    else {
      common.conLog("Bluetooth: Device found, but ID or product name is undefined or empty", "red");
    }
  });

  /**
   * Handles changes in the Bluetooth adapter's state.
   * If the state changes to "poweredOn", it sets the bridge status to online.
   * If the state changes to any other value, it stops scanning for devices and sets the bridge status to offline.
   * Publishes the new status to the MQTT broker. 
   * @param {string} state - The new state of the Bluetooth adapter. Possible values include "poweredOn", "poweredOff", "unauthorized", etc.
   * @description This function listens for state changes in the Bluetooth adapter and updates the bridge status accordingly.
   */
  bluetooth.on("stateChange", function (state) {
    common.conLog("Bluetooth: State has been changed", "yel");

    let message     = {};  
    message.bridge  = BRIDGE_PREFIX;

    if (state === "poweredOn") { // only if Bluetooth is powered on ...
      message.status = "online"; // ... set status to online
      mqttBridgeStatus(message);
    }
    else {
      bluetooth.stopScanning();    
      message.status                            = "offline";
      bridgeStatus.devicesRegisteredReconnect   = false;
      bridgeStatus.devicesConnected             = [];
      bridgeStatus.devicesRegisteredAtServer    = [];
      bridgeStatus.devicesFoundViaScan          = [];
      bridgeStatus.deviceScanCallID             = undefined;
    }

    bridgeStatus.status = message.status; // save status in bridge status object
    mqttClient.publish("server/bridge/status", JSON.stringify(message)); // ... publish to MQTT broker
  });

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
        case "bluetooth/devices/scan":
          mqttDevicesScan(data);
          break;
        case "bluetooth/bridge/status":
          mqttBridgeStatus(data);
          break;
        case "bluetooth/devices/reconnect": // this message is used to connect to ALL registered devices
          mqttDevicesReconnect(data);
          break;
        case "bluetooth/devices/connect": // this message is used to connect to ONE specific device (and maybe also to registered devices if flag is set)
          mqttDevicesConnect(data);
          break;
        case "bluetooth/devices/remove":
          mqttDevicesRemove(data);
          break;
        case "bluetooth/devices/disconnect":
          mqttDevicesDisconnect(data);
          break;
        case "bluetooth/devices/values/set":
          mqttDevicesValuesSet(data);
          break;
        case "bluetooth/devices/values/get":
          mqttDevicesValuesGet(data);
          break;
        case "bluetooth/devices/update":
          mqttDevicesUpdate(data);
          break;
        case "bluetooth/devices/refresh":
          mqttDevicesRefresh(data);
          break;
        case "bluetooth/devices/list":
          mqttDevicesList(data);
          break;
        case "bluetooth/devices/create":
          mqttDevicesCreate(data);
          break;

        default:
          common.conLog("Bluetooth: NOT found matching message handler for " + topic, "red");
      }
    }
    catch (error) { // if error while parsing message, log error
      common.conLog("MQTT: Error while parsing message:", "red");     
      common.conLog(error, "std", false);
    }  
  });


  /**
   * Scans for Bluetooth devices for a specified duration. If Bluetooth is powered on, it starts scanning and publishes the scanning status to the MQTT broker.
   * @param {Object} data - The data object containing the scanning duration and whether to connect to registered devices.
   * @description This function initiates a Bluetooth scan for the specified duration and publishes the scanning
   */
  function mqttDevicesScan(data) {
    if (bluetooth.state === "poweredOn") { // if Bluetooth is powered on ...
      let message = {};
      common.conLog("Bluetooth: Scanning for " + data.duration + " seconds", "yel");
      bluetooth.stopScanning();
      bluetooth.startScanning([], true);

      bridgeStatus.devicesFoundViaScan  = []; // reset array of devices found via scan
      bridgeStatus.deviceScanCallID     = data.callID;

      message.scanning                          = true;
      message.bridge                            = BRIDGE_PREFIX;
      bridgeStatus.devicesRegisteredReconnect   = (data.registeredReconnect !== undefined) ? data.registeredReconnect : false; // set flag for connecting to registered devices
      message.duration                          = data.duration;
      message.callID                            = data.callID; // add call ID to message

      mqttClient.publish("server/devices/scan/status", JSON.stringify(message)); // ... publish to MQTT broker
      
      setTimeout(() => { // end scanning after duration
        message.scanning                         = false;
        bridgeStatus.devicesRegisteredReconnect  = false; 

        mqttClient.publish("server/devices/scan/status", JSON.stringify(message)); // ... publish to MQTT broker
        bluetooth.stopScanning();
        bridgeStatus.deviceScanCallID = undefined;
      }, data.duration * 1000);
    }
    else {
      common.conLog("Bluetooth: Not powered on", "red");
    }
  }

  /**
   * If message is for bridge status, get all registered devices from server
   * @param {Object} data - The data object containing the bridge status.
   * @description This function checks the bridge status and, if online, requests all registered Bluetooth devices from server
   */
  function mqttBridgeStatus(data) {
    if (data.status === "online") { // if Bluetooth is online ... 
      let message              = {};
      message.bridge           = BRIDGE_PREFIX;
      message.forceReconnect   = true;

      common.conLog("Bluetooth: Bridge is online - request all registered bluetooth devices from server", "yel");

      mqttClient.publish("server/devices/refresh", JSON.stringify(message)); // ... then request all registered Bluetooth devices from server via MQTT broker
    }
  }
  
  /**
   * Refreshes the list of devices registered at the server based on the provided data.
   * @param {Object} data 
   * @description This function updates IN the bridge the list of devices registered at the server.
   */
  function mqttDevicesRefresh(data) {
    bridgeStatus.devicesRegisteredAtServer = data.devices; // save all devices registered at server in array
  }

  /**
   * Gets the list of devices registered and connected at the bridge based on the provided data.
   * @param {Object} data 
   * @description This function sends OUT from the bridge the list of devices registered and connected at the bridge.
   */
  function mqttDevicesList(data) {
    let message                   = {};
    message.bridge                = BRIDGE_PREFIX;
    message.callID                = data.callID;

    message.devicesRegisteredAtServer  = bridgeStatus.devicesRegisteredAtServer; 
    message.devicesConnected           = bridgeStatus.devicesConnected;
    message.devicesConnected = message.devicesConnected.map(device => { // delete deviceRaw and deviceConverter from devicesConnected, because they cannot be stringified
      const deviceCopy = { ...device };
      delete deviceCopy.deviceRaw;
      delete deviceCopy.deviceConverter;
      return deviceCopy;
    });

    mqttClient.publish("server/devices/list", JSON.stringify(message)); // ... publish to MQTT broker
  }

  /**
   * Updates the information of a registered device.
   * @param {Object} data 
   * @description This function updates the information of a registered device.
   */
  function mqttDevicesUpdate(data) {
    common.conLog("Bluetooth: Request to update device " + data.deviceID, "yel");
    
    if (data && typeof data.updates === "object") {
      bridgeStatus.devicesRegisteredAtServer = bridgeStatus.devicesRegisteredAtServer.map(deviceRegistered => {
        if (deviceRegistered.deviceID === data.deviceID) {
          return { ...deviceRegistered, ...data.updates }; // update device with new data
        }
        return deviceRegistered;
      });
      bridgeStatus.devicesConnected = bridgeStatus.devicesConnected.map(deviceConnected => {
        if (deviceConnected.deviceID === data.deviceID) {
          return { ...deviceConnected, ...data.updates }; // update device with new data
        }
        return deviceConnected;
      });

      common.conLog("Bluetooth: Updated bridge status (registered and connected devices)", "gre", false);
    }
    else {
      common.conLog("Bluetooth: No updates provided, so not updated bridge status", "red", false);
    }

    mqttClient.publish("server/devices/update", JSON.stringify(data)); // publish updated device to MQTT broker
  }

  /**
   * If message is for reconnecting to registered devices, start scanning for devices
   * @param {Object} data - The data object containing the devices to connect to.
   * @description This function handles the request to connect to registered devices by scanning for them and publishing
   */
  function mqttDevicesReconnect(data) {
    bridgeStatus.devicesRegisteredAtServer   = data.devices; // save all devices registered at server in array
    bridgeStatus.devicesConnected            = []; // reset array of connected devices
    bridgeStatus.devicesFoundViaScan         = []; // reset array of devices found via scan

    common.conLog("Bluetooth: Request to connect to devices", "yel");
    
    let message                   = {};
    message.duration              = 30;
    message.registeredReconnect   = true;
    mqttClient.publish("bluetooth/devices/scan", JSON.stringify(message)); // ... publish to MQTT broker
  }

  /**
   * If message is for connecting to a single device, search for it in the list of devices found via scan
   * @param {Object} data - The data object containing the device ID or product name to connect to.
   * @description This function handles the request to connect to a single Bluetooth device by searching for it in the list of devices found via scan.
   */
  function mqttDevicesConnect(data) {
    common.conLog("Bluetooth: Request for connecting to single device " + data.deviceID + " (" + data.productName + ")", "yel");

    let device = {}; // create empty device object

    if (data.deviceID !== undefined) {
      device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesFoundViaScan); // search device in array of devices found via scan
    }
    else if (data.productName !== undefined) {
      device = deviceSearchInArrayByProductName(data.productName, bridgeStatus.devicesFoundViaScan); // search device in array of devices found via scan
    }
    else {
      common.conLog("Bluetooth: No device ID or product name given", "red");
      device = undefined; // if no device ID or product name given, set device to undefined
    }

    if (device) { // if device is in array of devices found via scan, try do connect
      common.conLog("Bluetooth: Device " + device.deviceID + " (" + device.productName + ") found - trying to connect", "yel");
      deviceConnectAndDiscover(device, device.deviceRaw, data.callID, data.addDeviceToServer); // connect to device and discover services and characteristics
    }
    else {
      common.conLog("Bluetooth: Device " + data.deviceID + " (" + data.productName + ") not found in array of devices found via scan", "red");
    }
  }

  /**
   * If message is for removing a connected device (this message ist sent AFTER server removed device)
   * @param {Object} data - The data object containing the device ID to remove.
   * @description This function handles the request to remove a connected device by disconnecting it and removing it from the list of connected devices.
   * If the device is successfully disconnected, it publishes a message to the MQTT broker indicating that the device has been removed.
   */  
  function mqttDevicesRemove(data) {
    common.conLog("Bluetooth: Request for removing " + data.deviceID, "yel");

    const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    if (device) { // if device is in array of connected devices, try do disconnect
      device.deviceRaw.disconnect(function (error) { // disconnect device
        if (error) {    
          common.conLog("Bluetooth: Error while disconnecting device:", "red");
          common.conLog(error, "std", false);
        }
        else {
          bridgeStatus.devicesRegisteredAtServer  = bridgeStatus.devicesRegisteredAtServer.filter(deviceRegistered => deviceRegistered.deviceID !== data.deviceID); // remove device from array of devices registed at server
          common.conLog("Bluetooth: Device disconnected and removed: " + data.deviceID, "gre");
          mqttClient.publish("server/devices/remove", JSON.stringify(data)); // publish removed device to MQTT broker
        }
      });
    }
    else {
      bridgeStatus.devicesRegisteredAtServer  = bridgeStatus.devicesRegisteredAtServer.filter(deviceRegistered => deviceRegistered.deviceID !== data.deviceID); // remove device from array of devices registed at server
      common.conLog("Bluetooth: Device removed: " + data.deviceID, "gre");
      mqttClient.publish("server/devices/remove", JSON.stringify(data)); // publish removed device to MQTT broker
    }
  }

  /**
   * If message is for disconnecting a connected device
   * @param {Object} data - The data object containing the device ID to disconnect.
   * @description This function handles the request to disconnect a connected device by searching for it in the list of connected devices.
   */
  function mqttDevicesDisconnect(data) {
    common.conLog("Bluetooth: Request for disconnecting " + data.deviceID, "yel");
  
    const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    if (device) { // if device is in array of connected devices, try do disconnect
      device.deviceRaw.disconnect(function (error) { // disconnect device
        if (error) {    
          common.conLog("Bluetooth: Error while disconnecting device:", "red");
          common.conLog(error, "std", false);
        }
      });

      mqttClient.publish("server/devices/disconnect", JSON.stringify(data)); // publish disconnected device to MQTT broker
    }
    else { 
      common.conLog("Bluetooth: Device " + data.deviceID + " is not connected", "red");
    }
  }
  
  /**
   * If message is for setting values of a connected device
   * @param {Object} data - The data object containing the device ID and properties to set.
   * @description This function handles the request to set values for properties of a connected Bluetooth device.
   */
  async function mqttDevicesValuesSet(data) {
    common.conLog("Bluetooth: Request for setting values of " + data.deviceID, "yel");

    if (data.values) {
      const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

      if (device) { // if device is in array of connected devices, try do set desired values
        const services    = device.deviceRaw.services; // get services of device
        const promises = []; // array to store promises for writing characteristics
  
        for (const service of services) { // for each service of device
          for (const characteristic of service.characteristics) { // for each characteristic of service
            const property = device.deviceConverter.getPropertyByUUID(characteristic.uuid); // get property by UUID from converter
            if (property !== undefined) { 
              if (data.values.hasOwnProperty(property.name)) { // if property is in properties, that should be set
                if (property.write === true) { // if property is writable 
                  common.conLog("Bluetooth: Writing characteristic " + characteristic.uuid + " (" + property.name + ")", "yel");
                  const writePromise = new Promise(function (resolve, reject) { // create a promise for writing the characteristic value

                    const anyValue       = data.values[property.name]; // get value from property
                    characteristic.write(device.deviceConverter.set(property, anyValue), false, function (error) {
                      if (error) {
                        common.conLog("Bluetooth: Error while writing characteristic:", "red");
                        common.conLog(error, "std", false);
                        reject(error);
                      }
                      else {
                        resolve();
                      }
                    });
                  });
                  promises.push(writePromise); // add promise to array
                }
                else {
                  common.conLog("Bluetooth: Property " + property.name + " is not set as writable", "red");
                }
              }
              else { // if property is not in requested properties or no properties given
                common.conLog("Bluetooth: Device has property " + property.name + ", but this was not requested to be set", "yel");
              }
            }
            else { // if characteristic is not in converter property list
              common.conLog("Bluetooth: Characteristic " + characteristic.uuid + " not found in converter list", "red");
            }
          }
        }
        await Promise.all(promises); // wait for all write operations to complete before publishing
  
        data.values = Object.keys(data.values); // get only keys of properties that were set

        mqttDevicesValuesGet(data); // ... get new values of properties that were set and publish them to MQTT broker
      }
      else { 
        common.conLog("Bluetooth: Device " + data.deviceID + " is not connected", "red");
      }
    }
    else {
      common.conLog("Bluetooth: No properties given", "red");
    }
  }

  /**
   * If message is for getting properties and values of a connected device
   * @param {Object} data - The data object containing the device ID and properties to get.
   * @description This function handles the request to get properties and values of a connected Bluetooth device.
   */
  async function mqttDevicesValuesGet(data) {
    common.conLog("Bluetooth: Request for getting properties and values of " + data.deviceID, "yel");
  
    const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    if (device) { // if device is in array of connected devices, try do get desired values
      let message                      = {};
      message.deviceID                 = data.deviceID;
      message.callID                   = data.callID;
      message.values                   = {};

      const services    = device.deviceRaw.services; // get services of device
      const promises = []; // array to store promises for reading characteristics

      for (const service of services) { // for each service of device
        for (const characteristic of service.characteristics) { // for each characteristic of service
          const property = device.deviceConverter.getPropertyByUUID(characteristic.uuid); // get property by UUID from converter
          if (property !== undefined) { 
            common.conLog("Bluetooth: Reading characteristic " + characteristic.uuid + " (" + property.name + ")", "yel");
            const readPromise = new Promise(function (resolve, reject) { // create a promise for reading the characteristic value
              characteristic.read(function (error, value) {
                if (error) {
                  common.conLog("Bluetooth: Error while reading characteristic:", "red");
                  common.conLog(error, "std", false);
                  reject(error);
                }
                else {
                  if (property.valueType === "Subproperties") { // if property has multiple subproperties
                    const subproperty = device.deviceConverter.getSubproperty(property, value);
                    if (subproperty !== undefined) { // if subproperty is found in converter
                      message.values[subproperty.name] = { value: subproperty.value, valueAsNumeric: subproperty.valueAsNumeric };
                    }
                  }
                  else {
                    message.values[property.name]   = device.deviceConverter.get(property, value);
                  }
                  resolve();
                }
              });
            });
            promises.push(readPromise); // add promise to array
          }
          else { // if characteristic is not in converter property list
            common.conLog("Bluetooth: Characteristic " + characteristic.uuid + " not found in converter list", "red");
          }
        }
      }
      
      await Promise.all(promises); // wait for all read operations to complete before publishing
      mqttClient.publish("server/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
    }
    else { 
      common.conLog("Bluetooth: Device " + data.deviceID + " is not connected", "red");
    }
  }
  
   /**
    * Create a new device
    * @param {Object} data 
    * @description This function creates the information of a registered device.
    */
   function mqttDevicesCreate(data) {
      common.conLog("Bluetooth: Request to create device " + data.deviceID + ", but creating here will have no effect, because bridgeStatus is refreshed automatically by server", "red");

      const deviceConverter = convertersList.find(data.productName); // get converter for device from list of converters
      if (deviceConverter === undefined) { 
        common.conLog("Bluetooth: No converter found for " + data.productName, "red");
        data.powerType = "?"; 
      }
      else {
        common.conLog("Bluetooth: Converter found for " + data.productName, "gre");
        data.powerType  = deviceConverter.powerType;
        data.properties = common.devicePropertiesToArray(deviceConverter.properties);
      }

      data.forceReconnect = true; // because this is Bluetooth, reconnect devices after creation

      mqttClient.publish("server/devices/create", JSON.stringify(data)); // publish created device to MQTT broker
   } 
}

startBridgeAndServer();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
    common.conLog("Server closed.", "mag", true);
    process.exit(0);
});