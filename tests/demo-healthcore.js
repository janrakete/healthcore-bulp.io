/**
 * =============================================================================================
 * Healthcore Demo Script
 * ======================
 * Simuliert zwei Szenarien für eine Live-Demo:
 *
 *  1. Bangle.js 2 (Bluetooth)
 *     Ungewöhnlich hoher Puls → CareInsightsEngine (anomaly_detection)
 *     → Szenario feuert → Notification in der App
 *
 *  2. SONOFF SNZB-01P (ZigBee)
 *     Ungewöhnlich häufiges Drücken → CareInsightsEngine (sum_above_threshold)
 *     → Szenario feuert → Push-Notification
 *
 * Wiederholbar: Reset löscht alle Demo-spezifischen Daten vor jedem Lauf.
 *
 * Voraussetzung: Healthcore läuft (broker/app.js + server/app.js).
 *
 * Starten:
 *   node tests/demo-healthcore.js
 *
 * Mit Reset-Only (nur aufräumen, nicht simulieren):
 *   node tests/demo-healthcore.js --reset-only
 * =============================================================================================
 */

"use strict";

const path   = require("path");
const dotenv = require("dotenv");

// Load config (same way as the server does)
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const Database = require("better-sqlite3");
const mqtt     = require("mqtt");

// ─── Configuration ────────────────────────────────────────────────────────────

const BROKER_URL  = process.env.CONF_brokerAddress || "mqtt://localhost:9999";
const DB_FILENAME = process.env.CONF_databaseFilename || "../healthcore_database.db";
// The DB path in .env is relative to the project root (where server is started from)
const DB_PATH     = path.resolve(__dirname, "..", DB_FILENAME);

// Demo device identifiers — unique prefix avoids conflicts with real devices
const BANGLE_DEVICE_ID = "demo-bangle-js-2";
const BANGLE_BRIDGE    = "bluetooth";
const SONOFF_DEVICE_ID = "demo-sonoff-snzb01p";
const SONOFF_BRIDGE    = "zigbee";

// All demo resources use this prefix for easy identification and cleanup
const DEMO_PREFIX = "DEMO - ";

// CareInsights thresholds (must match CONF values in .env)
const ANOMALY_THRESHOLD      = parseFloat(process.env.CONF_careInsightsAnomalyThreshold) || 0.6;
const MIN_HISTORY_ENTRIES    = parseInt(process.env.CONF_careInsightsMinHistoryEntries)  || 10;

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

// ─── MQTT ─────────────────────────────────────────────────────────────────────

function connectMQTT(url) {
  return new Promise((resolve, reject) => {
    log("Verbinde mit MQTT-Broker: " + url, "⟳");
    const client = mqtt.connect(url, { clientId: "healthcore-demo-" + Date.now() });

    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error("MQTT-Verbindung timed out. Läuft der Broker (node broker/app.js)?"));
    }, 5000);

    client.on("connect", () => {
      clearTimeout(timeout);
      log("MQTT-Broker verbunden.", "✓");
      resolve(client);
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function mqttPublish(client, topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        reject(err);
      }
      else {
        resolve();
      }
    });
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Löscht alle Demo-spezifischen Daten für einen sauberen Neustart.
 * Demo-Geräte bleiben registriert (werden nur einmal angelegt).
 */
function resetDemo(db) {
  logSection("RESET: Vorherige Demo-Daten löschen");

  // 1. History der Demo-Geräte löschen
  const deletedHistory = db.prepare(
    "DELETE FROM mqtt_history_devices_values WHERE deviceID IN (?, ?)"
  ).run(BANGLE_DEVICE_ID, SONOFF_DEVICE_ID);
  log("Verlaufs-Messwerte gelöscht: " + deletedHistory.changes, "✓");

  // 2. Offene Insights der Demo-Geräte auf resolved setzen (nicht löschen — CareInsights sind Audit-Log)
  const resolvedInsights = db.prepare(
    "UPDATE care_insights SET status = 'resolved', dateTimeResolved = datetime('now', 'localtime') WHERE deviceID IN (?, ?) AND status IN ('open', 'acknowledged')"
  ).run(BANGLE_DEVICE_ID, SONOFF_DEVICE_ID);
  log("Offene Demo-Insights aufgelöst: " + resolvedInsights.changes, "✓");

  // 3. Demo-Notifications via Szenario-IDs löschen (MUSS vor der Szenario-Löschung passieren)
  const demoScenarios = db.prepare(
    "SELECT scenarioID FROM scenarios WHERE name LIKE ?"
  ).all(DEMO_PREFIX + "%");

  if (demoScenarios.length > 0) {
    const ids          = demoScenarios.map((s) => s.scenarioID);
    const placeholders = ids.map(() => "?").join(", ");
    const deletedNotifications = db.prepare(
      "DELETE FROM notifications WHERE scenarioID IN (" + placeholders + ")"
    ).run(...ids);
    log("Demo-Notifications gelöscht: " + deletedNotifications.changes, "✓");
  }
  else {
    log("Demo-Notifications gelöscht: 0", "✓");
  }

  // 4. Demo-Szenarien löschen (Trigger + Actions + Executions zuerst)
  demoScenarios.forEach((s) => {
    db.prepare("DELETE FROM scenarios_triggers   WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios_actions    WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios_executions WHERE scenarioID = ?").run(s.scenarioID);
    db.prepare("DELETE FROM scenarios            WHERE scenarioID = ?").run(s.scenarioID);
  });
  log("Demo-Szenarien gelöscht: " + demoScenarios.length, "✓");

  // 5. Demo-CareInsight-Regeln löschen
  const deletedRules = db.prepare(
    "DELETE FROM care_insight_rules WHERE title LIKE ?"
  ).run(DEMO_PREFIX + "%");
  log("CareInsight-Regeln gelöscht: " + deletedRules.changes, "✓");
}

// ─── Setup ────────────────────────────────────────────────────────────────────

/**
 * Legt Demo-Geräte, CareInsight-Regeln und Szenarien an.
 * @returns {{ bangleRuleID: number, sonoffRuleID: number, bangleScenarioID: number, sonoffScenarioID: number }}
 */
function setupDemo(db) {
  logSection("SETUP: Geräte, Regeln & Szenarien anlegen");

  // ── Demo-Geräte registrieren (nur wenn noch nicht vorhanden) ──────────────

  const bangleProps = JSON.stringify([
    { name: "heartrate", valueType: "Numeric", notify: true, read: true, write: false, anyValue: 0, standard: false }
  ]);

  const existingBangle = db.prepare("SELECT deviceID FROM devices WHERE deviceID = ? AND bridge = ?").get(BANGLE_DEVICE_ID, BANGLE_BRIDGE);
  if (!existingBangle) {
    db.prepare(
      "INSERT INTO devices (deviceID, bridge, powerType, vendorName, productName, properties, name, description, individualID, roomID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(BANGLE_DEVICE_ID, BANGLE_BRIDGE, "BATTERY", "Espruino", "Bangle.js 2", bangleProps, "Demo-Bangle.js 2", "Demo-Gerät: Bangle.js 2 Smartwatch", 0, 0);
    log("Bangle.js 2 registriert: " + BANGLE_DEVICE_ID, "✓");
  }
  else {
    log("Bangle.js 2 bereits registriert: " + BANGLE_DEVICE_ID, "→");
  }

  const sonoffProps = JSON.stringify([
    { name: "button", valueType: "Options", notify: true, read: true, write: false, anyValue: ["pressed", "not_pressed", "long_pressed", "double_pressed"], standard: false }
  ]);

  const existingSonoff = db.prepare("SELECT deviceID FROM devices WHERE deviceID = ? AND bridge = ?").get(SONOFF_DEVICE_ID, SONOFF_BRIDGE);
  if (!existingSonoff) {
    db.prepare(
      "INSERT INTO devices (deviceID, bridge, powerType, vendorName, productName, properties, name, description, individualID, roomID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(SONOFF_DEVICE_ID, SONOFF_BRIDGE, "BATTERY", "SONOFF", "SNZB-01P", sonoffProps, "Demo-SONOFF SNZB-01P", "Demo-Gerät: SONOFF Zigbee-Taster", 0, 0);
    log("SONOFF SNZB-01P registriert: " + SONOFF_DEVICE_ID, "✓");
  }
  else {
    log("SONOFF SNZB-01P bereits registriert: " + SONOFF_DEVICE_ID, "→");
  }

  // ── CareInsight-Regeln anlegen ────────────────────────────────────────────

  // Regel 1: Puls-Anomalie (Bangle.js 2)
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
  log("CareInsight-Regel angelegt: Puls-Anomalie (ID " + bangleRuleID + ")", "✓");

  // Regel 2: Häufiges Button-Drücken (SONOFF SNZB-01P)
  const sonoffRule = db.prepare(
    "INSERT INTO care_insight_rules (title, enabled, sourceProperty, aggregationType, aggregationWindowHours, thresholdMax, minReadings, recommendation) VALUES (?, 1, ?, ?, ?, ?, ?, ?)"
  ).run(
    DEMO_PREFIX + "Häufiger Taserdruck",
    "button",
    "sum_above_threshold",
    1,       // Fenster: 1 Stunde
    5,       // Schwelle: mehr als 5 Drücke pro Stunde = ungewöhnlich
    1,
    "Patientenzimmer aufsuchen und nach dem Befinden fragen."
  );
  const sonoffRuleID = sonoffRule.lastInsertRowid;
  log("CareInsight-Regel angelegt: Häufiger Taserdruck (ID " + sonoffRuleID + ")", "✓");

  // ── Szenarien anlegen ─────────────────────────────────────────────────────

  // Szenario 1: Bangle.js Puls-Anomalie → Notification
  const bangleScenario = db.prepare(
    "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 8, ?)"
  ).run(
    DEMO_PREFIX + "Hoher Puls → Notification",
    "Wird ausgelöst, wenn der Puls des Bangle.js 2 ungewöhnlich hoch ist.",
    "heart"
  );
  const bangleScenarioID = bangleScenario.lastInsertRowid;

  // Trigger: care_insight_opened mit der Puls-Anomalie-Regel
  db.prepare(
    "INSERT INTO scenarios_triggers (scenarioID, type, property) VALUES (?, ?, ?)"
  ).run(bangleScenarioID, "care_insight_opened", String(bangleRuleID));

  // Action: Notification in der App
  db.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay) VALUES (?, ?, ?, ?, ?)"
  ).run(
    bangleScenarioID,
    "notification",
    "⚠️ Ungewöhnlich hoher Puls erkannt!",
    "Bangle.js 2 hat einen Puls gemessen, der deutlich vom Normalwert abweicht.",
    0
  );
  log("Szenario angelegt: Hoher Puls → Notification (ID " + bangleScenarioID + ")", "✓");

  // Szenario 2: SONOFF häufiges Drücken → Push-Notification
  const sonoffScenario = db.prepare(
    "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 9, ?)"
  ).run(
    DEMO_PREFIX + "Häufiges Drücken → Push",
    "Wird ausgelöst, wenn der Taster ungewöhnlich oft gedrückt wird.",
    "hand-left"
  );
  const sonoffScenarioID = sonoffScenario.lastInsertRowid;

  // Trigger: care_insight_opened mit der Drück-Häufigkeits-Regel
  db.prepare(
    "INSERT INTO scenarios_triggers (scenarioID, type, property) VALUES (?, ?, ?)"
  ).run(sonoffScenarioID, "care_insight_opened", String(sonoffRuleID));

  // Action: Push-Notification
  db.prepare(
    "INSERT INTO scenarios_actions (scenarioID, type, value, property, delay) VALUES (?, ?, ?, ?, ?)"
  ).run(
    sonoffScenarioID,
    "push_notification",
    "🔔 Patient drückt wiederholt den Notruf-Taster!",
    "Der SONOFF-Taster wurde innerhalb einer Stunde mehr als 5-mal gedrückt.",
    0
  );
  log("Szenario angelegt: Häufiges Drücken → Push (ID " + sonoffScenarioID + ")", "✓");

  return { bangleRuleID, sonoffRuleID, bangleScenarioID, sonoffScenarioID };
}

// ─── Szenario 1: Bangle.js 2 — Hoher Puls ────────────────────────────────────

/**
 * Sät 12 normale Pulswerte als Baseline in die DB (mit vergangenen Timestamps),
 * dann simuliert einen ungewöhnlich hohen Puls via MQTT → löst CareInsight + Szenario aus.
 */
async function simulateHighHeartrate(db, mqttClient) {
  logSection("SZENARIO 1: Bangle.js 2 — Ungewöhnlich hoher Puls");

  // ── Baseline säen: 12 normale Pulswerte (68–74 bpm) ──────────────────────
  log("Säe " + (MIN_HISTORY_ENTRIES + 2) + " Baseline-Pulswerte (68–74 bpm) in die DB ...", "⟳");

  const baselineValues = [70, 72, 71, 69, 73, 70, 71, 72, 68, 74, 70, 71];
  const now            = Date.now();

  baselineValues.forEach((bpm, index) => {
    // Timestamps: von 90 Minuten bis 5 Minuten vor jetzt, gleichmäßig verteilt
    const timestamp = now - (90 - index * 7) * 60 * 1000;
    db.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(BANGLE_DEVICE_ID, BANGLE_BRIDGE, "heartrate", String(bpm), bpm, timestamp);
  });

  log("Baseline gesät: " + baselineValues.join(" → ") + " bpm", "✓");

  // ── Anomalie auslösen: Puls 155 bpm via MQTT ─────────────────────────────
  log("Sende anomalen Puls via MQTT: 155 bpm ...", "⟳");

  const payload = {
    deviceID: BANGLE_DEVICE_ID,
    bridge:   BANGLE_BRIDGE,
    values: {
      heartrate: {
        value:          155,
        valueAsNumeric: 155
      }
    }
  };

  await mqttPublish(mqttClient, "server/devices/values/get", payload);
  log("MQTT-Nachricht gesendet.", "✓");

  // Warten, damit Broker + Server die Nachricht verarbeiten können
  log("Warte auf Verarbeitung (1.5 Sek.) ...", "⟳");
  await sleep(1500);

  // ── Ergebnis prüfen ────────────────────────────────────────────────────────
  const insight = db.prepare(
    "SELECT * FROM care_insights WHERE deviceID = ? AND bridge = ? AND type = 'anomaly_detection' ORDER BY insightID DESC LIMIT 1"
  ).get(BANGLE_DEVICE_ID, BANGLE_BRIDGE);

  if (insight) {
    log("Care Insight erstellt! (ID " + insight.insightID + ", Score: " + Number(insight.score).toFixed(2) + ")", "✓");
    log("Titel:   " + insight.title, "  ");
    log("Summary: " + insight.summary, "  ");

    const notification = db.prepare(
      "SELECT * FROM notifications ORDER BY notificationID DESC LIMIT 1"
    ).get();

    if (notification) {
      log("Notification erstellt: \"" + notification.text + "\"", "✅");
    }
    else {
      log("Keine Notification gefunden — Szenario hat nicht gefeuert?", "⚠️");
      log("Mögliche Ursache: Cooldown aktiv oder Szenario-Match fehlgeschlagen.", "  ");
    }
  }
  else {
    log("Kein Care Insight erstellt!", "⚠️");
    log("Mögliche Ursache: Zu wenig History, Baseline zu ähnlich, oder Server nicht erreichbar.", "  ");
  }
}

// ─── Szenario 2: SONOFF SNZB-01P — Häufiges Drücken ──────────────────────────

/**
 * Sendet 6 Button-Press-Events via MQTT.
 * Nach dem 6. Druck: Summe (6) > Schwelle (5) → CareInsight + Szenario.
 */
async function simulateFrequentButtonPress(db, mqttClient) {
  logSection("SZENARIO 2: SONOFF SNZB-01P — Häufiges Drücken");

  const PRESS_COUNT = 6; // 6 Drücke → Summe 6 > Schwelle 5
  log("Simuliere " + PRESS_COUNT + " Button-Presses (Schwelle: 5 Drücke/Stunde) ...", "⟳");

  for (let i = 1; i <= PRESS_COUNT; i++) {
    const payload = {
      deviceID: SONOFF_DEVICE_ID,
      bridge:   SONOFF_BRIDGE,
      values: {
        button: {
          value:          "pressed",
          valueAsNumeric: 1
        }
      }
    };

    await mqttPublish(mqttClient, "server/devices/values/get", payload);
    log("Druck " + i + "/" + PRESS_COUNT + " gesendet.", i < PRESS_COUNT ? "  " : "✓");
    await sleep(400); // kurze Pause zwischen den Drücken
  }

  // Warten, damit der letzte Event vollständig verarbeitet wird
  log("Warte auf Verarbeitung (1.5 Sek.) ...", "⟳");
  await sleep(1500);

  // ── Ergebnis prüfen ────────────────────────────────────────────────────────
  const insight = db.prepare(
    "SELECT * FROM care_insights WHERE deviceID = ? AND bridge = ? AND type = 'sum_above_threshold' ORDER BY insightID DESC LIMIT 1"
  ).get(SONOFF_DEVICE_ID, SONOFF_BRIDGE);

  if (insight) {
    log("Care Insight erstellt! (ID " + insight.insightID + ", Score: " + Number(insight.score).toFixed(2) + ")", "✓");
    log("Titel:   " + insight.title, "  ");
    log("Summary: " + insight.summary, "  ");
    log("→ Push-Notification wurde an ScenarioEngine übergeben.", "✅");
    log("  (Ob die Push-Nachricht auf dem Gerät ankommt, hängt von der Firebase-Konfiguration ab.)", "  ");
  }
  else {
    log("Kein Care Insight erstellt!", "⚠️");
    log("Mögliche Ursache: Server verarbeitet Nachrichten noch oder Gerät nicht registriert.", "  ");
  }
}

// ─── Ergebnis-Übersicht ───────────────────────────────────────────────────────

function showSummary(db) {
  logSection("ERGEBNIS-ÜBERSICHT");

  const insights = db.prepare(
    "SELECT * FROM care_insights WHERE deviceID IN (?, ?) ORDER BY insightID DESC LIMIT 10"
  ).all(BANGLE_DEVICE_ID, SONOFF_DEVICE_ID);

  if (insights.length > 0) {
    log("Care Insights (" + insights.length + "):", "📋");
    insights.forEach((i) => {
      log("[" + i.insightID + "] " + i.status.toUpperCase() + " | " + i.type + " | " + i.deviceID + " | Score: " + Number(i.score).toFixed(2), "   ");
      log("     " + i.title, "   ");
    });
  }
  else {
    log("Keine Care Insights gefunden.", "  ");
  }

  const notifications = db.prepare(
    "SELECT * FROM notifications ORDER BY notificationID DESC LIMIT 5"
  ).all();

  if (notifications.length > 0) {
    log("");
    log("Letzte Notifications (" + Math.min(notifications.length, 5) + "):", "🔔");
    notifications.forEach((n) => {
      log("[" + n.notificationID + "] " + n.text, "   ");
      if (n.description) {
        log("     " + n.description, "   ");
      }
    });
  }

  const executions = db.prepare(
    "SELECT se.*, s.name AS scenarioName FROM scenarios_executions se JOIN scenarios s ON se.scenarioID = s.scenarioID WHERE s.name LIKE ? ORDER BY se.executionID DESC LIMIT 5"
  ).all(DEMO_PREFIX + "%");

  if (executions.length > 0) {
    log("");
    log("Demo-Szenario-Ausführungen (" + executions.length + "):", "⚙️");
    executions.forEach((e) => {
      const status = e.success ? "✓" : "✗";
      log(status + " [" + e.executionID + "] " + e.scenarioName + " | " + e.dateTimeExecutedAt, "   ");
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║        HEALTHCORE DEMO — Szenario-Simulation            ║");
  console.log("║        " + new Date().toLocaleString("de-DE") + "                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const resetOnly = process.argv.includes("--reset-only");

  // Datenbank öffnen
  let db;
  try {
    db = new Database(DB_PATH);
    log("Datenbank geöffnet: " + DB_PATH, "✓");
  }
  catch (err) {
    log("Datenbank konnte nicht geöffnet werden: " + err.message, "✗");
    log("Stelle sicher, dass Healthcore gestartet wurde (mindestens einmal), damit die DB existiert.", "  ");
    process.exit(1);
  }

  // Reset
  resetDemo(db);

  if (resetOnly) {
    log("", "");
    log("Reset abgeschlossen (--reset-only). Demo nicht gestartet.", "✓");
    db.close();
    return;
  }

  // Setup
  const { bangleRuleID, sonoffRuleID } = setupDemo(db);

  // MQTT verbinden
  let mqttClient;
  try {
    mqttClient = await connectMQTT(BROKER_URL);
  }
  catch (err) {
    log("MQTT-Verbindung fehlgeschlagen: " + err.message, "✗");
    log("Stelle sicher, dass der Broker läuft: node broker/app.js", "  ");
    db.close();
    process.exit(1);
  }

  // Szenarien simulieren
  await simulateHighHeartrate(db, mqttClient);
  await simulateFrequentButtonPress(db, mqttClient);

  // Übersicht
  showSummary(db);

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Demo abgeschlossen. Ergebnisse sind in der App sichtbar.║");
  console.log("║  Wiederholung: node tests/demo-healthcore.js             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  mqttClient.end();
  db.close();
}

main().catch((err) => {
  console.error("\n✗ Unbehandelter Fehler:", err.message);
  process.exit(1);
});
