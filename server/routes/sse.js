/**
 * =============================================================================================
 * Routes for Devices
 * ==================
 */
const appConfig     = require("../../config");
const router        = require("express").Router();

/**
 * SSE session
 * @param {Object} request 
 * @param {Object} response 
 * @description This route creates and registers a SSE session for the client, that calls this route
 */
router.get("/events", async function (request, response) {
	const sseSession = await sse.createSession(request, response);
	sseChannel.register(sseSession); 
});

 module.exports = router;