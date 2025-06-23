/*
    ================================
    ZigBee - Bridge: ZigBee <-> MQTT
    ================================
*/
const AppConfig       = require("../config");
const Common          = require("../common");

const strBridgePrefix = "zigbee"; 

/*
  Load  converters for devices
*/
const { Converters } = require("./converters.js");
const { default: Device } = require("zigbee-herdsman/dist/controller/model/device.js");
const ConvertersList = new Converters(); // create new object for converters

/*
  Start bridge and server
*/
async function startBridgeAndServer() {
  /*
    ======================================
    Server
    ======================================
  */
  const Express = require("express");
  const App     = Express();

  const Server = require("http").createServer(App);
  Server.listen(AppConfig.CONF_intPortBridgeZigBee, function () {
    Common.logoShow(strBridgePrefix, AppConfig.CONF_intPortBridgeZigBee); // Show bulp logo
  });

  /*
    ======================================
    MQTT client - subscribe to specific topics
    ======================================
  */
  const MQTT       = require("mqtt");
  const MQTTClient = MQTT.connect(AppConfig.CONF_strBrokerAddress, { clientId: strBridgePrefix }); // connect to broker ...

  function mqttConnect() {
    MQTTClient.subscribe(strBridgePrefix + "/#", function (Error, arrGanted) { // ... and subscribe to zigbee topics
      Common.conLog("MQTT: Subscribed to ZigBee topics from broker", "yel"); 
      if (Error) {
        Common.conLog("MQTT: Error while subscribing:", "red");
        Common.conLog(Error, "std", false);
      }
    });
  }
  MQTTClient.on("connect", mqttConnect);

  /*
    ======================================
    Helper functions
    ======================================

    Checks, of device ID is in given array of devices
  */
  function DeviceSearchInArray(strDeviceID, arrDevices) {
    let Device = new Object();  

    const DevicesFound = arrDevices.find(Device => Device.strDeviceID === strDeviceID);
    if (DevicesFound) { 
      Device = DevicesFound; // if device is in array, get first device (because there should be only one device with this ID)
    }
    else {
      Device = undefined; // if device is not in array, set device to undefined
    }
    return Device;
  }

  /*
    Get all information about a device
  */
  function DeviceGetInfo(strDeviceID, arrDevices) {
    let Device = DeviceSearchInArray(strDeviceID, arrDevices);
    if (Device === undefined) {
      Common.conLog("ZigBee: Device " + strDeviceID + " not found list", "red");
      return undefined; // if device is not in array, return undefined
    }
    else {
      Device.DeviceConverter = ConvertersList.find(Device.strProductName);
      if (Device.DeviceConverter === undefined) { // if no converter is found for this device, set device to undefined
        Common.conLog("ZigBee: No converter found for device " + strDeviceID, "red");
        return undefined;
      }
      else {
        Device.DeviceRaw = ZigBee.getDeviceByIeeeAddr(Device.strDeviceID); // save device object for later use
        if (Device.DeviceRaw === undefined) { // if device is not found, set device to undefined
          Common.conLog("ZigBee: Cannot get raw data for device " + strDeviceID, "red");
          return undefined;
        }
        else {
          if (Device.DeviceRaw.endpoints === undefined || Device.DeviceRaw.endpoints.length === 0) { // if device has no endpoints, set device to undefined
            Common.conLog("ZigBee: Cannot get endpoint for device " + strDeviceID, "red");
            return undefined;
          }
          else {
            Device.Endpoint = Device.DeviceRaw.endpoints[0];  // get first endpoint of the device
          }
        }
      }
    }
    return Device;
  }

  /*
    Ping a device
  */
  async function DeviceIsPingable(Device) {
  try {
      const Result = await Device.Endpoint.read("genBasic", ["zclVersion"]);
      return true;
    }
    catch (Error) {
      return false;
    }
  }


  /*
    Bridge status - for saving all connected devices and devices registered at server 
  */
  class BridgeStatusClass {
    constructor() {
      this.arrDevicesConnected          = new Array();
      this.arrDevicesRegisteredAtServer = new Array();
      this.blnDevicesRegisteredConnect  = false; // not in use yet
    }
  }
  const BridgeStatus = new BridgeStatusClass(); // create new object for bridge status

  /*
    ======================================
    Events at ZigBee adapter
    ======================================
  */
  const {Controller: ZigBeeController}  = require("zigbee-herdsman"); 
  const ZigBee                          = new ZigBeeController({ serialPort: {path: AppConfig.CONF_strZigBeeAdapterPort, adapter: AppConfig.CONF_strZigBeeAdapterName}, databasePath: "./devices.db", log: { level: 'none' } }); // create new ZigBee controller

  /*
    Start ZigBee controller
  */
  async function zigBeeStart(){
    await ZigBee.start();
    Common.conLog("ZigBee: Bridge started", "gre");

    let Data       = new Object();
    Data.strStatus = "online";
    MQTTClient.publish("zigbee/bridge/status", JSON.stringify(Data)); // publish to MQTT broker
  }
  await zigBeeStart();

  /*
    Request all registered ZigBee devices from server via MQTT broker
  */
  let Message        = new Object();
  Message.strBridge  = strBridgePrefix;
  MQTTClient.publish("server/devices/list", JSON.stringify(Message));
  
  /*
    If device has joined ...
  */
  ZigBee.on("deviceInterview", async function (Data) { 
    let Message = new Object();
    Message.strDeviceID           = Data.device.ieeeAddr;
    Message.blnInterviewCompleted = Data.device.interviewCompleted;
    Message.intLastSeen           = Data.device.lastSeen;
    Message.strManufacturerName   = Data.device.manufacturerName;
    Message.strProductName        = Data.device.modelID;
    Message.strSoftwareBuildID    = Data.device.softwareBuildID;
    Message.strType               = Data.device.type;

    if (Message.blnInterviewCompleted) { // ... and has been interviewed ...
      Common.conLog("ZigBee: device has joined and been interviewed", "yel");
      Common.conLog(Message, "std", false);
      
      MQTTClient.publish("server/device/create", JSON.stringify(Message)); // ... publish to MQTT broker
    }
  });

  /*
    If device has left ...
  */
  ZigBee.on("deviceLeave", function (Data) {
    Common.conLog("ZigBee: device has left", "yel");
    Common.conLog(Data, "std", false);

    let Message         = new Object();
    Message.strDeviceID = Data.ieeeAddr;
    Message.strBridge   = strBridgePrefix;
    MQTTClient.publish("server/device/remove", JSON.stringify(Message)); // ... publish to MQTT broker
  });

  /*
    If device has announced itself ...
  */
  ZigBee.on("deviceAnnounce", function (Data) { 
    Common.conLog("ZigBee: device has announced, try to add to connected devices", "yel");
    
    let strDeviceID = Data.device.ieeeAddr;
    
    let Device = DeviceSearchInArray(strDeviceID, BridgeStatus.arrDevicesRegisteredAtServer); // search device in array of registered devices
    if (Device) { // if device is in array of registered devices, add to array connected devices
      Common.conLog("ZigBee: Device " + Device.strDeviceID + " is registered at server - trying to connect", "yel");
      
      Data = DeviceGetInfo(strDeviceID, BridgeStatus.arrDevicesRegisteredAtServer);
      if (Data === undefined) { 
        Common.conLog("ZigBee: Device " + strDeviceID + " NOT added to list of connected devices", "red");
      }
      else {
        Common.conLog("ZigBee: Device " + Data.strDeviceID + " added to list of connected devices", "gre");
        BridgeStatus.arrDevicesConnected.push(Data); // add device to array of connected devices
      }
    }
    else {
        Common.conLog("... but is not registered at server", "std", false);      
    }
 
    let Message         = new Object();
    Message.strDeviceID = strDeviceID;
    MQTTClient.publish("zigbee/device/announced", JSON.stringify(Message)); // ... publish to MQTT broker
  });

 /*
    If message of a device has been received ...
  */
  ZigBee.on("message", async function (Data) { 
    let Message             = new Object();
    Message.strDeviceID     = Data.device.ieeeAddr;
    Message.strProductName  = Data.device.modelID;
    Message.arrProperties   = new Array();
    
    Common.conLog("ZigBee: Device " + Message.strDeviceID + " sends message", "yel");

    const Device          = Data.device;
    const DeviceConverter = ConvertersList.find(Device.modelID); // get converter for this device

    if (DeviceConverter)  {
      Common.conLog("ZigBee: Device converter found", "gre");

      const Property = DeviceConverter.getPropertyByClusterName(Data.cluster);
      if (Property) {
        let PropertyAndValue                = new Object();
        PropertyAndValue[Property.strName]  = DeviceConverter.getConvertedValueForProperty(Property, Data.type, Data.data); // get converted value for property
        Message.arrProperties.push(PropertyAndValue); // add property to array of properties for return
      }
      else {
        Common.conLog("ZigBee: No property found for cluster " + Data.cluster, "red");
      }
    }
    else {
      Common.conLog("ZigBee: No converter found for " + Device.modelID, "red");
      Message.Message = "Device not supported";
    }

    MQTTClient.publish("zigbee/device/values", JSON.stringify(Message)); // ... publish to MQTT broker
  });

  /*
    If joining status has been changed ...
  */
  ZigBee.on("permitJoinChanged", function (Data) {
    Common.conLog("ZigBee: joining status has been changed to", "yel");
    Common.conLog(Data, "std", false);

    let Message         = new Object();
    Message.blnScanning = Data.permitted;
    MQTTClient.publish("zigbee/devices/scan/status", JSON.stringify(Message)); // ... publish to MQTT broker
  });

  /*
    If adapter has been disconnected ...
  */
  ZigBee.on("adapterDisconnected", function () {
    Common.conLog("ZigBee: adapter has been disconnected", "red");

    let Message       = new Object();
    Message.strStatus = "offline";
    MQTTClient.publish("zigbee/bridge/status", JSON.stringify(Message)); // ... publish to MQTT broker
  });

  /*
    ======================================
    MQTT: incoming messages handler
    ======================================    
  */
  MQTTClient.on("message", async function (strTopic, strMessage) {
    strTopic    = strTopic.toString();
    strMessage  = strMessage.toString();

    Common.conLog("MQTT: Getting incoming message from broker", "yel");
    Common.conLog("Topic: " + strTopic, "std", false);
    Common.conLog("Message: " + strMessage, "std", false);

    try {
      const Data = JSON.parse(strMessage); // parse message to JSON

      switch (strTopic) {
        case "zigbee/devices/scan":
          MQTTDeviceScan(Data);
          break;
        case "zigbee/devices/connect":
          MQTTDeviceConnect(Data);
          break;
        case "zigbee/device/remove":
          MQTTDeviceRemove(Data);
          break;
        case "zigbee/device/set":
          MQTTDeviceSet(Data);
          break;
        case "zigbee/device/get":
          MQTTDeviceGet(Data);
          break;
        default:
          Common.conLog("ZigBee: NOT found matching message handler for " + strTopic, "red");
      }
    }
    catch (Error) { // if error while parsing message, log error
      Common.conLog("MQTT: Error while parsing message:", "red");     
      Common.conLog(Error, "std", false);
    }  
  });

  /*
    If message is for adding devices, send this to ZigBee bridge
  */
  function MQTTDeviceScan(Data) {
    let Message = new Object();
    Common.conLog("ZigBee: Joining possible for " + Data.intDuration + " seconds", "yel");
    ZigBee.permitJoin(Data.intDuration);
    // MQTT publish is not needed here, because this is done in the event permitJoinChanged
  }

  /*
    If message is for connecting to registered devices ...
  */
  async function MQTTDeviceConnect(Data) {
    BridgeStatus.arrDevicesRegisteredAtServer = Data.arrDevices; // save all devices registered at server in array

    for (let Device of BridgeStatus.arrDevicesRegisteredAtServer) {
      Device = DeviceGetInfo(Device.strDeviceID, BridgeStatus.arrDevicesRegisteredAtServer); // get device information

      if (Device === undefined) { // if device is not found, continue with next device
        continue;
      }
      else {
        Common.conLog("ZigBee: Try to connect to device " + Device.strDeviceID + " ...", "yel");
        
        if (Device.DeviceConverter.strPowerType === "mains") { // if device is wired, then it's pingable
          Common.conLog("... Device " + Device.strDeviceID + " is wired and pingable ...", "std", false);
          if (await DeviceIsPingable(Device)) {
            Common.conLog("... and added " + Device.strDeviceID + " to list to list of connected devices", "gre", false);
            BridgeStatus.arrDevicesConnected.push(Device); // add device to array of connected devices
          }
          else {
            Common.conLog("... but " + Device.strDeviceID + " was not pingable and added not to list of connected devices", "red", false);
          }
        }
        else {
          Common.conLog("... Device " + Device.strDeviceID + " is not wired and not pingable ...", "std", false);
          Common.conLog("... so just added to list to list of connected devices", "gre", false);
          BridgeStatus.arrDevicesConnected.push(Device); // add device to array of connected devices
        }
      }
    }
  }

  /*
    If message is for removing a connected device (this message ist sent AFTER server removed device)
  */  
  function MQTTDeviceRemove(Data) {
    Common.conLog("ZigBee: Request for removing " + Data.strDeviceID, "yel");

    const Device = DeviceSearchInArray(Data.strDeviceID, BridgeStatus.arrDevicesConnected); // search device in array of connected devices

    if (Device) { // if device is in array of connected devices, try do disconnect
      Device.DeviceRaw.removeFromDatabase();
      Device.DeviceRaw.removeFromNetwork();
      BridgeStatus.arrDevicesRegisteredAtServer  = BridgeStatus.arrDevicesRegisteredAtServer.filter(DeviceConnected => DeviceConnected.strDeviceID !== Data.strDeviceID); // remove device from array of devices registed at server
      BridgeStatus.arrDevicesConnected           = BridgeStatus.arrDevicesConnected.filter(DeviceConnected => DeviceConnected.strDeviceID !== Data.strDeviceID); // remove device from array of connected devices
      Common.conLog("ZigBee: Device disconnected and removed: " + Data.strDeviceID, "gre");

      MQTTClient.publish("zigbee/device/removed", JSON.stringify(Data)); // publish removed device to MQTT broker
    }
  }

  /*
    If message is for getting properties and values of a connected device
  */
  async function MQTTDeviceGet(Data) {
    Common.conLog("ZigBee: Request for getting properties and values of " + Data.strDeviceID, "yel");
    const Device = DeviceSearchInArray(Data.strDeviceID, BridgeStatus.arrDevicesConnected); // search device in array of connected devices

    let Message                      = new Object();
    Message.strDeviceID              = Data.strDeviceID;
    Message.arrPropertiesAndValues   = new Array();

    if (Device) { // if device is in array of connected devices, try do get desired values
      if (Device.DeviceConverter.strPowerType === "mains") { // if device is wired, then it's pingable and able to read values
        Common.conLog("... Device " + Device.strDeviceID + " is wired and pingable ...", "std", false);
        if (await DeviceIsPingable(Device)) {

          if (!Data.arrProperties) { // if no properties are defined, then read all properties
            Data.arrProperties = new Array(); // create array for properties
            for (const [strCluster, Properties] of Object.entries(Device.DeviceConverter.Properties)) { // for each cluster in converter
              for (const [strAttribute, Property] of Object.entries(Properties)) { // for each property in cluster
                Data.arrProperties.push(Property.strName);
              }
            }
          }

          if (Data.arrProperties) { // if properties are defined, then read these properties
            for (const strProperty of Data.arrProperties) { // for each property in requested properties
              const Cluster = Device.DeviceConverter.getClusterAndAttributeByPropertyName(strProperty); // get cluster and attribute by property name from converter
              
              if (Cluster === undefined) { // if cluster is not found, log error
                Common.conLog("ZigBee: No cluster found for property " + strProperty, "red");
              }
              else {
                const Attribute = await Device.Endpoint.read(Cluster.strCluster, [Cluster.strAttribute]);
                let PropertyAndValue           = new Object();
                PropertyAndValue[strProperty]  = Device.DeviceConverter.getConvertedValueForProperty(Device.DeviceConverter.getPropertyByAttributeName(Cluster.strAttribute), Attribute[Cluster.strAttribute]); // get converted value for property
                Message.arrPropertiesAndValues.push(PropertyAndValue); // add property to array of properties for return
              }
            }
            MQTTClient.publish("zigbee/device/values", JSON.stringify(Message)); // ... publish to MQTT broker
          }
        }
        else {
          Common.conLog("... but " + Device.strDeviceID + " was not pingable, so send empty values", "red", false);
          MQTTClient.publish("zigbee/device/values", JSON.stringify(Message)); // ... publish to MQTT broker
        }
      }
      else {
        Common.conLog("... but " + Device.strDeviceID + " is not wired, so send empty values", "red", false);
        MQTTClient.publish("zigbee/device/values", JSON.stringify(Message)); // ... publish to MQTT broker
      }
    }
  }  

  /*
    If message is for setting values of a connected device
  */
  async function MQTTDeviceSet(Data) {
    Common.conLog("ZigBee: Request for setting values of " + Data.strDeviceID, "yel");

    if (Data.arrProperties) {
      const Device = DeviceSearchInArray(Data.strDeviceID, BridgeStatus.arrDevicesConnected); // search device in array of connected devices

      if (Device) { // if device is in array of connected devices, try do get desired values
        if (Device.DeviceConverter.strPowerType === "mains") { // if device is wired, then it's pingable and able to read values
          Common.conLog("... Device " + Device.strDeviceID + " is wired and pingable ...", "std", false);
          if (await DeviceIsPingable(Device)) {
            for (const PropertyAndValue of Data.arrProperties) { // for each property in requested properties

              const strProperty = Object.keys(PropertyAndValue)[0]; // get property name from object
              const anyValue   = PropertyAndValue[strProperty]; // get value from object
              const Property    = Device.DeviceConverter.getPropertyByPropertyName(strProperty); // get property by name from converter

              if (Property === undefined) { // if property is not found, log error
                Common.conLog("ZigBee: No property found for " + strProperty, "red");
              }
              else {
                if (Property.blnWrite === true) { // if property is writable, then write value
                  Common.conLog("ZigBee: Set value for " + strProperty + " to " + anyValue, "gre", false);

                  const ValueConverted = Device.DeviceConverter.setConvertedValueForProperty(Property, anyValue);
                  await Device.Endpoint.command(Property.strCluster, ValueConverted.strCommand, ValueConverted.anyValue,  { disableDefaultResponse: true });

                  //await Device.Endpoint.write(Property.strCluster, { [Property.strAttribute]: anyValue }); // write value to device
                }
                else {
                  Common.conLog("ZigBee: Property " + strProperty + " is not writable", "red", false);
                }
              }
            }
          }
          else {
            Common.conLog("... but " + Device.strDeviceID + " was not pingable", "red", false);
          }
        }
        else {
          Common.conLog("... but " + Device.strDeviceID + " is not wired", "red", false);
        }
      }
      else { 
        Common.conLog("ZigBee: Device " + Data.strDeviceID + " is not connected", "red");
      }
    }
    else {
      Common.conLog("ZigBee: No properties given", "red");
    }
  }
}

startBridgeAndServer();

process.on("SIGINT", function () {
    Common.conLog("Server closed.", "mag", true);
    process.exit(0);
});