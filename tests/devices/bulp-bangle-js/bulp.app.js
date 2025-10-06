// === Farben für Dark Mode (RGB565 Format) ===
const BG_COLOR = 0;           // Schwarz
const TEXT_COLOR = 2047;      // Cyan (0x07FF)
const TITLE_COLOR = 65535;    // Weiß (0xFFFF)
const ALERT_COLOR = 63488;    // Rot (0xF800)
const SUCCESS_COLOR = 2016;   // Grün (0x07E0)
const SEL_BG = 2047;          // Markierter Hintergrund (Cyan)
const SEL_FG = 0;             // Markierter Text (Schwarz)

// Bildschirm vorbereiten
function setDarkMode() {
  g.setBgColor(BG_COLOR);
  g.setColor(TEXT_COLOR);
  g.clear();
}

// === Funktionen ===

// Pulsanzeige
function showHeartRate() {
  setDarkMode();
  g.setColor(TITLE_COLOR);
  E.showMessage("Messe Puls...", "Sensor");

  if (!Bangle.isHRMOn()) {
    Bangle.setHRMPower(1);
  }
  
  let measurements = [];
  let listener = Bangle.on('HRM', hrm => {
    if (hrm.bpm > 0 && hrm.confidence > 50) {
      measurements.push(hrm.bpm);
      setDarkMode();
      g.setColor(SUCCESS_COLOR);
      E.showMessage(`Puls: ${hrm.bpm} bpm\nVertrauen: ${hrm.confidence}%`, "Sensor");
      console.log("HRM:", hrm);
    }
  });

  setTimeout(() => {
    Bangle.removeListener('HRM', listener);
    Bangle.setHRMPower(0);
    
    if (measurements.length > 0) {
      const avgBpm = Math.round(measurements.reduce((a,b) => a+b) / measurements.length);
      g.setColor(SUCCESS_COLOR);
      E.showMessage(`Durchschnitt: ${avgBpm} bpm\nMessungen: ${measurements.length}`, "Ergebnis");
      setTimeout(showMainMenu, 3000);
    } else {
      g.setColor(ALERT_COLOR);
      E.showMessage("Keine guten\nMessungen", "Fehler");
      setTimeout(showMainMenu, 2000);
    }
  }, 15000);
}

// BLE-Warnsignal mit echten Daten
function sendBleAlert() {
  setDarkMode();
  g.setColor(ALERT_COLOR);
  E.showMessage("Sende Warnung...", "Bluetooth");

  // Echte Daten für dein bulp.io System
  const healthData = {
    deviceID: "bangle-" + NRF.getAddress().replace(/:/g, ""),
    type: "emergency",
    timestamp: Date.now(),
    battery: E.getBattery()
  };

  NRF.setAdvertising({
    0x180F: [E.getBattery()] // Battery Service
  }, {
    name: "bulp-bangle",
    manufacturerData: JSON.stringify(healthData).substr(0, 20) // Max 20 chars
  });

  Bangle.buzz(1000); // Längerer Buzz
  
  setTimeout(() => {
    NRF.setAdvertising({});
    g.setColor(SUCCESS_COLOR);
    E.showMessage("Warnung gesendet!", "Bluetooth");
    setTimeout(showMainMenu, 2000);
  }, 3000);
}

// ZigBee-Licht über Bluetooth-Bridge
function sendZigbeeLightOn() {
  setDarkMode();
  g.setColor(TEXT_COLOR);
  E.showMessage("Sende Licht-Befehl...", "Bridge");

  const command = {
    cmd: "light_on",
    target: "zigbee-bulb-001",
    from: "bangle"
  };

  NRF.setAdvertising({}, {
    name: "bulp-cmd",
    manufacturerData: JSON.stringify(command).substr(0, 20)
  });

  setTimeout(() => {
    NRF.setAdvertising({});
    Bangle.buzz();
    g.setColor(SUCCESS_COLOR);
    E.showMessage("Befehl gesendet!\nLicht sollte angehen", "Bridge");
    setTimeout(showMainMenu, 3000);
  }, 2000);
}

// === Menü anzeigen ===
function showMainMenu() {
  setDarkMode();
  let mainmenu = {
    "" : { title : "Health & Control" },
    "Aktueller Puls" : showHeartRate,
    "Bluetooth: Warn-Ton" : sendBleAlert,
    "ZigBee: Licht an" : sendZigbeeLightOn,
    "App beenden" : function() { load(); }
  };
  
  // Menü mit korrekten RGB565-Farben
  E.showMenu(mainmenu, {
    fg: TEXT_COLOR,     // Cyan Text
    bg: BG_COLOR,       // Schwarzer Hintergrund
    selFg: SEL_FG,      // Schwarzer markierter Text
    selBg: SEL_BG,      // Cyan markierter Hintergrund
    titleFg: TITLE_COLOR // Weißer Titel
  });
}

// Start der App
showMainMenu();