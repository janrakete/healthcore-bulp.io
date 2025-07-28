/**
 * =============================================================================================
 * Routes for Devices
 * ==================
 */
const appConfig     = require("../../config");
const router        = require("express").Router();

/**
 * POST request to scan for devices. This route is used to initiate a scan for devices connected to a specific bridge.
 * @route POST /devices/scan
 * @param {Object} request - The request object containing the payload with bridge information and optional duration for the scan.
 * @param {Object} response - The response object to send back the status of the scan
 * @returns {Object} - Returns a JSON object with the status of the scan request.
 * @description This route expects a JSON payload in the request body with the following structure:
 * {
 *   "bridge": "bluetooth",
 *   "duration": 30 // optional, default is 30 seconds
 * }
 */
router.post("/scan", async function (request, response) {
   const payload  = request.body;
   let data       = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            data.status = "ok";
            const bridge = payload.bridge;

            let message         = {};
            message.duration    = (payload.duration !== undefined) ? payload.duration : appConfig.CONF_scanTimeDefaultSeconds;
            mqttClient.publish(bridge + "/devices/scan", JSON.stringify(message)); // ... publish to MQTT broker
            
            common.conLog("POST request for device scan forwarded via MQTT", "gre");
        }
        else {
            data.status = "error";
            data.error  = "No bridge provided";
        }
    }
    else {
        data.status = "error";
        data.error  = "No payload provided";
    }

    if (data.status === "error") {
        common.conLog("POST request for device scan: an error occured", "red");
    }

    common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
    return response.json(data);
});

/**

 */
router.post("/scan/info", async function (request, response) {
   const payload  = request.body;
   let data       = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            const duration      = (payload.duration !== undefined) ? payload.duration : appConfig.CONF_scanTimeDefaultSeconds;
            const statement     = "SELECT * FROM mqtt_history WHERE topic=" + mysqlConnection.escape(payload.bridge + "/devices/discovered") +
                               " AND dateTime >= NOW() - INTERVAL " + duration + " SECOND"; 
            const result        = await MySQLConnection.query(statement);

            console.log("Devices scan info: " + JSON.stringify(result));
            
            data.status = "ok";
            common.conLog("POST request for device scan info", "gre");
        }
        else {
            data.status = "error";
            data.error  = "No bridge provided";
        }
    }
    else {
        data.status = "error";
        data.error  = "No payload provided";
    }

    if (data.status === "error") {
        common.conLog("POST request for device scan info: an error occured", "red");
    }

    common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
    return response.json(data);
});

module.exports = router;