/**
 * =============================================================================================
 * Routes for Device groups
 * ========================
 */

const router = require("express").Router();

/**
 * @swagger
 *   /devices-groups:
 *     post:
 *       summary: Create a device group
 *       description: Creates a named group that devices can be assigned to.
 *       tags:
 *         - Device Groups
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - name
 *               properties:
 *                 name:
 *                   type: string
 *                   example: "Living Room Sensors"
 *                 description:
 *                   type: string
 *                   example: "Devices installed in the living room"
 *       responses:
 *         "200":
 *           description: Device group created successfully.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *                   ID:
 *                     type: integer
 *                     example: 56
 *         "400":
 *           description: The group could not be created.
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
 *                     example: "Group name required"
 */
router.post("/", function (request, response) {
    let data = {};
    
    const name = String(request.body?.name || "").trim();

    if (!name) {
        data.status = "error";
        data.error  = "Group name required";
    }
    else {
        try {
            data.status  = "ok";

            const result = database.prepare("INSERT INTO devices_groups (name, description) VALUES (?, ?)").run(name, request.body?.description || null);
            data.ID      = result.lastInsertRowid;
        }
        catch (error) {
            data.status = "error";
            data.error = error.message;
        }
    }
    return common.sendResponse(response, data, "Server route 'DeviceGroups'", "POST request");
});

/**
 * @swagger
 *   /devices-groups/{groupID}:
 *     get:
 *       summary: Retrieve a device group
 *       description: Retrieves a device group and its assigned device memberships.
 *       tags:
 *         - Device Groups
 *       parameters:
 *         - in: path
 *           name: groupID
 *           required: true
 *           description: The ID of the device group to retrieve.
 *           schema:
 *             type: integer
 *             example: 1
 *       responses:
 *         "200":
 *           description: Device group retrieved successfully.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *                   result:
 *                     type: object
 *                     properties:
 *                       groupID:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: "Living Room Sensors"
 *                       description:
 *                         type: string
 *                         example: "Devices installed in the living room"
 *                       members:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             groupMemberID:
 *                               type: integer
 *                               example: 1
 *                             groupID:
 *                               type: integer
 *                               example: 1
 *                             deviceID:
 *                               type: integer
 *                               example: 42
 *         "400":
 *           description: The group ID is invalid or the group was not found.
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
 *                     example: "Group not found"
 */
router.get("/:groupID", function (request, response) {
    let data = {};

    const groupID = Number(request.params.groupID);

    if (!Number.isInteger(groupID) || groupID <= 0) {
        data.status = "error";
        data.error  = "Invalid group ID";
    }
    else {
        try {
            const result = database.prepare("SELECT * FROM devices_groups WHERE groupID = ?").get(groupID);

            if (!result) {
                data.status = "error";
                data.error  = "Group not found";
            }
            else {
                const resultsMembers = database.prepare("SELECT * FROM devices_group_members WHERE groupID = ? ORDER BY groupMemberID").all(groupID);

                data.status         = "ok";
                data.result         = result;
                data.result.members = resultsMembers;
            }
        }
        catch (error) {
            data.status = "error";
            data.error  = error.message;
        }
    }
        
    return common.sendResponse(response, data, "Server route 'DeviceGroups'", "GET request");
});

/**
 * @swagger
 *   /devices-groups/{groupID}/devices:
 *     post:
 *       summary: Add a device to a group
 *       description: Assigns an existing device to a device group. Adding an existing membership has no effect.
 *       tags:
 *         - Device Groups
 *       parameters:
 *         - in: path
 *           name: groupID
 *           required: true
 *           description: The ID of the device group.
 *           schema:
 *             type: integer
 *             example: 1
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - deviceID
 *               properties:
 *                 deviceID:
 *                   type: integer
 *                   example: 42
 *       responses:
 *         "200":
 *           description: Device group membership created successfully.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *                   ID:
 *                     type: integer
 *                     example: 1
 *         "400":
 *           description: The IDs are invalid, or the group or device was not found.
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
 *                     example: "Device not found"
 */
router.post("/:groupID/devices", function (request, response) {
    let data = {};

    const groupID   = Number(request.params.groupID);
    const deviceID  = Number(request.body?.deviceID);

    if (!Number.isInteger(groupID) || groupID <= 0 || !Number.isInteger(deviceID) || deviceID <= 0) {
        data.status = "error";
        data.error  = "Invalid IDs";
    }
    else {
        try {
            const result = database.prepare("INSERT OR IGNORE INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(groupID, deviceID);

            data.status  = "ok";
            data.ID      = result.lastInsertRowid;
        }
        catch (error) {
            data.status = "error";
            data.error  = error.message;
        }
    }

    return common.sendResponse(response, data, "Server route 'DeviceGroups'", "POST request");
});

/**
 * @swagger
 *   /devices-groups/{groupID}:
 *     delete:
 *       summary: Delete a device group
 *       description: Deletes a device group and all its memberships.
 *       tags:
 *         - Device Groups
 *       parameters:
 *         - in: path
 *           name: groupID
 *           required: true
 *           description: The ID of the device group to delete.
 *           schema:
 *             type: integer
 *             example: 1
 *       responses:
 *         "200":
 *           description: Device group deleted successfully.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *         "400":
 *           description: The group ID is invalid or the group was not found.
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
 *                     example: "Entry not found"
 */
router.delete("/:groupID", function (request, response) {
    let data = {};

    const groupID = Number(request.params.groupID);

    if (!Number.isInteger(groupID) || groupID <= 0) {
        data.status = "error";
        data.error  = "Invalid group ID";
    }
    else {
        try {
            const resultGroupMembers    = database.prepare("DELETE FROM devices_group_members WHERE groupID = ?").run(groupID);
            const resultGroup           = database.prepare("DELETE FROM devices_groups WHERE groupID = ?").run(groupID);

            if (resultGroup.changes === 0) {
                data.status = "error";
                data.error  ="Entry not found";
            }
            else {
                data.status = "ok";
            }
        }
        catch (error) {
            data.status = "error";
            data.error  = error.message;
        }
    }

    return common.sendResponse(response, data, "Server route 'DeviceGroups'", "DELETE request");
});

module.exports = router;