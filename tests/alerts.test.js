/**
 * Integration Tests: Alerts
 * ==========================
 */

jest.mock("../config", () => ({
  CONF_tablesAllowedForAPI:              ["individuals", "rooms", "users", "sos", "settings", "push_tokens", "alert_rules"],
  CONF_tablesMaxEntriesReturned:         500,
  CONF_apiKey:                           "",
  CONF_apiCallTimeoutMilliseconds:       1000,
  CONF_scenarioCooldownMilliseconds:     5000,
  CONF_scanTimeDefaultSeconds:           30,
  CONF_bridges:                          ["ZigBee", "HTTP", "Bluetooth", "LoRa"],
  CONF_corsURL:                          "",
  CONF_baseURL:                          "http://localhost",
  CONF_alertsActive:                     true,
  CONF_alertsAnomalyThreshold:           0.6,
  CONF_alertsHistorySize:                20,
  CONF_alertsMinHistoryEntries:          10,
  CONF_alertsMaxSignalsPerAlert:         5,
  CONF_alertsLanguage:                   "de",
  CONF_language:                         "de",
}));

const request = require("supertest");
const { createTestDatabase, setupGlobals, createTestApp, insertTestDevice } = require("./setup");

let app, db, alerts;
let careDevice001ID; // numeric PK for care_device_001

beforeAll(() => {
  db = createTestDatabase();
  setupGlobals(db);

  const ScenarioEngine = require("../server/libs/ScenarioEngine");
  global.scenarios = new ScenarioEngine();

  const AlertsEngine = require("../server/libs/AlertsEngine");
  alerts = new AlertsEngine();
  global.alerts = alerts;
  app = createTestApp();

  const roomResult       = db.prepare("INSERT INTO rooms (name) VALUES (?)").run("Care Room");
  const individualResult = db.prepare("INSERT INTO individuals (firstname, lastname, roomID) VALUES (?, ?, ?)").run("Mia", "Muster", roomResult.lastInsertRowid);

  const careDevice = insertTestDevice(db, {
    uuid:         "care_device_001",
    bridge:       "http",
    productName:  "CareSensor",
    name:         "Room Sensor",
    individualID: individualResult.lastInsertRowid,
    roomID:       roomResult.lastInsertRowid,
  });
  careDevice001ID = careDevice.deviceID;
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  db.prepare("DELETE FROM alert_signals").run();
  db.prepare("DELETE FROM alert_rules").run();
  db.prepare("DELETE FROM alerts").run();
  db.prepare("DELETE FROM mqtt_devices_values").run();
  db.prepare("DELETE FROM scenarios").run();
  db.prepare("DELETE FROM scenarios_triggers").run();
  db.prepare("DELETE FROM scenarios_actions").run();
  db.prepare("DELETE FROM scenarios_executions").run();
  global.mqttClient.publish.mockClear();
  global.scenarios.executionCooldowns.clear();
});

// ─── Helper ────────────────────────────────────────────────────────────────

function seedValues(values) {
  const now = Date.now();
  values.forEach((value, index) => {
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "heartrate", String(value), value, now - index);
  });
}

// ─── Alerts engine ────────────────────────────────────────────────────────

describe("Alerts engine", () => {
  test("creates Anomaly Detection alert", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, thresholdMin) VALUES (?, ?, ?, ?)"
    ).run("Unusual reading detected", "heartrate", "AnomalyDetection", 0.6);

    seedValues([250, 71, 72, 70, 69, 71, 70, 70, 71, 69, 72]);

    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: {
        heartrate: {
          value:          "250",
          valueAsNumeric: 250,
        }
      }
    });

    const alert = db.prepare("SELECT * FROM alerts WHERE type = 'AnomalyDetection'").get();
    expect(alert).toBeDefined();
    expect(alert.status).toBe("open");
    expect(alert.individualID).toBeGreaterThan(0);
    expect(alert.roomID).toBeGreaterThan(0);

    const signal = db.prepare("SELECT * FROM alert_signals WHERE alertID = ?").get(alert.alertID);
    expect(signal).toBeDefined();
    expect(signal.property).toBe("heartrate");
  });

  test("detects anomaly when baseline is constant but latest value differs", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, thresholdMin) VALUES (?, ?, ?, ?)"
    ).run("Unusual reading detected", "heartrate", "AnomalyDetection", 0.6);

    seedValues([200, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70]);

    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: {
        heartrate: {
          value:          "200",
          valueAsNumeric: 200,
        }
      }
    });

    const alert = db.prepare("SELECT * FROM alerts WHERE type = 'AnomalyDetection'").get();
    expect(alert).toBeDefined();
    expect(alert.status).toBe("open");
  });

  test("creates and resolves connectivity alert", () => {
    alerts.handleDeviceStatus({
      uuid:   "care_device_001",
      bridge: "http",
      status: "offline"
    });

    let alert = db.prepare("SELECT * FROM alerts WHERE type = 'device_connectivity_risk'").get();
    expect(alert).toBeDefined();
    expect(alert.status).toBe("open");
    expect(alert.individualID).toBeGreaterThan(0);
    expect(alert.roomID).toBeGreaterThan(0);

    alerts.handleDeviceStatus({
      uuid:   "care_device_001",
      bridge: "http",
      status: "online"
    });

    alert = db.prepare("SELECT * FROM alerts WHERE type = 'device_connectivity_risk'").get();
    expect(alert.status).toBe("resolved");
  });

  test("auto-resolves Anomaly Detection alert when values normalize", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, thresholdMin) VALUES (?, ?, ?, ?)"
    ).run("Unusual reading detected", "heartrate", "AnomalyDetection", 0.6);

    seedValues([240, 70, 69, 71, 70, 72, 71, 70, 69, 71, 72]);
    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: { heartrate: { value: "240", valueAsNumeric: 240 } }
    });

    let alert = db.prepare("SELECT * FROM alerts WHERE type = 'AnomalyDetection'").get();
    expect(alert).toBeDefined();
    expect(alert.status).toBe("open");

    db.prepare("DELETE FROM mqtt_devices_values").run();
    seedValues([71, 70, 69, 71, 70, 72, 71, 70, 69, 71, 72]);
    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: { heartrate: { value: "71", valueAsNumeric: 71 } }
    });

    alert = db.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alert.alertID);
    expect(alert.status).toBe("resolved");
  });

  test("limits signals per alert to configured maximum", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, thresholdMin) VALUES (?, ?, ?, ?)"
    ).run("Unusual reading detected", "heartrate", "AnomalyDetection", 0.6);

    seedValues([240, 70, 69, 71, 70, 72, 71, 70, 69, 71, 72]);

    for (let i = 0; i < 8; i++) {
      alerts.handleDeviceValues({
        uuid:   "care_device_001",
        bridge: "http",
        values: { heartrate: { value: String(240 + i), valueAsNumeric: 240 + i } }
      });
    }

    const alert   = db.prepare("SELECT * FROM alerts WHERE type = 'AnomalyDetection'").get();
    const signals = db.prepare("SELECT * FROM alert_signals WHERE alertID = ?").all(alert.alertID);
    expect(signals.length).toBeLessThanOrEqual(5);
  });

  test("creates SumBelowThreshold alert from alert_rules", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, aggregationWindowHours, thresholdMin, minReadings, recommendation) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("Hydration risk detected", "drink_ml", "SumBelowThreshold", 72, 1500, 3, "Encourage fluid intake and review the recent drinking pattern.");

    const now = Date.now();
    [300, 200, 250].forEach((value, index) => {
      db.prepare(
        "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
      ).run(careDevice001ID, "drink_ml", String(value), value, now - index);
    });

    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: {
        drink_ml: {
          value:          "300",
          valueAsNumeric: 300,
        }
      }
    });

    const alert = db.prepare("SELECT * FROM alerts WHERE type = 'SumBelowThreshold'").get();
    expect(alert).toBeDefined();
    expect(alert.ruleID).toBeGreaterThan(0);
    expect(alert.individualID).toBeGreaterThan(0);
  });

  test("creates SumAboveThreshold alert when total exceeds maximum", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, aggregationWindowHours, thresholdMax, minReadings) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("Activity too high", "steps", "SumAboveThreshold", 24, 500, 3);

    const now = Date.now();
    [200, 200, 200].forEach((value, index) => {
      db.prepare(
        "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
      ).run(careDevice001ID, "steps", String(value), value, now - index);
    });

    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: {
        steps: {
          value:          "200",
          valueAsNumeric: 200,
        }
      }
    });

    const alert = db.prepare("SELECT * FROM alerts WHERE type = 'SumAboveThreshold'").get();
    expect(alert).toBeDefined();
    expect(alert.score).toBeGreaterThan(0);
  });

  test("creates and resolves a dynamic inactivity alert for boolean sensor values", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, recommendation) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("No room activity", "motion", "NoActivityForDuration", 3, "truthy", "Check on the person in the room.");

    const now = Date.now();
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "motion", "yes", 1, now - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate(now);

    let alert = db.prepare("SELECT * FROM alerts WHERE type = 'NoActivityForDuration'").get();
    expect(alert).toBeDefined();
    expect(alert.status).toBe("open");
    expect(alert.individualID).toBeGreaterThan(0);
    expect(alert.roomID).toBeGreaterThan(0);
    expect(alert.summary).toContain("Seit 5 Minuten");
    expect(alert.explanation).toContain("konfigurierte Inaktivitätsdauer");

    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "motion", "yes", 1, now - (60 * 1000));

    alerts.inactivityRulesEvaluate(now);

    alert = db.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alert.alertID);
    expect(alert.status).toBe("resolved");
  });

  test("uses device group membership from the devices_groups tables", () => {
    const secondDevice = insertTestDevice(db, {
      uuid: "care_device_004",
      bridge: "http",
      name: "Door Sensor",
      individualID: 0,
      roomID: 0
    });
    const group = db.prepare("INSERT INTO devices_groups (name, description) VALUES (?, ?)").run("Care sensors", "Active monitoring group");
    db.prepare("INSERT INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(group.lastInsertRowid, careDevice001ID);
    db.prepare("INSERT INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(group.lastInsertRowid, secondDevice.deviceID);

    const now = Date.now();
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, scopeType, scopeGroupID) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("No group activity from table", "motion", "NoActivityForDuration", 3, "truthy", "device_group", group.lastInsertRowid);

    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "motion", "yes", 1, now - (5 * 60 * 1000));
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(secondDevice.deviceID, "motion", "yes", 1, now - (60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    expect(db.prepare("SELECT * FROM alerts WHERE title = ?").get("No group activity from table")).toBeUndefined();

    alerts.inactivityRulesEvaluate(now + (3 * 60 * 1000));
    const alert = db.prepare("SELECT * FROM alerts WHERE title = ?").get("No group activity from table");
    expect(alert).toBeDefined();
    expect(alert.deviceID).toBeNull();
  });

  test("uses a configured comparison to support numeric sensor values", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, activityValue) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("No elevated heart rate", "heartrate", "NoActivityForDuration", 3, "greater_or_equal", "100");

    const now = Date.now();
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "heartrate", "95", 95, now - (10 * 60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    expect(db.prepare("SELECT * FROM alerts WHERE type = 'NoActivityForDuration'").get()).toBeUndefined();

    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "heartrate", "110", 110, now - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    const alert = db.prepare("SELECT * FROM alerts WHERE type = 'NoActivityForDuration'").get();
    expect(alert).toBeDefined();
    expect(alert.status).toBe("open");
  });

  test("uses the latest activity from an explicit sensor group", () => {
    const secondDevice = insertTestDevice(db, {
      uuid: "care_device_002",
      bridge: "http",
      name: "Hallway Sensor",
      individualID: 0,
      roomID: 0
    });
    const group = db.prepare("INSERT INTO devices_groups (name, description) VALUES (?, ?)").run("Care group", "Active monitoring group");
    db.prepare("INSERT INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(group.lastInsertRowid, careDevice001ID);
    db.prepare("INSERT INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(group.lastInsertRowid, secondDevice.deviceID);
    const now = Date.now();
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, scopeType, scopeGroupID) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("No group activity", "motion", "NoActivityForDuration", 3, "truthy", "device_group", group.lastInsertRowid);
    const insertReading = db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    );
    insertReading.run(careDevice001ID, "motion", "yes", 1, now - (5 * 60 * 1000));
    insertReading.run(secondDevice.deviceID, "motion", "yes", 1, now - (60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    expect(db.prepare("SELECT * FROM alerts WHERE title = ?").get("No group activity")).toBeUndefined();

    alerts.inactivityRulesEvaluate(now + (3 * 60 * 1000));
    const alert = db.prepare("SELECT * FROM alerts WHERE title = ?").get("No group activity");
    expect(alert).toBeDefined();
    expect(alert.deviceID).toBeNull();
  });

  test("preserves optional person and room context for an explicit sensor group", () => {
    const room = db.prepare("SELECT * FROM rooms WHERE name = ?").get("Care Room");
    const individual = db.prepare("SELECT * FROM individuals WHERE firstname = ?").get("Mia");
    const group = db.prepare("INSERT INTO devices_groups (name, description) VALUES (?, ?)").run("Mia group", "Mia scoped sensors");
    db.prepare("INSERT INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(group.lastInsertRowid, careDevice001ID);
    const now = Date.now();
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, scopeType, scopeGroupID, scopeIndividualID, scopeRoomID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("Mia group inactivity", "motion", "NoActivityForDuration", 3, "truthy", "device_group", group.lastInsertRowid, individual.individualID, room.roomID);
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "motion", "yes", 1, now - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    const alert = db.prepare("SELECT * FROM alerts WHERE title = ?").get("Mia group inactivity");
    expect(alert.individualID).toBe(individual.individualID);
    expect(alert.roomID).toBe(room.roomID);
    expect(alert.deviceID).toBeNull();
  });

  test("does not keep a sensor group inactivity alert open outside its time window", () => {
    const group = db.prepare("INSERT INTO devices_groups (name, description) VALUES (?, ?)").run("Night group", "Night queue");
    db.prepare("INSERT INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(group.lastInsertRowid, careDevice001ID);
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const nowTimestamp = now.getTime();
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, activeTimeStart, activeTimeEnd, scopeType, scopeGroupID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("Night group inactivity", "motion", "NoActivityForDuration", 3, "truthy", "00:00", "01:00", "device_group", group.lastInsertRowid);
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "motion", "yes", 1, nowTimestamp - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate(nowTimestamp);
    expect(db.prepare("SELECT * FROM alerts WHERE title = ?").get("Night group inactivity")).toBeUndefined();
  });

  test("does not evaluate an explicit sensor group without configured devices", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, scopeType, scopeGroupID) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("Empty sensor group", "motion", "NoActivityForDuration", 3, "truthy", "device_group", 999999);
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "motion", "yes", 1, Date.now() - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate();
    expect(db.prepare("SELECT * FROM alerts WHERE title = ?").get("Empty sensor group")).toBeUndefined();
  });

  test("uses all matching devices assigned to an individual scope", () => {
    const room = db.prepare("SELECT * FROM rooms WHERE name = ?").get("Care Room");
    const individual = db.prepare("SELECT * FROM individuals WHERE firstname = ?").get("Mia");
    const roomDevice = insertTestDevice(db, {
      uuid: "care_device_003",
      bridge: "http",
      name: "Room Sensor",
      individualID: 0,
      roomID: room.roomID
    });
    // Create a device group for Mia's sensors with context
    const group = db.prepare("INSERT INTO devices_groups (name, description) VALUES (?, ?)").run("Mia's sensors", "Sensors assigned to Mia");
    db.prepare("INSERT INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(group.lastInsertRowid, roomDevice.deviceID);
    
    const now = Date.now();
    // Use new unified model: scopeGroupID with optional individualID/roomID context
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, scopeGroupID, scopeIndividualID, scopeRoomID) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("No activity for Mia", "motion", "NoActivityForDuration", 3, "truthy", group.lastInsertRowid, individual.individualID, room.roomID);
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(roomDevice.deviceID, "motion", "yes", 1, now - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    const alert = db.prepare("SELECT * FROM alerts WHERE title = ?").get("No activity for Mia");
    expect(alert).toBeDefined();
    expect(alert.individualID).toBe(individual.individualID);
    expect(alert.roomID).toBe(room.roomID);
    expect(alert.deviceID).toBeNull();
  });

  test("uses all matching devices in a room scope", () => {
    const room = db.prepare("SELECT * FROM rooms WHERE name = ?").get("Care Room");
    // Create a device group for room sensors with room context
    const group = db.prepare("INSERT INTO devices_groups (name, description) VALUES (?, ?)").run("Care room sensors", "Sensors in the care room");
    db.prepare("INSERT INTO devices_group_members (groupID, deviceID) VALUES (?, ?)").run(group.lastInsertRowid, careDevice001ID);
    
    const now = Date.now();
    // Use new unified model: scopeGroupID with optional roomID context
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, scopeGroupID, scopeRoomID) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("No activity in care room", "motion", "NoActivityForDuration", 3, "truthy", group.lastInsertRowid, room.roomID);
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "motion", "yes", 1, now - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    const alert = db.prepare("SELECT * FROM alerts WHERE title = ?").get("No activity in care room");
    expect(alert).toBeDefined();
    expect(alert.roomID).toBe(room.roomID);
    expect(alert.deviceID).toBeNull();
  });

  test("does not resolve an inactivity alert while a new device value is processed", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator) VALUES (?, ?, ?, ?, ?)"
    ).run("No room activity", "motion", "NoActivityForDuration", 3, "truthy");

    const now = Date.now();
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "motion", "yes", 1, now - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: { motion: { value: "no", valueAsNumeric: 0 } }
    });

    const alert = db.prepare("SELECT * FROM alerts WHERE type = 'NoActivityForDuration'").get();
    expect(alert.status).toBe("open");
  });

  test("resolves an inactivity alert when an updated rule has no matching activity", () => {
    const ruleResult = db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, inactivityDurationMinutes, activityOperator, activityValue) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("No elevated heart rate", "heartrate", "NoActivityForDuration", 3, "greater_or_equal", "100");

    const now = Date.now();
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
    ).run(careDevice001ID, "heartrate", "110", 110, now - (5 * 60 * 1000));

    alerts.inactivityRulesEvaluate(now);
    const alert = db.prepare("SELECT * FROM alerts WHERE ruleID = ?").get(ruleResult.lastInsertRowid);
    expect(alert.status).toBe("open");

    db.prepare("UPDATE alert_rules SET activityValue = ? WHERE ruleID = ?").run("200", ruleResult.lastInsertRowid);
    alerts.inactivityRulesEvaluate(now);

    expect(db.prepare("SELECT status FROM alerts WHERE alertID = ?").get(alert.alertID).status).toBe("resolved");
  });

  test("counts only active values within a configured time window", () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, aggregationWindowHours, activeTimeStart, activeTimeEnd, thresholdMax, minReadings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("Night bathroom activity", "motion", "SumAboveThreshold", 24, "00:00", "00:01", 0, 1);

    const today = new Date();
    const activeInWindow = new Date(today);
    activeInWindow.setHours(0, 0, 0, 0);
    const inactiveInWindow = new Date(activeInWindow);
    inactiveInWindow.setSeconds(30);
    const activeOutsideWindow = new Date(today);
    activeOutsideWindow.setHours(12, 0, 0, 0);

    [
      { value: "yes", numeric: 1, timestamp: activeInWindow.getTime() },
      { value: "no", numeric: 0, timestamp: inactiveInWindow.getTime() },
      { value: "yes", numeric: 1, timestamp: activeOutsideWindow.getTime() }
    ].forEach((entry) => {
      db.prepare(
        "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
      ).run(careDevice001ID, "motion", entry.value, entry.numeric, entry.timestamp);
    });

    alerts.handleDeviceValues({
      uuid: "care_device_001",
      bridge: "http",
      values: { motion: { value: "yes", valueAsNumeric: 1 } }
    });

    const alert = db.prepare("SELECT * FROM alerts WHERE title = ?").get("Night bathroom activity");
    expect(alert).toBeDefined();
    expect(alert.summary).toContain("00:00");
    expect(alert.summary).toContain("1");
    expect(alert.explanation).toContain("1");
  });

  test("scenario 'notification' action creates a ScenarioEvent alert and does NOT fire alert_opened scenario event (loop guard)", async () => {
    // Build a scenario that fires on alert_opened and has a notification action.
    // Without the guard, createScenarioAlert would emit alert_opened, which would
    // re-execute this scenario, creating a recursive execution chain. The dedup
    // in upsertAlert keeps the alert row count at 1, so we cannot rely on that
    // alone — we also check scenarios_executions, which is append-only.
    const room       = db.prepare("SELECT * FROM rooms WHERE name = ? LIMIT 1").get("Care Room");
    const individual = db.prepare("SELECT * FROM individuals WHERE firstname = ? LIMIT 1").get("Mia");

    const scenarioID = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon, roomID, individualID) VALUES (?, ?, 1, 5, ?, ?, ?)"
    ).run("Loop guard test", "Should not create recursive alerts", "alert", room.roomID, individual.individualID).lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, property) VALUES (?, ?, ?)"
    ).run(scenarioID, "alert_opened", "0"); // trigger on any alert_opened

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value, delay) VALUES (?, ?, ?, ?)"
    ).run(scenarioID, "notification", "Loop test alert title", 0);

    // Manually call createScenarioAlert as the ScenarioEngine would
    const scenario = db.prepare("SELECT * FROM scenarios WHERE scenarioID = ?").get(scenarioID);
    const action   = { type: "notification", value: "Direct scenario alert", property: "Test summary" };
    alerts.createScenarioAlert(scenario, action);

    await new Promise((r) => setTimeout(r, 100)); // let any async event handlers settle

    // Exactly one scenario alert with the expected fields
    const allAlerts = db.prepare("SELECT * FROM alerts WHERE source = 'scenario'").all();
    expect(allAlerts.length).toBe(1);
    expect(allAlerts[0].type).toBe("ScenarioEvent");
    expect(allAlerts[0].title).toBe("Direct scenario alert");
    expect(allAlerts[0].summary).toBe("Test summary");
    expect(allAlerts[0].scenarioID).toBe(scenarioID);

    // The guard prevents the scenario from being re-executed by its own alert.
    // scenarios_executions is append-only, so a recursive run would show up here.
    const executions = db.prepare("SELECT * FROM scenarios_executions WHERE scenarioID = ?").all(scenarioID);
    expect(executions.length).toBe(0);

    // No alert_signals should exist — scenario alerts have no measurement signals
    const signals = db.prepare("SELECT * FROM alert_signals WHERE alertID = ?").all(allAlerts[0].alertID);
    expect(signals.length).toBe(0);
  });

  test("rule alert triggers scenario via alert_opened event", async () => {
    const ruleResult = db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, aggregationWindowHours, thresholdMin, minReadings) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("Hydration risk detected", "drink_ml", "SumBelowThreshold", 72, 1500, 3);

    const individual = db.prepare("SELECT * FROM individuals WHERE firstname = ? LIMIT 1").get("Mia");
    const room       = db.prepare("SELECT * FROM rooms WHERE name = ? LIMIT 1").get("Care Room");
    const scenarioID = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon, roomID, individualID) VALUES (?, ?, 1, 5, ?, ?, ?)"
    ).run("Hydration Follow-up", "Scenario for hydration risk", "water", room.roomID, individual.individualID).lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, property) VALUES (?, ?, ?)"
    ).run(scenarioID, "alert_opened", String(ruleResult.lastInsertRowid));

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value, delay) VALUES (?, ?, ?, ?)"
    ).run(scenarioID, "notification", "Hydration scenario action", 0);

    const now = Date.now();
    [300, 200, 250].forEach((value, index) => {
      db.prepare(
        "INSERT INTO mqtt_devices_values (deviceID, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?)"
      ).run(careDevice001ID, "drink_ml", String(value), value, now - index);
    });

    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: {
        drink_ml: {
          value:          "300",
          valueAsNumeric: 300,
        }
      }
    });

    await new Promise((r) => setTimeout(r, 100));

    // The scenario action should have created a ScenarioEvent alert (source='scenario')
    const scenarioAlerts = db.prepare("SELECT * FROM alerts WHERE source = 'scenario' AND title = ?").all("Hydration scenario action");
    expect(scenarioAlerts.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Alerts API ───────────────────────────────────────────────────────────

describe("Alerts API", () => {
  test("GET /alerts returns created alerts", async () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, thresholdMin) VALUES (?, ?, ?, ?)"
    ).run("Unusual reading detected", "heartrate", "AnomalyDetection", 0.6);

    seedValues([240, 70, 69, 71, 70, 72, 71, 70, 69, 71, 72]);
    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: {
        heartrate: {
          value:          "240",
          valueAsNumeric: 240,
        }
      }
    });

    const res = await request(app).get("/alerts");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].device).toBeDefined();
    expect(res.body.results[0].device.name).toBe("Room Sensor");
    expect(res.body.results[0].individual).toBeDefined();
    expect(res.body.results[0].individual.firstname).toBe("Mia");
    expect(res.body.results[0].room).toBeDefined();
    expect(res.body.results[0].room.name).toBe("Care Room");
  });

  test("GET /alerts caps limit at CONF_tablesMaxEntriesReturned", async () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, thresholdMin) VALUES (?, ?, ?, ?)"
    ).run("Unusual reading detected", "heartrate", "AnomalyDetection", 0.6);

    seedValues([240, 70, 69, 71, 70, 72, 71, 70, 69, 71, 72]);
    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: { heartrate: { value: "240", valueAsNumeric: 240 } }
    });

    const res = await request(app).get("/alerts?limit=99999");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.results.length).toBe(1);
  });

  test("GET /alerts applies default limit without query param", async () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, thresholdMin) VALUES (?, ?, ?, ?)"
    ).run("Unusual reading detected", "heartrate", "AnomalyDetection", 0.6);

    seedValues([240, 70, 69, 71, 70, 72, 71, 70, 69, 71, 72]);
    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: { heartrate: { value: "240", valueAsNumeric: 240 } }
    });

    const res = await request(app).get("/alerts");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.results.length).toBe(1);
  });

  test("GET /alerts/:id returns alert with signals", async () => {
    db.prepare(
      "INSERT INTO alert_rules (title, sourceProperty, aggregationType, thresholdMin) VALUES (?, ?, ?, ?)"
    ).run("Unusual reading detected", "heartrate", "AnomalyDetection", 0.6);

    seedValues([230, 70, 71, 69, 70, 72, 70, 71, 69, 70, 72]);
    alerts.handleDeviceValues({
      uuid:   "care_device_001",
      bridge: "http",
      values: {
        heartrate: {
          value:          "230",
          valueAsNumeric: 230,
        }
      }
    });

    const alert = db.prepare("SELECT * FROM alerts LIMIT 1").get();
    const res   = await request(app).get("/alerts/" + alert.alertID);
    expect(res.status).toBe(200);
    expect(res.body.alert.alertID).toBe(alert.alertID);
    expect(res.body.alert.device).toBeDefined();
    expect(res.body.alert.device.name).toBe("Room Sensor");
    expect(res.body.alert.individual).toBeDefined();
    expect(res.body.alert.individual.firstname).toBe("Mia");
    expect(res.body.alert.room).toBeDefined();
    expect(res.body.alert.room.name).toBe("Care Room");
    expect(Array.isArray(res.body.signals)).toBe(true);
    expect(res.body.signals.length).toBeGreaterThan(0);
  });

  test("PATCH /alerts/:id updates status", async () => {
    alerts.handleDeviceStatus({
      uuid:   "care_device_001",
      bridge: "http",
      status: "offline"
    });

    const alert = db.prepare("SELECT * FROM alerts LIMIT 1").get();
    const res   = await request(app)
      .patch("/alerts/" + alert.alertID)
      .send({ status: "acknowledged" });

    expect(res.status).toBe(200);
    const updated = db.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alert.alertID);
    expect(updated.status).toBe("acknowledged");
  });

  test("GET /alerts/stats returns correct counts", async () => {
    // Insert some alerts directly to test the stats endpoint
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    db.prepare(
      "INSERT INTO alerts (ruleID, type, source, status, score, title, summary, dateTimeAdded, dateTimeUpdated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(0, "ScenarioEvent", "scenario", "open",         0, "Open alert",     "Test", now, now);
    db.prepare(
      "INSERT INTO alerts (ruleID, type, source, status, score, title, summary, dateTimeAdded, dateTimeUpdated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(0, "ScenarioEvent", "scenario", "critical",     0, "Critical alert", "Test", now, now);
    db.prepare(
      "INSERT INTO alerts (ruleID, type, source, status, score, title, summary, dateTimeAdded, dateTimeUpdated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(0, "ScenarioEvent", "scenario", "acknowledged", 0, "Ack alert",      "Test", now, now);
    db.prepare(
      "INSERT INTO alerts (ruleID, type, source, status, score, title, summary, dateTimeAdded, dateTimeUpdated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(0, "ScenarioEvent", "scenario", "resolved",     0, "Resolved alert", "Test", now, now);

    const res = await request(app).get("/alerts/stats");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.data.open).toBe(1);
    expect(res.body.data.critical).toBe(1);
    expect(res.body.data.acknowledged).toBe(1);
    expect(res.body.data.resolved).toBe(1);
  });
});
