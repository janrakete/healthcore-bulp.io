/**
 * =============================================================================================
 * Routes for Info (= just a simple endpoint to check if the server is running)
 * ============================================================================
 */
const appConfig       = require("../../config");
const router          = require("express").Router();

/**
 * @swagger
 *   /info:
 *     get:
 *       summary: Retrieve server information
 *       description: This endpoint provides basic information about the server, such as its name, version, and Bonjour ID.
 *       tags:
 *        - Info
 *       responses:
 *         "200":
 *           description: Successfully retrieved server information.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   serverName:
 *                     type: string
 *                     example: "bulp.io"
 *                   serverVersion:
 *                     type: string
 *                     example: "1.0.0"
 */
router.get("/", async function (request, response) {
    const data = {};
    data.serverName       = appConfig.CONF_serverID;
    data.serverVersion    = appConfig.CONF_serverVersion;
    data.serverIDBonjour  = appConfig.CONF_serverIDBonjour;

    return response.status(200).json(data);
});

module.exports = router;