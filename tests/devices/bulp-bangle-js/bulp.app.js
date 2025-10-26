(function() {
  // ===============================
  // BLE Setup Function
  // ===============================
  function setupBLE() {
    try {
      // Define the BLE services and characteristics
      NRF.setServices({
        // Main service
        "6e400001b5a3f393e0a9e50e24dcca9e": {
          // TX characteristic: notify = true, readable = true
          "6e400002b5a3f393e0a9e50e24dcca9e": { // PULSE
            value: "",
            maxLen: 40,
            notify: true,
            readable: true
          },
          "6e400003b5a3f393e0a9e50e24dcca9e": { // LIGHT
            value: "",
            maxLen: 40,
            notify: true,
            readable: true
          }
        }
      }, {
        // Make this service visible (advertised) to BLE scanners / Bridge
        advertise: ["6e400001b5a3f393e0a9e50e24dcca9e"]
      });

      print("✅ BLE active: bulp.io-watch visible");
    } catch (e) {
      print("❌ BLE error:", e);
    }
  }

  // ===============================
  // Function to send data over BLE
  // ===============================
  function sendBLE(type, value) {
    try {
      if (type === "pulse") {
        NRF.updateServices({
          "6e400001b5a3f393e0a9e50e24dcca9e": {
            "6e400002b5a3f393e0a9e50e24dcca9e": { value: JSON.stringify({ pulse: value }) }
          }
        });
      } else if (type === "light") {
        NRF.updateServices({
          "6e400001b5a3f393e0a9e50e24dcca9e": {
            "6e400003b5a3f393e0a9e50e24dcca9e": { value: JSON.stringify({ light: value }) }
          }
        });
      } else {
        throw new Error("Unknown type: " + type);
      }

      print("📤 Sent:", type, value);
    } catch (e) {
      print("❌ Send error:", e);
    }
  }
  
  // ===============================
  // Splashscreen
  // ===============================
  function splash() {
    g.clear(); // Clear screen
    g.setColor("#8000ff"); // Background color: purple
    g.fillRect(0, 0, g.getWidth(), g.getHeight()); // Fill background
    g.setColor("#ffffff"); // Text color: white
    g.setFont("Vector", 80); // Large font
    g.setFontAlign(0, 0); // Center alignment
    g.drawString("b", g.getWidth() / 2, g.getHeight() / 2); // Draw "b" in center
    g.flip();

    // Start BLE after short delay for stability, then show menu
    setTimeout(function() {
      setupBLE(); // Activate BLE
      showMenu(); // Show menu after splash
    }, 500); // 500ms delay
  }

  // ===============================
  // Main Menu
  // ===============================
  function showMenu() {
    E.showMenu({
      '': { title: 'bulp.io - send over BLE ...' },
      // Show current pulse
      "Current pulse": function() { showPulse(false); },
      // Send a command to turn ZigBee light on
      "Light = on": function() {
        sendBLE("light", "on");
        E.showMessage("Light turned on", "bulp.io");
        setTimeout(showMenu, 1500); // Return to menu
      },
      // Exit the app
      "Exit App": function() { load(); }
    });
  }

  // ===============================
  // Pulse Measurement
  // ===============================
  function showPulse(onlySend) {
    if (!onlySend) E.showMessage("Measuring ...", "Pulse");

    Bangle.setHRMPower(true); // Turn on HRM

    var startTime = Date.now();
    var measurementDuration = 60000; // 60 seconds
    var lastBPM = 0;

    function onHRM(hrm) {
      if (hrm.bpm > 0) lastBPM = hrm.bpm;

      // Send the current BPM immediately
      sendBLE("pulse", lastBPM);

      // Optionally display on screen every HRM update
      if (!onlySend) {
        g.clear();
        g.setFont("Vector", 30);
        g.setFontAlign(0, 0);
        g.drawString("Pulse: " + lastBPM + " bpm", g.getWidth()/2, g.getHeight()/2);
      }

      // Stop after 60 seconds
      if (Date.now() - startTime > measurementDuration) {
        Bangle.setHRMPower(false);          // Turn off HRM
        Bangle.removeListener('HRM', onHRM); // Remove listener
        if (!onlySend) showMenu();           // Return to menu
      }
    }

    // Listen for HRM events
    Bangle.on('HRM', onHRM);
  }

  // ===============================
  // App Start
  // ===============================
  splash(); // Show splashscreen and start BLE/menu sequence
})();
