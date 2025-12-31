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
 * @param {string} callID
 * @param {Object} response
 * @returns {void}
 * @description This function handles pending MQTT responses by setting a timeout for the response and storing the callback in a map.
 */
function mqttPendingResponsesHandler(callID, response) { 
    const data = {};
    
    const responseTimeout = setTimeout(() => {
        delete mqttPendingResponses[callID];
        data.status = "error";
        data.error  = "No response from broker in " + appConfig.CONF_apiCallTimeoutMilliseconds + "ms";

        common.conLog("Waited for MQTT response, but timed out", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }, appConfig.CONF_apiCallTimeoutMilliseconds);

    mqttPendingResponses[callID] = async (message) => {
        data.status = "ok";
        data.data   = message;

        clearTimeout(responseTimeout);
        common.conLog("Received MQTT response in time", "gre");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(200).json(data);
    };
}

/**
 * @swagger
 *  /devices/all:
 *    get:
 *      summary: Get all devices
 *      description: This endpoint retrieves all devices from the system.
 *      tags:
 *        - Devices
 *      responses:
 *        "200":
 *          description: Successfully retrieved all devices.
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  status:
 *                    type: string
 *                    example: "ok"
 *                  data:
 *                    type: object
 *                    properties:
 *                      results:
 *                        type: array
 *                        items:
 *                          type: object
 *                          properties:
 *                            deviceID:
 *                              type: string
 *                              example: "12345"
 *                            productName:
 *                              type: string
 *                              example: "Product XYZ"
 *                            bridge:
 *                              type: string
 *                              example: "bluetooth"
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
router.get("/all", async function (request, response) {
    let data = {};
    try {
        data.status = "ok";
        const statement = "SELECT * FROM devices LIMIT " + appConfig.CONF_tablesMaxEntriesReturned;
        common.conLog("GET Request: access table 'devices'", "gre");
        common.conLog("Execute statement: " + statement, "std", false);

        const results = await database.prepare(statement).all();
        data.results = results;
    }
    catch (error) {
    data.status = "error";
    data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }


    if (data.status === "error") {
        common.conLog("GET Request: an error occured", "red");
    }

    common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
    if (data.status === "ok") {
        return response.status(200).json(data);
    }
    else {
        return response.status(400).json(data);
    }
});

/**
 * @swagger
 *   /devices/{bridge}/scan:
 *     post:
 *       summary: Scan for devices (only Bluetooth and ZigBee)
 *       description: This endpoint allows you to initiate a scan for devices connected to a specific bridge.
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
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
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
 *                   data:
 *                     type: object
 *                     properties:
 *                       callID:
 *                         type: string
 *                         example: "In58F8lxhMEe6a4G"
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
router.post("/:bridge/scan", async function (request, response) {
    const payload  = {};
    payload.bridge = request.params.bridge;
    payload.body   = request.body;

    let data       = {};

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        if (payload.bridge !== undefined) {
            data.status = "ok";
            const bridge = payload.bridge.trim();

            let message         = {};
            message.duration    = (payload.body.duration !== undefined) ? payload.body.duration : appConfig.CONF_scanTimeDefaultSeconds;
            message.callID      = common.randomHash(); // create a unique call ID to identify the request
            message.bridge      = bridge;

            data.data        = {};
            data.data.callID = message.callID; // return the call ID in the response

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
 *   /devices/{bridge}/scan/info:
 *     get:
 *       summary: Get information about scanned devices (only Bluetooth and ZigBee)
 *       description: This endpoint allows you to retrieve information about devices that were discovered during a scan.
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
 *         - in: query
 *           name: callID
 *           required: true
 *           description: The unique call ID.
 *           schema:
 *             type: string
 *             example: "In58F8lxhMEe6a4G"
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
 *                   data:
 *                     type: object
 *                     properties:
 *                       callID:
 *                         type: string
 *                         example: "In58F8lxhMEe6a4G"
 *                       devices:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             deviceID:
 *                               type: string
 *                               example: "12345"
 *                             productName:
 *                               type: string
 *                               example: "Product XYZ"
 *                             bridge:
 *                               type: string
 *                               example: "bluetooth"
 *                             rssi:
 *                               type: integer
 *                               example: -60
 *                             connectable:
 *                               type: boolean
 *                               example: true
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
router.get("/:bridge/scan/info", async function (request, response) {
    const payload  = {};
    payload.callID = request.query.callID;
    let data       = {};

    if (payload.callID !== undefined) {
        const statement     = "SELECT * FROM mqtt_history WHERE topic = ? AND callID = ? ORDER BY dateTime DESC"; 
        const results       = await database.prepare(statement).all("server/devices/discover", payload.callID); // ... query the database for discovered devices

        const devices       = results.map(row => JSON.parse(row.message));

        // remove duplicates based on device ID, keep only the first occurrence and remove callID from the device info
        const uniqueDevices = {};
        devices.forEach(device => {
            delete device.callID;
            if (device.deviceID && !uniqueDevices[device.deviceID]) {
                uniqueDevices[device.deviceID] = device;
            }
        });
        
        data.data           = {};
        data.data.devices   = Object.values(uniqueDevices);
        data.data.callID    = payload.callID;

        data.status = "ok";
        common.conLog("POST request for device scan info", "gre");
    }
    else {
        data.status = "error";
        data.error  = "No call ID provided";
    }


    if (data.status === "error") {
        common.conLog("GET request for device scan info: an error occured", "red");
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
 *       summary: Connect a device via ID (only Bluetooth and ZigBee - but only with powerType = "mains")
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
 *       requestBody:
 *         required: false
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 addDeviceToServer:
 *                   type: boolean
 *                   description: Whether to add the device to the database if it is not already present (only for Bluetooth).
 *                   example: true
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
 *                   data:
 *                     type: object
 *                     properties:
 *                       callID:
 *                         type: string
 *                         example: "In58F8lxhMEe6a4G"
 *                       deviceID:
 *                         type: string
 *                         example: "12345"
 *                       productName:
 *                         type: string
 *                         example: "Product XYZ"
 *                       bridge:
 *                         type: string
 *                         example: "bluetooth"
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
    payload.body         = request.body;

    let data       = {};
    let message    = {};

    if (payload.bridge !== undefined) {
        const bridge = payload.bridge.trim();

        if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) { // check if deviceID is provided
            message.deviceID            = payload.deviceID.trim();
            message.callID              = common.randomHash(); // create a unique call ID to identify the request
            message.bridge              = bridge;
            message.addDeviceToServer   = payload.body?.addDeviceToServer === true;

            mqttClient.publish(bridge + "/devices/connect", JSON.stringify(message)); // ... publish to MQTT broker
            common.conLog("POST request for device connect via ID " + message.deviceID + " forwarded via MQTT", "gre");

            mqttPendingResponsesHandler(message.callID, response);
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
 *       summary: Disconnect a device (only Bluetooth)
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
 *                   data:
 *                     type: object
 *                     properties:
 *                       deviceID:
 *                         type: string
 *                         example: "12345"
 *                       bridge:
 *                         type: string
 *                         example: "bluetooth"
 *                       callID:
 *                         type: string
 *                         example: "In58F8lxhMEe6a4G"
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
            message.bridge      = bridge;

            mqttClient.publish(bridge + "/devices/disconnect", JSON.stringify(message)); // ... publish to MQTT broker
            common.conLog("POST request for device disconnect via ID " + message.deviceID + " forwarded via MQTT", "gre");

            mqttPendingResponsesHandler(message.callID, response);
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
 *                  data:
 *                    type: object
 *                    properties:
 *                      deviceID:
 *                        type: string
 *                        example: "12345"
 *                      bridge:
 *                        type: string
 *                        example: "bluetooth"
 *                      callID:
 *                        type: string
 *                        example: "In58F8lxhMEe6a4G"
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
            message.bridge      = bridge;

            mqttClient.publish(bridge + "/devices/remove", JSON.stringify(message)); // ... publish to MQTT broker
            common.conLog("DELETE request for device remove via ID " + message.deviceID + " forwarded via MQTT", "gre");

            mqttPendingResponsesHandler(message.callID, response);
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
 *    post:
 *      summary: Add a new device
 *      description: This endpoint adds a new device to the system.
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
 *                  example: "Device Name"
 *                description:
 *                  type: string
 *                  example: "Device Description"
 *                productName:
 *                  type: string
 *                  example: "Product XYZ"
 *      responses:
 *        "200":
 *          description: Device added successfully
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  status:
 *                    type: string
 *                    example: "ok"
 *                  data:
 *                    type: object
 *                    properties:
 *                      deviceID:
 *                        type: string
 *                        example: "12345"
 *                      bridge:
 *                        type: string
 *                        example: "bluetooth"
 *                      callID:
 *                        type: string
 *                        example: "In58F8lxhMEe6a4G"
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
router.post("/:bridge/:deviceID", async function (request, response) {
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
                message.bridge      = bridge;
                message.productName = payload.body.productName;
                message.name        = payload.body.name;
                message.description = payload.body.description;
                message.powerType   = payload.body.powerType;

                mqttClient.publish(bridge + "/devices/create", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for device add via ID " + message.deviceID + " forwarded via MQTT", "gre");

                mqttPendingResponsesHandler(message.callID, response);
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
        common.conLog("POST request for device add: an error occured", "red");
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
 *                  data:
 *                    type: object
 *                    properties:
 *                      deviceID:
 *                        type: string
 *                        example: "12345"
 *                      bridge:
 *                        type: string
 *                        example: "bluetooth"
 *                      callID:
 *                        type: string
 *                        example: "In58F8lxhMEe6a4G"
 *                      updates:
 *                        type: object
 *                        properties:
 *                          name:
 *                            type: string
 *                            example: "New Device Name"
 *                          description:
 *                            type: string
 *                            example: "New Device Description"
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
                message.bridge      = bridge;
                message.updates     = payload.body;

                mqttClient.publish(bridge + "/devices/update", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("PATCH request for device update via ID " + message.deviceID + " forwarded via MQTT", "gre");

                mqttPendingResponsesHandler(message.callID, response);
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
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 data:
 *                   type: object
 *                   properties:
 *                     callID:
 *                       type: string
 *                       example: "In58F8lxhMEe6a4G"
 *                     bridge:
 *                       type: string
 *                       example: "bluetooth"
 *                     deviceID:
 *                       type: string
 *                       example: "12345"
 *                     values:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *                       example: { "rotary_switch": { "value": 4, "valueAsNumeric": 4 }, "button": { "value": "pressed", "valueAsNumeric": 1 }}
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
            message.bridge      = bridge;
            message.values      = {};

            mqttPendingResponsesHandler(message.callID, response);

            if (message.bridge === "bluetooth" || message.bridge === "zigbee") { // Request latest values from the device via MQTT, i.e. Bluetooth or Zigbee
                mqttClient.publish(bridge + "/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("GET request for device values via ID " + message.deviceID + " forwarded via MQTT", "gre");
            }
            else { // Get latest values from database for the device, i.e. HTTP or LoRa
                const statement = database.prepare("SELECT property, value, valueAsNumeric, MAX(dateTimeAsNumeric) as latest_time FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? GROUP BY property ORDER BY property ASC");
                const results   = await statement.all(message.deviceID, message.bridge);

                for (const result of results) {
                    message.values[result.property] = { value: result.value, valueAsNumeric: result.valueAsNumeric };
                }
                mqttPendingResponses[message.callID](message);
            }
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
 *     summary: Set device values (only Bluetooth and ZigBee)
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
 *             example: {"light": "middle", "speaker": "on"}
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     bridge:
 *                       type: string
 *                       example: "bluetooth"
 *                     callID:
 *                       type: string
 *                       example: "In58F8lxhMEe6a4G"
 *                     deviceID:
 *                       type: string
 *                       example: "12345"
 *                     values:
 *                       type: object
 *                       example: {"light": {"value": "middle", "valueAsNumeric": 2}, "speaker": {"value": "on", "valueAsNumeric": 1}}
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
                message.values  = payload.body;
                message.bridge      = bridge;

                mqttClient.publish(bridge + "/devices/values/set", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for setting device values via ID " + message.deviceID + " forwarded via MQTT", "gre");

                mqttPendingResponsesHandler(message.callID, response);
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

/**
 * @swagger
 * /devices/{bridge}/list:
 *   get:
 *     summary: Get all devices (registered and connected) of a bridge
 *     description: This endpoint retrieves all devices registered and connected to a specific bridge.
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
 *     responses:
 *       "200":
 *         description: Successfully retrieved device list.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 data:
 *                   type: object
 *                   properties:
 *                     callID:
 *                       type: string
 *                       example: "In58F8lxhMEe6a4G"
 *                     bridge:
 *                       type: string
 *                       example: "bluetooth"
 *                     devicesRegisteredAtServer:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           deviceID:
 *                             type: string
 *                             example: "12345"
 *                           bridge:
 *                             type: string
 *                             example: "bluetooth"
 *                           powerType:
 *                             type: string
 *                             example: "wire"
 *                     devicesConnected:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           deviceID:
 *                             type: string
 *                             example: "54321"
 *                           bridge:
 *                             type: string
 *                             example: "bluetooth"
 *                           powerType:
 *                             type: string
 *                             example: "BATTERY"
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
router.get("/:bridge/list", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;

    let data             = {};
    let message          = {};

    if (payload.bridge !== undefined) {
        const bridge = payload.bridge.trim();

        message.callID      = common.randomHash(); // create a unique call ID to identify the request
        message.bridge      = bridge;

        mqttClient.publish(bridge + "/devices/list", JSON.stringify(message)); // ... publish to MQTT broker
        common.conLog("GET request for registered and connected device list via bridge " + message.bridge + " forwarded via MQTT", "gre");

        mqttPendingResponsesHandler(message.callID, response);
    }
    else {
        data.status = "error";
        data.error = "No bridge provided";
    }
 
    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        common.conLog("GET request for registered and connected device list: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});

/**
 * @swagger
 *  /devices/{bridge}/{deviceID}:
 *    get:
 *      summary: Get device info via ID
 *      description: This endpoint retrieves detailed information about a specific device using its ID.
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
 *          description: Successfully retrieved device information.
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  status:
 *                    type: string
 *                    example: "ok"
 *                  device:
 *                    type: object
 *                    properties:
 *                      deviceID:
 *                        type: string
 *                        example: "12345"
 *                      bridge:
 *                        type: string
 *                        example: "bluetooth"
 *                      powerType:
 *                        type: string
 *                        example: "MAINS"
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
router.get("/:bridge/:deviceID", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.deviceID     = request.params.deviceID;
    let data             = {};

    if (payload.bridge !== undefined) {
        const bridge = payload.bridge.trim();
        if ((payload.deviceID !== undefined) && (payload.deviceID.trim() !== "")) { // check if deviceID is provided
            const device = database.prepare("SELECT * FROM devices WHERE deviceID = ? AND bridge = ?").get(payload.deviceID.trim(), bridge);;
            if (device !== undefined) {
                data.status = "ok";
                data.device = device;
                common.conLog("GET request for device info via ID " + payload.deviceID + " successful", "gre");
            }
            else {
                data.status = "error";
                data.error  = "Device not found";
            }
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

    if (data.status === "ok") {
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(200).json(data);
    }
    else {
        common.conLog("GET request for device info: an error occured", "red");
        common.conLog("Server route 'Devices' HTTP response: " + JSON.stringify(data), "std", false);
        return response.status(400).json(data);
    }
});

module.exports = router;