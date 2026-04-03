/**
 * Integration Tests: Care Insights
 * =================================
 */

jest.mock("../config", () => ({
  CONF_tablesAllowedForAPI:         ["individuals", "rooms", "users", "sos", "settings", "push_tokens", "notifications", "device_assignments", "care_insight_rules"],
  CONF_tablesMaxEntriesReturned:    500,
  CONF_apiKey:                      "",
  CONF_apiCallTimeoutMilliseconds:  1000,
  CONF_scenarioCooldownMilliseconds: 5000,
  CONF_scanTimeDefaultSeconds:      30,
  CONF_bridges:                     ["ZigBee", "HTTP", "Bluetooth", "LoRa"],
  CONF_corsURL:                     "",
  CONF_baseURL:                     "http://localhost",
  CONF_careInsightsActive:          true,
  CONF_careInsightsAnomalyThreshold: 0.6,
  CONF_careInsightsHistorySize:     20,
  CONF_careInsightsMaxSignalsPerInsight: 5,
}));

const request = require("supertest");
const { createTestDatabase, setupGlobals, createTestApp, insertTestDevice } = require("./setup");

let app, db, careInsights;

beforeAll(() => {
  db = createTestDatabase();
  setupGlobals(db);

  const ScenarioEngine = require("../server/libs/ScenarioEngine");
  global.scenarios = new ScenarioEngine();

  const CareInsightsEngine = require("../server/libs/CareInsightsEngine");
  careInsights = new CareInsightsEngine();
  app = createTestApp();

  insertTestDevice(db, {
    deviceID: "care_device_001",
    bridge: "http",
    productName: "CareSensor",
    name: "Room Sensor",
  });

  const roomResult = db.prepare("INSERT INTO rooms (name) VALUES (?)").run("Care Room");
  const individualResult = db.prepare("INSERT INTO individuals (firstname, lastname, roomID) VALUES (?, ?, ?)").run("Mia", "Muster", roomResult.lastInsertRowid);

  db.prepare(
    "INSERT INTO device_assignments (deviceID, bridge, individualID, roomID) VALUES (?, ?, ?, ?)"
  ).run("care_device_001", "http", individualResult.lastInsertRowid, roomResult.lastInsertRowid);
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  db.prepare("DELETE FROM care_insight_signals").run();
  db.prepare("DELETE FROM care_insight_rules").run();
  db.prepare("DELETE FROM care_insights").run();
  db.prepare("DELETE FROM notifications").run();
  db.prepare("DELETE FROM mqtt_history_devices_values").run();
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
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("care_device_001", "http", "heartrate", String(value), value, now - index);
  });
}

// ─── Care Insights engine ──────────────────────────────────────────────────

describe("Care Insights engine", () => {
  test("creates anomaly_detection insight and notification", () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, thresholdMin, title) VALUES (?, 1, ?, ?, ?, ?)"
    ).run("Heartrate Anomaly", "heartrate", "anomaly_detection", 0.6, "Unusual reading detected");

    seedValues([250, 71, 72, 70, 69, 71, 70]);

    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: {
        heartrate: {
          value: "250",
          valueAsNumeric: 250,
        }
      }
    });

    const insight = db.prepare("SELECT * FROM care_insights WHERE type = 'anomaly_detection'").get();
    expect(insight).toBeDefined();
    expect(insight.status).toBe("open");
    expect(insight.individualID).toBeGreaterThan(0);
    expect(insight.roomID).toBeGreaterThan(0);

    const signal = db.prepare("SELECT * FROM care_insight_signals WHERE insightID = ?").get(insight.insightID);
    expect(signal).toBeDefined();
    expect(signal.property).toBe("heartrate");

    const notification = db.prepare("SELECT * FROM notifications ORDER BY notificationID DESC LIMIT 1").get();
    expect(notification).toBeDefined();
    expect(notification.text).toBe("Unusual reading detected");
    expect(notification.insightID).toBe(insight.insightID);
  });

  test("detects anomaly when baseline is constant but latest value differs", () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, thresholdMin, title) VALUES (?, 1, ?, ?, ?, ?)"
    ).run("Heartrate Anomaly", "heartrate", "anomaly_detection", 0.6, "Unusual reading detected");

    seedValues([200, 70, 70, 70, 70, 70, 70]);

    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: {
        heartrate: {
          value: "200",
          valueAsNumeric: 200,
        }
      }
    });

    const insight = db.prepare("SELECT * FROM care_insights WHERE type = 'anomaly_detection'").get();
    expect(insight).toBeDefined();
    expect(insight.status).toBe("open");
  });

  test("creates and resolves connectivity insight", () => {
    careInsights.handleDeviceStatus({
      deviceID: "care_device_001",
      bridge: "http",
      status: "offline"
    });

    let insight = db.prepare("SELECT * FROM care_insights WHERE type = 'device_connectivity_risk'").get();
    expect(insight).toBeDefined();
    expect(insight.status).toBe("open");
    expect(insight.individualID).toBeGreaterThan(0);
    expect(insight.roomID).toBeGreaterThan(0);

    careInsights.handleDeviceStatus({
      deviceID: "care_device_001",
      bridge: "http",
      status: "online"
    });

    insight = db.prepare("SELECT * FROM care_insights WHERE type = 'device_connectivity_risk'").get();
    expect(insight.status).toBe("resolved");
  });

  test("auto-resolves anomaly_detection insight when values normalize", () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, thresholdMin, title) VALUES (?, 1, ?, ?, ?, ?)"
    ).run("Heartrate Anomaly", "heartrate", "anomaly_detection", 0.6, "Unusual reading detected");

    seedValues([240, 70, 69, 71, 70, 72, 71]);
    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: { heartrate: { value: "240", valueAsNumeric: 240 } }
    });

    let insight = db.prepare("SELECT * FROM care_insights WHERE type = 'anomaly_detection'").get();
    expect(insight).toBeDefined();
    expect(insight.status).toBe("open");

    db.prepare("DELETE FROM mqtt_history_devices_values").run();
    seedValues([71, 70, 69, 71, 70, 72, 71]);
    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: { heartrate: { value: "71", valueAsNumeric: 71 } }
    });

    insight = db.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insight.insightID);
    expect(insight.status).toBe("resolved");
  });

  test("limits signals per insight to configured maximum", () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, thresholdMin, title) VALUES (?, 1, ?, ?, ?, ?)"
    ).run("Heartrate Anomaly", "heartrate", "anomaly_detection", 0.6, "Unusual reading detected");

    seedValues([240, 70, 69, 71, 70, 72, 71]);

    for (let i = 0; i < 8; i++) {
      careInsights.handleDeviceValues({
        deviceID: "care_device_001",
        bridge: "http",
        values: { heartrate: { value: String(240 + i), valueAsNumeric: 240 + i } }
      });
    }

    const insight = db.prepare("SELECT * FROM care_insights WHERE type = 'anomaly_detection'").get();
    const signals = db.prepare("SELECT * FROM care_insight_signals WHERE insightID = ?").all(insight.insightID);
    expect(signals.length).toBeLessThanOrEqual(5);
  });

  test("creates configured hydration insight from care_insight_rules", () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, aggregationWindowHours, thresholdMin, minReadings, title, recommendation) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)"
    ).run("Hydration Rule", "drink_ml", "sum_below_threshold", 72, 1500, 3, "Hydration risk detected", "Encourage fluid intake and review the recent drinking pattern.");

    const now = Date.now();
    [300, 200, 250].forEach((value, index) => {
      db.prepare(
        "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("care_device_001", "http", "drink_ml", String(value), value, now - index);
    });

    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: {
        drink_ml: {
          value: "300",
          valueAsNumeric: 300,
        }
      }
    });

    const insight = db.prepare("SELECT * FROM care_insights WHERE type = 'sum_below_threshold'").get();
    expect(insight).toBeDefined();
    expect(insight.ruleID).toBeGreaterThan(0);
    expect(insight.individualID).toBeGreaterThan(0);
  });

  test("configured hydration insight can trigger a scenario", async () => {
    const ruleResult = db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, aggregationWindowHours, thresholdMin, minReadings, title) VALUES (?, 1, ?, ?, ?, ?, ?, ?)"
    ).run("Hydration Rule", "drink_ml", "sum_below_threshold", 72, 1500, 3, "Hydration risk detected");

    const individual = db.prepare("SELECT * FROM individuals WHERE firstname = ? LIMIT 1").get("Mia");
    const room = db.prepare("SELECT * FROM rooms WHERE name = ? LIMIT 1").get("Care Room");
    const scenarioID = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon, roomID, individualID) VALUES (?, ?, 1, 5, ?, ?, ?)"
    ).run("Hydration Follow-up", "Scenario for hydration risk", "water", room.roomID, individual.individualID).lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, property) VALUES (?, ?, ?)"
    ).run(scenarioID, "care_insight_opened", String(ruleResult.lastInsertRowid));

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value, delay) VALUES (?, ?, ?, ?)"
    ).run(scenarioID, "notification", "Hydration scenario action", 0);

    const now = Date.now();
    [300, 200, 250].forEach((value, index) => {
      db.prepare(
        "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("care_device_001", "http", "drink_ml", String(value), value, now - index);
    });

    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: {
        drink_ml: {
          value: "300",
          valueAsNumeric: 300,
        }
      }
    });

    await new Promise((r) => setTimeout(r, 100));

    const notifications = db.prepare("SELECT * FROM notifications WHERE text = ?").all("Hydration scenario action");
    expect(notifications.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Care Insights API ─────────────────────────────────────────────────────

describe("Care Insights API", () => {
  test("GET /care-insights returns created insights", async () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, thresholdMin, title) VALUES (?, 1, ?, ?, ?, ?)"
    ).run("Heartrate Anomaly", "heartrate", "anomaly_detection", 0.6, "Unusual reading detected");

    seedValues([240, 70, 69, 71, 70, 72, 71]);
    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: {
        heartrate: {
          value: "240",
          valueAsNumeric: 240,
        }
      }
    });

    const res = await request(app).get("/care-insights");
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

  test("GET /care-insights caps limit at CONF_tablesMaxEntriesReturned", async () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, thresholdMin, title) VALUES (?, 1, ?, ?, ?, ?)"
    ).run("Heartrate Anomaly", "heartrate", "anomaly_detection", 0.6, "Unusual reading detected");

    seedValues([240, 70, 69, 71, 70, 72, 71]);
    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: { heartrate: { value: "240", valueAsNumeric: 240 } }
    });

    const res = await request(app).get("/care-insights?limit=99999");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.results.length).toBe(1);
  });

  test("GET /care-insights applies default limit without query param", async () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, thresholdMin, title) VALUES (?, 1, ?, ?, ?, ?)"
    ).run("Heartrate Anomaly", "heartrate", "anomaly_detection", 0.6, "Unusual reading detected");

    seedValues([240, 70, 69, 71, 70, 72, 71]);
    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: { heartrate: { value: "240", valueAsNumeric: 240 } }
    });

    const res = await request(app).get("/care-insights");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.results.length).toBe(1);
  });

  test("GET /care-insights/:id returns insight with signals", async () => {
    db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, thresholdMin, title) VALUES (?, 1, ?, ?, ?, ?)"
    ).run("Heartrate Anomaly", "heartrate", "anomaly_detection", 0.6, "Unusual reading detected");

    seedValues([230, 70, 71, 69, 70, 72, 70]);
    careInsights.handleDeviceValues({
      deviceID: "care_device_001",
      bridge: "http",
      values: {
        heartrate: {
          value: "230",
          valueAsNumeric: 230,
        }
      }
    });

    const insight = db.prepare("SELECT * FROM care_insights LIMIT 1").get();
    const res = await request(app).get("/care-insights/" + insight.insightID);
    expect(res.status).toBe(200);
    expect(res.body.insight.insightID).toBe(insight.insightID);
    expect(res.body.insight.device).toBeDefined();
    expect(res.body.insight.device.name).toBe("Room Sensor");
    expect(res.body.insight.individual).toBeDefined();
    expect(res.body.insight.individual.firstname).toBe("Mia");
    expect(res.body.insight.room).toBeDefined();
    expect(res.body.insight.room.name).toBe("Care Room");
    expect(Array.isArray(res.body.signals)).toBe(true);
    expect(res.body.signals.length).toBeGreaterThan(0);
  });

  test("PATCH /care-insights/:id updates status", async () => {
    careInsights.handleDeviceStatus({
      deviceID: "care_device_001",
      bridge: "http",
      status: "offline"
    });

    const insight = db.prepare("SELECT * FROM care_insights LIMIT 1").get();
    const res = await request(app)
      .patch("/care-insights/" + insight.insightID)
      .send({ status: "acknowledged" });

    expect(res.status).toBe(200);
    const updated = db.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insight.insightID);
    expect(updated.status).toBe("acknowledged");
  });
});
