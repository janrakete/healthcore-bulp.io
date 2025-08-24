/**
 * =============================================================================================
 * Routes for Devices
 * ==================
 */
const appConfig     = require("../../config");
const router        = require("express").Router();

/**
 * =============================================================================================
 * Helper functions
 * ================
 */

/**
 * MQTT Pending Responses Handler
 * @param {Object} data 
 * @param {Object} response 
 * @returns {void}
 * @description This function handles pending MQTT responses by setting a timeout for the response and storing the callback in a map.
 */
function mqttPendingResponsesHandler(data, response) {
    const responseTimeout = setTimeout(() => {
        delete mqttPendingResponses[data.callID];
        data.status = "error";
        data.error  = "No response from broker in " + appConfig.CONF_apiCallTimeoutMilliseconds + "ms";

        common.conLog("Waited for MQTT response, but timed out", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.json(data);
    }, appConfig.CONF_apiCallTimeoutMilliseconds);

    mqttPendingResponses[data.callID] = (message) => {
        data.status         = "ok";
        data.data        = message;

        clearTimeout(responseTimeout);
        common.conLog("Received MQTT respons in time", "gre");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.json(data);
    };
}

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
            message.callID      = common.randomHash(); // create a unique call ID to identify the request

            data.callID         = message.callID; // return the call ID in the response

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
router.get("/scan/info", async function (request, response) {
   const payload  = request.body;
   let data       = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            if (payload.callID !== undefined) {
                const statement     = "SELECT * FROM mqtt_history WHERE topic = ? AND callID = ? ORDER BY dateTime DESC"; 
                const results       = await database.prepare(statement).all("server/devices/discovered", payload.callID); // ... query the database for discovered devices

                data.devices = results.map(row => JSON.parse(row.message));

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
                data.error  = "No call ID provided";
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
 *   "name": "My device"   // optional, either deviceID or name must be provided
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

            if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) { // check if deviceID is provided
                message.deviceID    = payload.deviceID.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request

                data.callID         = message.callID; // return the call ID also in the response

                mqttClient.publish(bridge + "/device/connect", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for device connect via ID " + message.deviceID + " forwarded via MQTT", "gre");

                mqttPendingResponsesHandler(data, response);
            }
            else if ((payload.productName !== undefined) && (payload.productName.trim() !== "")) { // else if productName is provided
                data.status         = "ok";
                message.productName = payload.productName.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request

                data.callID         = message.callID; // return the call ID also in the response

                mqttClient.publish(bridge + "/device/connect", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for device connect via product name " + message.productName + " forwarded via MQTT", "gre");

                mqttPendingResponsesHandler(data, response);                
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

    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        common.conLog("POST request for device connect: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.json(data);
    }  
});

/**
 * DELETE request to remove a device
 * @route DELETE /devices
 * @param {Object} request - The request object containing the payload with device information.
 * @param {Object} response - The response object to send back the connection status.
 * @returns {Object} - Returns a JSON object with the status of the connection attempt.
 * @description This route expects a JSON payload in the request body with the following structure:
 * {
 *   "bridge": "bluetooth",
 *   "deviceID": "12345"
 * }
 */
router.delete("/", async function (request, response) {
    const payload  = request.body;
    let data       = {};
    let message    = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();

            if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) { // check if deviceID is provided
                message.deviceID    = payload.deviceID.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request

                data.callID         = message.callID; // return the call ID also in the response

                mqttClient.publish(bridge + "/device/remove", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("DELETE request for device remove via ID " + message.deviceID + " forwarded via MQTT", "gre");

                await database.prepare("DELETE FROM devices WHERE deviceID = ? AND bridge = ? LIMIT 1").run(message.deviceID, bridge);

                mqttPendingResponsesHandler(data, response);
            }
            else {
                data.status = "error";
                data.error  = "No ID provided";
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

    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        common.conLog("DELETE request for device remove: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.json(data);
    }
});

/**
 * PATCH request for updating a devices information
 * @route PATCH /devices
 * @param {Object} request - The request object containing the payload with device information.
 * @param {Object} response - The response object to send back the connection status.
 * @returns {Object} - Returns a JSON object with the status of the connection attempt.
 * @description This route expects a JSON payload in the request body with the following structure:
 * {
 *   "name": "New device name",
 *   "description": "New description",
 *   ...
 * }
 */
router.patch("/", async function (request, response) {
    const payload  = request.body;
    let data       = {};
    let message    = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();

            if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) { // check if deviceID is provided
                message.deviceID    = payload.deviceID.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request

                data.callID         = message.callID; // return the call ID also in the response

                mqttClient.publish(bridge + "/device/update", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("PATCH request for device update via ID " + message.deviceID + " forwarded via MQTT", "gre");

                // build update payload for database
                delete payload.callID;
                delete payload.bridge;
                delete payload.deviceID;

                const fields        = Object.keys(payload);
                const placeholders  = fields.map(field => field + " = ?").join(", ");
                const values        = Object.values(payload);

                await database.prepare("UPDATE devices SET " + placeholders + " WHERE deviceID = ? AND bridge = ? LIMIT 1").run(values, message.deviceID, bridge);

                mqttPendingResponsesHandler(data, response);
            }
            else {
                data.status = "error";
                data.error  = "No ID provided";
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

    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        common.conLog("PATCH request for device update: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.json(data);
    }
});

module.exports = router;