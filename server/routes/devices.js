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
 * @swagger
 *   /devices/{bridge}/{deviceID}/connect:
 *     post:
 *       summary: Connect a device via ID
 *       description: This endpoint allows you to connect a device using its ID.
 *       tags:
 *         - Devices
 *       parameters:
 *         - in: path
 *           name: bridge
 *           required: true
 *           description: The name of the bridge.
 *           schema:
 *             type: string
 *             example: bluetooth
 *         - in: path
 *           name: deviceID
 *           required: true
 *           description: The ID of the device.
 *           schema:
 *             type: string
 *             example: 12345
 *       responses:
 *         "200":
 *           description: Successfully initiated device connection.
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
router.post("/:bridge/:deviceID/connect", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.deviceID     = request.params.deviceID;

    let data       = {};
    let message    = {};

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
        /*else if ((payload.productName !== undefined) && (payload.productName.trim() !== "")) { // else if productName is provided
            data.status         = "ok";
            message.productName = payload.productName.trim();
            message.callID      = common.randomHash(); // create a unique call ID to identify the request

            data.callID         = message.callID; // return the call ID also in the response

            mqttClient.publish(bridge + "/devices/connect", JSON.stringify(message)); // ... publish to MQTT broker
            common.conLog("POST request for device connect via product name " + message.productName + " forwarded via MQTT", "gre");

            mqttPendingResponsesHandler(data, response);                
        }*/
        else {
            data.status = "error";
            data.error  = "No ID or product name provided";
        }
    }
    else {
        data.status = "error";
        data.error  = "No bridge provided";
    }


    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        common.conLog("POST request for device connect: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});

/**
 * @swagger
 *   /devices/{bridge}/{deviceID}/disconnect:
 *     post:
 *       summary: Disconnect a device
 *       description: This endpoint allows you to disconnect a device using its ID.
 *       tags:
 *         - Devices
 *       parameters:
 *         - in: path
 *           name: bridge
 *           required: true
 *           description: The name of the bridge.
 *           schema:
 *             type: string
 *             example: bluetooth
 *         - in: path
 *           name: deviceID
 *           required: true
 *           description: The ID of the device.
 *           schema:
 *             type: string
 *             example: 12345
 *       responses:
 *         "200":
 *           description: Device disconnected successfully
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
router.post("/:bridge/:deviceID/disconnect", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.deviceID     = request.params.deviceID;

    let data       = {};
    let message    = {};

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

    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        common.conLog("POST request for device disconnect: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});

/**
 * @swagger
 *  /devices/{bridge}/{deviceID}:
 *    delete:
 *      summary: Remove a device
 *      description: This endpoint removes a device from the system.
 *      tags:
 *        - Devices
 *      parameters:
 *        - in: path
 *          name: bridge
 *          required: true
 *          description: The name of the bridge.
 *          schema:
 *            type: string
 *            example: bluetooth
 *        - in: path
 *          name: deviceID
 *          required: true
 *          description: The ID of the device.
 *          schema:
 *            type: string
 *            example: 12345
 *      responses:
 *        "200":
 *          description: Device removed successfully
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  status:
 *                    type: string
 *                    example: "ok"
 *                  callID:
 *                    type: string
 *                    example: "In58F8lxhMEe6a4G"
 *        "400":
 *          description: Bad request. The request was invalid or cannot be served.
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  status:
 *                    type: string
 *                    example: "error"
 *                  error:
 *                    type: string
 *                    example: "Error message"
 */
router.delete("/:bridge/:deviceID", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.deviceID     = request.params.deviceID;
    
    let data       = {};
    let message    = {};

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

    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        common.conLog("DELETE request for device remove: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});

/**
 * @swagger
 *  /devices/{bridge}/{deviceID}:
 *    patch:
 *      summary: Update a device
 *      description: This endpoint updates the information of a device. You can update the name, description, or other properties of the device (you can get all properties with a GET request on table "devices", see "Data manipulation").
 *      tags:
 *        - Devices
 *      parameters:
 *        - in: path
 *          name: bridge
 *          required: true
 *          description: The name of the bridge.
 *          schema:
 *            type: string
 *            example: bluetooth
 *        - in: path
 *          name: deviceID
 *          required: true
 *          description: The ID of the device.
 *          schema:
 *            type: string
 *            example: 12345
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                name:
 *                  type: string
 *                  example: "New Device Name"
 *                description:
 *                  type: string
 *                  example: "New Device Description"
 *      responses:
 *        "200":
 *          description: Device updated successfully
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  status:
 *                    type: string
 *                    example: "ok"
 *                  callID:
 *                    type: string
 *                    example: "In58F8lxhMEe6a4G"
 *        "400":
 *          description: Bad request. The request was invalid or cannot be served.
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  status:
 *                    type: string
 *                    example: "error"
 *                  error:
 *                    type: string
 *                    example: "Error message"
 */
router.patch("/:bridge/:deviceID", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.deviceID     = request.params.deviceID;
    payload.body         = request.body;

    let data       = {};
    let message    = {};

    if ((payload.body !== undefined) && (Object.keys(payload.body).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();

            if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) { // check if deviceID is provided
                message.deviceID    = payload.deviceID.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request

                data.callID         = message.callID; // return the call ID also in the response

                mqttClient.publish(bridge + "/devices/update", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("PATCH request for device update via ID " + message.deviceID + " forwarded via MQTT", "gre");

                // build update payload for database
                const fields        = Object.keys(payload.body);
                const placeholders  = fields.map(field => field + " = ?").join(", ");
                const values        = Object.values(payload.body);

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
 * @swagger
 * /devices/{bridge}/{deviceID}/values:
 *   get:
 *     summary: Get current device values
 *     description: This endpoint retrieves the current values of a connected device.
 *     tags:
 *       - Devices
 *     parameters:
 *       - in: path
 *         name: bridge
 *         required: true
 *         description: The name of the bridge.
 *         schema:
 *           type: string
 *           example: bluetooth
 *       - in: path
 *         name: deviceID
 *         required: true
 *         description: The ID of the device.
 *         schema:
 *           type: string
 *           example: 12345
 *     responses:
 *       "200":
 *         description: Successfully retrieved device values.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 callID:
 *                   type: string
 *                   example: "In58F8lxhMEe6a4G"
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 data:
 *                   type: object
 *                   properties:
 *                     bridge:
 *                       type: string
 *                       example: "bluetooth"
 *                     deviceID:
 *                       type: string
 *                       example: "12345"
 *                     propertiesAndValues:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *                       example: [{ "rotary_switch": { "value": 4, "valueAsNumeric": 4 }}, {"button": { "value": "pressed", "valueAsNumeric": 1 }}]
 *       "400":
 *         description: Bad request. The request was invalid or cannot be served.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 error:
 *                   type: string
 *                   example: "Error message"
 */
router.get("/:bridge/:deviceID/values", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.deviceID     = request.params.deviceID;

    let data       = {};
    let message    = {};

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


    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        common.conLog("GET request for device values: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});

/**
 * @swagger
 * /devices/{bridge}/{deviceID}/values:
 *   post:
 *     summary: Set device values
 *     description: This endpoint sets new values for a connected device.
 *     tags:
 *       - Devices
 *     parameters:
 *       - in: path
 *         name: bridge
 *         required: true
 *         description: The name of the bridge.
 *         schema:
 *           type: string
 *           example: bluetooth
 *       - in: path
 *         name: deviceID
 *         required: true
 *         description: The ID of the device.
 *         schema:
 *           type: string
 *           example: 12345
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example: [{"light": "middle", "speaker": "on"}]
 *     responses:
 *       "200":
 *         description: Successfully set device values.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 callID:
 *                   type: string
 *                   example: "In58F8lxhMEe6a4G"
 *       "400":
 *         description: Bad request. The request was invalid or cannot be served.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 error:
 *                   type: string
 *                   example: "Error message"
 */
router.post("/:bridge/:deviceID/values", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.deviceID     = request.params.deviceID;
    payload.body         = request.body;

    let data       = {};
    let message    = {};

    if ((payload.body !== undefined) && (Object.keys(payload.body).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();

            if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) { // check if deviceID is provided
                message.deviceID    = payload.deviceID.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request
                message.properties  = payload.body;

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