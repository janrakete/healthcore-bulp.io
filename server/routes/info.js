/**
 * =============================================================================================
 * Routes for Info (= just a simple endpoint to check if the server is running)
 * ============================================================================
 */
const appConfig       = require("../../config");
const router          = require("express").Router();

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
    data.serverCodeLastCommit   = appConfig.CONF_settings.codeLastCommit;
    data.bridges                = [];

    const bridges = appConfig.CONF_bridges;
    for (const bridge of bridges) { // Check each bridge
        common.conLog("Server: Checking bridge: " + bridge, "yel");
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
   
    common.conLog("Server info sent!", "gre");
    common.conLog("Server route 'Info' HTTP response: " + JSON.stringify(data), "std", false);

    return response.status(200).json(data);
});

/**
 * @swagger
 * /info/update:
 *   get:
 *     summary: Check for server updates
 *     description: This endpoint checks if there is a newer version of the server code available on GitHub by comparing the latest commit hash with the one stored in the server configuration.
 *     tags:
 *       - Info
 *     responses:
 *       "200":
 *         description: Successfully checked for updates.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 updateAvailable:
 *                   type: boolean
 *                   example: false
 *                 latestCommit:
 *                   type: string
 *                   example: "abc123def456"
 */
router.get("/update", async function (request, response) {
    const data              = {};
    data.status             = "ok";
    data.updateAvailable    = false;
    data.latestCommit       = appConfig.CONF_settings.codeLastCommit;

    try {
        const responseFetch    = await fetch("https://api.github.com/repos/" + appConfig.CONF_repositoryURL);
        const dataFetch        = await responseFetch.json();
        const latestCommitHash = dataFetch.sha || null;

        if (latestCommitHash && latestCommitHash !== appConfig.CONF_settings.codeLastCommit) {
            data.updateAvailable = true;
            data.latestCommit    = latestCommitHash;
        }
    }
    catch (error) {
        common.conLog("Error checking for updates: " + error.message, "red");
    }

    common.conLog("Update check response: " + JSON.stringify(data), "std", false);
    return response.status(200).json(data);
});

module.exports = router;