/**
 * =============================================================================================
 * Config wrappers
 * ===============
 */

const dotenv = require("dotenv");
const path   = require("path");

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, ".env.local"), override: true });

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toFloat(value) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toBool(value, defaultValue = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

const appConfig = {
  CONF_bridges                                        : (process.env.CONF_bridges || "").split(",").filter(Boolean),
  CONF_portBroker                                     : toInt(process.env.CONF_portBroker),
  CONF_portServer                                     : toInt(process.env.CONF_portServer),
  CONF_portBridgeZigBee                               : toInt(process.env.CONF_portBridgeZigBee),
  CONF_portBridgeHTTP                                 : toInt(process.env.CONF_portBridgeHTTP),
  CONF_portBridgeBluetooth                            : toInt(process.env.CONF_portBridgeBluetooth),
  CONF_portBridgeLoRa                                 : toInt(process.env.CONF_portBridgeLoRa),
  CONF_portBridgeThread                               : toInt(process.env.CONF_portBridgeThread),
  CONF_brokerAddress                                  : process.env.CONF_brokerAddress,
  CONF_brokerUsername                                 : process.env.CONF_brokerUsername,
  CONF_brokerPassword                                 : process.env.CONF_brokerPassword,
  CONF_dbPort                                         : toInt(process.env.CONF_dbPort),
  CONF_corsURL                                        : (process.env.CONF_corsURL || "").split(",").map(url => url.trim()).filter(Boolean),
  CONF_serverID                                       : process.env.CONF_serverID,
  CONF_serverVersion                                  : process.env.CONF_serverVersion,
  CONF_zigBeeAdapterPort                              : process.env.CONF_zigBeeAdapterPort,
  CONF_zigBeeAdapterName                              : process.env.CONF_zigBeeAdapterName,
  CONF_loRaAdapterPath                                : process.env.CONF_loRaAdapterPath,
  CONF_loRaAdapterBaudRate                            : toInt(process.env.CONF_loRaAdapterBaudRate),
  CONF_loRaAdapterFRE                                 : process.env.CONF_loRaAdapterFRE,
  CONF_loRaAdapterSF                                  : process.env.CONF_loRaAdapterSF,
  CONF_loRaAdapterBW                                  : process.env.CONF_loRaAdapterBW,
  CONF_loRaAdapterPOWER                               : process.env.CONF_loRaAdapterPOWER,
  CONF_loRaAdapterCRC                                 : process.env.CONF_loRaAdapterCRC,
  CONF_loRaAdapterRXMOD                               : process.env.CONF_loRaAdapterRXMOD,
  CONF_portHealthcheck                                : toInt(process.env.CONF_portHealthcheck),
  CONF_baseURL                                        : process.env.CONF_baseURL,
  CONF_scanTimeDefaultSeconds                         : toInt(process.env.CONF_scanTimeDefaultSeconds),
  CONF_databaseFilename                               : process.env.CONF_databaseFilename,
  CONF_careInsightsActive                             : toBool(process.env.CONF_careInsightsActive, true),
  CONF_careInsightsAnomalyThreshold                   : toFloat(process.env.CONF_careInsightsAnomalyThreshold),
  CONF_careInsightsHistorySize                        : toInt(process.env.CONF_careInsightsHistorySize),
  CONF_careInsightsMaxSignalsPerInsight               : toInt(process.env.CONF_careInsightsMaxSignalsPerInsight),
  CONF_tablesAllowedForAPI                            : (process.env.CONF_tablesAllowedForAPI || "").split(",").map(table => table.trim()).filter(Boolean),
  CONF_tablesMaxEntriesReturned                       : toInt(process.env.CONF_tablesMaxEntriesReturned),
  CONF_apiCallTimeoutMilliseconds                     : toInt(process.env.CONF_apiCallTimeoutMilliseconds),
  CONF_scenarioCooldownMilliseconds                   : toInt(process.env.CONF_scenarioCooldownMilliseconds),
  CONF_zigBeeReportingTimeout                         : toInt(process.env.CONF_zigBeeReportingTimeout),
  CONF_serverIDBonjour                                : process.env.CONF_serverIDBonjour,
  CONF_apiKey                                         : process.env.CONF_apiKey,
  CONF_tlsPath                                        : process.env.CONF_tlsPath,
  CONF_tlsRejectUnauthorized                          : toBool(process.env.CONF_tlsRejectUnauthorized, true),
  CONF_pushFirebaseKeyPath                            : process.env.CONF_pushFirebaseKeyPath,
  CONF_devicesBluetoothMaintenanceIntervalSeconds     : toInt(process.env.CONF_devicesBluetoothMaintenanceIntervalSeconds),
  CONF_devicesBluetoothMaintenanceScanDurationSeconds : toInt(process.env.CONF_devicesBluetoothMaintenanceScanDurationSeconds),
  CONF_devicesBluetoothWatchdogTimeoutSeconds         : toInt(process.env.CONF_devicesBluetoothWatchdogTimeoutSeconds),
  CONF_devicesBluetoothBatteryThresholdPercent        : toInt(process.env.CONF_devicesBluetoothBatteryThresholdPercent),
  CONF_devicesBluetoothBatteryAlertCooldownHours      : toInt(process.env.CONF_devicesBluetoothBatteryAlertCooldownHours),
  CONF_bridgesWaitShutdownSeconds                     : toInt(process.env.CONF_bridgesWaitShutdownSeconds),
  CONF_loRaAdapterReconnectIntervalSeconds            : toInt(process.env.CONF_loRaAdapterReconnectIntervalSeconds),
  CONF_devicesZigBeeAdapterReconnectBaseDelaySeconds  : toInt(process.env.CONF_devicesZigBeeAdapterReconnectBaseDelaySeconds),
  CONF_devicesZigBeeAdapterReconnectMaxDelaySeconds   : toInt(process.env.CONF_devicesZigBeeAdapterReconnectMaxDelaySeconds),
  CONF_devicesZigBeeWatchdogTimeoutSeconds            : toInt(process.env.CONF_devicesZigBeeWatchdogTimeoutSeconds),
  CONF_devicesZigBeeMaintenanceIntervalSeconds        : toInt(process.env.CONF_devicesZigBeeMaintenanceIntervalSeconds),
  CONF_devicesZigBeeBatteryThresholdPercent           : toInt(process.env.CONF_devicesZigBeeBatteryThresholdPercent),
  CONF_devicesZigBeeBatteryAlertCooldownHours         : toInt(process.env.CONF_devicesZigBeeBatteryAlertCooldownHours),
  CONF_healthcheckMaxLogs                             : toInt(process.env.CONF_healthcheckMaxLogs)
};

module.exports = appConfig;