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
            const bridge = payload.bridge.trim();

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
 * POST request to get scan info for devices. This route retrieves information about devices discovered during a scan.
 * @route POST /devices/scan/info
 * @param {Object} request - The request object containing the payload with bridge information and optional duration for the scan.
 * @param {Object} response - The response object to send back the scan information.
 * @returns {Object} - Returns a JSON object with the status and list of discovered devices.
 * @description This route expects a JSON payload in the request body with the following structure:
 * {
 *   "bridge": "bluetooth",
 *   "duration": 30 // optional, default is 30 seconds
 * }
 */
router.post("/scan/info", async function (request, response) {
   const payload  = request.body;
   let data       = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            const duration      = (payload.duration !== undefined) ? payload.duration : appConfig.CONF_scanTimeDefaultSeconds;
            const statement     = "SELECT * FROM mqtt_history WHERE topic = ? AND dateTime >= datetime('now', '-' || ? || ' seconds') ORDER BY dateTime DESC"; 
            const results       = await database.all(statement, ["server/devices/discovered", duration]); // ... query the database for discovered devices

            data.devices = results.map(row => row.message);

            // remove duplicates based on device ID, keep only the first occurrence
            const uniqueDevices = {};
            data.devices.forEach(device => {
                if (device.deviceID && !uniqueDevices[device.deviceID]) {
                    uniqueDevices[device.deviceID] = device;
                }

            });
            data.devices = Object.values(uniqueDevices);

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

/**
 * POST request to connect a device. This route is used to connect a device by its ID or name.
 * @route POST /devices/connect
 * @param {Object} request - The request object containing the payload with device information.
 * @param {Object} response - The response object to send back the connection status.
 * @returns {Object} - Returns a JSON object with the status of the connection attempt.
 * @description This route expects a JSON payload in the request body with the following structure:
 * {
 *   "deviceID": "12345",  // optional, either deviceID or name must be provided
 *   "name": "My Device"   // optional, either deviceID or name must be provided
 *   "bridge": "bluetooth" // must be provided to specify the bridge
 * }
 */
router.post("/connect", async function (request, response) {
    const payload  = request.body;
    let data       = {};
    let message    = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();
            
            if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) {
                data.status      = "ok";
                message.deviceID = payload.deviceID.trim();

                mqttClient.publish(bridge + "/device/connect", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for device connect via ID " + message.deviceID + " forwarded via MQTT", "gre");
            }
            else if ((payload.productName !== undefined) && (payload.productName.trim() !== "")) {
                data.status         = "ok";
                message.productName = payload.productName.trim();

                mqttClient.publish(bridge + "/device/connect", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for device connect via product name " + message.productName + " forwarded via MQTT", "gre");
            }
            else {
                data.status = "error";
                data.error  = "No ID or product name provided";
            }
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
        common.conLog("POST request for device connect: an error occured", "red");
    }

    common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
    return response.json(data);
});








module.exports = router;