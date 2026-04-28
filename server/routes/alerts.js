/**
 * =============================================================================================
 * Routes for Alerts
 * =============================================================================================
 */
const appConfig    = require("../../config");
const router       = require("express").Router();
const AlertsEngine = require("../libs/AlertsEngine");

const allowedStatuses = ["open", "acknowledged", "resolved", "critical"];

/**
 * =============================================================================================
 * Helper functions
 * ================
 */

/**
 * Enriches an alert with related device, scenario, person and room context.
 * @param {Object} alert
 * @returns {Object}
 */
function enrichAlert(alert) {
    if ((alert === undefined) || (alert === null)) {
        return alert;
    }

    const enrichedAlert = { ...alert };

    if ((alert.deviceID !== undefined) && (alert.deviceID !== null) && Number(alert.deviceID) > 0) {
        const device = database.prepare("SELECT deviceID, uuid, bridge, name, productName, vendorName, description FROM devices WHERE deviceID = ? LIMIT 1").get(alert.deviceID);

        if (device !== undefined) {
            enrichedAlert.device = device;
        }
    }

    if (Number(alert.scenarioID) > 0) {
        const scenario = database.prepare("SELECT scenarioID, name, icon FROM scenarios WHERE scenarioID = ? LIMIT 1").get(alert.scenarioID);

        if (scenario !== undefined) {
            enrichedAlert.scenario = scenario;
        }
    }

    if (Number(alert.individualID) > 0) {
        const individual = database.prepare("SELECT individualID, firstname, lastname, roomID FROM individuals WHERE individualID = ? LIMIT 1").get(alert.individualID);

        if (individual !== undefined) {
            enrichedAlert.individual = individual;
        }
    }

    if (Number(alert.roomID) > 0) {
        const room = database.prepare("SELECT roomID, name FROM rooms WHERE roomID = ? LIMIT 1").get(alert.roomID);

        if (room !== undefined) {
            enrichedAlert.room = room;
        }
    }

    return enrichedAlert;
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
 * /alerts:
 *   get:
 *     summary: Get all Alerts
 *     description: This endpoint retrieves stored Alerts. Optional filters can be provided for status, type, device and property.
 *     tags:
 *       - Alerts
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
 *           example: AnomalyDetection
 *       - in: query
 *         name: deviceID
 *         required: false
 *         schema:
 *           type: integer
 *           example: 5
 *       - in: query
 *         name: property
 *         required: false
 *         schema:
 *           type: string
 *           example: heartRate
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
 *         description: Successfully retrieved Alerts
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
 *                       alertID:
 *                         type: integer
 *                         example: 42
 *                       ruleID:
 *                         type: integer
 *                         example: 12
 *                       scenarioID:
 *                         type: integer
 *                         example: 0
 *                       type:
 *                         type: string
 *                         example: AnomalyDetection
 *                       status:
 *                         type: string
 *                         example: open
 *                       score:
 *                         type: number
 *                         example: 0.85
 *                       deviceID:
 *                         type: integer
 *                         example: 5
 *                       property:
 *                         type: string
 *                         example: heartRate
 *                       individualID:
 *                         type: integer
 *                         example: 5
 *                       roomID:
 *                         type: integer
 *                         example: 3
 *                       dateTimeAdded:
 *                         type: string
 *                         example: "2025-01-15 14:30:00"
 *                       dateTimeUpdated:
 *                         type: string
 *                         example: "2025-01-15 15:00:00"
 *                       dateTimeResolved:
 *                         type: string
 *                         nullable: true
 *                         example: null
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

        const condition = await buildWhereClause("alerts", request.query);
        if (condition.status === "ok") {
            let sql = "SELECT * FROM alerts" + condition.condition;

            if (!sql.toUpperCase().includes(" ORDER BY ")) { // if statement contains no ORDER BY clause, add a default one (insert before LIMIT if present)
                const orderByClause = " ORDER BY dateTimeUpdated DESC, alertID DESC";
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

            common.conLog("GET Request: access table 'alerts'", "gre");
            common.conLog("Execute statement: " + sql, "std", false);

            data.results = database.prepare(sql).all(condition.parameters).map((item) => enrichAlert(item));
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

    return common.sendResponse(response, data, "Server route 'Alerts'", "GET request alerts");
});

/**
 * @swagger
 * /alerts/stats:
 *   get:
 *     summary: Get Alert statistics
 *     description: This endpoint retrieves a compact statistics object for open, acknowledged, resolved and critical Alerts.
 *     tags:
 *       - Alerts
 *     responses:
 *       "200":
 *         description: Successfully retrieved Alert statistics
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
        data.status            = "ok";
        data.data              = {};
        data.data.open         = database.prepare("SELECT COUNT(*) AS total FROM alerts WHERE status = 'open'").get().total;
        data.data.acknowledged = database.prepare("SELECT COUNT(*) AS total FROM alerts WHERE status = 'acknowledged'").get().total;
        data.data.resolved     = database.prepare("SELECT COUNT(*) AS total FROM alerts WHERE status = 'resolved'").get().total;
        data.data.critical     = database.prepare("SELECT COUNT(*) AS total FROM alerts WHERE status = 'critical'").get().total;
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + error.message;
    }

    return common.sendResponse(response, data, "Server route 'Alerts'", "GET request alert stats");
});

/**
 * @swagger
 * /alerts/{alertID}:
 *   get:
 *     summary: Get a specific Alert
 *     description: This endpoint retrieves one Alert together with its signals.
 *     tags:
 *       - Alerts
 *     parameters:
 *       - in: path
 *         name: alertID
 *         required: true
 *         schema:
 *           type: integer
 *           example: 42
 *     responses:
 *       "200":
 *         description: Successfully retrieved Alert details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 alert:
 *                   type: object
 *                   description: The Alert with enriched device, scenario, individual and room data
 *                 signals:
 *                   type: array
 *                   description: List of signals associated with this Alert, ordered by signalID descending
 *       "400":
 *         description: Invalid request or Alert not found
 */
router.get("/:alertID", async function (request, response) {
    const alertID = Number.parseInt(request.params.alertID, 10);
    let data      = {};

    try {
        common.conLog("GET Request: access table 'alerts' via ID " + alertID, "gre");
        const alert = database.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alertID);

        if (alert) {
            data.status  = "ok";
            data.alert   = enrichAlert(alert);
            data.signals = database.prepare("SELECT * FROM alert_signals WHERE alertID = ? ORDER BY signalID DESC").all(alertID);
        }
        else {
            data.status = "error";
            data.error  = "Alert not found";
        }
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + error.message;
    }

    return common.sendResponse(response, data, "Server route 'Alerts'", "GET request alert detail");
});

/**
 * @swagger
 * /alerts/{alertID}:
 *   patch:
 *     summary: Update Alert status
 *     description: This endpoint updates the workflow status of an Alert.
 *     tags:
 *       - Alerts
 *     parameters:
 *       - in: path
 *         name: alertID
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
 *         description: Successfully updated the Alert
 *       "400":
 *         description: Invalid status, alert not found, or route error
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
router.patch("/:alertID", async function (request, response) {
    const alertID    = Number.parseInt(request.params.alertID, 10);
    const nextStatus = String(request.body.status || "").trim();
    let data         = {};

    try {
        if (!allowedStatuses.includes(nextStatus)) {
            data.status = "error";
            data.error  = "Invalid status";
        }
        else {
            common.conLog("PATCH request for Alert via ID " + alertID, "gre");
            const alert = database.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alertID);

            if (alert) {
                const previousStatus = alert.status;

                database.prepare("UPDATE alerts SET status = ?, dateTimeResolved = CASE WHEN ? = 'resolved' THEN datetime('now', 'localtime') ELSE dateTimeResolved END, dateTimeUpdated = datetime('now', 'localtime') WHERE alertID = ?").run(nextStatus, nextStatus, alertID);

                const updatedAlert = database.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alertID);
                if (previousStatus !== nextStatus) {
                    if (nextStatus === "resolved") { // trigger special event for resolved status to allow scenario engine to react specifically on resolution
                        AlertsEngine.triggerScenarioEvent("alert_resolved", updatedAlert);
                    }
                    else { // trigger a general event for any status update to allow scenario engine to react on status changes (e.g. acknowledged or critical)
                        AlertsEngine.triggerScenarioEvent("alert_updated", updatedAlert);
                    }
                }

                data.status = "ok";
            }
            else {
                data.status = "error";
                data.error  = "Alert not found";
            }
        }
    }
    catch (error) {
        data.status = "error";
        data.error  = "Fatal error: " + error.message;
    }

    return common.sendResponse(response, data, "Server route 'Alerts'", "PATCH request alert");
});

module.exports = router;
