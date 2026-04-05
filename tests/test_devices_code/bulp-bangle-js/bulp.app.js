(() => {

  const DURATION = 60; // Measurement duration in seconds
  const UPDATE_INTERVAL = 3000; // Update every 3 seconds
  const centerX = g.getWidth() / 2;
  const centerY = g.getHeight() / 2;
  const baseSize = 40;

  // ===================================================
  // Send BLE data (only when connected)
  // ===================================================
  function sendBLE(data) {
    if (!NRF.getSecurityStatus().connected) return;
    Bluetooth.println(JSON.stringify(data) + "\n");
  }

  // ===================================================
  // Display text
  // ===================================================
  function showText(text) {
    g.clear();
    g.setColor("#8000FF");
    g.fillRect(0, 0, g.getWidth(), g.getHeight());
    g.setColor(1, 1, 1);
    g.setFont("6x8", 2);
    g.drawString(text, (g.getWidth() - g.stringWidth(text)) / 2, (g.getHeight()) / 2);
    g.flip();
  }

  // ===================================================
  // Draw heart
  // ===================================================
  function drawHeart(bpm) {
    const size = baseSize;
    g.clear();

    // Red
    g.setColor(1, 0, 0);

    // Upper left arc
    g.fillCircle(centerX - size / 2 + 5, centerY - size / 4, size / 2);
    // Upper right arc
    g.fillCircle(centerX + size / 2 - 5, centerY - size / 4, size / 2);

    // Lower triangle
    g.fillPoly([centerX - size + 6, centerY  + 9 - size / 4,
                centerX + size - 6, centerY  + 9 - size / 4,
                centerX, centerY + size]);

    // Text at top
    g.setColor(1, 1, 1);
    g.setFont("Vector", 20);
    g.drawString("Dein Puls: " + bpm, (g.getWidth() - g.stringWidth("Dein Puls: " + bpm)) / 2, 30);

    g.flip();
  }

  // ===================================================
  // HRM measurement
  // ===================================================
  function showHRM() {
    Bangle.setHRMPower(1);
    let lastSent = 0;

    const hrmListener = hrm => {
      const bpm = hrm.bpm;
      drawHeart(bpm);
      // send only every UPDATE_INTERVAL
      if ((Date.now() - lastSent) >= UPDATE_INTERVAL) {
        lastSent = Date.now();
        sendBLE({t:"h", v:bpm});
      }
    };

    Bangle.on("HRM", hrmListener);

    function stopHRM() {
      Bangle.setHRMPower(0);
      Bangle.removeListener("HRM", hrmListener);
      clearTimeout(timer);
      Bangle.setUI();
      showMenu();
    }

    // Allow cancelling with button press
    Bangle.setUI({mode:"custom", btn: stopHRM});

    // Timer for 60-second measurement
    const timer = setTimeout(stopHRM, DURATION * 1000);
  }

  // ===================================================
  // Turn light on
  // ===================================================
  function sendLightOn() {
    showText("Licht an ...");
    sendBLE({t:"l", v:"1"});
    setTimeout(showMenu, 2000);
  }

  // ===================================================
  // Turn alarm on
  // ===================================================
  function sendAlarmOn() {
    showText("Alarm an ...");
    sendBLE({t:"a", v:"1"});
    setTimeout(showMenu, 2000);
  }

  // ===================================================
  // Exit app
  // ===================================================
  function exitApp() {
    showText("Ende.");
    setTimeout(load, 1500);
  }

  // ===================================================
  // Menu
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
  // BLE status
  // ===================================================
  NRF.on("connect", () => g.clear());
  NRF.on("disconnect", () => {
    showText("Getrennt...");
    setTimeout(showMenu, 2000);
  });

  // ===================================================
  // Splash "b"
  // ===================================================
  g.clear();
  g.setColor("#8000FF");
  g.fillRect(0, 0, g.getWidth(), g.getHeight());
  g.setColor(1, 1, 1);
  g.setFont("Vector", 60);
  const t = "b";
  g.drawString(t, (g.getWidth() - g.stringWidth(t)) / 2, (g.getHeight() - 60) / 2);
  g.flip();

  setTimeout(showMenu, 1000);
})();
