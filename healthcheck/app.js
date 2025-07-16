/**
 * =============================================================================================
 * Healthcheck
 * ===========
 */
const appConfig   = require("../config");
const common      = require("../common");

const moment      = require("moment");

/**
 * Start the healthcheck server
 * This server monitors the status of various services and allows starting/stopping them.
 * It provides a web interface to view the status and logs of these services.
 * @async
 * @function startHealtcheck
 * @description This function initializes an Express server, sets up routes for service status and logs.
 */
async function startHealtcheck() {
  /**
   * Server
   */
  const express           = require("express");
  const cors              = require("cors");
  const bodyParser        = require("body-parser");
  const { spawn }         = require("child_process");

  const app = express();

  app.use(bodyParser.json());

  app.use(
    cors(),
    bodyParser.urlencoded({
      extended: true,
    })
  );

  app.use(function (error, req, res, next) { // if request contains JSON and the JSON is invalid
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      let data = {};
      data.status        = "error";
      data.errorMessage  = "JSON in request is invalid";
      res.json(data);
    }
  });

  /**
   * Variables, services and calls
   */
  const logs          = [];
  const processes     = {};
  const services      = {
      broker:         'node "../broker/app.js"',
      server:         'node "../server/app.js"',
      bluetooth:      'node "../bridge - bluetooth/app.js"',
      zigbee:         'node "../bridge - zigbee/app.js"',
      lora:           'node "../bridge - lora/app.js"',
      http:           'node "../bridge - http/app.js"'
  };

  const calls         = [
    {
      label:  "Scan devices",
      url:    "/api/bluetooth/scan",
      method: "POST",
      payload: {
        service: "bluetooth",
        action: "scan"
      }
    },
    {
      label:  "Delete device",
      url:    "/api/bluetooth/delete",
      method: "DELETE",
      payload: {
        service: "bluetooth",
        action: "delete"
      }
    }
  ];

  /**
   * This function adds a log entry to the logs array, ensuring it does not exceed the maximum
   * @param {*} service 
   * @param {*} log 
   */
  function appendLog(service, log) {
    if (log.match(/^\[\d{2}:\d{2}:\d{2}\]/)) {
      logs.push(log);
    } 
  }

  /**
   * =============================================================================================
   * Routes
   * ======
   */

  /**
   * This route returns the status of all monitored services. It checks if each service is running and returns a JSON object with the status.
   * @route GET /api/status
   * @returns {Object} status - An object containing the status of each service
   * @description This route iterates over each service defined in the services object and checks if it is running by looking for its process in the processes object. It returns a JSON object where each key is a service name and the value is a boolean indicating whether the service is running.
   */
  app.get("/api/status", (req, res) => {
    const status = {};
    for (let service in services) { // iterate over each service
      status[service] = !!processes[service];
    }
    res.json(status);
  });

  /**
   * This route allows starting or stopping a service. It checks the action parameter to determine whether to start or stop the service. If the service is already running, it returns an error for start requests. If the service is not running, it starts it and logs the output.
   * @route POST /api/:service/:action
   * @param {string} service - The name of the service to start or stop
   * @param {string} action - The action to perform on the service (start or stop)
   * @param {Object} req - The request object containing the service and action parameters
   * @param {Object} res - The response object used to send the status back to the client
   * @returns {Object} status - An object containing the status of the action performed
   * @description This route checks if the service exists in the services object. If it does, it checks the action parameter. If the action is "start", it starts the service using spawn and logs its output. If the action is "stop", it stops the service if it is running. It returns a JSON object with the status of the action performed (started or stopped) or an error message if the service is not found or already running.
   */
  app.post("/api/:service/:action", (req, res) => {
    const { service, action } = req.params;
    if (!services[service]) {
      return res.status(404).json({ error: "Unknown service" });
    }
   
    if (action === "start") {
        if (processes[service]) { // check if the service is already running
          return res.status(400).json({ error: "Already running" });
        }
        const proc = spawn(services[service], { shell: true }); // start the service
        processes[service] = proc;
        proc.stdout.on("data", chunk => appendLog(service, chunk.toString())); // log the output of standard output
        proc.stderr.on("data", chunk => appendLog(service, "[" + moment().format("HH:mm:ss") + "] " + "\x1B[31m" + chunk.toString() + "\x1B[39m")); // log the output of standard error
        proc.on("exit", function () {
          delete processes[service];
          appendLog(service, "[" + moment().format("HH:mm:ss") + "] " + "\x1B[32mExited " + service + "\x1B[39m");
        });
        return res.json({ status: "started" });
    }
    else if (action === "stop") { // check if the action is to stop the service
      const proc = processes[service];
      if (!proc) {
        return res.status(400).json({ error: "Not running" });
      }

      if (process.platform === "win32") { // if the platform is Windows, use taskkill to stop the process
        spawn("taskkill", ["/pid", proc.pid.toString(), "/f", "/t"]);
      }
      else {
        proc.kill("SIGINT");
      }

      delete processes[service];
      return res.json({ status: "stopped" });
    }
    res.status(400).json({ error: "Invalid action" });
  });

  /**
   * This route returns the logs of all services. It returns a JSON object containing the logs array.
   * @route GET /api/logs
   * @param {Object} req - The request object
   * @param {Object} res - The response object used to send the logs back to the client
   * @returns {Array} logs - An array containing the logs of all services
   * @description This route simply returns the logs array, which contains the output of all services. The logs are appended to this array as the services run, and it is limited to a maximum number of lines defined in the configuration.
   */
  app.get("/api/logs", (req, res) => {
    res.json(logs);
    logs.length = 0; // clear the logs after sending them to the client
  });

  /**
   * This route returns the calls array, which contains predefined actions that can be performed on the server.
   * @route GET /api/calls
   * @param {Object} req - The request object
   * @param {Object} res - The response object used to send the calls back to the client
   * @returns {Array} calls - An array containing predefined actions that can be performed on the server
   * @description This route returns the calls array, which contains objects with labels, URLs, and payloads for predefined actions. These actions can be used by the client to interact with the server, such as scanning devices or deleting devices.
   */
  app.get("/api/calls", (req, res) => {
    res.json(calls);
  });

  /**
   * This route serves the static files for the healthcheck monitor. It serves the HTML file and the CSS file for the monitor interface.
   * @route GET /
   * @param {Object} req - The request object
   * @param {Object} res - The response object used to send the HTML file back
   * @returns {File} monitor.html - The HTML file for the healthcheck monitor interface
   * @description This route serves the monitor.html file located in the monitor directory. It uses the express.static middleware to serve static files from the monitor directory, allowing the client to access the healthcheck monitor interface.  
   */
  app.use(express.static(__dirname + "/monitor"));
  app.get("/", function (req, res) {
    res.sendFile(__dirname + "/monitor/monitor.html");
  });

  /**
   * =============================================================================================
   * Server
   * ======
   */
  app.listen(appConfig.CONF_portHealthcheck); // start the server on the configured port
}

startHealtcheck();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
  common.conLog("Server closed.", "mag", true);
  process.exit(0);
}); 