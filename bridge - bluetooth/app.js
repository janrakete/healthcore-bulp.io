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
const { Converters } = require("./Converters.js");
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
    let device = {};  

    const deviceFound = devices.find(device => device.deviceID === deviceID);
    if (deviceFound) { 
      device = deviceFound; // if device is in array, get first device (because there should be only one device with this ID)
    }
    else {
      device = undefined; // if device is not in array, set device to undefined
    }
    return device;
  }

  /**
   * Searches for a device by its productName within a given array of devices.
   * @param {string} productName - The device product name to search for.
   * @param {Object[]} devices - The array of known device objects.
   * @returns {Object|undefined} The matching device object, or `undefined` if not found.
   * @description This function iterates through the array of devices and returns the first device that matches the provided product name. If no matching device is found, it returns `undefined`.
   */
  function deviceSearchInArrayByProductName(productName, devices) {
    let device = {};  

    const deviceFound = devices.find(device => device.productName === productName);
    if (deviceFound) { 
      device = deviceFound; // if device is in array, get first device (because there should be only one device with this ID)
    }
    else {
      device = undefined; // if device is not in array, set device to undefined
    }
    return device;
  }

  /**
   * Connects to a Bluetooth device, discovers its services and characteristics, subscribes to notifications, and updates bridge status.
   * @param {Object} device - Device metadata (deviceID, name, etc.).
   * @param {Object} deviceRaw - The raw Bluetooth device object.
   * @description This function attempts to connect to a Bluetooth device, discovers its services and characteristics, and subscribes to notifications for properties defined in the device converter. It also handles disconnection events and publishes connection status to the MQTT broker.
   */
  function deviceConnectAndDiscover(device, deviceRaw) {
    delete device.deviceRaw; // remove deviceRaw from device, because it cannot be stringified

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
            mqttClient.publish("server/device/disconnected", JSON.stringify(device)); // publish disconnected device to MQTT broker
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
                  for (const characteristic of service.characteristics) { // for each characteristic of service
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
                              let message                         = {};
                              message.deviceID                    = device.deviceID;
                              message.properties                  = [];
                              message.bridge                      = BRIDGE_PREFIX;
                            
                              let propertyAndValue                = {};
                              propertyAndValue[property.name]  = device.deviceConverter.get(property, value); 
                              message.properties.push(propertyAndValue); // add property to array of properties for return

                              mqttClient.publish("server/device/values", JSON.stringify(message)); // ... publish to MQTT broker    
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
              mqttClient.publish("server/device/connected", JSON.stringify(device)); // publish connected device to MQTT broker

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
   * @description This class is used to manage the status of the Bluetooth bridge, including connected devices and those registered at the server.
   */
  class BridgeStatusClass {
    constructor() {
      this.devicesConnected              = []; // Array of currently connected Bluetooth devices
      this.devicesRegisteredAtServer     = []; // Array of devices registered at the server
      this.devicesFoundViaScan           = []; // Array of devices found via scanning
      this.devicesRegisteredReconnect    = false; // Flag indicating if the bridge is set to reconnect to registered devices
      this.deviceScanCallID           = undefined; // ID of call if scanning is initiated
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
        mqttClient.publish("server/devices/discovered", JSON.stringify(deviceWithoutRaw));
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

    if (state == "poweredOn") { // only if Bluetooth is powered on ...
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
        case "bluetooth/device/connect": // this message is used to connect to ONE specific device
          mqttDeviceConnect(data);
          break;
        case "bluetooth/device/remove":
          mqttDeviceRemove(data);
          break;
        case "bluetooth/device/disconnect":
          mqttDeviceDisconnect(data);
          break;
        case "bluetooth/device/set":
          mqttDeviceSet(data);
          break;
        case "bluetooth/device/get":
          mqttDeviceGet(data);
          break;
        case "bluetooth/device/update":
          mqttDeviceUpdate(data);
          break;
        case "bluetooth/devices/list":
          mqttDevicesList(data);
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

      mqttClient.publish("server/devices/list", JSON.stringify(message)); // ... then request all registered Bluetooth devices from server via MQTT broker
    }
  }
  
  /**
   * Sets the list of devices registered at the server based on the provided data.
   * @param {Object} data 
   * @description This function updates the list of devices registered at the server.
   */
  function mqttDevicesList(data) {
    bridgeStatus.devicesRegisteredAtServer = data.devices; // save all devices registered at server in array
  }

  /**
   * Updates the information of a registered device.
   * @param {Object} data 
   * @description This function updates the information of a registered device.
   */
  function mqttDeviceUpdate(data) {
    common.conLog("Bluetooth: Request to update device " + data.deviceID + ", but updating here will have no effect", "red");
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
  function mqttDeviceConnect(data) {
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
      deviceConnectAndDiscover(device, device.deviceRaw); // connect to device and discover services and characteristics
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
  function mqttDeviceRemove(data) {
    common.conLog("Bluetooth: Request for removing " + data.deviceID, "yel");

    const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    if (device) { // if device is in array of connected devices, try do disconnect
      device.deviceRaw.disconnect(function (error) { // disconnect device
        if (error) {    
          common.conLog("Bluetooth: Error while disconnecting device:", "red");
          common.conLog(error, "std", false);
        }
        else {
          bridgeStatus.devicesRegisteredAtServer  = bridgeStatus.devicesRegisteredAtServer.filter(deviceConnected => deviceConnected.deviceID !== data.deviceID); // remove device from array of devices registed at server
          common.conLog("Bluetooth: Device disconnected and removed: " + data.deviceID, "gre");
          mqttClient.publish("server/device/removed", JSON.stringify(data)); // publish removed device to MQTT broker
        }
      });
    }
  }

  /**
   * If message is for disconnecting a connected device
   * @param {Object} data - The data object containing the device ID to disconnect.
   * @description This function handles the request to disconnect a connected device by searching for it in the list of connected devices.
   */
  function mqttDeviceDisconnect(data) {
    common.conLog("Bluetooth: Request for disconnecting " + data.deviceID, "yel");
  
    const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    if (device) { // if device is in array of connected devices, try do disconnect
      device.deviceRaw.disconnect(function (error) { // disconnect device
        if (error) {    
          common.conLog("Bluetooth: Error while disconnecting device:", "red");
          common.conLog(error, "std", false);
        }
      });
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
  async function mqttDeviceSet(data) {
    common.conLog("Bluetooth: Request for setting values of " + data.deviceID, "yel");

    if (data.properties) {
      const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

      if (device) { // if device is in array of connected devices, try do set desired values
        const services    = device.deviceRaw.services; // get services of device
        const promises = []; // array to store promises for writing characteristics
  
        for (const service of services) { // for each service of device
          for (const characteristic of service.characteristics) { // for each characteristic of service
            const property = device.deviceConverter.getPropertyByUUID(characteristic.uuid); // get property by UUID from converter
            if (property !== undefined) { 
              if (data.properties.some(propertySearch => Object.keys(propertySearch).includes(property.name))) { // if property is in properties, that should be set
                if (property.write === true) { // if property is writable 
                  common.conLog("Bluetooth: Writing characteristic " + characteristic.uuid + " (" + property.name + ")", "yel");
                  const writePromise = new Promise(function (resolve, reject) { // create a promise for writing the characteristic value

                    const propertyFound  = data.properties.find(propertySearch => propertySearch.hasOwnProperty(property.name)); // get property from array of properties that should be set
                    const anyValue       = propertyFound[property.name]; // get value from property
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
  
        data.properties = data.properties.map(propertyWithValue => Object.keys(propertyWithValue)[0]); // get only keys of properties that were set
        mqttDeviceGet(data); // ... and get values of properties that were set
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
  async function mqttDeviceGet(data) {
    common.conLog("Bluetooth: Request for getting properties and values of " + data.deviceID, "yel");
  
    const device = deviceSearchInArrayByID(data.deviceID, bridgeStatus.devicesConnected); // search device in array of connected devices

    if (device) { // if device is in array of connected devices, try do get desired values
      let message                      = {};
      message.deviceID                 = data.deviceID;
      message.propertiesAndValues      = [];

      const services    = device.deviceRaw.services; // get services of device
      const promises = []; // array to store promises for reading characteristics

      for (const service of services) { // for each service of device
        for (const characteristic of service.characteristics) { // for each characteristic of service
          const property = device.deviceConverter.getPropertyByUUID(characteristic.uuid); // get property by UUID from converter
          if (property !== undefined) { 
            if (!data.properties || data.properties.includes(property.name)) { // if property is in requested properties or no properties are defined
              common.conLog("Bluetooth: Reading characteristic " + characteristic.uuid + " (" + property.name + ")", "yel");
              const readPromise = new Promise(function (resolve, reject) { // create a promise for reading the characteristic value
                characteristic.read(function (error, value) {
                  if (error) {
                    common.conLog("Bluetooth: Error while reading characteristic:", "red");
                    common.conLog(error, "std", false);
                    reject(error);
                  }
                  else {
                    let propertyAndValue                = {};
                    propertyAndValue[property.name]     = device.deviceConverter.get(property, value);
                    message.propertiesAndValues.push(propertyAndValue); // add property to array of properties for return
                    resolve();
                  }
                });
              });
              promises.push(readPromise); // add promise to array
            }
            else { // if property is not in requested properties
              common.conLog("Bluetooth: Property " + property.name + " not found in requested properties", "red");
            }
          }
          else { // if characteristic is not in converter property list
            common.conLog("Bluetooth: Characteristic " + characteristic.uuid + " not found in converter list", "red");
          }
        }
      }
      
      await Promise.all(promises); // wait for all read operations to complete before publishing
      mqttClient.publish("server/device/values", JSON.stringify(message)); // ... publish to MQTT broker
    }
    else { 
      common.conLog("Bluetooth: Device " + data.deviceID + " is not connected", "red");
    }
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