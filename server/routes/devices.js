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
        return response.status(400).json(data);
    }, appConfig.CONF_apiCallTimeoutMilliseconds);

    mqttPendingResponses[data.callID] = (message) => {
        data.status         = "ok";
        data.data        = message;

        clearTimeout(responseTimeout);
        common.conLog("Received MQTT respons in time", "gre");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(200).json(data);
    };
}

/**
 * @swagger
 *   /devices/scan:
 *     post:
 *       summary: Scan for devices
 *       description: This endpoint allows you to initiate a scan for devices connected to a specific bridge.
 *       tags:
 *        - Devices
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bridge:
 *                   type: string
 *                   description: The bridge to scan for devices.
 *                   example: "bluetooth"
 *                 duration:
 *                   type: integer
 *                   description: The duration of the scan in seconds.
 *                   example: 30
 *       responses:
 *         "200":
 *           description: Successfully initiated device scan.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *                   callID:
 *                     type: string
 *                     example: "In58F8lxhMEe6a4G"
 *         "400":
 *           description: Bad request. The request was invalid or cannot be served.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "error"
 *                   error:
 *                     type: string
 *                     example: "Error message"
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

    if (data.status === "ok") {
        return response.status(200).json(data);
    } else {
        return response.status(400).json(data);
    }
});

/**
 * @swagger
 *   /devices/scan/info:
 *     post:
 *       summary: Get information about scanned devices
 *       description: This endpoint allows you to retrieve information about devices that were discovered during a scan.
 *       tags:
 *         - Devices
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 callID:
 *                   type: string
 *                   description: The unique call ID.
 *                   example: "In58F8lxhMEe6a4G"
 *       responses:
 *         "200":
 *           description: Successfully retrieved device scan information.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *                   devices:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         deviceID:
 *                           type: string
 *                           example: "12345"
 *                         productName:
 *                           type: string
 *                           example: "Product XYZ"
 *                         bridge:
 *                           type: string
 *                           example: "bluetooth"
 *                         rssi:
 *                           type: integer
 *                           example: -60
 *                         connectable:
 *                           type: boolean
 *                           example: true
 *                         callID: 
 *                           type: string
 *                           example: "In58F8lxhMEe6a4G"
 *         "400":
 *           description: Bad request. The request was invalid or cannot be served.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "error"
 *                   error:
 *                     type: string
 *                     example: "No call ID provided"
 */
router.post("/scan/info", async function (request, response) {
   const payload  = request.body;
   let data       = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
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
        data.error  = "No payload provided";
    }

    if (data.status === "error") {
        common.conLog("POST request for device scan info: an error occured", "red");
    }

    common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);

    if (data.status === "ok") {
        return response.status(200).json(data);
    } else {
        return response.status(400).json(data);
    }
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

                mqttClient.publish(bridge + "/devices/connect", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for device connect via ID " + message.deviceID + " forwarded via MQTT", "gre");

                mqttPendingResponsesHandler(data, response);
            }
            else if ((payload.productName !== undefined) && (payload.productName.trim() !== "")) { // else if productName is provided
                data.status         = "ok";
                message.productName = payload.productName.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request

                data.callID         = message.callID; // return the call ID also in the response

                mqttClient.publish(bridge + "/devices/connect", JSON.stringify(message)); // ... publish to MQTT broker
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
        return response.status(400).json(data);
    }
});

/**
 * POST request to disconnect a device
 * @route POST /devices/disconnect
 * @param {Object} request - The request object containing the payload with device information.
 * @param {Object} response - The response object to send back the disconnection status.
 * @returns {Object} - Returns a JSON object with the status of the disconnection attempt.
 * @description This route expects a JSON payload in the request body with the following structure:
 * {
 *   "bridge": "bluetooth",
 *   "deviceID": "12345"
 * }
 */
router.post("/disconnect", async function (request, response) {
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

                mqttClient.publish(bridge + "/devices/disconnect", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for device disconnect via ID " + message.deviceID + " forwarded via MQTT", "gre");

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
        common.conLog("POST request for device disconnect: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});

/**
 * DELETE request to remove a device
 * @route DELETE /devices
 * @param {Object} request - The request object containing the payload with device information.
 * @param {Object} response - The response object to send back the connection status.
 * @returns {Object} - Returns a JSON object with the status of the removal attempt.
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

                mqttClient.publish(bridge + "/devices/remove", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("DELETE request for device remove via ID " + message.deviceID + " forwarded via MQTT", "gre");

                //await database.prepare("DELETE FROM devices WHERE deviceID = ? AND bridge = ? LIMIT 1").run(message.deviceID, bridge);

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
        return response.status(400).json(data);
    }
});

/**
 * PATCH request for updating a devices information
 * @route PATCH /devices
 * @param {Object} request - The request object containing the payload with device information.
 * @param {Object} response - The response object to send back the connection status.
 * @returns {Object} - Returns a JSON object with the status of the patch attempt.
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

                mqttClient.publish(bridge + "/devices/update", JSON.stringify(message)); // ... publish to MQTT broker
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
        return response.status(400).json(data);
    }
});

/**
 * GET request for retrieving current device values
 * @route GET /devices/values
 * @param {Object} request - The request object containing the payload with device information.
 * @param {Object} response - The response object to send back the connection status.
 * @returns {Object} - Returns a JSON object with current device values.
 * @description This route retrieves the current values of a connected device.
 */
router.get("/values", async function (request, response) {
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

                mqttClient.publish(bridge + "/devices/get", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("GET request for device values via ID " + message.deviceID + " forwarded via MQTT", "gre");

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
        common.conLog("GET request for device values: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});

/**
 * POST request for setting current device values
 * @route POST /devices/values
 * @param {Object} request - The request object containing the payload with device information.
 * @param {Object} response - The response object to send back the connection status.
 * @returns {Object} - Returns a JSON object with current device values.
 * @description This route sets the current values of a connected device.
 */
router.post("/values", async function (request, response) {
    const payload  = request.body;
    let data       = {};
    let message    = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();

            if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) { // check if deviceID is provided
                message.deviceID    = payload.deviceID.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request
                message.properties  = payload.properties;

                data.callID         = message.callID; // return the call ID also in the response

                mqttClient.publish(bridge + "/devices/set", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for setting device values via ID " + message.deviceID + " forwarded via MQTT", "gre");

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
        common.conLog("POST request for setting device values: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});


module.exports = router;