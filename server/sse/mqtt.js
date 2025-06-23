/**
 * =============================================================================================
 * MQTT SSE
 * ========
 */
const appConfig = require("../../config");

/**
 * Process incoming MQTT messages - this function is called when a message is received from the MQTT broker
 * @async
 * @function mqttProcessIncomingMessages
 * @param {string} topic - The topic of the incoming MQTT message
 * @param {string} message - The message payload of the incoming MQTT message
 * @description This function processes incoming MQTT messages based on their topic.
 */
async function mqttProcessIncomingMessages(topic, message) {
    try {
        const data = JSON.parse(message); // parse message to JSON

        if (topic === "server/devices/list") {
            let response = {};

            if (data.bridge) {
                const [results] = await mysqlConnection.query("SELECT * FROM devices WHERE bridge='" + data.bridge + "'");
                response.devices = results;

                mqttClient.publish(data.bridge + "/devices/connect", JSON.stringify(response));
            } else {
                Common.conLog("Server: type is missing in message for devices list", "red");
            }
        } else if (topic === "server/device/create") {
            let response = {};
            // TODO: check if device already exists
            mqttClient.publish(data.bridge + "/device/create", JSON.stringify(response)); // ... inform bridge via MQTT that device has been created, maybe bridge has to create it in its list
        } else if (topic === "server/device/remove") {
            let response = {};
            // TODO: check if device already exists
            mqttClient.publish(data.bridge + "/device/remove", JSON.stringify(response)); // ... inform bridge via MQTT that device should be removed, maybe bridge has to remove it from its list
        } else {
            common.conLog("Server: NOT found matching message handler for " + topic, "red");
        }
    } catch (error) { // if error while parsing message, log error
        common.conLog("MQTT: Error while parsing message:", "red");
        common.conLog(error, "std", false);
    }
}

module.exports = { mqttProcessIncomingMessages };