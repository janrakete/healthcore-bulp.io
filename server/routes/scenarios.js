/**
 * =============================================================================================
 * Routes for Scenarios
 * ====================
 */
const appConfig     = require("../../config");
const router        = require("express").Router();

/**
 * @swagger
 * /scenarios:
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
 *                     type: object
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
router.get("/", async function (request, response) {
    let data       = {};
    try {
        data.status = "ok";

        const statement = "SELECT * FROM scenarios ORDER BY priority DESC, name ASC LIMIT ?"; 
        const results   = await database.prepare(statement).all(appConfig.CONF_tablesMaxEntriesReturned);

        for (const result of results) {         //convert 0/1 to false/true
          result.enabled = result.enabled === 1;
        }

        common.conLog("GET Request: access table 'scenarios'", "gre");
        common.conLog("Execute statement: " + statement, "std", false);

        for (const result of results) {
            result.triggers = await database.prepare("SELECT * FROM scenarios_triggers WHERE scenarioID = ? LIMIT ?").all(result.scenarioID, appConfig.CONF_tablesMaxEntriesReturned);
            result.actions  = await database.prepare("SELECT * FROM scenarios_actions WHERE scenarioID = ? ORDER BY delay ASC LIMIT ?").all(result.scenarioID, appConfig.CONF_tablesMaxEntriesReturned);
        }   

        data.results = results;
    } 
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + (error.stack).slice(0, 128);
    }

    if (data.status === "error") {
        common.conLog("GET Request: an error occured", "red");
    }

    common.conLog("Server route 'Scenarios' HTTP response: " + JSON.stringify(data), "std", false);    

    if (data.status === "ok") {
        return response.status(200).json(data);
    }
    else {
        return response.status(400).json(data);
    }
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
 *               triggers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     deviceID:
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
 *                       enum: ["string", "number", "boolean"]
 *                       example: "number"
 *               actions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     deviceID:
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
 *                       enum: ["string", "number", "boolean"]
 *                     delay:
 *                       type: integer
 *                       example: 300
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
                
                // begin transaction
                const insertScenario    = database.prepare("INSERT INTO scenarios (name, description, enabled, priority) VALUES (?, ?, ?, ?)");
                const insertTrigger     = database.prepare("INSERT INTO scenarios_triggers (scenarioID, deviceID, bridge, property, operator, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?)");
                const insertAction      = database.prepare("INSERT INTO scenarios_actions (scenarioID, deviceID, bridge, property, value, valueType, delay) VALUES (?, ?, ?, ?, ?, ?, ?)");

                const transaction = database.transaction(() => {
                    // insert scenario
                    const result = insertScenario.run(
                        payload.name,
                        payload.description || "",
                        payload.enabled === true ? 1 : 0,
                        payload.priority || 0
                    );

                    const scenarioID = result.lastInsertRowid;

                    // insert triggers
                    for (const trigger of payload.triggers) {
                        insertTrigger.run(
                        scenarioID,
                        trigger.deviceID,
                        trigger.bridge,
                        trigger.property,
                        trigger.operator || "equals",
                        typeof trigger.value === "object" ? JSON.stringify(trigger.value) : trigger.value,
                        trigger.valueType || "string"
                        );
                    }

                    // insert actions
                    for (const action of payload.actions) {
                        insertAction.run(
                        scenarioID,
                        action.deviceID,
                        action.bridge,
                        action.property,
                        typeof action.value === "object" ? JSON.stringify(action.value) : action.value,
                        action.valueType || "string",
                        action.delay || 0
                        );
                    }

                    return scenarioID;
                });

                data.ID = transaction(); // commit transaction

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
    
    if (data.status === "error") {
        common.conLog("POST Request: an error occured", "red");
    }

    common.conLog("Server route 'Scenarios' HTTP response: " + JSON.stringify(data), "std", false);    

    if (data.status === "ok") {
        return response.status(200).json(data);
    }
    else {
        return response.status(400).json(data);
    }
});

/**
 * @swagger
 * /scenarios/{scenarioID}:
 *   put:
 *     summary: Update a scenario
 *     description: Update an existing scenario
 *     tags:
 *       - Scenarios
 *     parameters:
 *       - in: path
 *         name: scenarioID
 *         required: true
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
 *               triggers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     deviceID:
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
 *                       type: integer
 *                       enum: ["string", "number", "boolean"]
 *               actions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     deviceID:
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
 *                       enum: ["string", "number", "boolean"]
 *                     delay:
 *                       type: integer
 *                       example: 1000
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
router.put("/:scenarioID", async function (request, response) {
  const scenarioID = parseInt(request.params.scenarioID);
  const payload    = request.body;
  let data         = {};

  try {
    const result = await database.prepare("SELECT * FROM scenarios WHERE scenarioID = ?").get(scenarioID);
    if (result) {
      data.status = "ok";

      const transaction = database.transaction(() => {
        // Update scenario
        if (payload.name || payload.description !== undefined || payload.enabled !== undefined || payload.priority !== undefined) {
          if (payload.enabled !== undefined) { // convert boolean to 0/1
            payload.enabled = payload.enabled === true ? 1 : 0;
          }
          
          database.prepare("UPDATE scenarios SET name = COALESCE(?, name), description = COALESCE(?, description), enabled = COALESCE(?, enabled), priority = COALESCE(?, priority) WHERE scenarioID = ?").run(
            payload.name || null, payload.description !== undefined ? payload.description : null, payload.enabled !== undefined ? payload.enabled : null, payload.priority !== undefined ? payload.priority : null, scenarioID
          );
          common.conLog("PUT Request: access table 'scenarios'", "gre");
        }

        // Update triggers if provided
        if (payload.triggers) {
          // Delete existing triggers
          database.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(scenarioID);

          // Insert new triggers
          const insertTrigger = database.prepare("INSERT INTO scenarios_triggers (scenarioID, deviceID, bridge, property, operator, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?)");

          for (const trigger of payload.triggers) {
            insertTrigger.run(scenarioID, trigger.deviceID, trigger.bridge, trigger.property, trigger.operator || "equals", typeof trigger.value === "object" ? JSON.stringify(trigger.value) : trigger.value, trigger.valueType || "string");
          }
          common.conLog("PUT Request: access table 'scenarios'", "gre");
          common.conLog("Execute statement: " + insertTrigger.sql, "std", false);
        }

        // Update actions if provided
        if (payload.actions) {
          // Delete existing actions
          database.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(scenarioID);

          // Insert new actions
          const insertAction = database.prepare("INSERT INTO scenarios_actions (scenarioID, deviceID, bridge, property, value, valueType, delay) VALUES (?, ?, ?, ?, ?, ?, ?)");

          for (const action of payload.actions) {
            insertAction.run(scenarioID, action.deviceID, action.bridge, action.property, typeof action.value === "object" ? JSON.stringify(action.value) : action.value, action.valueType || "string", action.delay || 0);
          }
          common.conLog("PUT Request: access table 'scenarios'", "gre");
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

  if (data.status === "error") {
      common.conLog("PUT Request: an error occured", "red");
  }

  common.conLog("Server route 'Scenarios' HTTP response: " + JSON.stringify(data), "std", false);    

  if (data.status === "ok") {
      return response.status(200).json(data);
  }
  else {
      return response.status(400).json(data);
  }
});

/**
 * @swagger
 * /scenarios/{scenarioID}:
 *   delete:
 *     summary: Delete a scenario
 *     description: Delete a scenario and all its triggers and actions
 *     tags:
 *       - Scenarios
 *     parameters:
 *       - in: path
 *         name: scenarioID
 *         required: true
 *         schema:
 *           type: integer
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
    }
  }
  catch (error) {
    data.status = "error";
    data.error  = "Fatal error: " + (error.stack).slice(0, 128);
  }

  if (data.status === "error") {
    common.conLog("DELETE Request: an error occured", "red");
  }

  common.conLog("Server route 'Scenarios' HTTP response: " + JSON.stringify(data), "std", false);

  if (data.status === "ok") {
      return response.status(200).json(data);
  }
  else {
      return response.status(400).json(data);
  }
});

/**
 * @swagger
 * /scenarios/{scenarioID}/toggle:
 *   post:
 *     summary: Toggle scenario enabled/disabled
 *     description: Enable or disable a scenario
 *     tags:
 *       - Scenarios
 *     parameters:
 *       - in: path
 *         name: scenarioID
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       "200":
 *         description: Successfully toggled scenario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 state:
 *                   type: integer
 *                   example: 1
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
router.post("/:scenarioID/toggle", async function (request, response) {
  const scenarioID = parseInt(request.params.scenarioID);
  let data         = {};

  try {
    const scenario = database.prepare("SELECT enabled FROM scenarios WHERE scenarioID = ?").get(scenarioID);

    if (scenario !== undefined) {
      data.status    = "ok";
      const newState = scenario.enabled === 1 ? 0 : 1;
      database.prepare("UPDATE scenarios SET enabled = ? WHERE scenarioID = ?").run(newState, scenarioID);
      common.conLog("POST (toggle) Request: scenario '" + scenarioID + "' toggled successfully", "gre");
      data.state = newState === 1 ? true : false;
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
 
  if (data.status === "error") {
    common.conLog("POST (toggle) Request: an error occured", "red");
  }

  common.conLog("Server route 'Scenarios' HTTP response: " + JSON.stringify(data), "std", false);

  if (data.status === "ok") {
      return response.status(200).json(data);
  }
  else {
      return response.status(400).json(data);
  }
});

module.exports = router;