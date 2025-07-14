/**
 * =============================================================================================
 * Healthcheck
 * ===========
 */
const appConfig   = require("../config");
const common      = require("../common");

const moment      = require("moment");

async function startCommander() {
  /**
   * Middleware
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

  const MAX_LOG_LINES = 200;
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

  function appendLog(service, log) {
    
    if (log.match(/^\[\d{2}:\d{2}:\d{2}\]/)) {
      logs.push(log);
    }
    
    if (logs.length > MAX_LOG_LINES) {
      logs.shift();
    }
  }

  app.get("/api/status", (req, res) => {
    const status = {};
    for (let service in services) {
      status[service] = !!processes[service];
    }
    res.json(status);
  });

  app.post("/api/:service/:action", (req, res) => {
    const { service, action } = req.params;
    if (!services[service]) {
      return res.status(404).json({ error: "Unknown service" });
    }
   
    if (action === "start") {
        if (processes[service]) {
          return res.status(400).json({ error: "Already running" });
        }
        const proc = spawn(services[service], { shell: true });
        processes[service] = proc;
        proc.stdout.on("data", chunk => appendLog(service, chunk.toString()));
        proc.stderr.on("data", chunk => appendLog(service, "[" + moment().format("HH:mm:ss") + "] " + "\x1B[31m" + chunk.toString() + "\x1B[39m"));
        proc.on("exit", function () {
          delete processes[service];
          appendLog(service, "[" + moment().format("HH:mm:ss") + "] " + "\x1B[32mExited " + service + "\x1B[39m");
        });
        return res.json({ status: "started" });
    }
    else if (action === "stop") {
      const proc = processes[service];
      if (!proc) {
        return res.status(400).json({ error: "Not running" });
      }

      if (process.platform === "win32") {
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

  app.get("/api/logs", (req, res) => {
    res.json(logs);
  });

  app.use(express.static(__dirname + "/monitor"));
  app.get("/", function (req, res) {
    res.sendFile(__dirname + "/monitor/monitor.html");
  });

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