/**
 * =============================================================================================
 * Routes for Care Insights
 * =============================================================================================
 */
const appConfig          = require("../../config");
const router             = require("express").Router();
const CareInsightsEngine = require("../libs/CareInsightsEngine");

const allowedStatuses    = ["open", "acknowledged", "resolved", "critical"];

/**
 * =============================================================================================
 * Helper functions
 * ================
 */

/**
 * Enriches a Care Insight with related device, person and room context.
 * @param {Object} insight
 * @returns {Object}
 */
function enrichInsight(insight) {
    if ((insight === undefined) || (insight === null)) {
        return insight;
    }

    const enrichedInsight = { ...insight };

    if ((insight.deviceID !== undefined) && (insight.deviceID !== null) && (String(insight.deviceID).trim() !== "") && (insight.bridge !== undefined) && (insight.bridge !== null)) {
        const device = database.prepare("SELECT deviceID, bridge, name, productName, vendorName, description FROM devices WHERE deviceID = ? AND bridge = ? LIMIT 1").get(insight.deviceID, insight.bridge);

        if (device !== undefined) {
            enrichedInsight.device = device;
        }
    }

    if (Number(insight.individualID) > 0) {
        const individual = database.prepare("SELECT individualID, firstname, lastname, roomID FROM individuals WHERE individualID = ? LIMIT 1").get(insight.individualID);

        if (individual !== undefined) {
            enrichedInsight.individual = individual;
        }
    }

    if (Number(insight.roomID) > 0) {
        const room = database.prepare("SELECT roomID, name FROM rooms WHERE roomID = ? LIMIT 1").get(insight.roomID);

        if (room !== undefined) {
            enrichedInsight.room = room;
        }
    }

    return enrichedInsight;
}

/**
 * Validates that a name (table or column) contains only safe characters.
 * @param {string} name - The name to validate.
 * @returns {boolean} - Returns true if the name is safe, false otherwise.
 * @description Only allows alphanumeric characters and underscores. Prevents SQL injection through table or column names.
 */
function validateSqlIdentifier(name) {
    return typeof name === "string" && /^[a-zA-Z0-9_]+$/.test(name);
}

/**
 * This function builds a WHERE condition for SQL queries based on the provided payload.
 * @function buildWhereClause
 * @param {string} table - The name of the table to build the condition for.
 * @param {object} payload - The JSON payload containing the conditions to be applied.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed WHERE condition.
 * @description This function checks if the keys in the payload match the columns of the specified table. If they do, it constructs a WHERE condition string for use in SQL queries. If any key does not match, it returns an error.
 */
function buildWhereClause(table, payload) {
    let response = {};

    if (!validateSqlIdentifier(table)) {
        response.status = "error";
        response.error  = "Invalid table name";
        return response;
    }

    const results     = database.pragma("table_info('" + table + "')"); // get all columns for the table
    const columnsList = results.map(result => result.name);

    let orderByString = ""; // if payload contains orderBy block, remove it from payload and save it for later processing
    if (payload.orderBy !== undefined) {
        orderByString = payload.orderBy;
        delete payload.orderBy;
    }

    let limitString = ""; // if payload contains limit block, remove it from payload and save it for later processing
    if (payload.limit !== undefined) {
        limitString = payload.limit;
        delete payload.limit;
    }

    response.condition  = "";
    response.parameters = {};

    let conditions = [];

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        for (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
            if (columnsList.includes(key)) { // if key is an existing table column ...
                response.status = "ok"; // ... return ok

                const paramKey = "cond_" + key; // unique param name for condition
                conditions.push(key + "=@" + paramKey);
                response.parameters[paramKey] = value;
            }
            else { // if key is not an existing table column
                response.status    = "error"; // ... return error
                response.error     = "Given column '" + key + "' in condition block does not exists in table";
                response.parameters = {}; // reset
                break;
            }
        }

        if (response.status === "ok" && conditions.length > 0) {
            response.condition = " WHERE " + conditions.join(" AND ");
        }
        else if (response.status === "error") {
            // error already set
        }
        else {
            response.status = "ok";
        }
    }
    else {
        response.status = "ok"; // if payload is empty it's also ok, no WHERE condition returned
    }

    if (response.status === "ok") { // if status is ok ...
        if (orderByString !== "") { // ... process orderBy block
            const orderByResponse = buildOrderByClause(orderByString, table);
            if (orderByResponse.status === "ok") {
                response.condition = response.condition + orderByResponse.statement;
            }
            else {
                response.status = "error";
                response.error  = orderByResponse.error;
            }
        }

        if (limitString !== "") { // ... process limit block
            const limitResponse = buildLimitClause(limitString);
            if (limitResponse.status === "ok") {
                response.condition = response.condition + limitResponse.statement;
            }
            else {
                response.status = "error";
                response.error  = limitResponse.error;
            }
        }
    }

    return (response);
}

/**
 * This function builds a LIMIT clause for SQL queries based on the provided limit value.
 * @function buildLimitClause
 * @param {string|number} limitValue - The limit value for the SQL query.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed LIMIT clause.
 * @description This function checks if the provided limit value is a valid positive integer. If it is, it constructs a LIMIT clause for SQL queries. If not, it returns an error.
 */
function buildLimitClause(limitValue) {
    let response = {};
    const limitNumber = parseInt(limitValue, 10);

    if (!isNaN(limitNumber) && limitNumber > 0) { // if limit is a valid positive integer ...
        response.status    = "ok"; // ... return ok and ...
        response.statement = " LIMIT " + limitNumber;
    }
    else { // if limit is not a valid positive integer
        response.statement   = "";
        response.status      = "error"; // ... return error
        response.error       = "Given limit value '" + limitValue + "' is not a valid positive integer";
    }
    return (response);
}

/**
 * This function builds an ORDER BY clause for SQL queries based on the provided orderBy string.
 * @function buildOrderByClause
 * @param {string} orderByString - The orderBy string in the format "column,direction" (e.g., "dateTime,DESC").
 * @param {string} table - The name of the table to validate the column against.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed ORDER BY clause.
 * @description This function checks if the specified column exists in the table. If it does, it constructs an ORDER BY clause with the specified direction (ASC or DESC). If the column does not exist, it returns an error.
 */
function buildOrderByClause(orderByString, table) {
    const column   = orderByString.split(",")[0]; // first part column name
    let direction  = orderByString.split(",")[1]; // second part direction (ASC or DESC)

    direction = (direction && direction.toUpperCase() === "DESC") ? "DESC" : "ASC"; // default direction

    let response = {};

    if (!validateSqlIdentifier(column)) {
        response.status = "error";
        response.error  = "Invalid column name in orderBy";
        return response;
    }

    const results     = database.pragma("table_info('" + table + "')"); // get all columns for the table
    const columnsList = results.map(result => result.name);

    if (columnsList.includes(column)) { // if key is an existing table column ...
        response.status    = "ok"; // ... return ok and ...
        response.statement = " ORDER BY " + column + " " + direction;
    }
    else { // if key is not an existing table column
        response.statement   = "";
        response.status      = "error"; // ... return error
        response.error       = "Given column '" + column + "' in orderBy block does not exists in table";
    }
    return (response);
}

/**
 * @swagger
 * /care-insights:
 *   get:
 *     summary: Get all Care Insights
 *     description: This endpoint retrieves stored Care Insights. Optional filters can be provided for status, type, device and property.
 *     tags:
 *       - Care Insights
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           example: open
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           example: hydration
 *       - in: query
 *         name: deviceID
 *         required: false
 *         schema:
 *           type: string
 *           example: sensor-001
 *       - in: query
 *         name: bridge
 *         required: false
 *         schema:
 *           type: string
 *           example: zigbee
 *       - in: query
 *         name: property
 *         required: false
 *         schema:
 *           type: string
 *           example: hydration
 *       - in: query
 *         name: ruleID
 *         required: false
 *         schema:
 *           type: integer
 *           example: 12
 *       - in: query
 *         name: orderBy
 *         required: false
 *         description: Order results by a column in the format "column,direction" (e.g., "dateTimeUpdated,DESC").
 *         schema:
 *           type: string
 *           example: dateTimeUpdated,DESC
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           example: 100
 *     responses:
 *       "200":
 *         description: Successfully retrieved Care Insights
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       insightID:
 *                         type: integer
 *                         example: 42
 *                       ruleID:
 *                         type: integer
 *                         example: 12
 *                       type:
 *                         type: string
 *                         example: hydration
 *                       status:
 *                         type: string
 *                         example: open
 *                       score:
 *                         type: number
 *                         example: 63.5
 *                       deviceID:
 *                         type: string
 *                         example: sensor-001
 *                       bridge:
 *                         type: string
 *                         example: zigbee
 *                       property:
 *                         type: string
 *                         example: hydration
 *       "400":
 *         description: Bad request or internal route error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 error:
 *                   type: string
 *                   example: "Fatal error: <message>"
 */
router.get("/", async function (request, response) {
    let data = {};

    try {
        data.status = "ok";

        const condition = await buildWhereClause("care_insights", request.query);
        if (condition.status === "ok") {
            let sql = "SELECT * FROM care_insights" + condition.condition;

            if (!sql.toUpperCase().includes(" ORDER BY ")) { // if statement contains no ORDER BY clause, add a default one (insert before LIMIT if present)
                const orderByClause = " ORDER BY dateTimeUpdated DESC, insightID DESC";
                const limitPos = sql.toUpperCase().indexOf(" LIMIT ");
                if (limitPos !== -1) {
                    sql = sql.substring(0, limitPos) + orderByClause + sql.substring(limitPos);
                } else {
                    sql += orderByClause;
                }
            }

            if (!sql.toUpperCase().includes(" LIMIT ")) { // if statement contains no LIMIT clause, add a default one to avoid overload
                sql += " LIMIT " + appConfig.CONF_tablesMaxEntriesReturned;
            }

            common.conLog("GET Request: access table 'care_insights'", "gre");
            common.conLog("Execute statement: " + sql, "std", false);

            data.results = database.prepare(sql).all(condition.parameters).map((item) => enrichInsight(item));
        }
        else {
            data.status = condition.status;
            data.error  = condition.error;
        }
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + error.message;
    }

    return common.sendResponse(response, data, "Server route 'Care Insights'", "GET request care insights");
});

/**
 * @swagger
 * /care-insights/stats:
 *   get:
 *     summary: Get Care Insight statistics
 *     description: This endpoint retrieves a compact statistics object for open, acknowledged, resolved and critical Care Insights.
 *     tags:
 *       - Care Insights
 *     responses:
 *       "200":
 *         description: Successfully retrieved Care Insight statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 data:
 *                   type: object
 *                   properties:
 *                     open:
 *                       type: integer
 *                       example: 4
 *                     acknowledged:
 *                       type: integer
 *                       example: 2
 *                     resolved:
 *                       type: integer
 *                       example: 10
 *                     critical:
 *                       type: integer
 *                       example: 1
 *       "400":
 *         description: Bad request or internal route error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 error:
 *                   type: string
 *                   example: "Fatal error: <message>"
 */
router.get("/stats", async function (request, response) {
    let data = {};

    try {
        data.status                  = "ok";
        data.data                    = {};
        data.data.open               = database.prepare("SELECT COUNT(*) AS total FROM care_insights WHERE status = 'open'").get().total;
        data.data.acknowledged       = database.prepare("SELECT COUNT(*) AS total FROM care_insights WHERE status = 'acknowledged'").get().total;
        data.data.resolved           = database.prepare("SELECT COUNT(*) AS total FROM care_insights WHERE status = 'resolved'").get().total;
        data.data.critical           = database.prepare("SELECT COUNT(*) AS total FROM care_insights WHERE status = 'critical'").get().total;
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + error.message;
    }

    return common.sendResponse(response, data, "Server route 'Care Insights'", "GET request care insight stats");
});

/**
 * @swagger
 * /care-insights/{insightID}:
 *   get:
 *     summary: Get a specific Care Insight
 *     description: This endpoint retrieves one Care Insight together with its signals.
 *     tags:
 *       - Care Insights
 *     parameters:
 *       - in: path
 *         name: insightID
 *         required: true
 *         schema:
 *           type: integer
 *           example: 42
 *     responses:
 *       "200":
 *         description: Successfully retrieved Care Insight details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 insight:
 *                   type: object
 *                 signals:
 *                   type: array
 *                   items:
 *                     type: object
 *       "400":
 *         description: Invalid request or Care Insight not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 error:
 *                   type: string
 *                   example: Care Insight not found
 */
router.get("/:insightID", async function (request, response) {
    const insightID = Number.parseInt(request.params.insightID, 10);
    let data        = {};

    try {
        common.conLog("GET Request: access table 'care_insights' via ID " + insightID, "gre");
        const insight = database.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insightID);

        if (insight) {
            data.status  = "ok";
            data.insight = enrichInsight(insight);
            data.signals = database.prepare("SELECT * FROM care_insight_signals WHERE insightID = ? ORDER BY signalID DESC").all(insightID);
        }
        else {
            data.status = "error";
            data.error  = "Care Insight not found";
        }
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + error.message;
    }

    return common.sendResponse(response, data, "Server route 'Care Insights'", "GET request care insight detail");
});

/**
 * @swagger
 * /care-insights/{insightID}:
 *   patch:
 *     summary: Update Care Insight status
 *     description: This endpoint updates the workflow status of a Care Insight.
 *     tags:
 *       - Care Insights
 *     parameters:
 *       - in: path
 *         name: insightID
 *         required: true
 *         schema:
 *           type: integer
 *           example: 42
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, acknowledged, resolved, critical]
 *                 example: resolved
 *             required:
 *               - status
 *     responses:
 *       "200":
 *         description: Successfully updated the Care Insight
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *       "400":
 *         description: Invalid status, insight not found, or route error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 error:
 *                   type: string
 *                   example: Invalid status
 */
router.patch("/:insightID", async function (request, response) {
    const insightID  = Number.parseInt(request.params.insightID, 10);
    const nextStatus = String(request.body.status || "").trim();
    let data         = {};

    try {
        if (!allowedStatuses.includes(nextStatus)) {
            data.status = "error";
            data.error  = "Invalid status";
        }
        else {
            common.conLog("PATCH request for Care Insight via ID " + insightID, "gre");
            const insight = database.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insightID);

            if (insight) {
                const previousStatus = insight.status;

                database.prepare("UPDATE care_insights SET status = ?, dateTimeResolved = CASE WHEN ? = 'resolved' THEN datetime('now', 'localtime') ELSE dateTimeResolved END, dateTimeUpdated = datetime('now', 'localtime') WHERE insightID = ?").run(nextStatus, nextStatus, insightID);

                const updatedInsight = database.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insightID);
                if (previousStatus !== nextStatus) {
                    if (nextStatus === "resolved") { // trigger special event for resolved status to allow scenario engine to react specifically on resolution (e.g. to stop a timer that was started when the insight was created)
                        CareInsightsEngine.triggerScenarioEvent("care_insight_resolved", updatedInsight);
                    }
                    else { // trigger a general event for any status update to allow scenario engine to react on status changes (e.g. to send a notification when an insight is acknowledged or becomes critical)
                        CareInsightsEngine.triggerScenarioEvent("care_insight_updated", updatedInsight);
                    }
                }

                data.status = "ok";
            }
            else {
                data.status = "error";
                data.error  = "Care Insight not found";
            }
        }
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + error.message;
    }

    return common.sendResponse(response, data, "Server route 'Care Insights'", "PATCH request care insight");
});

module.exports = router;