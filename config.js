/**
 * =============================================================================================
 * Config wrappers
 * ===============
 */

const dotenv = require("dotenv");
dotenv.config({path: "../.env"});
dotenv.config({path: "../.env.local", override: true});

const appConfig = {
  CONF_bridges                           : process.env.CONF_bridges.split(","),
  CONF_portBroker                        : parseInt(process.env.CONF_portBroker),
  CONF_portServer                        : parseInt(process.env.CONF_portServer),
  CONF_portBridgeZigBee                  : parseInt(process.env.CONF_portBridgeZigBee),
  CONF_portBridgeHTTP                    : parseInt(process.env.CONF_portBridgeHTTP),
  CONF_portBridgeBluetooth               : parseInt(process.env.CONF_portBridgeBluetooth),
  CONF_portBridgeLoRa                    : parseInt(process.env.CONF_portBridgeLoRa),
  CONF_portBridgeThread                  : parseInt(process.env.CONF_portBridgeThread),
  CONF_brokerAddress                     : process.env.CONF_brokerAddress,
  CONF_dbPort                            : parseInt(process.env.CONF_dbPort),
  CONF_corsURL                           : process.env.CONF_corsURL,
  CONF_serverID                          : process.env.CONF_serverID,
  CONF_serverVersion                     : process.env.CONF_serverVersion,
  CONF_zigBeeAdapterPort                 : process.env.CONF_zigBeeAdapterPort,
  CONF_zigBeeAdapterName                 : process.env.CONF_zigBeeAdapterName,
  CONF_loRaAdapterPath                   : process.env.CONF_loRaAdapterPath,
  CONF_loRaAdapterBaudRate               : parseInt(process.env.CONF_loRaAdapterBaudRate),
  CONF_loRaAdapterFRE                    : process.env.CONF_loRaAdapterFRE,
  CONF_loRaAdapterSF                     : process.env.CONF_loRaAdapterSF,
  CONF_loRaAdapterBW                     : process.env.CONF_loRaAdapterBW,
  CONF_loRaAdapterPOWER                  : process.env.CONF_loRaAdapterPOWER,
  CONF_loRaAdapterCRC                    : process.env.CONF_loRaAdapterCRC,
  CONF_loRaAdapterRXMOD                  : process.env.CONF_loRaAdapterRXMOD,
  CONF_portHealthcheck                   : parseInt(process.env.CONF_portHealthcheck),
  CONF_baseURL                           : process.env.CONF_baseURL,
  CONF_scanTimeDefaultSeconds            : parseInt(process.env.CONF_scanTimeDefaultSeconds),
  CONF_databaseFilename                  : process.env.CONF_databaseFilename,
  CONF_anomalyDetectionThreshold         : parseFloat(process.env.CONF_anomalyDetectionThreshold),
  CONF_anomalyDetectionHistorySize       : parseInt(process.env.CONF_anomalyDetectionHistorySize),
  CONF_anomalyDetectionActive            : process.env.CONF_anomalyDetectionActive,
  CONF_tablesAllowedForAPI               : process.env.CONF_tablesAllowedForAPI.split(","),
  CONF_tablesMaxEntriesReturned          : parseInt(process.env.CONF_tablesMaxEntriesReturned),
  CONF_apiCallTimeoutMilliseconds        : parseInt(process.env.CONF_apiCallTimeoutMilliseconds),
  CONF_scenarioCooldownMilliseconds      : parseInt(process.env.CONF_scenarioCooldownMilliseconds),
  CONF_zigBeeReportingTimeout            : parseInt(process.env.CONF_zigBeeReportingTimeout),
  CONF_serverIDBonjour                   : process.env.CONF_serverIDBonjour,
};

module.exports = appConfig;