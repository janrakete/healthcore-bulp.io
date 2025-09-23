/**
 * =============================================================================================
 * Healthcheck - JS for the healthcheck monitor interface
 * ======================================================
 */

/**
 * This script fetches the status of various services and their logs from the healthcheck server.
 * @async
 * @function statusFetch
 * @description This function fetches the current status of all services from the healthcheck server.
 */
async function statusFetch() {
  const res = await fetch("/api/status");
  return res.json();
}

/**
 * This function fetches the logs of all services from the healthcheck server.
 * @async
 * @function logsFetch
 * @returns {Promise<Array>} A promise that resolves to an array of logs.
 * @description This function retrieves the logs of all services from the healthcheck server.
 */
async function logsFetch() {
  const res = await fetch("/api/logs");
  return res.json();
}

/**
 * This function toggles the status of a service (start/stop) based on its current state.
 * @async
 * @function statusToggle
 * @param {string} service - The name of the service to toggle.
 * @returns {Promise<void>} A promise that resolves when the status has been toggled and the UI has been updated.
 * @description This function checks the current status of the specified service. If the service is running, it sends a request to stop it; if it is stopped, it sends a request to start it. After toggling the status, it updates the UI by calling the update function.
 */
async function statusToggle(service) {
  const status = await statusFetch();
  const action = status[service] ? "stop" : "start";
  await fetch("/api/" + service + "/" + action, { method: "POST" });
  update();
}

/**
 * This function updates the UI by fetching the current status and logs from the healthcheck server.
 * @async
 * @function update
 * @returns {Promise<void>} A promise that resolves when the UI has been updated.
 * @description This function fetches the current status of all services and their logs, then updates the UI elements to reflect the current state of each service. It creates buttons for starting or stopping services and displays their logs in a formatted manner.
 */
async function update() {
  const [status, logs] = await Promise.all([statusFetch(), logsFetch()]);
  
  const containerControls   = document.getElementById("controls");
  const containerLogs       = document.getElementById("logs");

  containerControls.innerHTML = "";

  for (let service of Object.keys(status)) {
    const linebreak = document.createElement("br");

    const button = document.createElement("button");
    button.textContent = status[service] ? "Stop " + service : "Start " + service;
    button.onclick = () => statusToggle(service);

    const statusinfo = document.createElement("span");
    statusinfo.textContent = status[service] ? "Running" : "Stopped";
    statusinfo.className = status[service] ? "status-running" : "status-stopped";
    containerControls.appendChild(button);
    containerControls.appendChild(statusinfo);
    containerControls.appendChild(linebreak);    
  }

  for (let log of logs) {
    const line  = document.createElement("div");

    const replacements = [ // replace ANSI escape codes with HTML spans for color formatting
      { search: "\\x1B\\[35m", replace: "<span style='color: #311B92'>" },
      { search: "\\x1B\\[32m", replace: "<span style='color: #4caf50'>" },
      { search: "\\x1B\\[33m", replace: "<span style='color: #ffc107'>" },
      { search: "\\x1B\\[31m", replace: "<span style='color: #ff5722'>" },
      { search: "\\x1B\\[0m",  replace: "<span style='color: #ffffff'>" },
      { search: "\\x1B\\[39m", replace: "</span>" },
    ];

    for (const { search, replace } of replacements) {
      const regex = new RegExp(search, "g");
      log = log.replace(regex, replace);
    }
    
    line.innerHTML = log;
    containerLogs.appendChild(line);

    // Scroll to the bottom of the logs container only if the last log is visible
    if (containerLogs.scrollHeight - containerLogs.clientHeight <= containerLogs.scrollTop + line.offsetHeight) {
      containerLogs.scrollTop = containerLogs.scrollHeight;
    }
  }
}

document.getElementById("calls-button").onclick = function() {
  window.open("http://localhost:9998/api-docs/", "_blank");
};

update();
setInterval(update, 2000); // update the UI every 2 seconds