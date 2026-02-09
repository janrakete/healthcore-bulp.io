/**
 * =============================================================================================
 * Config wrappers
 * ===============
 */

const dotenv = require("dotenv");
dotenv.config({path: "../.env"});
dotenv.config({path: "../.env.local", override: true});

const appConfig = {
  CONF_bridges                                   : process.env.CONF_bridges.split(","),
  CONF_portBroker                                : parseInt(process.env.CONF_portBroker),
  CONF_portServer                                : parseInt(process.env.CONF_portServer),
  CONF_portBridgeZigBee                          : parseInt(process.env.CONF_portBridgeZigBee),
  CONF_portBridgeHTTP                            : parseInt(process.env.CONF_portBridgeHTTP),
  CONF_portBridgeBluetooth                       : parseInt(process.env.CONF_portBridgeBluetooth),
  CONF_portBridgeLoRa                            : parseInt(process.env.CONF_portBridgeLoRa),
  CONF_portBridgeThread                          : parseInt(process.env.CONF_portBridgeThread),
  CONF_brokerAddress                             : process.env.CONF_brokerAddress,
  CONF_brokerUsername                            : process.env.CONF_brokerUsername,
  CONF_brokerPassword                            : process.env.CONF_brokerPassword,
  CONF_dbPort                                    : parseInt(process.env.CONF_dbPort),
  CONF_corsURL                                   : process.env.CONF_corsURL.split(",").map(url => url.trim()),
  CONF_serverID                                  : process.env.CONF_serverID,
  CONF_serverVersion                             : process.env.CONF_serverVersion,
  CONF_zigBeeAdapterPort                         : process.env.CONF_zigBeeAdapterPort,
  CONF_zigBeeAdapterName                         : process.env.CONF_zigBeeAdapterName,
  CONF_loRaAdapterPath                           : process.env.CONF_loRaAdapterPath,
  CONF_loRaAdapterBaudRate                       : parseInt(process.env.CONF_loRaAdapterBaudRate),
  CONF_loRaAdapterFRE                            : process.env.CONF_loRaAdapterFRE,
  CONF_loRaAdapterSF                             : process.env.CONF_loRaAdapterSF,
  CONF_loRaAdapterBW                             : process.env.CONF_loRaAdapterBW,
  CONF_loRaAdapterPOWER                          : process.env.CONF_loRaAdapterPOWER,
  CONF_loRaAdapterCRC                            : process.env.CONF_loRaAdapterCRC,
  CONF_loRaAdapterRXMOD                          : process.env.CONF_loRaAdapterRXMOD,
  CONF_portHealthcheck                           : parseInt(process.env.CONF_portHealthcheck),
  CONF_baseURL                                   : process.env.CONF_baseURL,
  CONF_scanTimeDefaultSeconds                    : parseInt(process.env.CONF_scanTimeDefaultSeconds),
  CONF_databaseFilename                          : process.env.CONF_databaseFilename,
  CONF_anomalyDetectionThreshold                 : parseFloat(process.env.CONF_anomalyDetectionThreshold),
  CONF_anomalyDetectionHistorySize               : parseInt(process.env.CONF_anomalyDetectionHistorySize),
  CONF_anomalyDetectionActive                    : process.env.CONF_anomalyDetectionActive,
  CONF_tablesAllowedForAPI                       : process.env.CONF_tablesAllowedForAPI.split(",").map(table => table.trim()),
  CONF_tablesMaxEntriesReturned                  : parseInt(process.env.CONF_tablesMaxEntriesReturned),
  CONF_apiCallTimeoutMilliseconds                : parseInt(process.env.CONF_apiCallTimeoutMilliseconds),
  CONF_scenarioCooldownMilliseconds              : parseInt(process.env.CONF_scenarioCooldownMilliseconds),
  CONF_zigBeeReportingTimeout                    : parseInt(process.env.CONF_zigBeeReportingTimeout),
  CONF_serverIDBonjour                           : process.env.CONF_serverIDBonjour,
  CONF_apiKey                                    : process.env.CONF_apiKey,
  CONF_tlsPath                                   : process.env.CONF_tlsPath,
  CONF_tlsRejectUnauthorized                     : process.env.CONF_tlsRejectUnauthorized,
  CONF_pushFirebaseKeyPath                       : process.env.CONF_pushFirebaseKeyPath,
  CONF_devicesBluetoothReconnectMaxAttempts      : parseInt(process.env.CONF_devicesBluetoothReconnectMaxAttempts),
  CONF_devicesBluetoothReconnectScanTime         : parseInt(process.env.CONF_devicesBluetoothReconnectScanTime),
  CONF_devicesBluetoothWatchdogIntervalSeconds   : parseInt(process.env.CONF_devicesBluetoothWatchdogIntervalSeconds),
  CONF_devicesBluetoothWatchdogTimeoutSeconds    : parseInt(process.env.CONF_devicesBluetoothWatchdogTimeoutSeconds),
  CONF_devicesBluetoothBatteryThresholdPercent   : parseInt(process.env.CONF_devicesBluetoothBatteryThresholdPercent),
  CONF_devicesBluetoothBatteryAlertCooldownHours : parseInt(process.env.CONF_devicesBluetoothBatteryAlertCooldownHours),
  CONF_devicesBluetoothRSSIMonIntervalSeconds    : parseInt(process.env.CONF_devicesBluetoothRSSIMonIntervalSeconds),
  CONF_bridgesWaitShutdownSeconds                : parseInt(process.env.CONF_bridgesWaitShutdownSeconds)
};

module.exports = appConfig;