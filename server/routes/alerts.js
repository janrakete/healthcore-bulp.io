/**
 * =============================================================================================
 * Routes for Alerts
 * =============================================================================================
 */
const appConfig    = require("../../config");
const router       = require("express").Router();
const AlertsEngine = require("../libs/AlertsEngine");

const { buildWhereClause } = require("./_sqlQueryBuilders");

const STATUSES_ALLOWED = ["open", "acknowledged", "resolved", "critical"];

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
    const data = {};

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

            common.conLog("Server route 'Alerts': GET Request: access table 'alerts'", "gre");
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
        data.error  = error.message;
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
    const data = {};

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
        data.error  = error.message;
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
        common.conLog("Server route 'Alerts': GET Request: access table 'alerts' via ID " + alertID, "gre");
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
        data.error  = error.message;
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
        if (!STATUSES_ALLOWED.includes(nextStatus)) {
            data.status = "error";
            data.error  = "Invalid status";
        }
        else {
            common.conLog("Server route 'Alerts': PATCH request for Alert via ID " + alertID, "gre");
            const alert = database.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alertID);

            if (alert) {
                const previousStatus = alert.status;

                database.prepare("UPDATE alerts SET status = ?, dateTimeResolved = CASE WHEN ? = 'resolved' THEN CASE WHEN status = 'resolved' THEN dateTimeResolved ELSE datetime('now', 'localtime') END ELSE NULL END, dateTimeUpdated = datetime('now', 'localtime') WHERE alertID = ?").run(nextStatus, nextStatus, alertID);

                const updatedAlert = database.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alertID);
                if (previousStatus !== nextStatus) {
                    if (nextStatus === "resolved") { // trigger special event for resolved status to allow scenario engine to react specifically on resolution
                        common.conLog("Server route 'Alerts': Alert resolved, triggering scenario event", "gre");
                        AlertsEngine.triggerScenarioEvent("alert_resolved", updatedAlert);
                    }
                    else { // trigger a general event for any status update to allow scenario engine to react on status changes (e.g. acknowledged or critical)
                        AlertsEngine.triggerScenarioEvent("alert_updated", updatedAlert);
                    }
                }

                data.status  = "ok";
            }
            else {
                data.status = "error";
                data.error  = "Alert not found";
            }
        }
    }
    catch (error) {
        data.status = "error";
        data.error  = error.message;
    }

    return common.sendResponse(response, data, "Server route 'Alerts'", "PATCH request alert");
});

module.exports = router;
