import React, { useEffect, useState } from "react";

function Monitor() {
  const [status, setStatus] = useState({});

  const fetchStatus = () => {
    fetch("http://localhost:9990/api/status")
      .then(res => res.json())
      .then(setStatus);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const toggle = (svc) => {
    const action = status[svc] ? "stop" : "start";
    fetch("http://localhost:9990/api/${svc}/${action}", { method: "POST" })
      .then(fetchStatus);
  };

  return (
    <div className="container">
      <h1>Bridge Control Interface</h1>
      <ul>
        {Object.keys(status).map(svc => (
          <li key={svc}>
            <button onClick={() => toggle(svc)}>
              {status[svc] ? "Stop" : "Start"} {svc.charAt(0).toUpperCase() + svc.slice(1)}
            </button>
            <span className={status[svc] ? "running" : "stopped"}>
              {status[svc] ? "Running" : "Stopped"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Monitor;