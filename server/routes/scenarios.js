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
 *                     bridge:
 *                       type: string
 *                     property:
 *                       type: string
 *                     operator:
 *                       type: string
 *                       enum: ["equals", "greater", "less", "between", "contains"]
 *                     value:
 *                       type: string
 *                     valueType:
 *                       type: string
 *                       enum: ["string", "number", "boolean"]
 *               actions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     deviceID:
 *                       type: string
 *                     bridge:
 *                       type: string
 *                     property:
 *                       type: string
 *                     value:
 *                       type: string
 *                     valueType:
 *                       type: string
 *                     delay:
 *                       type: integer
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
 *                ID:
 *                  type: integer
 *                  example: 1
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

                const transaction = database.transaction(async () => {
                    // insert scenario
                    const result = await insertScenario.run(
                        payload.name,
                        payload.description || "",
                        payload.enabled !== false,
                        payload.priority || 0
                    );

                    const scenarioID = result.lastInsertRowid;

                    // insert triggers
                    for (const trigger of payload.triggers) {
                        await insertTrigger.run(
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
                        await insertAction.run(
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
               
                common.conLog("POST Request: access table 'scenarios'", "gre");
                common.conLog("Execute statement: " + statement, "std", false);
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
 */
router.put("/:scenarioID", async function (request, response) {
  const scenarioID = parseInt(request.params.scenarioID);
  const payload    = request.body;

    try {
      const result = await database.prepare("SELECT * FROM scenarios WHERE scenarioID = ?").get(scenarioID);
      if (result) {
        data.status = "ok";




const transaction = database.transaction(async () => {
      // Update scenario
      if (payload.name || payload.description !== undefined || payload.enabled !== undefined || payload.priority !== undefined) {
        await database.prepare(`
          UPDATE scenarios 
          SET name = COALESCE(?, name),
              description = COALESCE(?, description),
              enabled = COALESCE(?, enabled),
              priority = COALESCE(?, priority),
              dateTimeModified = datetime('now')
          WHERE scenarioID = ?
        `).run(
          payload.name || null,
          payload.description !== undefined ? payload.description : null,
          payload.enabled !== undefined ? payload.enabled : null,
          payload.priority !== undefined ? payload.priority : null,
          scenarioID
        );
      }

      // Update triggers if provided
      if (payload.triggers) {
        // Delete existing triggers
        await database.prepare("DELETE FROM scenario_triggers WHERE scenarioID = ?").run(scenarioID);

        // Insert new triggers
        const insertTrigger = database.prepare(`
          INSERT INTO scenario_triggers (scenarioID, deviceID, bridge, property, operator, value, valueType)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const trigger of payload.triggers) {
          await insertTrigger.run(
            scenarioID,
            trigger.deviceID,
            trigger.bridge,
            trigger.property,
            trigger.operator || "equals",
            typeof trigger.value === 'object' ? JSON.stringify(trigger.value) : trigger.value,
            trigger.valueType || "string"
          );
        }
      }

      // Update actions if provided
      if (payload.actions) {
        // Delete existing actions
        await database.prepare("DELETE FROM scenario_actions WHERE scenarioID = ?").run(scenarioID);

        // Insert new actions
        const insertAction = await database.prepare(`
          INSERT INTO scenario_actions (scenarioID, deviceID, bridge, property, value, valueType, delay)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const action of payload.actions) {
          await insertAction.run(
            scenarioID,
            action.deviceID,
            action.bridge,
            action.property,
            typeof action.value === 'object' ? JSON.stringify(action.value) : action.value,
            action.valueType || "string",
            action.delay || 0
          );
        }
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
 */
router.delete("/:scenarioID", async function (request, response) {
  const scenarioID = parseInt(request.params.scenarioID);

  try {
    const result = database.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(scenarioID);

    if (result.changes === 0) {
      return response.status(404).json({
        status: "error",
        error: "Scenario not found"
      });
    }

    response.json({
      status: "ok",
      message: "Scenario deleted successfully"
    });

  } catch (error) {
    response.status(500).json({
      status: "error",
      error: error.message
    });
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
 */
router.post("/:scenarioID/toggle", async function (request, response) {
  const scenarioID = parseInt(request.params.scenarioID);

  try {
    const scenario = database.prepare("SELECT enabled FROM scenarios WHERE scenarioID = ?").get(scenarioID);
    
    if (!scenario) {
      return response.status(404).json({
        status: "error",
        error: "Scenario not found"
      });
    }

    const newState = !scenario.enabled;
    
    database.prepare(`
      UPDATE scenarios 
      SET enabled = ?, dateTimeModified = datetime('now') 
      WHERE scenarioID = ?
    `).run(newState, scenarioID);

    response.json({
      status: "ok",
      enabled: newState,
      message: `Scenario ${newState ? 'enabled' : 'disabled'} successfully`
    });

  } catch (error) {
    response.status(500).json({
      status: "error",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /scenarios/executions:
 *   get:
 *     summary: Get scenario execution history
 *     description: Retrieve the execution history of scenarios
 *     tags:
 *       - Scenarios
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 */
router.get("/executions", async function (request, response) {
  try {
    const limit = parseInt(request.query.limit) || 100;
    
    const executions = database.prepare(`
      SELECT 
        se.*,
        s.name as scenarioName
      FROM scenario_executions se
      JOIN scenarios s ON se.scenarioID = s.scenarioID
      ORDER BY se.executedAt DESC
      LIMIT ?
    `).all(limit);

    response.json({
      status: "ok",
      executions: executions
    });

  } catch (error) {
    response.status(500).json({
      status: "error",
      error: error.message
    });
  }
});

module.exports = router;