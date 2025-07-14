async function statusFetch() {
  const res = await fetch("/api/status");
  return res.json();
}

async function logsFetch() {
  const res = await fetch("/api/logs");
  return res.json();
}

async function statusToggle(service) {
  const status = await statusFetch();
  const action = status[service] ? "stop" : "start";
  await fetch("/api/" + service + "/" + action, { method: "POST" });
  update();
}

async function update() {
  const [status, logs] = await Promise.all([statusFetch(), logsFetch()]);
  
  const containerControls   = document.getElementById("controls");
  const containerLogs       = document.getElementById("logs");

  containerControls.innerHTML = "";
  containerLogs.innerHTML     = "";

  for (let service of Object.keys(status)) {
    const linebreak = document.createElement("br");

    const button = document.createElement("button");
    button.textContent = status[service] ? "Stop " + service : "Start " + service;
    button.onclick = () => statusToggle(service);

    const statusinfo = document.createElement("span");
    statusinfo.textContent = status[service] ? "Running" : "Stopped";
    statusinfo.className = status[service] ? "status_running" : "status_stopped";
    containerControls.appendChild(button);
    containerControls.appendChild(statusinfo);
    containerControls.appendChild(linebreak);    
  }

  for (let log of logs) {
    const line  = document.createElement("div");

    const replacements = [
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
  }
 
}

update();
setInterval(update, 2000);