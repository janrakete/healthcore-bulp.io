/**
 * =============================================================================================
 * Healthcore Demo Script — Echte Geräte
 * ======================================
 * Simuliert zwei Szenarien mit physischen Geräten:
 *
 *  1. Bangle.js 2 (Bluetooth)
 *     → Drücke im Watch-Menü: "Demo: Hoher Puls (155 bpm)"
 *     → CareInsightsEngine (anomaly_detection) erkennt Abweichung
 *     → Szenario feuert → Notification in der App
 *
 *  2. SONOFF SNZB-01P (ZigBee)
 *     → Drücke den Taster 6 Mal innerhalb einer Minute
 *     → CareInsightsEngine (sum_above_threshold) schlägt an
 *     → Szenario feuert → Push-Notification
 *
 * Voraussetzung:
 *   - Healthcore läuft (broker/app.js + server/app.js)
 *   - Bangle.js 2 ist über den Bluetooth-Bridge mit Healthcore verbunden
 *   - SONOFF SNZB-01P ist über den ZigBee-Bridge mit Healthcore verbunden
 *   - Neue bulp.app.js auf die Bangle.js 2 laden (enthält "Demo: Hoher Puls"-Menü)
 *
 * Starten:
 *   node tests/demo-real-devices.js
 *
 * Nur reset/aufräumen:
 *   node tests/demo-real-devices.js --reset-only
 * =============================================================================================
 */

"use strict";

const path   = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const Database = require("better-sqlite3");

// ─── Configuration ────────────────────────────────────────────────────────────

const DB_FILENAME = process.env.CONF_databaseFilename || "../healthcore_database.db";
// DB_FILENAME ist relativ zum Projektverzeichnis (z.B. "../healthcore_database.db").
// Da __dirname das tests/-Verzeichnis ist, reicht ein einfaches path.resolve ohne
// zusätzliches ".."-Segment — sonst wird eine Ebene zu weit nach oben navigiert.
const DB_PATH     = path.resolve(__dirname, DB_FILENAME);

const DEMO_PREFIX = "DEMO - ";

// CareInsights-Parameter aus .env
const ANOMALY_THRESHOLD   = parseFloat(process.env.CONF_careInsightsAnomalyThreshold) || 0.6;
const MIN_HISTORY_ENTRIES = parseInt(process.env.CONF_careInsightsMinHistoryEntries)   || 10;
const HISTORY_SIZE        = parseInt(process.env.CONF_careInsightsHistorySize)          || 200;

// Anzahl Button-Drücke, die den Threshold überschreiten sollen
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

// ─── Geräte in der Datenbank finden ──────────────────────────────────────────

/**
 * Sucht das Bangle.js 2 in der DB (zuerst per ProductName, dann per Bridge).
 * @param {Database} db
 * @returns {Object|null} device row
 */
function findBangleDevice(db) {
  // Suche mit Converter-ProductName-Pattern
  const device = db.prepare(
    "SELECT * FROM devices WHERE bridge = 'bluetooth' AND productName LIKE 'Bangle.js%' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

/**
 * Sucht das SONOFF SNZB-01P in der DB.
 * @param {Database} db
 * @returns {Object|null} device row
 */
function findSonoffDevice(db) {
  const device = db.prepare(
    "SELECT * FROM devices WHERE bridge = 'zigbee' AND productName = 'SNZB-01P' ORDER BY dateTimeAdded DESC LIMIT 1"
  ).get();

  return device || null;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Löscht alle Demo-spezifischen Konfigurations-Daten.
 * Echte Messwert-History wird NICHT gelöscht — nur SONOFF-Button-Presses
 * der letzten 2 Stunden werden bereinigt (für einen sauberen Schwellwert-Demo).
 */
function resetDemo(db, bangleDeviceID, sonoffDeviceID) {
  logSection("RESET: Vorherige Demo-Daten löschen");

  // 1. Demo-Notifications via Szenario-IDs löschen (vor der Szenario-Löschung!)
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

  // 2. Demo-Szenarien löschen
  demoScenarios.forEach((s) => {
    db.prepare("DELETE FROM scenarios_triggers   WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios_actions    WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios_executions WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios            WHERE scenarioID = ?").run(s.scenarioID);
  });
  log("Demo-Szenarien gelöscht: " + demoScenarios.length, "✓");

  // 3. Demo-CareInsight-Regeln löschen
  const deletedRules = db.prepare(
    "DELETE FROM care_insight_rules WHERE title LIKE ?"
  ).run(DEMO_PREFIX + "%");
  log("CareInsight-Regeln gelöscht: " + deletedRules.changes, "✓");

  // 4. Offene Demo-Insights auflösen
  if (bangleDeviceID || sonoffDeviceID) {
    const ids = [bangleDeviceID, sonoffDeviceID].filter(Boolean);
    const placeholders = ids.map(() => "?").join(", ");
    const resolved = db.prepare(
      "UPDATE care_insights SET status = 'resolved', dateTimeResolved = datetime('now', 'localtime') WHERE deviceID IN (" + placeholders + ") AND status IN ('open', 'acknowledged')"
    ).run(...ids);
    log("Offene Demo-Insights aufgelöst: " + resolved.changes, "✓");
  }

  // 5. SONOFF Button-Presses der letzten 2 Stunden löschen (für sauberen Threshold-Demo)
  if (sonoffDeviceID) {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const deletedPresses = db.prepare(
      "DELETE FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = 'zigbee' AND property = 'button' AND dateTimeAsNumeric >= ?"
    ).run(sonoffDeviceID, twoHoursAgo);
    log("SONOFF Button-Presses (letzte 2h) gelöscht: " + deletedPresses.changes, "✓");
  }

  // 6. Synthetische Bangle.js-Baseline entfernen (falls vom vorherigen Demo-Lauf)
  //    Erkennbar: Werte zwischen 68 und 74, innerhalb der Demo-Zeitfenster
  //    Wir lassen echte Messwerte unangetastet — Baseline wird ggf. neu gesät.
  if (bangleDeviceID) {
    const baselineStart = Date.now() - 100 * 60 * 1000; // vor max 100 Minuten
    const deletedBaseline = db.prepare(
      "DELETE FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = 'bluetooth' AND property = 'heartrate' AND valueAsNumeric BETWEEN 68 AND 74 AND dateTimeAsNumeric >= ?"
    ).run(bangleDeviceID, baselineStart);
    if (deletedBaseline.changes > 0) {
      log("Synthetische Bangle.js-Baseline entfernt: " + deletedBaseline.changes + " Einträge", "✓");
    }
  }
}

// ─── Bangle.js Baseline prüfen und ggf. säen ─────────────────────────────────

/**
 * Prüft, ob genug echte Puls-History vorhanden ist.
 * Falls nicht, werden synthetische Baseline-Werte gesät.
 * @param {Database} db
 * @param {string} deviceID
 * @returns {number} Anzahl der vorhandenen (+ gesäten) History-Einträge
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

  const missing = MIN_HISTORY_ENTRIES + 2 - existingCount; // 2 Puffer
  log("Zu wenig History (" + existingCount + "/" + MIN_HISTORY_ENTRIES + ") — säe " + missing + " synthetische Normalwerte ...", "⟳");

  // Synthetische Normalwerte: 68–74 bpm, verteilt auf die letzten 90 Minuten
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
 * Legt CareInsight-Regeln und Szenarien für die echten Geräte an.
 *
 * Trennung von Verantwortlichkeiten:
 *   - Eine CareInsight-Regel ist geräteunabhängig: Sie lauscht nur auf eine Property
 *     (z.B. "heartrate") und feuert für jedes Gerät, das diese Property sendet.
 *   - Die Gerätebindung erfolgt ausschließlich im Szenario-Trigger über deviceID und bridge:
 *     Das Szenario reagiert nur, wenn die Regel für das konkrete Zielgerät ausgelöst wurde.
 *
 * Für SONOFF wird der aktuelle Button-Press-Sum abgefragt und die Schwelle
 * dynamisch gesetzt (current_sum + SONOFF_PRESS_THRESHOLD), so dass genau
 * SONOFF_PRESSES_NEEDED weitere Drücke den Insight auslösen.
 *
 * @param {Database} db
 * @param {Object} bangle  - { deviceID, bridge } — wird für den Szenario-Trigger benötigt
 * @param {Object} sonoff  - { deviceID, bridge } — wird für Threshold-Query und Szenario-Trigger benötigt
 */
function setupDemo(db, bangle, sonoff) {
  logSection("SETUP: CareInsight-Regeln & Szenarien anlegen");

  // ── SONOFF: Aktuellen Sum in letzter Stunde abfragen ─────────────────────
  const oneHourAgo  = Date.now() - 60 * 60 * 1000;
  const sonoffCurrent = db.prepare(
    "SELECT COALESCE(SUM(valueAsNumeric), 0) AS total FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? AND property = 'button' AND dateTimeAsNumeric >= ?"
  ).get(sonoff.deviceID, sonoff.bridge, oneHourAgo);

  const currentSum      = Number(sonoffCurrent.total) || 0;
  const sonoffThreshold = currentSum + SONOFF_PRESS_THRESHOLD;  // dynamische Schwelle

  log("SONOFF Button-Sum (letzte 1h): " + currentSum, "📊");
  log("SONOFF Schwelle gesetzt auf:   " + sonoffThreshold + " (aktuell " + currentSum + " + " + SONOFF_PRESS_THRESHOLD + ")", "📊");

  // ── CareInsight-Regeln ─────────────────────────────────────────────────────
  // Regeln sind geräteunabhängig und lauschen nur auf eine Property. Welches
  // Gerät die Regel schlussendlich auslöst, entscheidet erst der Szenario-Trigger.

  // Regel 1: Puls-Anomalie (feuert für jedes Gerät, das "heartrate" sendet)
  const bangleRule = db.prepare(
    "INSERT INTO care_insight_rules (title, enabled, sourceProperty, aggregationType, thresholdMin, minReadings, recommendation) VALUES (?, 1, ?, ?, ?, ?, ?)"
  ).run(
    DEMO_PREFIX + "Puls-Anomalie",
    "heartrate",
    "anomaly_detection",
    ANOMALY_THRESHOLD,
    MIN_HISTORY_ENTRIES,
    "Ruhepuls messen und ggf. medizinisches Fachpersonal informieren."
  );
  const bangleRuleID = bangleRule.lastInsertRowid;
  log("CareInsight-Regel: Puls-Anomalie (ID " + bangleRuleID + ", Schwelle: " + ANOMALY_THRESHOLD + ")", "✓");

  // Regel 2: Häufiges Drücken (feuert für jedes Gerät, das "button" sendet)
  const sonoffRule = db.prepare(
    "INSERT INTO care_insight_rules (title, enabled, sourceProperty, aggregationType, aggregationWindowHours, thresholdMax, minReadings, recommendation) VALUES (?, 1, ?, ?, ?, ?, ?, ?)"
  ).run(
    DEMO_PREFIX + "Häufiger Taserdruck",
    "button",
    "sum_above_threshold",
    1,                // 1-Stunden-Fenster
    sonoffThreshold,  // dynamisch: aktuell + 5
    1,
    "Patientenzimmer aufsuchen und nach dem Befinden fragen."
  );
  const sonoffRuleID = sonoffRule.lastInsertRowid;
  log("CareInsight-Regel: Häufiger Taserdruck (ID " + sonoffRuleID + ", Schwelle: >" + sonoffThreshold + " Drücke/h)", "✓");

  // ── Szenarien ─────────────────────────────────────────────────────────────
  // Die Gerätebindung erfolgt im Szenario-Trigger: deviceID und bridge begrenzen
  // die Auslösung auf das konkrete Zielgerät, obwohl die Regel selbst generisch ist.

  // Szenario 1: Bangle.js Puls-Anomalie → Notification
  const bangleScenario = db.prepare(
    "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 8, ?)"
  ).run(
    DEMO_PREFIX + "Hoher Puls → Notification",
    "Bangle.js 2: Anomaler Puls erkannt",
    "heart"
  );
  const bangleScenarioID = bangleScenario.lastInsertRowid;

  // Trigger: Regel feuert + Gerät muss Bangle.js 2 sein
  db.prepare(
    "INSERT INTO scenarios_triggers (scenarioID, type, property, deviceID, bridge) VALUES (?, ?, ?, ?, ?)"
  ).run(bangleScenarioID, "care_insight_opened", String(bangleRuleID), bangle.deviceID, bangle.bridge);

  db.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay) VALUES (?, ?, ?, ?, ?)"
  ).run(
    bangleScenarioID,
    "notification",
    "⚠️ Ungewöhnlich hoher Puls erkannt!",
    "Bangle.js 2 hat einen Puls gemessen, der deutlich vom Normalwert abweicht.",
    0
  );
  log("Szenario: Hoher Puls → Notification (ID " + bangleScenarioID + ")", "✓");

  // Szenario 2: SONOFF häufiges Drücken → Push-Notification
  const sonoffScenario = db.prepare(
    "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 9, ?)"
  ).run(
    DEMO_PREFIX + "Häufiges Drücken → Push",
    "SONOFF SNZB-01P: Taster wird ungewöhnlich oft gedrückt",
    "hand-left"
  );
  const sonoffScenarioID = sonoffScenario.lastInsertRowid;

  // Trigger: Regel feuert + Gerät muss SONOFF SNZB-01P sein
  db.prepare(
    "INSERT INTO scenarios_triggers (scenarioID, type, property, deviceID, bridge) VALUES (?, ?, ?, ?, ?)"
  ).run(sonoffScenarioID, "care_insight_opened", String(sonoffRuleID), sonoff.deviceID, sonoff.bridge);

  db.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay) VALUES (?, ?, ?, ?, ?)"
  ).run(
    sonoffScenarioID,
    "push_notification",
    "🔔 Patient drückt wiederholt den Notruf-Taster!",
    "Der SONOFF-Taster wurde innerhalb einer Stunde häufiger als üblich gedrückt.",
    0
  );
  log("Szenario: Häufiges Drücken → Push (ID " + sonoffScenarioID + ")", "✓");

  return { bangleRuleID, sonoffRuleID, bangleScenarioID, sonoffScenarioID, sonoffThreshold };
}

// ─── Live-Monitoring ──────────────────────────────────────────────────────────

/**
 * Wartet auf neue Care Insights für die angegebenen Device-IDs und gibt
 * eine Meldung aus, sobald sie in der DB erscheinen.
 * Bricht nach `timeoutSeconds` Sekunden ab.
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

        // Auf zugehörige Notification/Execution warten
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

    // Fortschritts-Punkt ausgeben
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

// ─── Demo-Anleitung ausgeben ──────────────────────────────────────────────────

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

  // ── Datenbank öffnen ──────────────────────────────────────────────────────
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

  // ── Echte Geräte suchen ───────────────────────────────────────────────────
  logSection("GERÄTE SUCHEN");

  const bangle = findBangleDevice(db);
  const sonoff = findSonoffDevice(db);

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

  if (hasError) {
    log("", "");
    log("Demo kann nicht gestartet werden — bitte zuerst fehlende Geräte verbinden.", "⚠️");
    db.close();
    process.exit(1);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  resetDemo(db, bangle.deviceID, sonoff.deviceID);

  if (resetOnly) {
    log("", "");
    log("Reset abgeschlossen (--reset-only). Demo nicht gestartet.", "✓");
    db.close();
    return;
  }

  // ── Bangle.js Baseline sicherstellen ──────────────────────────────────────
  ensureBangleBaseline(db, bangle.deviceID);

  // ── Szenarien & Regeln anlegen ────────────────────────────────────────────
  const { sonoffThreshold } = setupDemo(db, bangle, sonoff);

  // ── Anleitung ausgeben ────────────────────────────────────────────────────
  printInstructions(bangle, sonoff, sonoffThreshold);

  // ── Live-Monitoring ───────────────────────────────────────────────────────
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
