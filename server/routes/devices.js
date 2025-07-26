/**
 * =============================================================================================
 * Routes for Devices
 * ==================
 */
const appConfig     = require("../../config");
const router        = require("express").Router();
const mqttClient    = global.mqttClient;

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

            let message      = {};
            message.duration = (payload.duration !== undefined) ? payload.duration : 30; // default duration is 30 seconds
            mqttClient.publish(bridge + "/devices/scan", JSON.stringify(message)); // ... publish to MQTT broker
            Common.conLog("Request for device scan forwarded via MQTT", "gre");
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
        Common.conLog("POST request (scan): an error occured", "red");
    }    

    Common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
    return response.json(data);
});

 module.exports = router;