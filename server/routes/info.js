/**
 * =============================================================================================
 * Routes for Info
 * ===============
 */
const appConfig       = require("../../config");
const router          = require("express").Router();

const fs              = require("fs");
const path            = require("path");

/**
 * @swagger
 * /info:
 *   get:
 *     summary: Retrieve server information
 *     description: This endpoint provides basic information about the server, such as its name, version, and Bonjour ID.
 *     tags:
 *       - Info
 *     responses:
 *       "200":
 *         description: Successfully retrieved server information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 serverName:
 *                   type: string
 *                   example: "bulp.io"
 *                 serverVersion:
 *                   type: string
 *                   example: "1.0.0"
 *                 serverIDBonjour:
 *                   type: string
 *                   example: "healthcore"
 *                 bridges:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       bridge:
 *                         type: string
 *                         example: "ZigBee"
 *                       port:
 *                         type: integer
 *                         example: 9996
 *                       status:
 *                         type: string
 *                         example: "online"
 */
router.get("/", async function (request, response) {
    const data                  = {};
    data.status                 = "ok";
    data.serverName             = appConfig.CONF_serverID;
    data.serverVersion          = appConfig.CONF_serverVersion;
    data.serverIDBonjour        = appConfig.CONF_serverIDBonjour;
    data.bridges                = [];

    const latestCommitUpdate = await database.prepare("SELECT * FROM update_history WHERE type='commit' ORDER BY dateTimeApplied DESC LIMIT 1").get();
    if (latestCommitUpdate) {
        data.serverCodeLastCommit = latestCommitUpdate.migrationID;
    }
    else {
        data.serverCodeLastCommit = null;
    }

    const bridges = appConfig.CONF_bridges;
    for (const bridge of bridges) { // Check each bridge
        common.conLog("Server route 'Info': Checking bridge: " + bridge, "yel");
        const port = appConfig["CONF_portBridge" + bridge]; // Get port for the bridge (undefined for MQTT-only bridges like "integrations")

        const bridgeStatus  = {};
        bridgeStatus.bridge = bridge;
        bridgeStatus.port   = port || null;

        if (port) { // HTTP-based bridge — check status via /info endpoint
            try { 
                const controller    = new AbortController(); // Create an AbortController to handle timeouts
                const timeoutID     = setTimeout(() => controller.abort(), appConfig.CONF_apiCallTimeoutMilliseconds);
                const answer        = await fetch(appConfig.CONF_baseURL + ":" + port + "/info", { signal: controller.signal });
                clearTimeout(timeoutID);

                if (!answer.ok) {
                    throw new Error("Bridge '" + bridge + "' returned status " + answer.status);
                }

                const answerData    = await answer.json();
                bridgeStatus.status = answerData.status;
            }
            catch (error) {
                bridgeStatus.status = "offline";
            }
        }
        else { // MQTT-only bridge — use status tracked via LWT / online message
            const bridgeKeyLower    = String(bridge || "").trim().toLowerCase();
            const mqttBridgeStatus  = global.mqttBridgeStatus || {};

            bridgeStatus.status = mqttBridgeStatus[bridgeKeyLower] || "offline";
        }

        data.bridges.push(bridgeStatus);
    }
   
    common.conLog("Server route 'Info': Server info sent!", "gre");
    common.conLog("Server route 'Info' HTTP response: " + JSON.stringify(data), "std", false);

    return response.status(200).json(data);
});

/**
 * @swagger
 * /info/logs:
 *   get:
 *     summary: Retrieve server logs
 *     description: This endpoint provides the last 200 lines of logs from all log files in the server's logs directory.
 *     tags:
 *       - Info
 *     responses:
 *       "200":
 *         description: Successfully retrieved server logs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 lines:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       source:
 *                         type: string
 *                         example: "server"
 *                       line:
 *                         type: string
 *                         example: "[2024-06-01T12:00:00Z] Server started successfully."
 */
router.get("/logs", async function (request, response) {
    const logsDirectory = path.join(__dirname, "../..", "logs");
    const files         = fs.readdirSync(logsDirectory).filter(file => file.endsWith(".log"));
    
    let lines = [];
    for (const file of files) {
        const source    = file.replace(/ - (output|errors)\.log$/, "");
        const content   = fs.readFileSync(path.join(logsDirectory, file), "utf8");
        for (const line of content.split("\n").slice(-200)) {
            if (line.trim()) {
                lines.push({ source, line });
            }
        }
    }
    
    lines.sort((a, b) => a.line.localeCompare(b.line)); // relies on ISO-like timestamp prefix
    response.json({ status: "ok", lines });
});    

module.exports = router;