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
 *     description: This endpoint provides the contents of all log files in the server's logs directory as plain text.
 *     tags:
 *       - Info
 *     responses:
 *       "200":
 *         description: Successfully retrieved server logs.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 2026-08-15 00:11:38: [00:11:38] Server started successfully.
 */
router.get("/logs", async function (request, response) {
    const logsDirectory = path.join(__dirname, "../..", "logs");
    const files         = fs.readdirSync(logsDirectory).filter(file => file.endsWith(".log")); // Get all log files in the logs directory

    const data = {};

    const maxEntries = appConfig.CONF_apiCallLogsMaxEntries;
    const lines      = (await Promise.all(files.map(async file => { // Read each log file and return the last maxEntries lines
        if (maxEntries <= 0) {
            return [];
        }

        const fileHandle = await fs.promises.open(path.join(logsDirectory, file), "r");

        try {
            const fileSize  = (await fileHandle.stat()).size;
            const chunks    = [];
            const chunkSize = 64 * 1024;
            let position    = fileSize;
            let lineBreaks  = 0;

            while (position > 0 && lineBreaks <= maxEntries) { // Read the file in reverse until we have enough lines
                const bytesToRead = Math.min(chunkSize, position);
                position -= bytesToRead;

                const buffer = Buffer.alloc(bytesToRead);
                await fileHandle.read(buffer, 0, bytesToRead, position);
                chunks.unshift(buffer);

                for (const byte of buffer) {
                    if (byte === 0x0A) {
                        lineBreaks++;
                    }
                }
            }

            return Buffer.concat(chunks).toString("utf8").split("\n").slice(-maxEntries); // Return the last maxEntries lines
        }
        finally {
            await fileHandle.close();
        }
    }))).flat();

    const timestampPattern = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?::\s*)?/;

    lines.sort((lineA, lineB) => { // Sort lines by timestamp in ascending order
        const timestampA = lineA.match(timestampPattern)?.[1];
        const timestampB = lineB.match(timestampPattern)?.[1];

        if (!timestampA || !timestampB) {
            return timestampA ? -1 : timestampB ? 1 : 0;
        }

        return timestampA.localeCompare(timestampB);
    });
    
    common.conLog("Server route 'Info': Logs retrieved from " + files.length + " log files.", "gre");

    const ansiEscapePattern = /\x1B\[[0-?]*[ -\/]*[@-~]/g;

    data.status = "ok";
    data.result = lines.map(line => line.replace(timestampPattern, "").replace(ansiEscapePattern, "")).join("\n");

    return response.status(200).json(data);
});    

module.exports = router;