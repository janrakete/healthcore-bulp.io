(() => {
  const DURATION = 60; // Messdauer in Sekunden
  const UPDATE_INTERVAL = 3000; // Update alle 3 Sekunden
  const centerX = g.getWidth() / 2;
  const centerY = g.getHeight() / 2;
  const baseSize = 40;

  // ===================================================
  // BLE senden
  // ===================================================
  function sendBLE(data) {
    Bluetooth.println(JSON.stringify(data) + "\n");
  }

  // ===================================================
  // Text anzeigen
  // ===================================================
  function showText(text) {
    g.clear();
    g.setColor("#FF00DC");
    g.fillRect(0, 0, g.getWidth(), g.getHeight());
    g.setColor(1, 1, 1);
    g.setFont("6x8", 2);
    g.drawString(text, (g.getWidth() - g.stringWidth(text)) / 2, (g.getHeight()) / 2);
    g.flip();
  }

  // ===================================================
  // Herz zeichnen
  // ===================================================
  function drawHeart(bpm) {
    const size = baseSize;
    g.clear();

    // Rot
    g.setColor(1, 0, 0);

    // linke obere Rundung
    g.fillCircle(centerX - size / 2 + 5, centerY - size / 4, size / 2);
    // rechte obere Rundung
    g.fillCircle(centerX + size / 2 - 5, centerY - size / 4, size / 2);

    // unteres Dreieck
    g.fillPoly([centerX - size + 6, centerY  + 9 - size / 4,
                centerX + size - 6, centerY  + 9 - size / 4,
                centerX, centerY + size]);

    // Text oben
    g.setColor(1, 1, 1);
    g.setFont("Vector", 20);
    g.drawString("Dein Puls: " + bpm, (g.getWidth() - g.stringWidth("Dein Puls: " + bpm)) / 2, 30);

    g.flip();
  }

  // ===================================================
  // HRM Messung
  // ===================================================
  function showHRM() {
    Bangle.setHRMPower(1);

    const hrmListener = hrm => {
      if (hrm.confidence < 50)
        return;
      const bpm = hrm.bpm;
      drawHeart(bpm);
      // send only every UPDATE_INTERVAL
      if (!this.lastSent || (Date.now() - this.lastSent) >= UPDATE_INTERVAL) {
        this.lastSent = Date.now();
        sendBLE({t:"hrm", v:bpm});
      }
    };

    Bangle.on("HRM", hrmListener);

    // Timer für 60 Sekunden Messung
    setTimeout(()=>{
      Bangle.setHRMPower(0);
      Bangle.removeListener("HRM", hrmListener);
      showMenu();
    }, DURATION * 1000);
  }

  // ===================================================
  // Licht an
  // ===================================================
  function sendLightOn() {
    showText("Licht an ...");
    sendBLE({t:"light", v:"1"});
    setTimeout(showMenu, 2000);
  }

  // ===================================================
  // Alarm an
  // ===================================================
  function sendAlarmOn() {
    showText("Alarm an ...");
    sendBLE({t:"alarm", v:"1"});
    setTimeout(showMenu, 2000);
  }

  // ===================================================
  // App beenden
  // ===================================================
  function exitApp() {
    showText("Ende.");
    setTimeout(()=>load(), 1500);
  }

  // ===================================================
  // Menü
  // ===================================================
  function showMenu() {
    const menu = {
      "": {"title":"Per BLE senden:"},
      "Aktueller Puls\n(an App)": () => showHRM(),
      "Licht an\n(an ZigBee-Gerät)": () => sendLightOn(),
      "Alarm an\n(an Bluetooth-Gerät)": () => sendAlarmOn(),
      "App beenden": () => exitApp()
    };
    E.showMenu(menu);
  }

  // ===================================================
  // BLE Status
  // ===================================================
  NRF.on("connect", () => g.clear());
  NRF.on("disconnect", () => g.clear());

  // ===================================================
  // Splash "b"
  // ===================================================
  g.clear();
  g.setColor("#FF00DC");
  g.fillRect(0, 0, g.getWidth(), g.getHeight());
  g.setColor(1, 1, 1);
  g.setFont("Vector", 60);
  const t = "b";
  g.drawString(t, (g.getWidth() - g.stringWidth(t)) / 2, (g.getHeight() - 60) / 2);
  g.flip();

  setTimeout(showMenu, 1000);
})();
