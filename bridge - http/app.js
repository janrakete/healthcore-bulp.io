/*
    ============================
    HTTP - Bridge: HTTP <-> MQTT
    ============================
*/
const AppConfig       = require("../config");
const Common          = require("../common");

const strBridgePrefix = "http"; 

/*
  Load  converters for devices
*/
const { Converters } = require("./converters.js");
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
  const Express     = require("express");
  const Cors        = require("cors");
  const BodyParser  = require("body-parser");

  const App = Express();

  App.use(BodyParser.json());

  App.use(
    Cors(),
    BodyParser.urlencoded({
      extended: true,
    })
  );

  App.use(function (Error, Request, Response, Next) { // if request contains JSON and the JSON is invalid
    if (Error instanceof SyntaxError && Error.status === 400 && "body" in Error) {
      let Data = new Object();
      Data.strStatus        = "error";
      Data.strErrorMessage  = "JSON in request is invalid";
      Response.json(Data);
    }
  });

  const Router = require("express").Router();
  App.use("/", Router);

  const Server = require("http").createServer(App);
  Server.listen(AppConfig.CONF_intPortBridgeHTTP, function () {
    Common.logoShow(strBridgePrefix, AppConfig.CONF_intPortBridgeHTTP); // Show bulp logo
  });

  /*
    ======================================
    MQTT client - subscribe to specific topics
    ======================================
  */
  const MQTT       = require("mqtt");
  const MQTTClient = MQTT.connect(AppConfig.CONF_strBrokerAddress, { clientId: strBridgePrefix }); // connect to broker ...

  function mqttConnect() {
    MQTTClient.subscribe(strBridgePrefix + "/#", function (Error, arrGanted) { // ... and subscribe to HTTP topics
      Common.conLog("MQTT: Subscribed to HTTP topics from broker", "yel"); 
      if (Error) {
        Common.conLog("MQTT: Error while subscribing:", "red");
        Common.conLog(Error, "std", false);
      }

      /*
        If MQTT is started, request all registered devices from server
      */
      Common.conLog("HTTP: Bridge (= this web server) is online - request all registered HTTP devices from server", "yel");
      let Message     = new Object();
      Message.strBridge  = strBridgePrefix;
      MQTTClient.publish("server/devices/list", JSON.stringify(Message)); // then request all registered HTTP devices from server via MQTT broker 
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
    Bridge status - for saving all connected devices and devices registered at server 
  */
  class BridgeStatusClass {
    constructor() {
      this.arrDevicesRegisteredAtServer = new Array();
      this.arrDevicesConnected          = new Array();
      this.blnDevicesRegisteredConnect  = false; // not in use yet
    }
  }
  const BridgeStatus = new BridgeStatusClass(); // create new object for bridge status

  /*
    ======================================
    Events at web server
    ======================================

    If call is for deleting a device
  */
  Router.delete("/message", async function (Request, Response) {
    const Payload       = Request.body;
    let Message         = new Object(); // create new object for MQTT message
    let Data            = new Object(); // create new object for HTTP response

    try {
      if (Payload === undefined) { // if no payload is given, send error message
        Data.strStatus        = "error";
        Data.strErrorMessage  = "No payload given";
      }
      else { // if payload exists, check if device is in array of connected devices
        const Device = DeviceSearchInArray(Payload.strDeviceID, BridgeStatus.arrDevicesConnected);  
        
        if (Device) { // if device is in array of connected devices, build message and send it to MQTT broker
          Common.conLog("HTTP: Device " + Payload.strDeviceID + " is connected - trying to remove", "yel");

          Message.strProductName  = Payload.strProductName;
          Message.strDeviceID     = Payload.strDeviceID;
          Message.strBridge       = strBridgePrefix;

          Common.conLog("HTTP: Request for deleting device " + Message.strDeviceID, "yel", false);

          MQTTClient.publish("server/device/remove", JSON.stringify(Message));
          Data.strStatus = "ok";
        }
        else { // if device is not in array of connected devices, send error message
          Common.conLog("HTTP: Device is not connected or registered at server", "red");
          Data.strStatus        = "error";
          Data.strErrorMessage  = "Device " + Payload.strDeviceID + " is not registered at server";
        }
      }
    }
    catch (Error) {
      Data.strStatus = "error";
      Data.strError  = "Fatal error: " + (Error.stack).slice(0, 128);
    }
      
    Common.conLog("HTTP response: " + JSON.stringify(Data), "std", false);
    Response.json(Data);
  });

  /*
    If call is for creating a device
  */
  Router.put("/message", async function (Request, Response) {
    const Payload       = Request.body;
    let Message         = new Object(); // create new object for MQTT message
    let Data            = new Object(); // create new object for HTTP response

    try {
      if (Payload === undefined) { // if no payload is given, send error message
        Data.strStatus        = "error";
        Data.strErrorMessage  = "No payload given";
      }
      else { // if payload exists, fill message and send it to MQTT broker
        Message.strProductName  = Payload.strProductName;
        Message.strDeviceID     = Payload.strDeviceID;
        Message.strBridge       = strBridgePrefix;

        Common.conLog("HTTP: Request for creating a device " + Message.strDeviceID, "yel");

        MQTTClient.publish("server/device/create", JSON.stringify(Message));
        Data.strStatus        = "ok";
      }
    }
    catch (Error) {
      Data.strStatus = "error";
      Data.strError  = "Fatal error: " + (Error.stack).slice(0, 128);
    }
      
    Common.conLog("HTTP response: " + JSON.stringify(Data), "std", false);
    Response.json(Data);
  });

  /*
    If call is for sending values of a device to the server
  */
  Router.post("/message", async function (Request, Response) {
    const Payload       = Request.body;
    let Message         = new Object(); // create new object for MQTT message
    let Data            = new Object(); // create new object for HTTP response

    try {
      if (Payload === undefined) { // if no payload is given, send error message
        Data.strStatus        = "error";
        Data.strErrorMessage  = "No payload given";
      }
      else {// if payload exists, check if device is in array of connected devices
        const Device = DeviceSearchInArray(Payload.strDeviceID, BridgeStatus.arrDevicesConnected);  
        if (Device) { // if device is in array of connected devices, build message and send it to MQTT broker
          Common.conLog("HTTP: Device " + Payload.strDeviceID + " is connected - trying to get and convert data", "yel");

          Message.strProductName  = Payload.strProductName;
          Message.strDeviceID     = Payload.strDeviceID;
          Message.strBridge       = strBridgePrefix;
          Message.Values          = Payload.Values;

          Common.conLog("HTTP: Request for sending values of device " + Message.strDeviceID, "yel", false);

          MQTTClient.publish("http/device/get", JSON.stringify(Message)); // ... publish to MQTT broker
          Data.strStatus        = "ok";
        }
        else { // if device is not in array of connected devices, send error message
          Common.conLog("HTTP: Device is not connected or registered at server", "red");
          Data.strStatus        = "error";
          Data.strErrorMessage  = "Device " + Payload.strDeviceID + " is not registered at server";
        }
      }
    }
    catch (Error) {
      Data.strStatus = "error";
      Data.strError  = "Fatal error: " + (Error.stack).slice(0, 128);
    }
      
    Common.conLog("HTTP response: " + JSON.stringify(Data), "std", false);
    Response.json(Data);
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
      const Message = JSON.parse(strMessage); // parse message to JSON

      switch (strTopic) {
        case "http/device/create":
          MQTTDeviceCreate(Message);
          break;
        case "http/device/remove":
          MQTTDeviceRemove(Message);
          break;
        case "http/device/get":
          MQTTDeviceGet(Message);
          break;
        case "http/devices/connect":
          MQTTDeviceConnect(Message);
          break;
        default:
          Common.conLog("HTTP: NOT found matching message handler for " + strTopic, "red");
      }
    }
    catch (Error) { // if error while parsing message, log error
      Common.conLog("MQTT: Error while parsing message:", "red");     
      Common.conLog(Error, "std", false);
    }  
  });


  /*
    If message is for adding devices (this message ist sent AFTER server created device)
  */
  function MQTTDeviceCreate(Data) {
    // TODO: zu arrays hinzufügen

  }

  /*
    If message is for removing devices (this message ist sent AFTER server removed device)
  */
  function MQTTDeviceRemove(Data) {
    // TODO: aus arrays löschen

  }

  /*
    If message is for connecting to registered devices, add them list of connected devices
  */
  function MQTTDeviceConnect(Data) {
    // because HTTP bridge is not a real bridge, connected devices are the same as registered devices
    BridgeStatus.arrDevicesRegisteredAtServer   = Data.arrDevices; // save all devices registered at server in array
    BridgeStatus.arrDevicesConnected            = Data.arrDevices; // save all devices connected in array 

    for (let Device of BridgeStatus.arrDevicesConnected) { // for each device in array of connected devices
      Device.DeviceConverter = ConvertersList.find(Device.strProductName); // get converter for device from list of converters

      if (Device.DeviceConverter === undefined) { 
        Common.conLog("HTTP: No converter found for " + Device.strProductName, "red");
      }
      else {
        Common.conLog("HTTP: Converter found for " + Device.strProductName, "gre");
      }
    }

    Common.conLog("HTTP: Connected to devices", "gre");
  }

  /*
    If message is for getting properties and values of a connected device
  */
  function MQTTDeviceGet(Data) {
    let Message                      = new Object();
    Message.strDeviceID              = Data.strDeviceID;
    Message.arrPropertiesAndValues   = new Array();

    const Device = DeviceSearchInArray(Message.strDeviceID, BridgeStatus.arrDevicesConnected);  
    if (Device) { // if device is in array of connected devices, convert values
      for (const [strProperty, anyValue] of Object.entries(Data.Values)) { // for each value key in data      
        let PropertyAndValue      = new Object();
        PropertyAndValue[strProperty]  = Device.DeviceConverter.getConvertedValueForProperty(strProperty, anyValue);
        Message.arrPropertiesAndValues.push(PropertyAndValue); // add property to array of properties for return
      }
    }
    else { // if device is not in array of connected devices, send error message
      Common.conLog("HTTP: Device is not connected or registered at server", "red");
    }

    MQTTClient.publish("http/device/values", JSON.stringify(Message)); // ... publish to MQTT broker
  }
}

startBridgeAndServer();

process.on("SIGINT", function () {
    Common.conLog("Server closed.", "mag", true);
    process.exit(0);
});