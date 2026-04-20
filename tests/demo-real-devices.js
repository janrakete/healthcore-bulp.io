/**
 * =============================================================================================
 * Healthcore Demo Script — Real Devices
 * =====================================
 * Simulates two scenarios with physical devices:
 *
 *  1. Bangle.js 2 (Bluetooth)
 *     → Press in the watch menu: "Demo: High Heart Rate (155 bpm)"
 *     → CareInsightsEngine (AnomalyDetection) detects a deviation
 *     → Scenario fires → Push notification → Changes color of Paulmann bulb
 *     
 *  2. SONOFF SNZB-01P (ZigBee)
 *     → Press the button 6 times within one minute
 *     → CareInsightsEngine (SumAboveThreshold) triggers
 *     → Scenario fires → Push notification → Activates alarm on BULP sensor  
 *
 * Start:
 *   node tests/demo-real-devices.js
 * =============================================================================================
 */

"use strict";

const path   = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const Database = require("better-sqlite3");
const { find } = require("async");

const DB_FILENAME = process.env.CONF_databaseFilename || "../healthcore_database.db";
const DB_PATH     = path.resolve(__dirname, DB_FILENAME);
const DEMO_PREFIX = "[Demo] ";

// CareInsights parameters from .env
const ANOMALY_THRESHOLD   = parseFloat(process.env.CONF_careInsightsAnomalyThreshold) || 0.6;
const MIN_HISTORY_ENTRIES = parseInt(process.env.CONF_careInsightsMinHistoryEntries)   || 10;
const HISTORY_SIZE        = parseInt(process.env.CONF_careInsightsHistorySize)          || 200;

// Number of button presses required to exceed the threshold
const SONOFF_PRESS_THRESHOLD = 5;  // Schwelle: mehr als 5 Drücke/Stunde
const SONOFF_PRESSES_NEEDED  = 6;  // 6 Drücke → Summe 6 > 5 → Insight

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

/**
 * Finds the Bangle.js 2 in the DB (first by ProductName, then by bridge).
 * @param {Database} database
 * @returns {Object|null} device row
 */
function findBangleDevice(database) {
  // Search using the converter product name pattern
  const device = database.prepare(
    "SELECT * FROM devices WHERE bridge = 'bluetooth' AND productName LIKE 'Bangle.js%' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

/**
 * Finds the SONOFF SNZB-01P in the DB.
 * @param {Database} database
 * @returns {Object|null} device row
 */
function findSonoffDevice(database) {
  const device = database.prepare(
    "SELECT * FROM devices WHERE bridge = 'zigbee' AND productName = 'SNZB-01P' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

/**
 * Finds the Paulmann Smart Home device in the DB.
 * @param {Database} database
 * @returns {Object|null} device row
 */
function findPaulmannDevice(database) {
  const device = database.prepare(
    "SELECT * FROM devices WHERE bridge = 'zigbee' AND productName LIKE 'RGB%' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

/**
 * Finds the BULP in the DB.
 * @param {Database} database
 * @returns {Object|null} device row
 */
function findBulpDevice(database) {
  const device = database.prepare(
    "SELECT * FROM devices WHERE bridge = 'bluetooth' AND productName LIKE 'bulp%' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

/**
 * Deletes all demo-specific configuration data.
 * Real measurement history is NOT deleted — only SONOFF button presses
 * from the last 2 hours are cleared (for a clean threshold demo).
 */
function resetDemo(database, bangleDeviceID, sonoffDeviceID, paulmannDeviceID, bulpDeviceID) {
  logSection("RESET: Vorherige Demo-Daten löschen");

  // 1. Delete demo notifications via scenario IDs (before deleting the scenarios!)
  const demoScenarios = database.prepare(
    "SELECT scenarioID FROM scenarios WHERE name LIKE ?"
  ).all(DEMO_PREFIX + "%");

  if (demoScenarios.length > 0) {
    const ids          = demoScenarios.map((s) => s.scenarioID);
    const placeholders = ids.map(() => "?").join(", ");
    const deletedN = database.prepare(
      "DELETE FROM notifications WHERE scenarioID IN (" + placeholders + ")"
    ).run(...ids);
    log("Demo-Notifications gelöscht: " + deletedN.changes, "✓");
  }
  else {
    log("Demo-Notifications gelöscht: 0", "✓");
  }

  // 2. Delete demo scenarios
  demoScenarios.forEach((s) => {
    database.prepare("DELETE FROM scenarios_triggers   WHERE scenarioID = ?").run(s.scenarioID);
    database.prepare("DELETE FROM scenarios_actions    WHERE scenarioID = ?").run(s.scenarioID);
    database.prepare("DELETE FROM scenarios_executions WHERE scenarioID = ?").run(s.scenarioID);
    database.prepare("DELETE FROM scenarios            WHERE scenarioID = ?").run(s.scenarioID);
  });
  log("Demo-Szenarien gelöscht: " + demoScenarios.length, "✓");

  // 3. Delete demo CareInsight rules
  const deletedRules = database.prepare(
    "DELETE FROM care_insight_rules WHERE title LIKE ?"
  ).run(DEMO_PREFIX + "%");
  log("CareInsight-Regeln gelöscht: " + deletedRules.changes, "✓");

  // 4. Resolve open demo insights
  if (bangleDeviceID || sonoffDeviceID || paulmannDeviceID || bulpDeviceID) {
    const ids = [bangleDeviceID, sonoffDeviceID, paulmannDeviceID, bulpDeviceID].filter(Boolean);
    const placeholders = ids.map(() => "?").join(", ");
    const resolved = database.prepare(
      "UPDATE care_insights SET status = 'resolved', dateTimeResolved = datetime('now', 'localtime') WHERE deviceID IN (" + placeholders + ") AND status IN ('open', 'acknowledged')"
    ).run(...ids);
    log("Offene Demo-Insights aufgelöst: " + resolved.changes, "✓");
  }

  // 5. Delete SONOFF button presses
  if (sonoffDeviceID) {
    const deletedPresses = database.prepare(
      "DELETE FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = 'zigbee' AND property = 'button'"
    ).run(sonoffDeviceID);
    log("SONOFF Button-Presses gelöscht: " + deletedPresses.changes, "✓");
  }

  // 6. Remove synthetic Bangle.js baseline (if left over from a previous demo run)
  if (bangleDeviceID) {
    const deletedBaseline = database.prepare(
      "DELETE FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = 'bluetooth' AND property = 'heartrate'"
    ).run(bangleDeviceID);
    if (deletedBaseline.changes > 0) {
      log("Synthetische Bangle.js-Baseline entfernt: " + deletedBaseline.changes + " Einträge", "✓");
    }
  }
}

/**
 * Checks whether enough real heart rate history is available.
 * If not, synthetic baseline values are seeded.
 * @param {Database} database
 * @param {string} deviceID
 * @returns {number} Number of existing (+ seeded) history entries
 */
function ensureBangleBaseline(database, deviceID) {
  logSection("BANGLE.JS 2: Puls-Baseline prüfen");

  const existingCount = database.prepare(
    "SELECT COUNT(*) AS cnt FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = 'bluetooth' AND property = 'heartrate' ORDER BY dateTimeAsNumeric DESC LIMIT ?"
  ).get(deviceID, HISTORY_SIZE).cnt;

  log("Vorhandene Puls-Einträge in History: " + existingCount, "📊");

  if (existingCount >= MIN_HISTORY_ENTRIES) {
    log("Genug History vorhanden — keine synthetische Baseline nötig.", "✓");
    return existingCount;
  }

  const missing = MIN_HISTORY_ENTRIES + 2 - existingCount; // 2 buffer entries
  log("Zu wenig History (" + existingCount + "/" + MIN_HISTORY_ENTRIES + ") — säe " + missing + " synthetische Normalwerte ...", "⟳");

  const baselineValues = [70, 72, 71, 69, 73, 70, 71, 72, 68, 74, 70, 71, 69, 72];  // Synthetic normal values: 68–74 bpm, spread over the last 90 minutes

  const now            = Date.now();

  baselineValues.slice(0, missing).forEach((bpm, index) => {
    const timestamp = now - (90 - index * (80 / missing)) * 60 * 1000;
    database.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(deviceID, "bluetooth", "heartrate", String(bpm), bpm, timestamp);
  });

  log("Synthetische Baseline gesät: " + missing + " Einträge (68–74 bpm)", "✓");
  return existingCount + missing;
}

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
 * @param {Database} database - DB connection
 * @param {Object} bangle  - { deviceID, bridge } — required for the scenario trigger
 * @param {Object} sonoff  - { deviceID, bridge } — required for threshold query and scenario trigger
 * @param {Object} paulmann  - { deviceID, bridge } — required for scenario trigger
 * @param {Object} bulp  - { deviceID, bridge } — required for scenario trigger
 */
function setupDemo(database, bangle, sonoff, paulmann, bulp) {
  logSection("SETUP: CareInsight-Regeln & Szenarien anlegen");

  const oneHourAgo  = Date.now() - 60 * 60 * 1000;
  const sonoffCurrent = database.prepare(
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
  const bangleRule = database.prepare(
    "INSERT INTO care_insight_rules (title, enabled, sourceProperty, aggregationType, thresholdMin, minReadings, recommendation) VALUES (?, 1, ?, ?, ?, ?, ?)"
  ).run(
    DEMO_PREFIX + "Ungewöhnlicher Puls",
    "heartrate",
    "AnomalyDetection",
    ANOMALY_THRESHOLD,
    MIN_HISTORY_ENTRIES,
    "Ruhepuls messen und ggf. medizinisches Fachpersonal informieren."
  );
  const bangleRuleID = bangleRule.lastInsertRowid;
  log("CareInsight-Regel: Puls-Anomalie (ID " + bangleRuleID + ", Schwelle: " + ANOMALY_THRESHOLD + ")", "✓");

  // Rule 2: Frequent pressing (fires for any device that sends "button")
  const sonoffRule = database.prepare(
    "INSERT INTO care_insight_rules (title, enabled, sourceProperty, aggregationType, aggregationWindowHours, thresholdMax, minReadings, recommendation) VALUES (?, 1, ?, ?, ?, ?, ?, ?)"
  ).run(
    DEMO_PREFIX + "Häufiger Hilferuf",
    "button",
    "SumAboveThreshold",
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
  const bangleScenario = database.prepare(
    "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 8, ?)"
  ).run(
    DEMO_PREFIX + "Hoher Puls → Push-Nachricht",
    "Ungewöhnlicher Puls erkannt",
    "heart"
  );
  const bangleScenarioID = bangleScenario.lastInsertRowid;

  database.prepare(
    "INSERT INTO scenarios_triggers (scenarioID, type, property, deviceID, bridge) VALUES (?, ?, ?, ?, ?)"
  ).run(bangleScenarioID, "care_insight_opened", String(bangleRuleID), bangle.deviceID, bangle.bridge);

  database.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay) VALUES (?, ?, ?, ?, ?)"
  ).run(
    bangleScenarioID,
    "push_notification",
    "Ungewöhnlicher Puls erkannt",
    "Puls-Uhr hat einen Puls gemessen, der deutlich vom Normalwert abweicht.",
    0
  );

  database.prepare(
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

  log("Szenario: Hoher Puls → Push-Nachricht → Lichtänderung (ID " + bangleScenarioID + ")", "✓");

  // Scenario 2: SONOFF frequent pressing → Push notification
  const sonoffScenario = database.prepare(
    "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 9, ?)"
  ).run(
    DEMO_PREFIX + "Häufiges Drücken → Push-Nachricht",
    "Hilfe-Taster wird ungewöhnlich oft gedrückt",
    "hand-left"
  );
  const sonoffScenarioID = sonoffScenario.lastInsertRowid;

  database.prepare(
    "INSERT INTO scenarios_triggers (scenarioID, type, property, deviceID, bridge) VALUES (?, ?, ?, ?, ?)"
  ).run(sonoffScenarioID, "care_insight_opened", String(sonoffRuleID), sonoff.deviceID, sonoff.bridge);

  database.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay) VALUES (?, ?, ?, ?, ?)"
  ).run(
    sonoffScenarioID,
    "push_notification",
    "Patient drückt wiederholt den Hilfe-Taster",
    "Der Hilfe-Taster wurde innerhalb einer Stunde häufiger als üblich gedrückt.",
    0
  );

  database.prepare(
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
  console.log("  └──────────────────────────────────────────────────────┘");
  console.log("");
}

function padRight(str, length) {
  str = String(str);
  return str.length >= length ? str.slice(0, length) : str + " ".repeat(length - str.length);
}

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║    HEALTHCORE DEMO — Echte Geräte                       ║");
  console.log("║    " + new Date().toLocaleString("de-DE") + "                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  let database;
  try {
    database = new Database(DB_PATH);
    log("Datenbank geöffnet: " + DB_PATH, "✓");
  }
  catch (error) {
    log("Datenbank konnte nicht geöffnet werden: " + error.message, "✗");
    log("Stelle sicher, dass Healthcore gestartet wurde, damit die DB existiert.", "  ");
    process.exit(1);
  }

  logSection("GERÄTE SUCHEN");

  const bangle    = findBangleDevice(database);
  const sonoff    = findSonoffDevice(database);
  const paulmann  = findPaulmannDevice(database);
  const bulp      = findBulpDevice(database);

  let hasError = false;

  if (bangle) {
    log("Bangle.js 2 gefunden:    " + bangle.deviceID + " (" + (bangle.name || bangle.productName) + ")", "✓");
  }
  else {
    log("Bangle.js 2 nicht gefunden!", "✗");
    hasError = true;
  }

  if (sonoff) {
    log("SONOFF SNZB-01P gefunden: " + sonoff.deviceID + " (" + (sonoff.name || sonoff.productName) + ")", "✓");
  }
  else {
    log("SONOFF SNZB-01P nicht gefunden!", "✗");
    hasError = true;
  }

  if (paulmann) {
    log("Paulmann Smart Home gefunden: " + paulmann.deviceID + " (" + (paulmann.name || paulmann.productName) + ")", "✓");
  }
  else {
    log("Paulmann Smart Home nicht gefunden!", "✗");
    hasError = true;
  }

  if (bulp) {
    log("BULP gefunden:           " + bulp.deviceID + " (" + (bulp.name || bulp.productName) + ")", "✓");
  }
  else {
    log("BULP nicht gefunden!", "✗");
    hasError = true;
  }

  if (hasError) {
    log("", "");
    log("Demo kann nicht gestartet werden — bitte zuerst fehlende Geräte verbinden.", "⚠️");
    database.close();
    process.exit(1);
  }

  resetDemo(database, bangle.deviceID, sonoff.deviceID, paulmann.deviceID, bulp.deviceID);
  await sleep(1000);

  ensureBangleBaseline(database, bangle.deviceID);

  const { sonoffThreshold } = setupDemo(database, bangle, sonoff, paulmann, bulp);

  printInstructions(bangle, sonoff, sonoffThreshold);

  database.close();
}

main().catch((error) => {
  console.error("\n✗ Unbehandelter Fehler:", error.message);
  process.exit(1);
});
