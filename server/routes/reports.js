/**
 * =============================================================================================
 * Routes for Reporting
 * ====================
 */
const appConfig     = require("../../config");
const router        = require("express").Router();

/**
 * =============================================================================================
 * Helper functions
 * ================
 */

/**
 * Validates if a given value is a valid date string in the format YYYY-MM-DD.
 * @param {string} value - The value to validate.
 * @returns {boolean} - Returns true if the value is a valid date string, otherwise false.
 */
function isValidDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Normalizes and validates report language codes.
 * @param {string} value
 * @returns {string}
 */
function reportLanguageNormalize(value) {
    const normalizedLanguage = String(value || appConfig.CONF_reportingLanguage).trim().toLowerCase();

    if (appConfig.CONF_reportingLanguageSupported.includes(normalizedLanguage)) {
        return (normalizedLanguage);
    }
    else {
        return (appConfig.CONF_reportingLanguage);
    }
}

/**
 * @swagger
 *  /reports:
 *    get: 
 *      summary: Get generated reports
 *      description: Retrieve a list of generated reports with optional filtering by date, individual ID, and language. You can also include the facts used to generate the reports.
 *      tags:
 *        - Reports
 *      parameters:
 *        - in: query
 *          name: date
 *          required: false
 *          schema:
 *            type: string
 *            example: "2026-07-05"
 *        - in: query
 *          name: individualID
 *          required: false
 *          schema:
 *            type: integer
 *        - in: query
 *          name: language
 *          required: false
 *          schema:
 *            type: string
 *            example: "en"
 *        - in: query
 *          name: includeFacts
 *          required: false
 *          schema:
 *            type: boolean
 *            example: true
 *      responses:
 *        "200":
 *          description: Retrieved reports successfully.
 *        "400":
 *          description: Invalid request.
 */
router.get("/", function (request, response) {
    const data = {};

    try {
        const date              = request.query.date;
        const individualID      = request.query.individualID;
        const reportLanguage    = request.query.language;
        const includeFacts      = String(request.query.includeFacts || "false").toLowerCase() === "true"; // Convert to boolean

        if (date !== undefined && !isValidDate(date)) {
            data.status = "error";
            data.error  = "Date must be in YYYY-MM-DD format";
            return common.sendResponse(response, data, "Server route 'Reports'", "GET Request");
        }

        const conditions = [];
        const parameters = [];

        if (date) {
            conditions.push("r.reportDate = ?");
            parameters.push(date);
        }

        if (individualID !== undefined) {
            const numericIndividualID = Number(individualID);
            if (!Number.isFinite(numericIndividualID) || numericIndividualID <= 0) {
                data.status = "error";
                data.error  = "individualID must be a positive number";
                return common.sendResponse(response, data, "Server route 'Reports'", "GET Request");
            }
            conditions.push("r.individualID = ?");
            parameters.push(numericIndividualID);
        }

        if (reportLanguage !== undefined) {
            conditions.push("r.reportLanguage = ?");
            parameters.push(reportLanguageNormalize(reportLanguage));
        }

        const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
        
        const results = database.prepare(
            "SELECT r.reportID, r.individualID, r.reportDate, r.reportLanguage, r.summaryText, r.modelName, r.status, r.dateTimeAdded, i.firstname, i.lastname FROM reporting_reports AS r LEFT JOIN individuals AS i ON i.individualID = r.individualID" + whereClause + " ORDER BY r.reportDate DESC, r.individualID ASC"
        ).all(...parameters);

        if (includeFacts) { // Fetch factsJson for each report if requested and include it in the response
            const factsStatement = database.prepare("SELECT reportID, factsJson FROM reporting_reports WHERE reportID = ? LIMIT 1");
            for (const result of results) {
                const factsRow = factsStatement.get(result.reportID);
                result.facts   = factsRow && factsRow.factsJson ? JSON.parse(factsRow.factsJson) : null; // Include facts as an object if available, otherwise null
            }
        }

        data.status  = "ok";
        data.results = results;
    }
    catch (error) {
        data.status = "error";
        data.error  = error.message;
    }

    return common.sendResponse(response, data, "Server route 'Reports'", "GET Request");
});

/**
 * @swagger
 *  /reports/generate:
 *    post:
 *      summary: Generate reports manually
 *      description: Manually trigger the generation of reports for a specific date and language. If no date is provided, reports will be generated for the current date. The language parameter allows specifying the desired report language.
 *      tags:
 *        - Reports
 *      requestBody:
 *        required: false
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                date:
 *                  type: string
 *                  example: "2026-07-05"
 *                language:
 *                  type: string
 *                  example: "en"
 *      responses:
 *        "200":
 *          description: Reports generated successfully.
 *        "400":
 *          description: Invalid request.
 */
router.post("/generate", async function (request, response) {
    const data = {};

    try {
        const date     = request.body && request.body.date;
        const language = reportLanguageNormalize(request.body && request.body.language);

        if (date !== undefined && !isValidDate(date)) {
            data.status = "error";
            data.error  = "Date must be in YYYY-MM-DD format";
            return common.sendResponse(response, data, "Server route 'Reports'", "POST Request");
        }

        if (!global.reportingService || typeof global.reportingService.generateAndStoreReports !== "function") {
            data.status = "error";
            data.error  = "Reporting service is not initialized";
            return common.sendResponse(response, data, "Server route 'Reports'", "POST Request");
        }

        const results = await global.reportingService.generateAndStoreReports(date, { language });
        data.status  = "ok";
        data.results = results;
    }
    catch (error) {
        data.status = "error";
        data.error  = error.message;
    }

    return common.sendResponse(response, data, "Server route 'Reports'", "POST Request");
});

module.exports = router;
