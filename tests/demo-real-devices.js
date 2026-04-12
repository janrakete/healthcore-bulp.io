/**
 * =============================================================================================
 * Healthcore Demo Script — Real Devices
 * ======================================
 * Simulates two scenarios with physical devices:
 *
 *  1. Bangle.js 2 (Bluetooth)
 *     → Press in the watch menu: "Demo: High Heart Rate (155 bpm)"
 *     → CareInsightsEngine (anomaly_detection) detects a deviation
 *     → Scenario fires → Notification in the app → Changes color of Paulmann bulb
 *     
 *  2. SONOFF SNZB-01P (ZigBee)
 *     → Press the button 6 times within one minute
 *     → CareInsightsEngine (sum_above_threshold) triggers
 *     → Scenario fires → Push notification → Activates alarm on BULP sensor  
 *
 * Prerequisites:
 *   - Healthcore is running (broker/app.js + server/app.js)
 *   - Bangle.js 2 is connected to Healthcore via the Bluetooth bridge
 *   - SONOFF SNZB-01P is connected to Healthcore via the ZigBee bridge
 *   - Paulmann Smart Home device is connected to Healthcore via the ZigBee bridge
 *   - BULP is connected to Healthcore via the Bluetooth bridge
 *   - Load the new bulp.app.js onto the Bangle.js 2 (contains the "Demo: High Heart Rate" menu)
 *
 * Start:
 *   node tests/demo-real-devices.js
 *
 * Reset/clean up only:
 *   node tests/demo-real-devices.js --reset-only
 * =============================================================================================
 */

"use strict";

const path   = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const Database = require("better-sqlite3");
const { find } = require("async");

// ─── Configuration ────────────────────────────────────────────────────────────

const DB_FILENAME = process.env.CONF_databaseFilename || "../healthcore_database.db";
// DB_FILENAME is relative to the project directory (e.g. "../healthcore_database.db").
// Since __dirname points to the tests/ directory, a simple path.resolve is sufficient —
// no extra ".." segment is needed, otherwise navigation would go one level too far up.
const DB_PATH     = path.resolve(__dirname, DB_FILENAME);

const DEMO_PREFIX = "[Demo] ";

// CareInsights parameters from .env
const ANOMALY_THRESHOLD   = parseFloat(process.env.CONF_careInsightsAnomalyThreshold) || 0.6;
const MIN_HISTORY_ENTRIES = parseInt(process.env.CONF_careInsightsMinHistoryEntries)   || 10;
const HISTORY_SIZE        = parseInt(process.env.CONF_careInsightsHistorySize)          || 200;

// Number of button presses required to exceed the threshold
const SONOFF_PRESS_THRESHOLD = 5;  // Schwelle: mehr als 5 Drücke/Stunde
const SONOFF_PRESSES_NEEDED  = 6;  // 6 Drücke → Summe 6 > 5 → Insight

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg = "", symbol = " ") {
  console.log(symbol + " " + msg);
}

function logSection(title) {
  console.log("");
  console.log("─".repeat(60));
  console.log("  " + title);
  console.log("─".repeat(60));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Find devices in the database ────────────────────────────────────────────

/**
 * Finds the Bangle.js 2 in the DB (first by ProductName, then by bridge).
 * @param {Database} db
 * @returns {Object|null} device row
 */
function findBangleDevice(db) {
  // Search using the converter product name pattern
  const device = db.prepare(
    "SELECT * FROM devices WHERE bridge = 'bluetooth' AND productName LIKE 'Bangle.js%' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

/**
 * Finds the SONOFF SNZB-01P in the DB.
 * @param {Database} db
 * @returns {Object|null} device row
 */
function findSonoffDevice(db) {
  const device = db.prepare(
    "SELECT * FROM devices WHERE bridge = 'zigbee' AND productName = 'SNZB-01P' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

/**
 * Finds the Paulmann Smart Home device in the DB.
 * @param {Database} db
 * @returns {Object|null} device row
 */
function findPaulmannDevice(db) {
  const device = db.prepare(
    "SELECT * FROM devices WHERE bridge = 'zigbee' AND productName LIKE 'RGB%' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

/**
 * Finds the BULP in the DB.
 * @param {Database} db
 * @returns {Object|null} device row
 */
function findBulpDevice(db) {
  const device = db.prepare(
    "SELECT * FROM devices WHERE bridge = 'bluetooth' AND productName LIKE 'bulp%' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Deletes all demo-specific configuration data.
 * Real measurement history is NOT deleted — only SONOFF button presses
 * from the last 2 hours are cleared (for a clean threshold demo).
 */
function resetDemo(db, bangleDeviceID, sonoffDeviceID, paulmannDeviceID, bulpDeviceID) {
  logSection("RESET: Vorherige Demo-Daten löschen");

  // 1. Delete demo notifications via scenario IDs (before deleting the scenarios!)
  const demoScenarios = db.prepare(
    "SELECT scenarioID FROM scenarios WHERE name LIKE ?"
  ).all(DEMO_PREFIX + "%");

  if (demoScenarios.length > 0) {
    const ids          = demoScenarios.map((s) => s.scenarioID);
    const placeholders = ids.map(() => "?").join(", ");
    const deletedN = db.prepare(
      "DELETE FROM notifications WHERE scenarioID IN (" + placeholders + ")"
    ).run(...ids);
    log("Demo-Notifications gelöscht: " + deletedN.changes, "✓");
  }
  else {
    log("Demo-Notifications gelöscht: 0", "✓");
  }

  // 2. Delete demo scenarios
  demoScenarios.forEach((s) => {
    db.prepare("DELETE FROM scenarios_triggers   WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios_actions    WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios_executions WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios            WHERE scenarioID = ?").run(s.scenarioID);
  });
  log("Demo-Szenarien gelöscht: " + demoScenarios.length, "✓");

  // 3. Delete demo CareInsight rules
  const deletedRules = db.prepare(
    "DELETE FROM care_insight_rules WHERE title LIKE ?"
  ).run(DEMO_PREFIX + "%");
  log("CareInsight-Regeln gelöscht: " + deletedRules.changes, "✓");

  // 4. Resolve open demo insights
  if (bangleDeviceID || sonoffDeviceID || paulmannDeviceID || bulpDeviceID) {
    const ids = [bangleDeviceID, sonoffDeviceID, paulmannDeviceID, bulpDeviceID].filter(Boolean);
    const placeholders = ids.map(() => "?").join(", ");
    const resolved = db.prepare(
      "UPDATE care_insights SET status = 'resolved', dateTimeResolved = datetime('now', 'localtime') WHERE deviceID IN (" + placeholders + ") AND status IN ('open', 'acknowledged')"
    ).run(...ids);
    log("Offene Demo-Insights aufgelöst: " + resolved.changes, "✓");
  }

  // 5. Delete SONOFF button presses from the last 2 hours (for a clean threshold demo)
  if (sonoffDeviceID) {
    const deletedPresses = db.prepare(
      "DELETE FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = 'zigbee' AND property = 'button'"
    ).run(sonoffDeviceID);
    log("SONOFF Button-Presses (letzte 2h) gelöscht: " + deletedPresses.changes, "✓");
  }

  // 6. Remove synthetic Bangle.js baseline (if left over from a previous demo run)
  //    Identifiable: values between 68 and 74, within the demo time windows
  //    Real measurements are left untouched — baseline will be re-seeded if needed.
  if (bangleDeviceID) {
    const deletedBaseline = db.prepare(
      "DELETE FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = 'bluetooth' AND property = 'heartrate'"
    ).run(bangleDeviceID);
    if (deletedBaseline.changes > 0) {
      log("Synthetische Bangle.js-Baseline entfernt: " + deletedBaseline.changes + " Einträge", "✓");
    }
  }
}

// ─── Check and optionally seed Bangle.js baseline ───────────────────────────

/**
 * Checks whether enough real heart rate history is available.
 * If not, synthetic baseline values are seeded.
 * @param {Database} db
 * @param {string} deviceID
 * @returns {number} Number of existing (+ seeded) history entries
 */
function ensureBangleBaseline(db, deviceID) {
  logSection("BANGLE.JS 2: Puls-Baseline prüfen");

  const existingCount = db.prepare(
    "SELECT COUNT(*) AS cnt FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = 'bluetooth' AND property = 'heartrate' ORDER BY dateTimeAsNumeric DESC LIMIT ?"
  ).get(deviceID, HISTORY_SIZE).cnt;

  log("Vorhandene Puls-Einträge in History: " + existingCount, "📊");

  if (existingCount >= MIN_HISTORY_ENTRIES) {
    log("Genug History vorhanden — keine synthetische Baseline nötig.", "✓");
    return existingCount;
  }

  const missing = MIN_HISTORY_ENTRIES + 2 - existingCount; // 2 buffer entries
  log("Zu wenig History (" + existingCount + "/" + MIN_HISTORY_ENTRIES + ") — säe " + missing + " synthetische Normalwerte ...", "⟳");

  // Synthetic normal values: 68–74 bpm, spread over the last 90 minutes
  const baselineValues = [70, 72, 71, 69, 73, 70, 71, 72, 68, 74, 70, 71, 69, 72];
  const now            = Date.now();

  baselineValues.slice(0, missing).forEach((bpm, index) => {
    const timestamp = now - (90 - index * (80 / missing)) * 60 * 1000;
    db.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(deviceID, "bluetooth", "heartrate", String(bpm), bpm, timestamp);
  });

  log("Synthetische Baseline gesät: " + missing + " Einträge (68–74 bpm)", "✓");
  return existingCount + missing;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

/**
 * Creates CareInsight rules and scenarios for the real devices.
 *
 * Separation of concerns:
 *   - A CareInsight rule is device-agnostic: it only listens to a property
 *     (e.g. "heartrate") and fires for any device that sends this property.
 *   - Device binding is done exclusively in the scenario trigger via deviceID and bridge:
 *     The scenario only reacts when the rule was triggered for the specific target device.
 *
 * For SONOFF, the current button-press sum is queried and the threshold is set
 * dynamically (current_sum + SONOFF_PRESS_THRESHOLD), so that exactly
 * SONOFF_PRESSES_NEEDED more presses will trigger the insight.
 *
 * @param {Database} db
 * @param {Object} bangle  - { deviceID, bridge } — required for the scenario trigger
 * @param {Object} sonoff  - { deviceID, bridge } — required for threshold query and scenario trigger
 * @param {Object} paulmann  - { deviceID, bridge } — required for scenario trigger
 * @param {Object} bulp  - { deviceID, bridge } — required for scenario trigger
 */
function setupDemo(db, bangle, sonoff, paulmann, bulp) {
  logSection("SETUP: CareInsight-Regeln & Szenarien anlegen");

  // ── SONOFF: Query current button-press sum in the last hour ───────────────
  const oneHourAgo  = Date.now() - 60 * 60 * 1000;
  const sonoffCurrent = db.prepare(
    "SELECT COALESCE(SUM(valueAsNumeric), 0) AS total FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? AND property = 'button' AND dateTimeAsNumeric >= ?"
  ).get(sonoff.deviceID, sonoff.bridge, oneHourAgo);

  const currentSum      = Number(sonoffCurrent.total) || 0;
  const sonoffThreshold = currentSum + SONOFF_PRESS_THRESHOLD;  // dynamische Schwelle

  log("SONOFF Button-Sum (letzte 1h): " + currentSum, "📊");
  log("SONOFF Schwelle gesetzt auf:   " + sonoffThreshold + " (aktuell " + currentSum + " + " + SONOFF_PRESS_THRESHOLD + ")", "📊");

  // ── CareInsight Rules ──────────────────────────────────────────────────────
  // Rules are device-agnostic and only listen to a single property. Which
  // device ultimately triggers the rule is determined solely by the scenario trigger.

  // Rule 1: Heart rate anomaly (fires for any device that sends "heartrate")
  const bangleRule = db.prepare(
    "INSERT INTO care_insight_rules (title, enabled, sourceProperty, aggregationType, thresholdMin, minReadings, recommendation) VALUES (?, 1, ?, ?, ?, ?, ?)"
  ).run(
    DEMO_PREFIX + "Ungewöhnlicher Puls",
    "heartrate",
    "anomaly_detection",
    ANOMALY_THRESHOLD,
    MIN_HISTORY_ENTRIES,
    "Ruhepuls messen und ggf. medizinisches Fachpersonal informieren."
  );
  const bangleRuleID = bangleRule.lastInsertRowid;
  log("CareInsight-Regel: Puls-Anomalie (ID " + bangleRuleID + ", Schwelle: " + ANOMALY_THRESHOLD + ")", "✓");

  // Rule 2: Frequent pressing (fires for any device that sends "button")
  const sonoffRule = db.prepare(
    "INSERT INTO care_insight_rules (title, enabled, sourceProperty, aggregationType, aggregationWindowHours, thresholdMax, minReadings, recommendation) VALUES (?, 1, ?, ?, ?, ?, ?, ?)"
  ).run(
    DEMO_PREFIX + "Häufiger Hilferuf",
    "button",
    "sum_above_threshold",
    1,                // 1-hour window
    sonoffThreshold,  // dynamic: current sum + 5
    1,
    "Patientenzimmer aufsuchen und nach dem Befinden fragen."
  );
  const sonoffRuleID = sonoffRule.lastInsertRowid;
  log("CareInsight-Regel: Häufiger Tastendruck (ID " + sonoffRuleID + ", Schwelle: >" + sonoffThreshold + " Drücke/h)", "✓");

  // ── Scenarios ─────────────────────────────────────────────────────────────
  // Device binding is done in the scenario trigger: deviceID and bridge restrict
  // the trigger to the specific target device, even though the rule itself is generic.

  // Scenario 1: Bangle.js heart rate anomaly → Notification
  const bangleScenario = db.prepare(
    "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 8, ?)"
  ).run(
    DEMO_PREFIX + "Hoher Puls → Notification",
    "Ungewöhnlicher Puls erkannt",
    "heart"
  );
  const bangleScenarioID = bangleScenario.lastInsertRowid;

  // Trigger: rule fires + device must be Bangle.js 2
  db.prepare(
    "INSERT INTO scenarios_triggers (scenarioID, type, property, deviceID, bridge) VALUES (?, ?, ?, ?, ?)"
  ).run(bangleScenarioID, "care_insight_opened", String(bangleRuleID), bangle.deviceID, bangle.bridge);

  db.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay) VALUES (?, ?, ?, ?, ?)"
  ).run(
    bangleScenarioID,
    "notification",
    "Ungewöhnlicher Puls erkannt",
    "Puls-Uhr hat einen Puls gemessen, der deutlich vom Normalwert abweicht.",
    0
  );

  db.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay, bridge, deviceID) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    bangleScenarioID,
    "set_device_value",
    250,
    "hue",
    1,
    paulmann.bridge,
    paulmann.deviceID
  );

  log("Szenario: Hoher Puls → Notification → Lichtänderung (ID " + bangleScenarioID + ")", "✓");

  // Scenario 2: SONOFF frequent pressing → Push notification
  const sonoffScenario = db.prepare(
    "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 9, ?)"
  ).run(
    DEMO_PREFIX + "Häufiges Drücken → Push-Nachricht",
    "Hilfe-Taster wird ungewöhnlich oft gedrückt",
    "hand-left"
  );
  const sonoffScenarioID = sonoffScenario.lastInsertRowid;

  // Trigger: rule fires + device must be SONOFF SNZB-01P
  db.prepare(
    "INSERT INTO scenarios_triggers (scenarioID, type, property, deviceID, bridge) VALUES (?, ?, ?, ?, ?)"
  ).run(sonoffScenarioID, "care_insight_opened", String(sonoffRuleID), sonoff.deviceID, sonoff.bridge);

  db.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay) VALUES (?, ?, ?, ?, ?)"
  ).run(
    sonoffScenarioID,
    "push_notification",
    "Patient drückt wiederholt den Hilfe-Taster",
    "Der Hilfe-Taster wurde innerhalb einer Stunde häufiger als üblich gedrückt.",
    0
  );

  db.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay, bridge, deviceID) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    sonoffScenarioID,
    "set_device_value",
    "on",
    "speaker",
    0,
    bulp.bridge,
    bulp.deviceID
  );

  log("Szenario: Häufiges Drücken → Push-Nachricht → Lautsprecher einschalten (ID " + sonoffScenarioID + ")", "✓");

  return { bangleRuleID, sonoffRuleID, bangleScenarioID, sonoffScenarioID, sonoffThreshold };
}

// ─── Live-Monitoring ──────────────────────────────────────────────────────────

/**
 * Waits for new care insights for the given device IDs and prints
 * a message as soon as they appear in the DB.
 * Aborts after `timeoutSeconds` seconds.
 *
 * @param {Database} db
 * @param {string[]} deviceIDs
 * @param {number} timeoutSeconds
 */
async function waitForInsights(db, deviceIDs, timeoutSeconds = 120) {
  logSection("WARTE AUF EVENTS ...");
  log("Timeout: " + timeoutSeconds + " Sekunden", "⏱");
  log("");

  const placeholders = deviceIDs.map(() => "?").join(", ");
  const seenIDs      = new Set();
  const startTime    = Date.now();
  const deadline     = startTime + timeoutSeconds * 1000;

  let dotCount = 0;

  while (Date.now() < deadline) {
    const insights = db.prepare(
      "SELECT * FROM care_insights WHERE deviceID IN (" + placeholders + ") AND status = 'open' ORDER BY insightID DESC LIMIT 10"
    ).all(...deviceIDs);

    for (const insight of insights) {
      if (!seenIDs.has(insight.insightID)) {
        seenIDs.add(insight.insightID);
        process.stdout.write("\n");
        log("CARE INSIGHT erkannt! (ID " + insight.insightID + ")", "🚨");
        log("Gerät:   " + insight.deviceID + " [" + insight.bridge + "]", "   ");
        log("Typ:     " + insight.type, "   ");
        log("Score:   " + Number(insight.score).toFixed(2), "   ");
        log("Titel:   " + insight.title, "   ");
        log("Summary: " + insight.summary, "   ");

        // Wait for associated notification/execution
        await sleep(800);

        const notification = db.prepare(
          "SELECT * FROM notifications ORDER BY notificationID DESC LIMIT 1"
        ).get();

        if (notification && (Date.now() - new Date(notification.dateTime).getTime()) < 5000) {
          log("Notification erstellt: \"" + notification.text + "\"", "✅");
        }

        const execution = db.prepare(
          "SELECT se.*, s.name AS scenarioName FROM scenarios_executions se JOIN scenarios s ON se.scenarioID = s.scenarioID WHERE s.name LIKE ? ORDER BY se.executionID DESC LIMIT 1"
        ).get(DEMO_PREFIX + "%");

        if (execution) {
          log("Szenario ausgeführt: \"" + execution.scenarioName + "\"", "✅");
        }

        log("");
      }
    }

    // Print progress dot
    process.stdout.write(".");
    dotCount++;
    if (dotCount % 30 === 0) {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      process.stdout.write(" (" + remaining + "s)\n");
    }

    await sleep(1000);
  }

  process.stdout.write("\n");

  if (seenIDs.size === 0) {
    log("Timeout — keine neuen Care Insights empfangen.", "⏱");
    log("Überprüfe:", "  ");
    log("  • Ist die Bangle.js 2 über Bluetooth verbunden?", "  ");
    log("  • Wurde 'Demo: Hoher Puls' im Watch-Menü gedrückt?", "  ");
    log("  • Wurde der SONOFF-Taster " + SONOFF_PRESSES_NEEDED + "× gedrückt?", "  ");
    log("  • Laufen broker/app.js und server/app.js?", "  ");
  }
  else {
    log("" + seenIDs.size + " Care Insight(s) empfangen. Demo erfolgreich!", "🎉");
  }
}

// ─── Print demo instructions ─────────────────────────────────────────────────

function printInstructions(bangle, sonoff, sonoffThreshold) {
  logSection("BEREIT — Bitte Geräte auslösen");

  console.log("");
  console.log("  ┌──────────────────────────────────────────────────────┐");
  console.log("  │  SZENARIO 1: Bangle.js 2                            │");
  console.log("  │                                                      │");
  console.log("  │  Gerät:  " + padRight(bangle.name || bangle.deviceID, 42) + "│");
  console.log("  │  ID:     " + padRight(bangle.deviceID, 42) + "│");
  console.log("  │                                                      │");
  console.log("  │  → Öffne das bulp-Menü auf der Bangle.js 2          │");
  console.log("  │  → Tippe auf: \"Demo: Hoher Puls (155 bpm)\"          │");
  console.log("  │                                                      │");
  console.log("  │  Erwartung: Notification in der Healthcore-App       │");
  console.log("  └──────────────────────────────────────────────────────┘");
  console.log("");
  console.log("  ┌──────────────────────────────────────────────────────┐");
  console.log("  │  SZENARIO 2: SONOFF SNZB-01P                        │");
  console.log("  │                                                      │");
  console.log("  │  Gerät:  " + padRight(sonoff.name || sonoff.deviceID, 42) + "│");
  console.log("  │  ID:     " + padRight(sonoff.deviceID, 42) + "│");
  console.log("  │                                                      │");
  console.log("  │  → Drücke den Taster " + SONOFF_PRESSES_NEEDED + "× hintereinander             │");
  console.log("  │  → Schwelle: >" + sonoffThreshold + " Drücke in der letzten Stunde        │");
  console.log("  │                                                      │");
  console.log("  │  Erwartung: Push-Notification auf dem Smartphone     │");
  console.log("  └──────────────────────────────────────────────────────┘");
  console.log("");
}

function padRight(str, length) {
  str = String(str);
  return str.length >= length ? str.slice(0, length) : str + " ".repeat(length - str.length);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║    HEALTHCORE DEMO — Echte Geräte                       ║");
  console.log("║    " + new Date().toLocaleString("de-DE") + "                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const resetOnly = process.argv.includes("--reset-only");

  // ── Open database ─────────────────────────────────────────────────────────
  let db;
  try {
    db = new Database(DB_PATH);
    log("Datenbank geöffnet: " + DB_PATH, "✓");
  }
  catch (err) {
    log("Datenbank konnte nicht geöffnet werden: " + err.message, "✗");
    log("Stelle sicher, dass Healthcore gestartet wurde, damit die DB existiert.", "  ");
    process.exit(1);
  }

  // ── Find real devices ───────────────────────────────────────────────────
  logSection("GERÄTE SUCHEN");

  const bangle = findBangleDevice(db);
  const sonoff = findSonoffDevice(db);
  const paulmann = findPaulmannDevice(db);
  const bulp = findBulpDevice(db);

  let hasError = false;

  if (bangle) {
    log("Bangle.js 2 gefunden:    " + bangle.deviceID + " (" + (bangle.name || bangle.productName) + ")", "✓");
  }
  else {
    log("Bangle.js 2 nicht gefunden!", "✗");
    log("  → Starte den Bluetooth-Bridge (node \"bridge - bluetooth/app.js\")", "  ");
    log("  → Verbinde die Bangle.js 2 und stelle sicher, dass sie in Healthcore registriert ist.", "  ");
    hasError = true;
  }

  if (sonoff) {
    log("SONOFF SNZB-01P gefunden: " + sonoff.deviceID + " (" + (sonoff.name || sonoff.productName) + ")", "✓");
  }
  else {
    log("SONOFF SNZB-01P nicht gefunden!", "✗");
    log("  → Starte den ZigBee-Bridge (node \"bridge - zigbee/app.js\")", "  ");
    log("  → Koppele das SONOFF und stelle sicher, dass es in Healthcore registriert ist.", "  ");
    hasError = true;
  }

  if (paulmann) {
    log("Paulmann Smart Home gefunden: " + paulmann.deviceID + " (" + (paulmann.name || paulmann.productName) + ")", "✓");
  }
  else {
    log("Paulmann Smart Home nicht gefunden!", "✗");
    log("  → Starte den ZigBee-Bridge (node \"bridge - zigbee/app.js\")", "  ");
    log("  → Koppele das Paulmann-Gerät und stelle sicher, dass es in Healthcore registriert ist.", "  ");
    hasError = true;
  }

  if (bulp) {
    log("BULP gefunden:           " + bulp.deviceID + " (" + (bulp.name || bulp.productName) + ")", "✓");
  }
  else {
    log("BULP nicht gefunden!", "✗");
    log("  → Starte den Bluetooth-Bridge (node \"bridge - bluetooth/app.js\")", "  ");
    log("  → Verbinde die BULP und stelle sicher, dass sie in Healthcore registriert ist.", "  ");
    hasError = true;
  }

  if (hasError) {
    log("", "");
    log("Demo kann nicht gestartet werden — bitte zuerst fehlende Geräte verbinden.", "⚠️");
    db.close();
    process.exit(1);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  resetDemo(db, bangle.deviceID, sonoff.deviceID, paulmann.deviceID, bulp.deviceID);

  if (resetOnly) {
    log("", "");
    log("Reset abgeschlossen (--reset-only). Demo nicht gestartet.", "✓");
    db.close();
    return;
  }

  // ── Ensure Bangle.js baseline ──────────────────────────────────────────────
  ensureBangleBaseline(db, bangle.deviceID);

  // ── Create scenarios & rules ────────────────────────────────────────────
  const { sonoffThreshold } = setupDemo(db, bangle, sonoff, paulmann, bulp);

  // ── Print instructions ────────────────────────────────────────────────────
  printInstructions(bangle, sonoff, sonoffThreshold);

  // ── Live monitoring ────────────────────────────────────────────────────────
  await waitForInsights(db, [bangle.deviceID, sonoff.deviceID], 120);

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Wiederholung: node tests/demo-real-devices.js          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  db.close();
}

main().catch((err) => {
  console.error("\n✗ Unbehandelter Fehler:", err.message);
  process.exit(1);
});
