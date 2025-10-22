(function() {
  const DEVICE_NAME = "bulp.io-hub";
  const UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
  const UART_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

  // --- Splashscreen ---
  function showSplash() {
    g.clear();
    g.setColor("#8000ff");
    g.fillRect(0, 0, g.getWidth(), g.getHeight());
    g.setColor("#ffffff");
    g.setFont("Vector", 80);
    g.setFontAlign(0, 0);
    g.drawString("b", g.getWidth() / 2, g.getHeight() / 2);
    g.flip();
    setTimeout(showMenu, 2000);
  }

  // --- Menü ---
  function showMenu() {
    g.clear();
    const menu = {
      '': { title: 'bulp.io - per BLE senden ...' },
      'Aktueller Puls': showPulse,
      'Warn-Ton -> BLE-Gerät': sendWarnTone,
      'Licht an -> ZigBee-Gerät': sendLightOn,
      'App beenden': () => load()
    };
    E.showMenu(menu);
  }

  // --- Pulsmessung + BLE-Übertragung ---
  let hrmListener = null;
  let lastBPM = null;

  function showPulse() {
    if (hrmListener) {
      Bangle.removeListener('HRM', hrmListener);
      hrmListener = null;
    }

    E.showMessage("Starte Pulsmessung...", "Puls");
    Bangle.setHRMPower(1);
    let lastUpdate = 0;

    hrmListener = function(hrm) {
      const now = getTime();
      if (now - lastUpdate > 1) {
        lastUpdate = now;
        lastBPM = hrm.bpm || 0;

        g.clear();
        g.setFontAlign(0, 0);

        g.setFont("Vector", 24);
        g.setColor("#00aa00");
        g.drawString("Aktueller Puls", g.getWidth() / 2, 35);

        g.setFont("Vector", 48);
        g.setColor("#ffffff");
        const bpmText = lastBPM + " bpm";
        g.drawString(bpmText, g.getWidth() / 2, g.getHeight() / 2);

        g.setFont("Vector", 16);
        g.setColor("#888888");
        g.drawString("Signalstärke: " + (hrm.confidence || 0) + "%", g.getWidth() / 2, g.getHeight() - 25);

        g.flip();
      }
    };

    Bangle.on("HRM", hrmListener);

    // Nach 15 Sekunden stoppen und übertragen
    setTimeout(stopPulse, 15000);
  }

  function stopPulse() {
    if (hrmListener) {
      Bangle.removeListener("HRM", hrmListener);
      hrmListener = null;
    }
    Bangle.setHRMPower(0);

    if (lastBPM) {
      sendBLEMessage({ topic: "pulse", payload: lastBPM }, "Puls gesendet.");
    } else {
      E.showMessage("Kein Pulswert\nermittelt.");
      setTimeout(showMenu, 2000);
    }
  }

  function sendBLEMessage(payload, label) {
    E.showMessage("Verbinde BLE...", label);

    NRF.requestDevice({ filters: [{ name: "bulp.io-hub" }] })
    .then(device => device.gatt.connect())
    .then(gatt => gatt.getPrimaryService("6e400001-b5a3-f393-e0a9-e50e24dcca9e"))
    .then(service => service.getCharacteristic("6e400002-b5a3-f393-e0a9-e50e24dcca9e"))
    .then(txChar => {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      return txChar.writeValue(data);
    })
    .then(() => {
      E.showMessage(label + " gesendet!", label);
      setTimeout(showMenu, 1500);
    })
    .catch(e => {
      E.showMessage("Fehler:\n" + e, label);
      setTimeout(showMenu, 2000);
    });
  }

  function sendWarnTone() { sendBLEMessage({ topic: "warn", payload: 1 }, "Warn-Ton gespielt."); }
  function sendLightOn() { sendBLEMessage({ topic: "light", payload: "on" }, "Licht eingeschaltet."); }

  // --- Start ---
  showSplash();
})();
