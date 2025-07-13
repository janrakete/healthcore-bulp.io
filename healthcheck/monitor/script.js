async function fetchStatus() {
  const res = await fetch('/api/status');
  return res.json();
}

async function fetchLogs() {
  const res = await fetch('/api/logs');
  return res.json();
}

async function toggle(svc) {
  const status = await fetchStatus();
  const action = status[svc] ? 'stop' : 'start';
  await fetch(`/api/${svc}/${action}`, { method: 'POST' });
  update();
}

async function update() {
  const [status, logs] = await Promise.all([fetchStatus(), fetchLogs()]);
  const container = document.getElementById('services');
  container.innerHTML = '';
  for (let svc of Object.keys(status)) {
    const div = document.createElement('div');
    div.className = 'service';
    const btn = document.createElement('button');
    btn.textContent = status[svc] ? `Stop ${svc}` : `Start ${svc}`;
    btn.onclick = () => toggle(svc);
    const span = document.createElement('span');
    span.textContent = status[svc] ? 'Running' : 'Stopped';
    span.className = status[svc] ? 'running' : 'stopped';
    div.appendChild(btn);
    div.appendChild(span);
    const logpre = document.createElement('div');
    logpre.className = 'log';
    logpre.textContent = (logs[svc] || []).join('');
    div.appendChild(logpre);
    container.appendChild(div);
  }
}

// Kick off initial update and polling
update();
setInterval(update, 2000);