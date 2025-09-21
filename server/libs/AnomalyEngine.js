/**
 * =============================================================================================
 * Anomaly Engine - Anomaly detection using Isolation Forest
 * =======================================================
 */

const appConfig = require("../../config");

const { IsolationForest } = require("isolation-forest");

class AnomalyEngine {
  constructor() {

  }

  /**
   * Anomaly detection
   * @param {Object} data
   * @description This function checks for anomalies in the data properties using the Isolation Forest algorithm.
   */
  check(data) { // TODO: convert to cron job
    const propertyKeys = data.properties.map(property => Object.keys(property)[0]);
    propertyKeys.forEach((property, index) => { // iterate over each property
      const results = database.prepare( // prepare SQL query to get historical data
        "SELECT valueAsNumeric FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? AND property = ? ORDER BY dateTimeAsNumeric DESC LIMIT ?"
      ).all(data.deviceID, data.bridge, property, appConfig.CONF_anomalyDetectionHistorySize);

      if (!results || results.length < 2) { // not enough data for anomaly detection
        return;
      }

      const values = results.map(result => { return { [property]: result.valueAsNumeric }} ); // map results to values  
      const model = new IsolationForest();

      model.fit(values.slice(1)); // Cut first entry of data, because if it is already in dataset then it will not be considered as anomaly
      const trainingScores = model.scores();
      const latestScore    = model.predict([{ [property]: values[0][property] }])[0]; // get score of latest entry
      if (latestScore > appConfig.CONF_anomalyDetectionThreshold) {
        common.conLog("Server: Anomaly detected for property " + property + " with score " + latestScore, "gre");
        let message         = {};
        message.deviceID    = data.deviceID;
        message.bridge      = data.bridge;
        message.property    = property;
        message.score       = latestScore;
        mqttClient.publish("server/devices/anomaly", JSON.stringify(message));
      }
    });
  }
}

module.exports = AnomalyEngine;
