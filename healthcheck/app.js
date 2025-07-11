/**
 * =============================================================================================
 * Healthcheck
 * ==============
 */
const appConfig   = require("../config");
const common      = require("../common");


async function startCommander() {
  /**
   * Middleware
   */
  const express           = require("express");
  const cors              = require("cors");
  const bodyParser        = require("body-parser");
  const { exec, spawn }   = require("child_process");

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

  const processes = {};
  const services  = {
      broker:         "node broker/app.js",
      bluetooth:      "node 'bridge - bluetooth/app.js'",
      zigbee:         "node 'bridge - zigbee/app.js'",
      lora:           "node 'bridge - lora/app.js'",
      http:           "node 'bridge - http/app.js'",
      server:         "node server/app.js"
  };

  app.get("/api/status", (req, res) => {
      const status = Object.keys(services).reduce((acc, key) => {
          acc[key] = processes[key] ? true : false;
          return acc;
      }, {});
      res.json(status);
  });

  app.post("/api/:service/:action", (req, res) => {
      const { service, action } = req.params;
      if (!services[service]) {
          return res.status(404).json({ error: "Unknown service" });
      }
      if (action === "start") {
          if (processes[service])
              return res.status(400).json({ error: 'Already running' });
          const proc = spawn(services[service], { shell: true, stdio: "inherit" });
          processes[service] = proc;
          proc.on("exit", () => delete processes[service]);
          return res.json({ status: "started" });
      } else if (action === "stop") {
          const proc = processes[service];
          if (!proc)
              return res.status(400).json({ error: "Not running" });
          proc.kill();
          delete processes[service];
          return res.json({ status: "stopped" });
      }
      res.status(400).json({ error: "Invalid action" });
  });    

  app.use(express.static("healthcheck"));
  app.get("*", (req, res) => res.sendFile(__dirname + "/healthcheck/index.html"));

  app.listen(appConfig.CONF_portHealthcheck);
}

startCommander();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
  common.conLog("Server closed.", "mag", true);
  process.exit(0);
});