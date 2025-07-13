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

    const pre = document.createElement("pre");
    const log = document.createElement("div");

    const replacements = [
      { search: "\\x1B\\[35m", replace: "<span style='color: #311B92'>" },
      { search: "\\x1B\\[32m", replace: "<span style='color: #4caf50'>" },
      { search: "\\x1B\\[33m", replace: "<span style='color: #ffc107'>" },
      { search: "\\x1B\\[31m", replace: "<span style='color: #ff5722'>" },
      { search: "\\x1B\\[0m",  replace: "<span style='color: #ffffff'>" },
      { search: "\\x1B\\[39m", replace: "</span>" },
    ];

    logs[service] = logs[service].map(line => {
      for (const { search, replace } of replacements) {
        const regex = new RegExp(search, "g");
        line = line.replace(regex, replace);
      }
      return line;
    });
    
    logs[service] = logs[service].filter(line => line.match(/^\[\d{2}:\d{2}:\d{2}\]/));
    log.innerHTML = (logs[service] || []).join("");
    
    pre.appendChild(log);
    containerLogs.appendChild(pre);
  }
}

update();
setInterval(update, 2000);