/**
 * =============================================================================================
 * Routes for Scenarios
 * ====================
 */
const appConfig     = require("../../config");
const router        = require("express").Router();
const { getDeviceIDByUUID } = require("../libs/DeviceLookup");

/**
 * @swagger
 * components:
 *   schemas:
 *     Scenario:
 *       type: object
 *       properties:
 *         scenarioID:
 *           type: integer
 *           example: 42
 *         name:
 *           type: string
 *           example: "High Heartrate Alert"
 *         description:
 *           type: string
 *           example: "Turn on emergency light when heartrate > 100"
 *         enabled:
 *           type: boolean
 *           example: true
 *         priority:
 *           type: integer
 *           example: 0
 *         icon:
 *           type: string
 *           example: "heart"
 *         roomID:
 *           type: integer
 *           example: 3
 *         individualID:
 *           type: integer
 *           example: 5
 *         dateTimeAdded:
 *           type: string
 *           example: "2025-01-15 14:30:00"
 *         triggers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               triggerID:
 *                 type: integer
 *                 example: 1
 *               scenarioID:
 *                 type: integer
 *                 example: 42
 *               type:
 *                 type: string
 *                 example: "device_value"
 *               deviceUUID:
 *                 type: string
 *                 example: "12345"
 *               bridge:
 *                 type: string
 *                 example: "bluetooth"
 *               property:
 *                 type: string
 *                 example: "heartrate"
 *               operator:
 *                 type: string
 *                 enum: ["equals", "greater", "less", "between", "contains"]
 *               value:
 *                 type: string
 *                 example: "100"
 *               valueType:
 *                 type: string
 *                 enum: ["String", "Numeric", "Boolean"]
 *               deviceName:
 *                 type: string
 *                 example: "Heart Monitor"
 *               deviceProperties:
 *                 type: object
 *                 description: Parsed JSON object with device-specific properties
 *               devicePowerType:
 *                 type: string
 *                 example: "battery"
 *         actions:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               actionID:
 *                 type: integer
 *                 example: 1
 *               scenarioID:
 *                 type: integer
 *                 example: 42
 *               type:
 *                 type: string
 *                 example: "set_device_value"
 *               deviceUUID:
 *                 type: string
 *                 example: "12345"
 *               bridge:
 *                 type: string
 *                 example: "bluetooth"
 *               property:
 *                 type: string
 *                 example: "led"
 *               value:
 *                 type: string
 *                 example: "on"
 *               valueType:
 *                 type: string
 *                 enum: ["String", "Numeric", "Boolean"]
 *               delay:
 *                 type: integer
 *                 description: Delay in seconds before executing this action
 *                 example: 3
 *               deviceName:
 *                 type: string
 *                 example: "Emergency Light"
 *               deviceProperties:
 *                 type: object
 *                 description: Parsed JSON object with device-specific properties
 *               devicePowerType:
 *                 type: string
 *                 example: "mains"
 */

/**
 * @swagger
 * /scenarios/all:
 *   get:
 *     summary: Get all scenarios
 *     description: Retrieve all scenarios with their triggers and actions
 *     tags:
 *       - Scenarios
 *     responses:
 *       "200":
 *         description: Successfully retrieved scenarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Scenario'
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
router.get("/all", async function (request, response) {
    let data       = {};
    try {
        data.status = "ok";

        const statement = "SELECT * FROM scenarios ORDER BY scenarioID DESC, name ASC LIMIT ?"; 
        const results   = await database.prepare(statement).all(appConfig.CONF_tablesMaxEntriesReturned);

        for (const result of results) {         
            result.enabled          = result.enabled === 1 ? true : false;
        }

        common.conLog("GET Request: access table 'scenarios'", "gre");
        common.conLog("Execute statement: " + statement, "std", false);

        for (const result of results) {
          result.triggers = await database.prepare("SELECT st.*, d.uuid AS deviceUUID, d.bridge AS deviceBridge, d.name AS deviceName, d.properties AS deviceProperties, d.powerType AS devicePowerType FROM scenarios_triggers st LEFT JOIN devices d ON st.deviceID = d.deviceID WHERE st.scenarioID = ? LIMIT ?").all(result.scenarioID, appConfig.CONF_tablesMaxEntriesReturned);
          result.actions  = await database.prepare("SELECT sa.*, d.uuid AS deviceUUID, d.bridge AS deviceBridge, d.name AS deviceName, d.properties AS deviceProperties, d.powerType AS devicePowerType FROM scenarios_actions sa LEFT JOIN devices d ON sa.deviceID = d.deviceID WHERE sa.scenarioID = ? ORDER BY sa.delay ASC LIMIT ?").all(result.scenarioID, appConfig.CONF_tablesMaxEntriesReturned);

          for (const trigger of result.triggers) {
              if (trigger.deviceProperties) {
                  try {
                      trigger.deviceProperties = JSON.parse(trigger.deviceProperties); // Parse JSON string to object
                  }
                  catch (error) {
                      data.status              = "error";
                      data.error               = "Fatal error: " + (error.stack).slice(0, 128);
                      trigger.deviceProperties = {};
                  }
              }
          }

          for (const action of result.actions) {
              if (action.deviceProperties) {
                  try {
                      action.deviceProperties = JSON.parse(action.deviceProperties); // Parse JSON string to object
                  }
                  catch (error) {
                      data.status             = "error";
                      data.error              = "Fatal error: " + (error.stack).slice(0, 128);
                      action.deviceProperties = {};
                  }
              }
          }
        }

        data.results = results;
    } 
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }

    return common.sendResponse(response, data, "Server route 'Scenarios'", "GET Request");
});

/**
 * @swagger
 * /scenarios/{scenarioID}:
 *   get:
 *     summary: Get a specific scenario
 *     description: Retrieve a specific scenario by its ID, including its triggers and actions
 *     tags:
 *       - Scenarios
 *     parameters:
 *       - in: path
 *         name: scenarioID
 *         required: true
 *         description: The unique ID of the scenario
 *         schema:
 *           type: integer
 *     responses:
 *       "200":
 *         description: Successfully retrieved scenario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Scenario'
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
router.get("/:scenarioID", async function (request, response) {
    const scenarioID = parseInt(request.params.scenarioID);
    let data         = {};
    try {
        const result = await database.prepare("SELECT * FROM scenarios WHERE scenarioID = ?").get(scenarioID);
        if (result) {
            result.enabled          = result.enabled === 1 ? true : false;

            result.triggers = await database.prepare("SELECT st.*, d.uuid AS deviceUUID, d.bridge AS deviceBridge, d.name AS deviceName, d.properties AS deviceProperties, d.powerType AS devicePowerType FROM scenarios_triggers st LEFT JOIN devices d ON st.deviceID = d.deviceID WHERE st.scenarioID = ? LIMIT ?").all(scenarioID, appConfig.CONF_tablesMaxEntriesReturned);
            result.actions  = await database.prepare("SELECT sa.*, d.uuid AS deviceUUID, d.bridge AS deviceBridge, d.name AS deviceName, d.properties AS deviceProperties, d.powerType AS devicePowerType FROM scenarios_actions sa LEFT JOIN devices d ON sa.deviceID = d.deviceID WHERE sa.scenarioID = ? ORDER BY sa.delay ASC LIMIT ?").all(scenarioID, appConfig.CONF_tablesMaxEntriesReturned);

            for (const trigger of result.triggers) {
                if (trigger.deviceProperties) {
                    try {
                        trigger.deviceProperties = JSON.parse(trigger.deviceProperties); // Parse JSON string to object
                    }
                    catch (error) {
                        data.status              = "error";
                        data.error               = "Fatal error: " + (error.stack).slice(0, 128);
                        trigger.deviceProperties = {};
                    }
                }
            }

            for (const action of result.actions) {
                if (action.deviceProperties) {
                    try {
                        action.deviceProperties = JSON.parse(action.deviceProperties); // Parse JSON string to object
                    }
                    catch (error) {
                        data.status             = "error";
                        data.error              = "Fatal error: " + (error.stack).slice(0, 128);
                        action.deviceProperties = {};
                    }
                }
            }

            data.status    = "ok";
            data.results   = [result];
            common.conLog("GET Request: access table 'scenarios'", "gre");
        } 
        else {
            data.status = "error";
            data.error  = "Scenario not found";
        }
    } 
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }
    return common.sendResponse(response, data, "Server route 'Scenarios'", "GET Request");
});

/**
 * @swagger
 * /scenarios:
 *   post:
 *     summary: Create a new scenario
 *     description: Create a new scenario with triggers and actions
 *     tags:
 *       - Scenarios
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - triggers
 *               - actions
 *             properties:
 *               name:
 *                 type: string
 *                 example: "High Heartrate Alert"
 *               description:
 *                 type: string
 *                 example: "Turn on emergency light when heartrate > 100"
 *               enabled:
 *                 type: boolean
 *                 default: true
 *               priority:
 *                 type: integer
 *                 default: 0
 *               icon:
 *                 type: string
 *                 example: "heart"
 *               roomID:
 *                 type: integer
 *                 example: 3
 *               individualID:
 *                 type: integer
 *                 example: 5
 *               triggers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: "device_value"
 *                     uuid:
 *                       type: string
 *                       example: "12345"
 *                     bridge:
 *                       type: string
 *                       example: "bluetooth"
 *                     property:
 *                       type: string
 *                       example: "heartrate"
 *                     operator:
 *                       type: string
 *                       enum: ["equals", "greater", "less", "between", "contains"]
 *                     value:
 *                       type: string
 *                       example: "100"
 *                     valueType:
 *                       type: string
 *                       enum: ["String", "Numeric", "Boolean"]
 *                       example: "Numeric"
 *               actions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: "set_device_value"
 *                     uuid:
 *                       type: string
 *                       example: "12345"
 *                     bridge:
 *                       type: string
 *                       example: "bluetooth"
 *                     property:
 *                       type: string
 *                       example: "led"
 *                     value:
 *                       type: string
 *                       example: "on"
 *                     valueType:
 *                       type: string
 *                       enum: ["String", "Numeric", "Boolean"]
 *                     delay:
 *                       type: integer
 *                       example: 3
 *     responses:
 *       "200":
 *         description: Successfully created scenario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 ID:
 *                   type: integer
 *                   example: 42
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
router.post("/", async function (request, response) {
    const payload = request.body;
    let data      = {};

    try {
        if (payload.name && payload.triggers && payload.actions) {
            if (Array.isArray(payload.triggers) && Array.isArray(payload.actions)) {
                data.status = "ok";
                
                const insertScenario    = database.prepare("INSERT INTO scenarios (name, description, enabled, priority, icon, roomID, individualID, dateTimeAdded) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))");
                const insertTrigger     = database.prepare("INSERT INTO scenarios_triggers (scenarioID, type, deviceID, property, operator, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?)");
                const insertAction      = database.prepare("INSERT INTO scenarios_actions (scenarioID, type, deviceID, property, value, valueType, delay) VALUES (?, ?, ?, ?, ?, ?, ?)");

                const transaction = database.transaction(() => {

                    const result = insertScenario.run( // Insert scenario
                        payload.name,
                        payload.description || "",
                        payload.enabled === true ? 1 : 0,
                        payload.priority || 0,
                        payload.icon || "",
                        payload.roomID || null,
                        payload.individualID || null
                    );

                    const scenarioID = result.lastInsertRowid;

                    for (const trigger of payload.triggers) { // Insert triggers — translate uuid+bridge → numeric deviceID
                        const triggerUUID   = trigger.uuid || null;
                        const triggerBridge = trigger.bridge || null;
                        const deviceID      = (triggerUUID && triggerBridge) ? getDeviceIDByUUID(database, triggerUUID, triggerBridge) : null;

                        insertTrigger.run(
                            scenarioID,
                            trigger.type || "device_value",
                            deviceID,
                            trigger.property || null,
                            trigger.operator || "equals",
                            typeof trigger.value === "object" ? JSON.stringify(trigger.value) : (trigger.value || null),
                            trigger.valueType || "String"
                        );
                    }

                    for (const action of payload.actions) { // Insert actions — translate uuid+bridge → numeric deviceID
                        const actionUUID   = action.uuid || null;
                        const actionBridge = action.bridge || null;
                        const deviceID     = (actionUUID && actionBridge) ? getDeviceIDByUUID(database, actionUUID, actionBridge) : null;

                        insertAction.run(
                            scenarioID,
                            action.type || "set_device_value",
                            deviceID,
                            action.property || null,
                            typeof action.value === "object" ? JSON.stringify(action.value) : (action.value || null),
                            action.valueType || "String",
                            action.delay || 0
                        );
                    }

                    return scenarioID;
                });

                data.ID = transaction(); // Commit transaction

                common.conLog("POST Request: insert into table 'scenarios'", "gre");
                common.conLog("Execute statement: " + insertScenario.sql, "std", false);
                common.conLog("Execute statement: " + insertTrigger.sql, "std", false);
                common.conLog("Execute statement: " + insertAction.sql, "std", false);
            }
            else {
                data.status = "error";
                data.error  = "Triggers and actions must be arrays";
            }
        }
        else {
            data.status = "error";
            data.error  = "Missing required fields: name, triggers, actions";
        }
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }
    
    return common.sendResponse(response, data, "Server route 'Scenarios'", "POST Request");
});

/**
 * @swagger
 * /scenarios/{scenarioID}:
 *   patch:
 *     summary: Update a scenario
 *     description: Update an existing scenario. Only the provided fields will be updated. If triggers or actions are provided, the existing ones will be replaced entirely.
 *     tags:
 *       - Scenarios
 *     parameters:
 *       - in: path
 *         name: scenarioID
 *         required: true
 *         description: The unique ID of the scenario to update
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Scenario Name"
 *               description:
 *                 type: string
 *                 example: "Updated description"
 *               enabled:
 *                 type: boolean
 *                 example: true
 *               priority:
 *                 type: integer
 *                 example: 1
 *               icon:    
 *                 type: string
 *                 example: "star"
 *               roomID:
 *                 type: integer
 *                 example: 2
 *               individualID:
 *                 type: integer
 *                 example: 4
 *               triggers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: "device_value"
 *                     uuid:
 *                       type: string
 *                       example: "12345"
 *                     bridge:
 *                       type: string
 *                       example: "bluetooth"
 *                     property:
 *                       type: string
 *                       example: "heartrate"
 *                     operator:
 *                       type: string 
 *                       enum: ["equals", "greater", "less", "between", "contains"]
 *                     value:
 *                       type: string
 *                       example: "100"
 *                     valueType:
 *                       type: string
 *                       enum: ["String", "Numeric", "Boolean"]
 *               actions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: "set_device_value"
 *                     uuid:
 *                       type: string
 *                       example: "12345"
 *                     bridge:
 *                       type: string
 *                       example: "bluetooth"
 *                     property:
 *                       type: string
 *                       example: "led"
 *                     value:
 *                       type: string
 *                       example: "on"
 *                     valueType:
 *                       type: string
 *                       enum: ["String", "Numeric", "Boolean"]
 *                     delay:
 *                       type: integer
 *                       example: 3
 *     responses:
 *       "200":
 *         description: Successfully updated scenario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
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
router.patch("/:scenarioID", async function (request, response) {
  const scenarioID = parseInt(request.params.scenarioID);
  const payload    = request.body;
  let data         = {};

  try {
    const result = await database.prepare("SELECT * FROM scenarios WHERE scenarioID = ?").get(scenarioID);
    if (result) {
      data.status = "ok";

      const transaction = database.transaction(() => {
        if (payload.name || payload.description !== undefined || payload.enabled !== undefined || payload.priority !== undefined || payload.icon !== undefined || payload.roomID !== undefined || payload.individualID !== undefined) { // Update scenario
            payload.enabled           = payload.enabled === true ? 1 : 0;
            payload.icon              = payload.icon || "";
            payload.roomID            = payload.roomID || null;
            payload.individualID      = payload.individualID || null;
          
            database.prepare("UPDATE scenarios SET name = COALESCE(?, name), description = COALESCE(?, description), enabled = COALESCE(?, enabled), priority = COALESCE(?, priority), icon = COALESCE(?, icon), roomID = COALESCE(?, roomID), individualID = COALESCE(?, individualID) WHERE scenarioID = ?").run(
                payload.name || null, payload.description !== undefined ? payload.description : null, payload.enabled !== undefined ? payload.enabled : null, payload.priority !== undefined ? payload.priority : null, payload.icon || null, payload.roomID || null, payload.individualID || null, scenarioID
            );
            common.conLog("PATCH Request: access table 'scenarios'", "gre");
        }

        if (payload.triggers) {  // Update triggers if provided
          database.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(scenarioID); // Delete existing triggers

          const insertTrigger = database.prepare("INSERT INTO scenarios_triggers (scenarioID, type, deviceID, property, operator, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?)"); // Insert new triggers — translate uuid+bridge → numeric deviceID

          for (const trigger of payload.triggers) {
            const triggerUUID   = trigger.uuid || null;
            const triggerBridge = trigger.bridge || null;
            const deviceID      = (triggerUUID && triggerBridge) ? getDeviceIDByUUID(database, triggerUUID, triggerBridge) : null;

            insertTrigger.run(scenarioID, trigger.type || "device_value", deviceID, trigger.property || null, trigger.operator || "equals", typeof trigger.value === "object" ? JSON.stringify(trigger.value) : (trigger.value || null), trigger.valueType || "String");
          }
          common.conLog("PATCH Request: access table 'scenarios'", "gre");
          common.conLog("Execute statement: " + insertTrigger.sql, "std", false);
        }

        if (payload.actions) { // Update actions if provided
          database.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(scenarioID); // Delete existing actions

          const insertAction = database.prepare("INSERT INTO scenarios_actions (scenarioID, type, deviceID, property, value, valueType, delay) VALUES (?, ?, ?, ?, ?, ?, ?)"); // Insert new actions — translate uuid+bridge → numeric deviceID

          for (const action of payload.actions) {
            const actionUUID   = action.uuid || null;
            const actionBridge = action.bridge || null;
            const deviceID     = (actionUUID && actionBridge) ? getDeviceIDByUUID(database, actionUUID, actionBridge) : null;

            insertAction.run(scenarioID, action.type || "set_device_value", deviceID, action.property || null, typeof action.value === "object" ? JSON.stringify(action.value) : (action.value || null), action.valueType || "String", action.delay || 0);
          }
          common.conLog("PATCH Request: access table 'scenarios'", "gre");
          common.conLog("Execute statement: " + insertAction.sql, "std", false);
        }
      });

      transaction();
    }
    else {
      data.status = "error";
      data.error  = "Scenario not found";
    }
  }
  catch (error) {
    data.status = "error";
    data.error  = "Fatal error: " + (error.stack).slice(0, 128);
  }

  return common.sendResponse(response, data, "Server route 'Scenarios'", "PATCH Request");
});

/**
 * @swagger
 * /scenarios/{scenarioID}:
 *   delete:
 *     summary: Delete a scenario
 *     description: Delete a scenario and all its associated triggers and actions
 *     tags:
 *       - Scenarios
 *     parameters:
 *       - in: path
 *         name: scenarioID
 *         required: true
 *         description: The unique ID of the scenario to delete
 *         schema:
 *           type: integer
 *     responses:
 *       "200":
 *         description: Successfully deleted scenario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
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
router.delete("/:scenarioID", async function (request, response) {
  const scenarioID = parseInt(request.params.scenarioID);
  let data         = {};

  try {
    const result = await database.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(scenarioID);

    if (result.changes === 0) {
      data.status = "error";
      data.error  = "Scenario not found";
    }
    else {
      data.status = "ok";
      common.conLog("DELETE Request: scenario '" + scenarioID + "' deleted successfully", "gre");

      database.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(scenarioID);
      database.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(scenarioID);
      common.conLog("DELETE Request: associated triggers and actions for scenario '" + scenarioID + "' deleted successfully", "gre");
    }
  }
  catch (error) {
    data.status = "error";
    data.error  = "Fatal error: " + (error.stack).slice(0, 128);
  }

  return common.sendResponse(response, data, "Server route 'Scenarios'", "DELETE Request");
});

/**
 * @swagger
 * /scenarios/{scenarioID}/execute:
 *   post:
 *     summary: Execute all actions for a scenario
 *     description: Manually trigger the execution of all actions for a specific scenario, regardless of its trigger conditions
 *     tags:
 *       - Scenarios
 *     parameters:
 *       - in: path
 *         name: scenarioID
 *         required: true
 *         description: The unique ID of the scenario to execute
 *         schema:
 *           type: integer
 *     responses:
 *       "200":
 *         description: Successfully executed scenario actions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
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
router.post("/:scenarioID/execute", async function (request, response) {
    const scenarioID = parseInt(request.params.scenarioID);
    let data         = {};

    try {
        const scenario = await database.prepare("SELECT * FROM scenarios WHERE scenarioID = ?").get(scenarioID);
        if (scenario) {
            await global.scenarios.executeScenarioActionsManually(scenarioID);

            data.status = "ok";
            common.conLog("POST Request: execute actions for scenario '" + scenarioID + "'", "gre");
        }
        else {
            data.status = "error";
            data.error  = "Scenario not found";
        }
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }

    return common.sendResponse(response, data, "Server route 'Scenarios'", "POST Request");
});

module.exports = router;