/**
 * =============================================================================================
 * Healthcheck
 * ===========
 */
const appConfig   = require("../config");
const common      = require("../common");

/**
 * Start the healthcheck server
 * @async
 * @function startHealthcheck
 * @description This function initializes an Express server, sets up routes for service status and logs.
 */
async function startHealthcheck() {
  /**
   * Server
   */
  const express           = require("express");
  const cors              = require("cors");
  const bodyParser        = require("body-parser");

  const app = express();

  app.use(bodyParser.json());

  app.use(
    cors(),
    bodyParser.urlencoded({
      extended: true,
    })
  );

  if (!appConfig.CONF_corsURL || String(appConfig.CONF_corsURL).trim() === "") {
   common.conLog("Auth: No CORS URLs configured. All URLs are allowed. Set CONF_corsURL in .env.local", "red");
  }

  app.use(function (error, request, response, next) { // if request contains JSON and the JSON is invalid
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      let data = {};
      data.status        = "error";
      data.errorMessage  = "JSON in request is invalid";
      response.json(data);
    }
  });

  /**
   * =============================================================================================
   * Routes
   * ====== 
   */

  /**
   * This route returns the runtime configuration needed by the browser-based dashboard. The Healthcore server base URL and optional API key are injected here so the frontend never has to hard-code connection details.
   * @route GET /api/config
   * @returns {Object} config - An object with serverBaseUrl and apiKey fields
   * @description Reads CONF_baseURL, CONF_portServer and CONF_apiKey from the app
   *   configuration and returns them as JSON. The dashboard fetches this once on startup.
   */
  app.get("/api/config", (req, res) => {
    res.json({
      CONF_serverBaseUrl:                     "http://" + req.hostname + ":" + appConfig.CONF_portServer,
      CONF_apiKey:                            appConfig.CONF_apiKey || "",
      CONF_dashboardRefreshIntervalMs:        appConfig.CONF_dashboardRefreshIntervalMs,
      CONF_dashboardRecentInsightsCount:      appConfig.CONF_dashboardRecentInsightsCount,
      CONF_dashboardRecentNotificationsCount: appConfig.CONF_dashboardRecentNotificationsCount
    });
  });

  app.use(express.static(__dirname + "/dashboard")); // Serve all static files (JS, CSS, libraries) from the dashboard folder

  /**
   * This route serves the dashboard HTML page. The dashboard is the single entry point for the healthcheck interface and replaces the old monitor page.
   * @route GET /
   * @returns {File} dashboard.html - The HTML file for the healthcheck dashboard
   */
  app.get("/", function (request, response) {
    response.sendFile(__dirname + "/dashboard/dashboard.html");
  });

  app.listen(appConfig.CONF_portHealthcheck, function () { // bind to localhost only
    common.conLog("Healthcheck server listening on " + common.ipGetOwn() + ":" + appConfig.CONF_portHealthcheck, "green");
  });
}

startHealthcheck();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
  common.conLog("Server closed.", "mag", true);
  process.exit(0);
}); 