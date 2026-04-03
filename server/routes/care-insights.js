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
 * Builds SQL filters for supported query parameters.
 * @param {Object} queryParams
 * @returns {Object}
 */
function buildFilters(queryParams) {
    const response      = {};
    response.filters    = [];
    response.parameters = [];

    const allowedFilters = ["status", "type", "deviceID", "bridge", "property", "ruleID"];

    for (const filter of allowedFilters) {
        if ((queryParams[filter] !== undefined) && (String(queryParams[filter]).trim() !== "")) {
            response.filters.push(filter + " = ?");
            response.parameters.push(String(queryParams[filter]).trim());
        }
    }

    return response;
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
 *         name: severity
 *         required: false
 *         schema:
 *           type: string
 *           example: high
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
 *                       severity:
 *                         type: string
 *                         example: medium
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

        const filterResponse = buildFilters(request.query);

        let statement = "SELECT * FROM care_insights";
        if (filterResponse.filters.length > 0) {
            statement += " WHERE " + filterResponse.filters.join(" AND ");
        }
        statement += " ORDER BY dateTimeUpdated DESC, insightID DESC";

        const maxEntries = appConfig.CONF_tablesMaxEntriesReturned;
        let limit = maxEntries;
        if (request.query.limit !== undefined) { // allow client to specify a custom limit (e.g. for pagination), but enforce maximum limit from config
            const parsed = Number.parseInt(request.query.limit, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                limit = Math.min(parsed, maxEntries);
            }
        }
        statement += " LIMIT " + limit;

        common.conLog("GET Request: access table 'care_insights'", "gre");
        common.conLog("Execute statement: " + statement, "std", false);

        data.results = database.prepare(statement).all(...filterResponse.parameters).map((item) => enrichInsight(item));
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