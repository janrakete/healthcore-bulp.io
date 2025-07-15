/**
 * =============================================================================================
 * Config wrappers
 * ===============
 */

const dotenv = require("dotenv");
dotenv.config({path: "../.env"});
dotenv.config({path: "../.env.local", override: true});

const appConfig = {
  CONF_portBroker             : process.env.CONF_portBroker,
  CONF_portServer             : process.env.CONF_portServer,
  CONF_portBridgeZigBee       : process.env.CONF_portBridgeZigBee,
  CONF_portBridgeHTTP         : process.env.CONF_portBridgeHTTP,
  CONF_portBridgeBluetooth    : process.env.CONF_portBridgeBluetooth, 
  CONF_portBridgeLoRa         : process.env.CONF_portBridgeLoRa,
  CONF_brokerAddress          : process.env.CONF_brokerAddress,
  CONF_dbHost                 : process.env.CONF_dbHost,
  CONF_dbUser                 : process.env.CONF_dbUser,
  CONF_dbPass                 : process.env.CONF_dbPass,
  CONF_dbName                 : process.env.CONF_dbName,
  CONF_dbPort                 : process.env.CONF_dbPort,  
  CONF_corsURL                : process.env.CONF_corsURL,
  CONF_serverID               : process.env.CONF_serverID,
  CONF_serverVersion          : process.env.CONF_serverVersion,
  CONF_zigBeeAdapterPort      : process.env.CONF_zigBeeAdapterPort,
  CONF_zigBeeAdapterName      : process.env.CONF_zigBeeAdapterName,
  CONF_loRaAdapterPath        : process.env.CONF_loRaAdapterPath,
  CONF_loRaAdapterBaudRate    : process.env.CONF_loRaAdapterBaudRate,
  CONF_loRaAdapterFRE         : process.env.CONF_loRaAdapterFRE,
  CONF_loRaAdapterSF          : process.env.CONF_loRaAdapterSF,
  CONF_loRaAdapterBW          : process.env.CONF_loRaAdapterBW,
  CONF_loRaAdapterPOWER       : process.env.CONF_loRaAdapterPOWER,
  CONF_loRaAdapterCRC         : process.env.CONF_loRaAdapterCRC,
  CONF_loRaAdapterRXMOD       : process.env.CONF_loRaAdapterRXMOD,
  CONF_portHealthcheck        : process.env.CONF_portHealthcheck,
};

module.exports = appConfig;