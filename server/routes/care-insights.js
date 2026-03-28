/**
 * =============================================================================================
 * Routes for Care Insights
 * =============================================================================================
 */
const router                  = require("express").Router();

const allowedStatuses         = ["open", "acknowledged", "resolved", "dismissed"];
const allowedFeedbackTypes    = ["helpful", "false_positive", "resolved", "escalated", "ignored"];

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
        const device = database.prepare(
            "SELECT deviceID, bridge, name, productName, vendorName, description FROM devices WHERE deviceID = ? AND bridge = ? LIMIT 1"
        ).get(insight.deviceID, insight.bridge);

        if (device !== undefined) {
            enrichedInsight.device = device;
        }
    }

    if (Number(insight.individualID) > 0) {
        const individual = database.prepare(
            "SELECT individualID, firstname, lastname, roomID FROM individuals WHERE individualID = ? LIMIT 1"
        ).get(insight.individualID);

        if (individual !== undefined) {
            enrichedInsight.individual = individual;
        }
    }

    if (Number(insight.roomID) > 0) {
        const room = database.prepare(
            "SELECT roomID, name FROM rooms WHERE roomID = ? LIMIT 1"
        ).get(insight.roomID);

        if (room !== undefined) {
            enrichedInsight.room = room;
        }
    }

    return enrichedInsight;
}

function triggerCareInsightScenarioEvent(eventType, insight) {
    if ((global.scenarios === undefined) || (insight === undefined) || (insight === null)) {
        return;
    }

    global.scenarios.handleEvent(eventType, {
        insightID: insight.insightID,
        ruleID: Number(insight.ruleID) || 0,
        insightType: insight.type,
        severity: insight.severity,
        score: Number(insight.score) || 0,
        status: insight.status,
        deviceID: insight.deviceID || "",
        bridge: insight.bridge || "",
        property: insight.property || "",
        individualID: Number(insight.individualID) || 0,
        roomID: Number(insight.roomID) || 0
    });
}

/**
 * Builds SQL filters for supported query parameters.
 * @param {Object} queryParams
 * @returns {Object}
 */
function buildFilters(queryParams) {
    const response        = {};
    response.filters      = [];
    response.parameters   = [];

    const allowedFilters = ["status", "severity", "type", "deviceID", "bridge", "property", "ruleID"];

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
 *     description: This endpoint retrieves stored Care Insights. Optional filters can be provided for status, severity, type, device and property.
 *     tags:
 *       - Care Insights
 *     responses:
 *       "200":
 *         description: Successfully retrieved Care Insights
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

        if (request.query.limit !== undefined) {
            const limit = Number.parseInt(request.query.limit, 10);
            if (!Number.isNaN(limit) && limit > 0) {
                statement += " LIMIT " + limit;
            }
        }

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
 */
router.get("/stats", async function (request, response) {
    let data = {};

    try {
        data.status                  = "ok";
        data.data                    = {};
        data.data.open               = database.prepare("SELECT COUNT(*) AS total FROM care_insights WHERE status = 'open'").get().total;
        data.data.acknowledged       = database.prepare("SELECT COUNT(*) AS total FROM care_insights WHERE status = 'acknowledged'").get().total;
        data.data.resolved           = database.prepare("SELECT COUNT(*) AS total FROM care_insights WHERE status = 'resolved'").get().total;
        data.data.critical           = database.prepare("SELECT COUNT(*) AS total FROM care_insights WHERE severity = 'critical' AND status IN ('open', 'acknowledged')").get().total;
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
 *     description: This endpoint retrieves one Care Insight together with its signals and feedback.
 *     tags:
 *       - Care Insights
 *     responses:
 *       "200":
 *         description: Successfully retrieved Care Insight details
 */
router.get("/:insightID", async function (request, response) {
    const insightID = Number.parseInt(request.params.insightID, 10);
    let data        = {};

    try {
        common.conLog("GET Request: access table 'care_insights' via ID " + insightID, "gre");
        const insight = database.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insightID);

        if (insight) {
            data.status   = "ok";
            data.insight  = enrichInsight(insight);
            data.signals  = database.prepare("SELECT * FROM care_insight_signals WHERE insightID = ? ORDER BY signalID DESC").all(insightID);
            data.feedback = database.prepare("SELECT * FROM care_feedback WHERE insightID = ? ORDER BY feedbackID DESC").all(insightID);
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
 *     responses:
 *       "200":
 *         description: Successfully updated the Care Insight
 */
router.patch("/:insightID", async function (request, response) {
    const insightID     = Number.parseInt(request.params.insightID, 10);
    const nextStatus    = String(request.body.status || "").trim();
    let data            = {};

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

                database.prepare(
                  "UPDATE care_insights SET status = ?, dateTimeResolved = CASE WHEN ? IN ('resolved', 'dismissed') THEN datetime('now', 'localtime') ELSE dateTimeResolved END, dateTimeUpdated = datetime('now', 'localtime') WHERE insightID = ?"
                ).run(nextStatus, nextStatus, insightID);

                const updatedInsight = database.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insightID);

                if (previousStatus !== nextStatus) {
                    if (["resolved", "dismissed"].includes(nextStatus)) {
                        triggerCareInsightScenarioEvent("care_insight_resolved", updatedInsight);
                    }
                    else {
                        triggerCareInsightScenarioEvent("care_insight_updated", updatedInsight);
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

/**
 * @swagger
 * /care-insights/{insightID}/feedback:
 *   post:
 *     summary: Store feedback for a Care Insight
 *     description: This endpoint stores operational feedback such as helpful or false positive.
 *     tags:
 *       - Care Insights
 *     responses:
 *       "200":
 *         description: Successfully stored feedback
 */
router.post("/:insightID/feedback", async function (request, response) {
    const insightID      = Number.parseInt(request.params.insightID, 10);
    const feedbackType   = String(request.body.feedbackType || "").trim();
    let data             = {};

    try {
        if (!allowedFeedbackTypes.includes(feedbackType)) {
            data.status = "error";
            data.error  = "Invalid feedback type";
        }
        else {
            common.conLog("POST request for Care Insight feedback via ID " + insightID, "gre");
            const insight = database.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insightID);

            if (insight) {
                database.prepare(
                  "INSERT INTO care_feedback (insightID, userID, feedbackType, comment, dateTimeAdded) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))"
                ).run(insightID, Number.parseInt(request.body.userID, 10) || 0, feedbackType, request.body.comment || "");

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

    return common.sendResponse(response, data, "Server route 'Care Insights'", "POST request care insight feedback");
});

module.exports = router;