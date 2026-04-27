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
function handlePendingMqttResponse(callID, response) { 
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
 * Enriches a device object with individual and room details based on its individualID and roomID.
 * @param {Object} device - The device object (must have individualID and roomID fields).
 */
function enrichDeviceWithAssignment(device) {
    if ((device === undefined) || (device === null)) {
        return;
    }

    if (Number(device.individualID) > 0) {
        const individual = getIndividual(device.individualID);
        if (individual) {
            device.individual = {
                individualID:   individual.individualID,
                firstname:      individual.firstname || "",
                lastname:       individual.lastname || "",
            };
        }
    }

    if (Number(device.roomID) > 0) {
        const room = getRoom(device.roomID);
        if (room) {
            device.room = {
                roomID: room.roomID,
                name:   room.name || "",
            };
        }
    }
}

/**
 * Returns a single device by UUID and bridge.
 * @param {string} uuid
 * @param {string} bridge
 * @returns {Object|undefined}
 */
function getDevice(uuid, bridge) {
    return common.deviceGetByUUID(uuid, bridge) ?? undefined; // normalize null → undefined to match existing === undefined checks
}

/**
 * Returns a single individual by ID.
 * @param {number} individualID
 * @returns {Object|undefined}
 */
function getIndividual(individualID) {
    return database.prepare("SELECT * FROM individuals WHERE individualID = ? LIMIT 1").get(individualID);
}

/**
 * Returns a single room by ID.
 * @param {number} roomID
 * @returns {Object|undefined}
 */
function getRoom(roomID) {
    return database.prepare("SELECT * FROM rooms WHERE roomID = ? LIMIT 1").get(roomID);
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
 *                  results:
 *                    type: array
 *                    items:
 *                      type: object
 *                      properties:
 *                        uuid:
 *                          type: string
 *                          example: "12345"
 *                        bridge:
 *                          type: string
 *                          example: "bluetooth"
 *                        name:
 *                          type: string
 *                          example: "Living Room Sensor"
 *                        productName:
 *                          type: string
 *                          example: "Product XYZ"
 *                        vendorName:
 *                          type: string
 *                          example: "Vendor ABC"
 *                        description:
 *                          type: string
 *                          example: "Temperature sensor in the living room"
 *                        powerType:
 *                          type: string
 *                          example: "mains"
 *                        properties:
 *                          type: object
 *                          description: Parsed JSON object with device-specific properties
 *                        individualID:
 *                          type: integer
 *                          example: 5
 *                        roomID:
 *                          type: integer
 *                          example: 3
 *                        individual:
 *                          type: object
 *                          description: Enriched individual data (if individualID is set)
 *                          properties:
 *                            individualID:
 *                              type: integer
 *                              example: 5
 *                            firstname:
 *                              type: string
 *                              example: "Max"
 *                            lastname:
 *                              type: string
 *                              example: "Mustermann"
 *                        room:
 *                          type: object
 *                          description: Enriched room data (if roomID is set)
 *                          properties:
 *                            roomID:
 *                              type: integer
 *                              example: 3
 *                            name:
 *                              type: string
 *                              example: "Living Room"
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

        results.forEach(device => {  // Convert "properties" from JSON string to object
            if (device.properties) {
                try {
                    device.properties = JSON.parse(device.properties);
                }
                catch (error) {
                    data.status         = "error";
                    data.error          = "Fatal error: " + (error.stack).slice(0, 128);
                    device.properties   = {};
                }
            }

            enrichDeviceWithAssignment(device);
        });

        data.results = results;
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }


    return common.sendResponse(response, data, "Server route 'Devices'", "GET Request");
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

    return common.sendResponse(response, data, "Server route 'Devices'", "POST request for device scan");
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
 *                             uuid:
 *                               type: string
 *                               example: "12345"
 *                             productName:
 *                               type: string
 *                               example: "Product XYZ"
 *                             bridge:
 *                               type: string
 *                               example: "bluetooth"
 *                             strength:
 *                               type: integer
 *                               description: Signal strength in percent (0–100)
 *                               example: 57
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
        
        const uniqueDevices = {};
        devices.forEach(device => {
            delete device.callID; // remove duplicates based on UUID, keep only the first occurrence and remove callID from the device info
            if (device.uuid && !uniqueDevices[device.uuid]) {
                uniqueDevices[device.uuid] = device;
            }
        });
        
        data.data           = {};
        data.data.devices   = Object.values(uniqueDevices);
        data.data.callID    = payload.callID;

        data.status = "ok";
        common.conLog("GET request for device scan info", "gre");
    }
    else {
        data.status = "error";
        data.error  = "No call ID provided";
    }


    return common.sendResponse(response, data, "Server route 'Devices'", "GET request for device scan info");
});

/**
 * @swagger
 *   /devices/{bridge}/{uuid}/connect:
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
 *           name: uuid
 *           required: true
 *           description: The UUID of the device.
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
 *                       uuid:
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
router.post("/:bridge/:uuid/connect", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.uuid         = request.params.uuid;
    payload.body         = request.body;

    let data       = {};
    let message    = {};

    if (payload.bridge !== undefined) {
        const bridge = payload.bridge.trim();

        if ((payload.uuid !== undefined) && (payload.uuid.trim() !== "")) { // check if UUID is provided
            message.uuid                = payload.uuid.trim();
            message.callID              = common.randomHash(); // create a unique call ID to identify the request
            message.bridge              = bridge;
            message.addDeviceToServer   = payload.body?.addDeviceToServer === true;

            mqttClient.publish(bridge + "/devices/connect", JSON.stringify(message)); // ... publish to MQTT broker
            common.conLog("POST request for device connect via UUID " + message.uuid + " forwarded via MQTT", "gre");

            handlePendingMqttResponse(message.callID, response);
        }
        else {
            data.status = "error";
            data.error  = "No UUID or product name provided";
        }
    }
    else {
        data.status = "error";
        data.error  = "No bridge provided";
    }


    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        return common.sendResponse(response, data, "Server route 'Devices'", "POST request for device connect");
    }
});

/**
 * @swagger
 *   /devices/{bridge}/{uuid}/disconnect:
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
 *           name: uuid
 *           required: true
 *           description: The UUID of the device.
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
 *                       uuid:
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
router.post("/:bridge/:uuid/disconnect", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.uuid         = request.params.uuid;

    let data       = {};
    let message    = {};

    if (payload.bridge !== undefined) {
        const bridge = payload.bridge.trim();

        if ((payload.uuid !== undefined) && (payload.uuid.trim() !== "")) { // check if UUID is provided
            message.uuid    = payload.uuid.trim();
            message.callID  = common.randomHash(); // create a unique call ID to identify the request
            message.bridge  = bridge;

            mqttClient.publish(bridge + "/devices/disconnect", JSON.stringify(message)); // ... publish to MQTT broker
            common.conLog("POST request for device disconnect via UUID " + message.uuid + " forwarded via MQTT", "gre");

            handlePendingMqttResponse(message.callID, response);
        }
        else {
            data.status = "error";
            data.error  = "No UUID provided";
        }
    }
    else {
        data.status = "error";
        data.error  = "No bridge provided";
    }

    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        return common.sendResponse(response, data, "Server route 'Devices'", "POST request for device disconnect");
    }
});

/**
 * @swagger
 *  /devices/{bridge}/{uuid}:
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
 *          name: uuid
 *          required: true
 *          description: The UUID of the device.
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
 *                      uuid:
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
router.delete("/:bridge/:uuid", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.uuid         = request.params.uuid;

    let data       = {};
    let message    = {};

    if (payload.bridge !== undefined) {
        const bridge = payload.bridge.trim();

        if ((payload.uuid !== undefined) && (payload.uuid.trim() !== "")) { // check if UUID is provided
            message.uuid    = payload.uuid.trim();
            message.callID  = common.randomHash(); // create a unique call ID to identify the request
            message.bridge  = bridge;

            mqttClient.publish(bridge + "/devices/remove", JSON.stringify(message)); // ... publish to MQTT broker
            common.conLog("DELETE request for device remove via UUID " + message.uuid + " forwarded via MQTT", "gre");

            handlePendingMqttResponse(message.callID, response);
        }
        else {
            data.status = "error";
            data.error  = "No UUID provided";
        }
    }
    else {
        data.status = "error";
        data.error  = "No bridge provided";
    }

    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        return common.sendResponse(response, data, "Server route 'Devices'", "DELETE request for device remove");
    }
});

/**
 * @swagger
 *  /devices/{bridge}/{uuid}:
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
 *          name: uuid
 *          required: true
 *          description: The UUID of the device.
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
 *                powerType:
 *                  type: string
 *                  example: "mains"
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
 *                      uuid:
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
router.post("/:bridge/:uuid", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.uuid         = request.params.uuid;
    payload.body         = request.body;

    let data       = {};
    let message    = {};

    if ((payload.body !== undefined) && (Object.keys(payload.body).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();

            if ((payload.uuid !== undefined) && (payload.uuid.trim() !== "")) { // check if UUID is provided
                message.uuid        = payload.uuid.trim();
                message.callID      = common.randomHash(); // create a unique call ID to identify the request
                message.bridge      = bridge;
                message.productName = payload.body.productName;
                message.name        = payload.body.name;
                message.description = payload.body.description;
                message.powerType   = payload.body.powerType;

                mqttClient.publish(bridge + "/devices/create", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for device add via UUID " + message.uuid + " forwarded via MQTT", "gre");

                handlePendingMqttResponse(message.callID, response);
            }
            else {
                data.status = "error";
                data.error  = "No UUID provided";
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
        return common.sendResponse(response, data, "Server route 'Devices'", "POST request for device add");
    }
});


/**
 * @swagger
 *  /devices/{bridge}/{uuid}:
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
 *          name: uuid
 *          required: true
 *          description: The UUID of the device.
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
 *                individualID:
 *                  type: integer
 *                  description: ID of the individual to assign this device to (0 to unassign)
 *                  example: 5
 *                roomID:
 *                  type: integer
 *                  description: ID of the room to assign this device to (0 to unassign)
 *                  example: 3
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
 *                      uuid:
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
router.patch("/:bridge/:uuid", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.uuid         = request.params.uuid;
    payload.body         = request.body;

    let data       = {};
    let message    = {};

    if ((payload.body !== undefined) && (Object.keys(payload.body).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();

            if ((payload.uuid !== undefined) && (payload.uuid.trim() !== "")) { // check if UUID is provided
                const uuid = payload.uuid.trim();

                // Update individualID and roomID directly in the database (these are server-side fields, not bridge-side)
                if (payload.body.individualID !== undefined || payload.body.roomID !== undefined) {
                    const device = getDevice(uuid, bridge);

                    if (device === undefined) {
                        data.status = "error";
                        data.error  = "Device not found";
                        return common.sendResponse(response, data, "Server route 'Devices'", "PATCH request for device update");
                    }

                    const individualID = (payload.body.individualID !== undefined) ? (Number(payload.body.individualID) || 0) : device.individualID;
                    const roomID       = (payload.body.roomID !== undefined) ? (Number(payload.body.roomID) || 0) : device.roomID;

                    if (individualID > 0 && getIndividual(individualID) === undefined) {
                        data.status = "error";
                        data.error  = "Individual not found";
                        return common.sendResponse(response, data, "Server route 'Devices'", "PATCH request for device update");
                    }

                    if (roomID > 0 && getRoom(roomID) === undefined) {
                        data.status = "error";
                        data.error  = "Room not found";
                        return common.sendResponse(response, data, "Server route 'Devices'", "PATCH request for device update");
                    }

                    database.prepare("UPDATE devices SET individualID = ?, roomID = ? WHERE uuid = ? AND bridge = ?").run(individualID, roomID, uuid, bridge);
                    common.conLog("PATCH request for device assignment update via UUID " + uuid + " successful", "gre");
                }

                // Forward remaining fields (name, description, etc.) to the bridge via MQTT
                const bridgeFields = { ...payload.body };
                delete bridgeFields.individualID;
                delete bridgeFields.roomID;

                if (Object.keys(bridgeFields).length > 0) {
                    message.uuid    = uuid;
                    message.callID  = common.randomHash();
                    message.bridge  = bridge;
                    message.updates = bridgeFields;

                    mqttClient.publish(bridge + "/devices/update", JSON.stringify(message));
                    common.conLog("PATCH request for device update via UUID " + message.uuid + " forwarded via MQTT", "gre");

                    handlePendingMqttResponse(message.callID, response);
                }
                else {
                    // Only assignment fields were updated, no MQTT needed
                    data.status = "ok";
                    data.device = getDevice(uuid, bridge);
                    enrichDeviceWithAssignment(data.device);
                    return common.sendResponse(response, data, "Server route 'Devices'", "PATCH request for device update");
                }
            }
            else {
                data.status = "error";
                data.error  = "No UUID provided";
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
        return common.sendResponse(response, data, "Server route 'Devices'", "PATCH request for device update");
    }
});

/**
 * @swagger
 * /devices/{bridge}/{uuid}/values:
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
 *         name: uuid
 *         required: true
 *         description: The UUID of the device.
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
 *                     uuid:
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
router.get("/:bridge/:uuid/values", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.uuid         = request.params.uuid;

    let data       = {};
    let message    = {};

    if (payload.bridge !== undefined) {
        const bridge = payload.bridge.trim();

        if ((payload.uuid !== undefined) && (payload.uuid.trim() !== "")) { // check if UUID is provided
            message.uuid    = payload.uuid.trim();
            message.callID  = common.randomHash(); // create a unique call ID to identify the request
            message.bridge  = bridge;
            message.values  = {};

            if (message.bridge === "bluetooth" || message.bridge === "zigbee") { // Request latest values from the device via MQTT, i.e. Bluetooth or Zigbee
                handlePendingMqttResponse(message.callID, response);
                mqttClient.publish(bridge + "/devices/values/get", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("GET request for device values via UUID " + message.uuid + " forwarded via MQTT", "gre");
            }
            else { // Get latest values from database for the device, i.e. HTTP or LoRa — use numeric deviceID
                const deviceID = common.deviceGetIDByUUID(message.uuid, bridge);
                if (deviceID === null) {
                    data.status = "error";
                    data.error  = "Device not found";
                    return common.sendResponse(response, data, "Server route 'Devices'", "GET request for device values");
                }

                handlePendingMqttResponse(message.callID, response);

                const statement = database.prepare("SELECT property, value, valueAsNumeric, MAX(dateTimeAsNumeric) as latest_time FROM mqtt_history_devices_values WHERE deviceID = ? GROUP BY property ORDER BY property ASC");
                const results   = statement.all(deviceID);

                for (const result of results) {
                    message.values[result.property] = { value: result.value, valueAsNumeric: result.valueAsNumeric };
                }
                mqttPendingResponses[message.callID](message);
            }
        }
        else {
            data.status = "error";
            data.error  = "No UUID provided";
        }
    }
    else {
        data.status = "error";
        data.error  = "No bridge provided";
    }


    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        return common.sendResponse(response, data, "Server route 'Devices'", "GET request for device values");
    }
});

/**
 * @swagger
 * /devices/{bridge}/{uuid}/values:
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
 *         name: uuid
 *         required: true
 *         description: The UUID of the device.
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
 *                     uuid:
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
router.post("/:bridge/:uuid/values", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.uuid         = request.params.uuid;
    payload.body         = request.body;

    let data       = {};
    let message    = {};

    if ((payload.body !== undefined) && (Object.keys(payload.body).length > 0)) {
        if (payload.bridge !== undefined) {
            const bridge = payload.bridge.trim();

            if ((payload.uuid !== undefined) && (payload.uuid.trim() !== "")) { // check if UUID is provided
                message.uuid    = payload.uuid.trim();
                message.callID  = common.randomHash(); // create a unique call ID to identify the request
                message.values  = payload.body;
                message.bridge  = bridge;

                mqttClient.publish(bridge + "/devices/values/set", JSON.stringify(message)); // ... publish to MQTT broker
                common.conLog("POST request for setting device values via UUID " + message.uuid + " forwarded via MQTT", "gre");

                handlePendingMqttResponse(message.callID, response);
            }
            else {
                data.status = "error";
                data.error  = "No UUID provided";
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
        return common.sendResponse(response, data, "Server route 'Devices'", "POST request for setting device values");
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
 *                           uuid:
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
 *                           uuid:
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

        handlePendingMqttResponse(message.callID, response);
    }
    else {
        data.status = "error";
        data.error = "No bridge provided";
    }
 
    if (data.status === "error") { // send HTTP response immediately only if there is an error, otherwise see above
        return common.sendResponse(response, data, "Server route 'Devices'", "GET request for registered and connected device list");
    }
});

/**
 * @swagger
 *  /devices/{bridge}/{uuid}:
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
 *          name: uuid
 *          required: true
 *          description: The UUID of the device.
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
 *                      uuid:
 *                        type: string
 *                        example: "12345"
 *                      bridge:
 *                        type: string
 *                        example: "bluetooth"
 *                      name:
 *                        type: string
 *                        example: "Living Room Sensor"
 *                      productName:
 *                        type: string
 *                        example: "Product XYZ"
 *                      vendorName:
 *                        type: string
 *                        example: "Vendor ABC"
 *                      description:
 *                        type: string
 *                        example: "Temperature sensor in the living room"
 *                      powerType:
 *                        type: string
 *                        example: "MAINS"
 *                      properties:
 *                        type: object
 *                        description: Parsed JSON object with device-specific properties
 *                      individualID:
 *                        type: integer
 *                        example: 5
 *                      roomID:
 *                        type: integer
 *                        example: 3
 *                      individual:
 *                        type: object
 *                        description: Enriched individual data (if individualID is set)
 *                        properties:
 *                          individualID:
 *                            type: integer
 *                            example: 5
 *                          firstname:
 *                            type: string
 *                            example: "Max"
 *                          lastname:
 *                            type: string
 *                            example: "Mustermann"
 *                      room:
 *                        type: object
 *                        description: Enriched room data (if roomID is set)
 *                        properties:
 *                          roomID:
 *                            type: integer
 *                            example: 3
 *                          name:
 *                            type: string
 *                            example: "Living Room"
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
router.get("/:bridge/:uuid", async function (request, response) {
    const payload        = {};
    payload.bridge       = request.params.bridge;
    payload.uuid         = request.params.uuid;
    let data             = {};

    if (payload.bridge !== undefined) {
        const bridge = payload.bridge.trim();
        if ((payload.uuid !== undefined) && (payload.uuid.trim() !== "")) { // check if UUID is provided
            const device = getDevice(payload.uuid.trim(), bridge);
            if (device !== undefined) {
                data.status = "ok";
                data.device = device;
                if (data.device.properties !== undefined) {
                    try {
                        data.device.properties = JSON.parse(data.device.properties); // Convert "properties" from JSON string to object
                    }
                    catch (error) {
                        data.status             = "error";
                        data.error              = "Fatal error: " + (error.stack).slice(0, 128);
                        data.device.properties  = {};
                    }
                }

                enrichDeviceWithAssignment(data.device);

                common.conLog("GET request for device info via UUID " + payload.uuid + " successful", "gre");
            }
            else {
                data.status = "error";
                data.error  = "Device not found";
            }
        }
        else {
            data.status = "error";
            data.error  = "No UUID provided";
        }
    }
    else {
        data.status = "error";
        data.error  = "No bridge provided";
    }

    return common.sendResponse(response, data, "Server route 'Devices'", "GET request for device info");
});

module.exports = router;