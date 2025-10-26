NRF.setAdvertising([], { name:"Bangle", connectable:true });
setupBLE(); // initiiert Service sofort

(function() {
  // --- UUIDs ---
  const SERVICE_UUID = "6e400001b5a3f393e0a9e50e24dcca9e";
  const TX_UUID = "6e400002b5a3f393e0a9e50e24dcca9e"; // Notify → Bridge empfängt
  const RX_UUID = "6e400003b5a3f393e0a9e50e24dcca9e"; // Write → Bridge sendet

  // --- BLE Peripheral Setup ---
  function setupBLE() {
    try {
      NRF.setServices({
        "6e400001b5a3f393e0a9e50e24dcca9e": {
          "6e400002b5a3f393e0a9e50e24dcca9e": {
            value: "",
            maxLen: 40,
            notify: true,
            readable: true
          },
          "6e400003b5a3f393e0a9e50e24dcca9e": {
            value: "",
            maxLen: 40,
            writable: true,
            onWrite: function(evt) {
              try {
                var msg = JSON.parse(evt.data);
                handleIncoming(msg);
              } catch (e) {
                print("❌ RX Parse Error:", e);
              }
            }
          }
        }
      }, { advertise: ["6e400001b5a3f393e0a9e50e24dcca9e"] });
      print("✅ BLE aktiv: bulp.io-watch");
    } catch (e) {
      print("❌ BLE Fehler:", e);
    }
  }

  function sendBLE(obj) {
    try {
      var data = JSON.stringify(obj);
      NRF.updateServices({
        "6e400001b5a3f393e0a9e50e24dcca9e": {
          "6e400002b5a3f393e0a9e50e24dcca9e": { value: data }
        }
      });
      print("📤 Gesendet:", data);
    } catch (e) {
      print("❌ Sendefehler:", e);
    }
  }

  function handleIncoming(msg) {
    if (msg.type === "ping") {
      sendBLE({ type: "pong", ts: Date.now() });
    } else if (msg.type === "getPulse") {
      showPulse(true); // true = nur senden
    }
  }

  // --- Splashscreen ---
  function splash() {
    g.clear();
    g.setColor("#8000ff"); // Lila
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
    var menu = {
      "Aktueller Puls": function() { showPulse(false); },
      "Bluetooth: Warn-Ton": function() {
        sendBLE({ type: "warnTone" });
        E.showMessage("Warn-Ton gesendet", "Bluetooth");
        setTimeout(showMenu, 1500);
      },
      "ZigBee: Licht an": function() {
        sendBLE({ type: "zigbeeLight" });
        E.showMessage("Licht eingeschaltet", "ZigBee");
        setTimeout(showMenu, 1500);
      },
      "App beenden": function() { load(); }
    };
    E.showMenu(menu);
  }

  // --- Pulsanzeige ---
  function showPulse(onlySend) {
    if (!onlySend) E.showMessage("Messung läuft...", "Puls");
    Bangle.setHRMPower(1);

    setTimeout(function() {
      var hrm = Bangle.getHRM();
      var bpm = (hrm && hrm.bpm) ? hrm.bpm : 0;
      sendBLE({ type: "pulse", value: bpm });

      if (!onlySend) {
        g.clear();
        g.setFont("Vector", 30);
        g.setFontAlign(0, 0);
        g.drawString("Puls: " + bpm + " bpm", g.getWidth() / 2, g.getHeight() / 2);
        setTimeout(showMenu, 3000);
      }

      Bangle.setHRMPower(0);
    }, 2500);
  }

  // --- App Start ---
  setupBLE();
  splash();
})();
