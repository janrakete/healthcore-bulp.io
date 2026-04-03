/**
 * Integration Tests: Scenarios API & ScenarioEngine
 * ===================================================
 * Tests scenario CRUD routes and the ScenarioEngine evaluation logic.
 */

jest.mock("../config", () => ({
  CONF_tablesAllowedForAPI:          ["individuals", "rooms", "users", "sos", "settings", "push_tokens", "notifications", "device_assignments", "care_insight_rules"],
  CONF_tablesMaxEntriesReturned:     500,
  CONF_apiKey:                       "",  // dev mode
  CONF_apiCallTimeoutMilliseconds:   3000,
  CONF_scenarioCooldownMilliseconds: 500,  // short cooldown for tests
  CONF_scanTimeDefaultSeconds:       30,
  CONF_bridges:                      ["ZigBee", "HTTP", "Bluetooth", "LoRa"],
  CONF_corsURL:                      "",
  CONF_baseURL:                      "http://localhost",
}));

const request = require("supertest");
const { createTestDatabase, setupGlobals, createTestApp, insertTestDevice } = require("./setup");

let app, db;

beforeAll(() => {
  db  = createTestDatabase();
  setupGlobals(db);

  // Set up ScenarioEngine
  const ScenarioEngine = require("../server/libs/ScenarioEngine");
  global.scenarios     = new ScenarioEngine();

  app = createTestApp();
});

afterAll(() => {
  db.close();
});

// ─── Scenario CRUD ──────────────────────────────────────────────────────────

describe("Scenario CRUD", () => {
  let scenarioID;

  beforeAll(() => {
    // Insert devices referenced in scenarios
    insertTestDevice(db, { deviceID: "sensor_001", bridge: "bluetooth", productName: "BangleJS2" });
    insertTestDevice(db, { deviceID: "light_001", bridge: "zigbee", productName: "IKEA TRADFRI" });
  });

  test("POST /scenarios — create scenario → 200 with ID", async () => {
    const res = await request(app)
      .post("/scenarios")
      .send({
        name:             "High Heartrate Alert",
        description:      "Alert when heartrate exceeds 100",
        enabled:          true,
        priority:         1,
        icon:             "heart",
        triggers: [{
          type:      "device_value",
          deviceID:  "sensor_001",
          bridge:    "bluetooth",
          property:  "heartrate",
          operator:  "greater",
          value:     "100",
          valueType: "Numeric",
        }],
        actions: [{
          type:      "set_device_value",
          deviceID:  "light_001",
          bridge:    "zigbee",
          property:  "state",
          value:     "on",
          valueType: "String",
          delay:     0,
        }],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.ID).toBe("number");
    scenarioID = Number(res.body.ID);
  });

  test("GET /scenarios/all — returns created scenario", async () => {
    const res = await request(app).get("/scenarios/all");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);

    const scenario = res.body.results.find((s) => s.scenarioID === scenarioID);
    expect(scenario).toBeDefined();
    expect(scenario.name).toBe("High Heartrate Alert");
    expect(scenario.enabled).toBe(true);
    expect(scenario.triggers.length).toBe(1);
    expect(scenario.actions.length).toBe(1);
    expect(scenario.triggers[0].type).toBe("device_value");
    expect(scenario.triggers[0].operator).toBe("greater");
    expect(scenario.triggers[0].value).toBe("100");
    expect(scenario.actions[0].type).toBe("set_device_value");
  });

  test("GET /scenarios/:id — returns single scenario with triggers & actions", async () => {
    const res = await request(app).get(`/scenarios/${scenarioID}`);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].triggers.length).toBe(1);
    expect(res.body.results[0].actions.length).toBe(1);
    expect(res.body.results[0].actions[0].property).toBe("state");
  });

  test("GET /scenarios/:id — non-existent → 400", async () => {
    const res = await request(app).get("/scenarios/99999");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scenario not found");
  });

  test("PATCH /scenarios/:id — update name and add second action", async () => {
    const res = await request(app)
      .patch(`/scenarios/${scenarioID}`)
      .send({
        name: "Updated Alert",
        actions: [
          { type: "set_device_value", deviceID: "light_001", bridge: "zigbee", property: "state", value: "on", valueType: "String", delay: 0 },
          { type: "set_device_value", deviceID: "light_001", bridge: "zigbee", property: "brightness", value: "254", valueType: "Numeric", delay: 2 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");

    // Verify update
    const check = await request(app).get(`/scenarios/${scenarioID}`);
    expect(check.body.results[0].name).toBe("Updated Alert");
    expect(check.body.results[0].actions.length).toBe(2);
  });

  test("PATCH /scenarios/:id — update non-existent → 400", async () => {
    const res = await request(app)
      .patch("/scenarios/99999")
      .send({ name: "Ghost" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scenario not found");
  });

  test("POST /scenarios — missing required fields → 400", async () => {
    const res = await request(app)
      .post("/scenarios")
      .send({ name: "No Triggers" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing required fields");
  });

  test("POST /scenarios — triggers not an array → 400", async () => {
    const res = await request(app)
      .post("/scenarios")
      .send({ name: "Bad", triggers: "not-array", actions: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("must be arrays");
  });

  test("POST /scenarios/:id/execute — manual execution", async () => {
    const res = await request(app).post(`/scenarios/${scenarioID}/execute`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");

    // Verify MQTT was published (executeAction publishes to bridge/devices/values/set)
    // The actions have a delay, so we wait a short moment for setTimeout to fire
    await new Promise((r) => setTimeout(r, 100));
    expect(global.mqttClient.publish).toHaveBeenCalled();
  });

  test("POST /scenarios/99999/execute — non-existent → 400", async () => {
    const res = await request(app).post("/scenarios/99999/execute");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scenario not found");
  });

  test("DELETE /scenarios/:id → 200", async () => {
    // Create a throwaway scenario
    const create = await request(app)
      .post("/scenarios")
      .send({
        name: "ToDelete", icon: "trash",
        triggers: [{ type: "device_value", deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", operator: "equals", value: "0" }],
        actions:  [{ type: "set_device_value", deviceID: "light_001", bridge: "zigbee", property: "state", value: "off" }],
      });
    const deleteID = Number(create.body.ID);

    const res = await request(app).delete(`/scenarios/${deleteID}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");

    // Verify deleted
    const check = await request(app).get(`/scenarios/${deleteID}`);
    expect(check.status).toBe(400);
    expect(check.body.error).toContain("Scenario not found");

    // Verify triggers and actions also deleted
    const triggers = db.prepare("SELECT * FROM scenarios_triggers WHERE scenarioID = ?").all(deleteID);
    const actions  = db.prepare("SELECT * FROM scenarios_actions WHERE scenarioID = ?").all(deleteID);
    expect(triggers.length).toBe(0);
    expect(actions.length).toBe(0);
  });

  test("DELETE /scenarios/99999 — non-existent → 400", async () => {
    const res = await request(app).delete("/scenarios/99999");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Scenario not found");
  });
});

// ─── ScenarioEngine ────────────────────────────────────────────────────────

describe("ScenarioEngine", () => {
  let scenarioID;

  beforeAll(() => {
    // Create a scenario in DB: heartrate > 50 → turn on light
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 1, ?)"
    ).run("Engine Test", "Heartrate alert", "heart");
    scenarioID = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, deviceID, bridge, property, operator, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(scenarioID, "device_value", "sensor_001", "bluetooth", "heartrate", "greater", "50", "Numeric");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, deviceID, bridge, property, value, valueType, delay) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(scenarioID, "set_device_value", "light_001", "zigbee", "state", "on", "String", 0);
  });

  beforeEach(() => {
    global.mqttClient.publish.mockClear();
    global.scenarios.executionCooldowns.clear();
  });

  test("compareValues — equals (String)", () => {
    expect(global.scenarios.compareValues("on", "equals", "on", "String")).toBe(true);
    expect(global.scenarios.compareValues("on", "equals", "off", "String")).toBe(false);
  });

  test("compareValues — equals (Numeric)", () => {
    expect(global.scenarios.compareValues(100, "equals", "100", "Numeric")).toBe(true);
    expect(global.scenarios.compareValues(99, "equals", "100", "Numeric")).toBe(false);
  });

  test("compareValues — greater (Numeric)", () => {
    expect(global.scenarios.compareValues(101, "greater", "100", "Numeric")).toBe(true);
    expect(global.scenarios.compareValues(100, "greater", "100", "Numeric")).toBe(false);
    expect(global.scenarios.compareValues(99, "greater", "100", "Numeric")).toBe(false);
  });

  test("compareValues — less (Numeric)", () => {
    expect(global.scenarios.compareValues(50, "less", "100", "Numeric")).toBe(true);
    expect(global.scenarios.compareValues(100, "less", "100", "Numeric")).toBe(false);
  });

  test("compareValues — greater on String returns false", () => {
    expect(global.scenarios.compareValues("abc", "greater", "abc", "String")).toBe(false);
  });

  test("compareValues — between (Numeric)", () => {
    expect(global.scenarios.compareValues(75, "between", [50, 100], "Numeric")).toBe(true);
    expect(global.scenarios.compareValues(50, "between", [50, 100], "Numeric")).toBe(true);
    expect(global.scenarios.compareValues(100, "between", [50, 100], "Numeric")).toBe(true);
    expect(global.scenarios.compareValues(49, "between", [50, 100], "Numeric")).toBe(false);
    expect(global.scenarios.compareValues(101, "between", [50, 100], "Numeric")).toBe(false);
  });

  test("compareValues — between with JSON string", () => {
    expect(global.scenarios.compareValues(75, "between", "[50,100]", "Numeric")).toBe(true);
    expect(global.scenarios.compareValues(49, "between", "[50,100]", "Numeric")).toBe(false);
  });

  test("compareValues — between with invalid input returns false", () => {
    expect(global.scenarios.compareValues(75, "between", "not-json", "Numeric")).toBe(false);
    expect(global.scenarios.compareValues(75, "between", "[50]", "Numeric")).toBe(false);
    expect(global.scenarios.compareValues(75, "between", 50, "Numeric")).toBe(false);
  });

  test("compareValues — contains (String)", () => {
    expect(global.scenarios.compareValues("hello world", "contains", "world", "String")).toBe(true);
    expect(global.scenarios.compareValues("hello", "contains", "world", "String")).toBe(false);
  });

  test("compareValues — contains is case-insensitive", () => {
    expect(global.scenarios.compareValues("Hello World", "contains", "hello", "String")).toBe(true);
  });

  test("compareValues — unknown operator returns false", () => {
    expect(global.scenarios.compareValues(1, "unknown", 1, "Numeric")).toBe(false);
  });

  test("convertValue — Numeric", () => {
    expect(global.scenarios.convertValue("42.5", "Numeric")).toBe(42.5);
    expect(global.scenarios.convertValue("0", "Numeric")).toBe(0);
  });

  test("convertValue — Boolean", () => {
    expect(global.scenarios.convertValue("true", "Boolean")).toBe(true);
    expect(global.scenarios.convertValue("1", "Boolean")).toBe(true);
    expect(global.scenarios.convertValue(true, "Boolean")).toBe(true);
    expect(global.scenarios.convertValue("false", "Boolean")).toBe(false);
    expect(global.scenarios.convertValue("0", "Boolean")).toBe(false);
  });

  test("convertValue — String (default)", () => {
    expect(global.scenarios.convertValue(42, "String")).toBe("42");
    expect(global.scenarios.convertValue(42)).toBe("42");
  });

  test("handleEvent — triggers scenario when value > 50", async () => {
    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001",
      bridge:   "bluetooth",
      property: "heartrate",
      value:    "80",
    });

    // Wait for delayed actions (delay=0, but uses setTimeout)
    await new Promise((r) => setTimeout(r, 100));

    expect(global.mqttClient.publish).toHaveBeenCalledWith(
      "zigbee/devices/values/set",
      expect.any(String)
    );

    // Verify the published message content
    const publishedMsg = JSON.parse(global.mqttClient.publish.mock.calls[0][1]);
    expect(publishedMsg.deviceID).toBe("light_001");
    expect(publishedMsg.values.state).toBe("on");
  });

  test("handleEvent — does NOT trigger when value ≤ 50", async () => {
    global.mqttClient.publish.mockClear();
    global.scenarios.executionCooldowns.clear();

    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001",
      bridge:   "bluetooth",
      property: "heartrate",
      value:    "30",
    });

    await new Promise((r) => setTimeout(r, 100));
    // publish may have been called for other things but NOT for zigbee/devices/values/set
    const setCalls = global.mqttClient.publish.mock.calls.filter((c) => c[0] === "zigbee/devices/values/set");
    expect(setCalls.length).toBe(0);
  });

  test("handleEvent — cooldown prevents rapid re-execution", async () => {
    global.mqttClient.publish.mockClear();
    global.scenarios.executionCooldowns.clear();

    // First trigger
    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "80",
    });

    // Second trigger immediately
    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "90",
    });

    await new Promise((r) => setTimeout(r, 100));

    const setCalls = global.mqttClient.publish.mock.calls.filter((c) => c[0] === "zigbee/devices/values/set");
    expect(setCalls.length).toBe(1); // Only first one fires
  });

  test("handleEvent — cooldown expires, allows re-execution", async () => {
    global.mqttClient.publish.mockClear();
    global.scenarios.executionCooldowns.clear();

    // First trigger
    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "80",
    });

    // Wait for cooldown to expire (CONF_scenarioCooldownMilliseconds = 500)
    await new Promise((r) => setTimeout(r, 600));
    global.mqttClient.publish.mockClear();

    // Second trigger after cooldown
    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "90",
    });

    await new Promise((r) => setTimeout(r, 100));

    const setCalls = global.mqttClient.publish.mock.calls.filter((c) => c[0] === "zigbee/devices/values/set");
    expect(setCalls.length).toBe(1);
  });

  test("handleEvent — disabled scenario does NOT trigger", async () => {
    db.prepare("UPDATE scenarios SET enabled = 0 WHERE scenarioID = ?").run(scenarioID);
    global.mqttClient.publish.mockClear();
    global.scenarios.executionCooldowns.clear();

    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "80",
    });

    await new Promise((r) => setTimeout(r, 100));
    const setCalls = global.mqttClient.publish.mock.calls.filter((c) => c[0] === "zigbee/devices/values/set");
    expect(setCalls.length).toBe(0);

    // Re-enable for subsequent tests
    db.prepare("UPDATE scenarios SET enabled = 1 WHERE scenarioID = ?").run(scenarioID);
  });

  test("getCurrentDeviceValue — returns null when no data", async () => {
    const val = await global.scenarios.getCurrentDeviceValue("nonexistent", "http", "temp");
    expect(val).toBeNull();
  });

  test("getCurrentDeviceValue — returns latest value from DB", async () => {
    db.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("sensor_001", "bluetooth", "heartrate", "75", 75, Date.now() - 1000);
    db.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("sensor_001", "bluetooth", "heartrate", "80", 80, Date.now());

    const val = await global.scenarios.getCurrentDeviceValue("sensor_001", "bluetooth", "heartrate");
    expect(val).toBe(80);
  });

  test("Scenario execution logs to scenarios_executions", async () => {
    global.scenarios.executionCooldowns.clear();

    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "80",
    });

    const executions = db.prepare("SELECT * FROM scenarios_executions WHERE scenarioID = ?").all(scenarioID);
    expect(executions.length).toBeGreaterThanOrEqual(1);
    expect(executions[executions.length - 1].triggerDeviceID).toBe("sensor_001");
    expect(executions[executions.length - 1].success).toBe(1);
  });

  test("Scenario execution creates notification via notification action", async () => {
    // Add a notification action to the engine test scenario
    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value, delay) VALUES (?, ?, ?, ?)"
    ).run(scenarioID, "notification", "Engine Test Notification", 0);

    global.scenarios.executionCooldowns.clear();

    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "80",
    });

    await new Promise((r) => setTimeout(r, 100));

    const notifications = db.prepare("SELECT * FROM notifications WHERE text = ?").all("Engine Test Notification");
    expect(notifications.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Multi-Trigger Scenarios ────────────────────────────────────────────────

describe("Multi-Trigger Scenarios", () => {

  let multiScenarioID;

  beforeAll(() => {
    // Scenario: heartrate > 50 AND motion = yes → turn on light
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 2, ?)"
    ).run("Multi Trigger", "Both conditions must be met", "alert");
    multiScenarioID = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, deviceID, bridge, property, operator, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(multiScenarioID, "device_value", "sensor_001", "bluetooth", "heartrate", "greater", "50", "Numeric");

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, deviceID, bridge, property, operator, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(multiScenarioID, "device_value", "sensor_001", "bluetooth", "motion", "equals", "yes", "String");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, deviceID, bridge, property, value, valueType, delay) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(multiScenarioID, "set_device_value", "light_001", "zigbee", "state", "on", "String", 0);
  });

  beforeEach(() => {
    global.mqttClient.publish.mockClear();
    global.scenarios.executionCooldowns.clear();
  });

  test("Multi-trigger: all conditions met → triggers", async () => {
    // Seed existing motion value = "yes" in DB
    db.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("sensor_001", "bluetooth", "motion", "yes", 0, Date.now());

    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "80",
    });

    await new Promise((r) => setTimeout(r, 100));
    const setCalls = global.mqttClient.publish.mock.calls.filter((c) => c[0] === "zigbee/devices/values/set");
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("Multi-trigger: one condition NOT met → multi-trigger scenario does NOT fire", async () => {
    // Disable the single-trigger scenario to avoid interference
    const singleTriggerScenarios = db.prepare("SELECT scenarioID FROM scenarios WHERE name = 'Engine Test'").all();
    for (const s of singleTriggerScenarios) {
      db.prepare("UPDATE scenarios SET enabled = 0 WHERE scenarioID = ?").run(s.scenarioID);
    }

    // Set motion = "no" in DB
    db.prepare("DELETE FROM mqtt_history_devices_values WHERE deviceID = ? AND property = ?").run("sensor_001", "motion");
    db.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("sensor_001", "bluetooth", "motion", "no", 0, Date.now());

    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "80",
    });

    await new Promise((r) => setTimeout(r, 100));
    const setCalls = global.mqttClient.publish.mock.calls.filter((c) => c[0] === "zigbee/devices/values/set");
    expect(setCalls.length).toBe(0);

    // Re-enable for other tests
    for (const s of singleTriggerScenarios) {
      db.prepare("UPDATE scenarios SET enabled = 1 WHERE scenarioID = ?").run(s.scenarioID);
    }
  });
});

// ─── Care Insight Trigger Scenarios ────────────────────────────────────────

describe("Care Insight Trigger Scenarios", () => {

  let careScenarioID;
  let careRuleID;

  beforeAll(() => {
    const roomID = db.prepare("INSERT INTO rooms (name) VALUES (?)").run("Hydration Room").lastInsertRowid;
    const individualID = db.prepare("INSERT INTO individuals (firstname, lastname, roomID) VALUES (?, ?, ?)").run("Lea", "Example", roomID).lastInsertRowid;

    careRuleID = db.prepare(
      "INSERT INTO care_insight_rules (name, enabled, sourceProperty, aggregationType, aggregationWindowHours, thresholdMin, minReadings, title) VALUES (?, 1, ?, ?, ?, ?, ?, ?)"
    ).run("Hydration Rule", "drink_ml", "sum_below_threshold", 72, 1500, 3, "Hydration risk detected").lastInsertRowid;

    const scenarioResult = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon, roomID, individualID) VALUES (?, ?, 1, 3, ?, ?, ?)"
    ).run("Hydration Alert", "React to hydration insights", "water", roomID, individualID);
    careScenarioID = scenarioResult.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, property) VALUES (?, ?, ?)"
    ).run(careScenarioID, "care_insight_opened", String(careRuleID));

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value, delay) VALUES (?, ?, ?, ?)"
    ).run(careScenarioID, "notification", "Hydration scenario triggered", 0);
  });

  beforeEach(() => {
    global.mqttClient.publish.mockClear();
    global.scenarios.executionCooldowns.clear();
  });

  test("care_insight_opened trigger executes matching scenario", async () => {
    await global.scenarios.handleEvent("care_insight_opened", {
      insightID: 1,
      ruleID: careRuleID,
      insightType: "sum_below_threshold",
      score: 0.8,
      deviceID: "glass_001",
      bridge: "http",
      individualID: 1,
      roomID: 1
    });

    await new Promise((r) => setTimeout(r, 100));

    const notifications = db.prepare("SELECT * FROM notifications WHERE text = ?").all("Hydration scenario triggered");
    expect(notifications.length).toBeGreaterThanOrEqual(1);
  });

  test("care_insight_opened trigger respects scenario individual and room context", async () => {
    global.scenarios.executionCooldowns.clear();

    await global.scenarios.handleEvent("care_insight_opened", {
      insightID: 2,
      ruleID: careRuleID,
      insightType: "sum_below_threshold",
      score: 0.8,
      deviceID: "glass_001",
      bridge: "http",
      individualID: 999,
      roomID: 999
    });

    await new Promise((r) => setTimeout(r, 100));

    const notifications = db.prepare("SELECT * FROM notifications WHERE text = ?").all("Hydration scenario triggered");
    expect(notifications.length).toBe(1);
  });

  test("care_insight trigger with device filter only fires for matching device", async () => {
    const deviceScenarioID = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon, roomID, individualID) VALUES (?, ?, 1, 3, ?, ?, ?)"
    ).run("Device-Specific Hydration Alert", "Only glass_001", "water", 0, 0).lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, property, deviceID, bridge) VALUES (?, ?, ?, ?, ?)"
    ).run(deviceScenarioID, "care_insight_opened", String(careRuleID), "glass_001", "http");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value, delay) VALUES (?, ?, ?, ?)"
    ).run(deviceScenarioID, "notification", "Device-specific hydration alert", 0);

    global.scenarios.executionCooldowns.clear();

    // Matching device — should trigger
    await global.scenarios.handleEvent("care_insight_opened", {
      insightID: 10,
      ruleID: careRuleID,
      insightType: "sum_below_threshold",
      score: 0.8,
      deviceID: "glass_001",
      bridge: "http",
      individualID: 0,
      roomID: 0
    });

    await new Promise((r) => setTimeout(r, 100));

    const notificationsMatch = db.prepare("SELECT * FROM notifications WHERE text = ?").all("Device-specific hydration alert");
    expect(notificationsMatch.length).toBe(1);

    global.scenarios.executionCooldowns.clear();

    // Non-matching device — should NOT trigger
    await global.scenarios.handleEvent("care_insight_opened", {
      insightID: 11,
      ruleID: careRuleID,
      insightType: "sum_below_threshold",
      score: 0.8,
      deviceID: "glass_999",
      bridge: "http",
      individualID: 0,
      roomID: 0
    });

    await new Promise((r) => setTimeout(r, 100));

    const notificationsNoMatch = db.prepare("SELECT * FROM notifications WHERE text = ?").all("Device-specific hydration alert");
    expect(notificationsNoMatch.length).toBe(1); // Still only 1 from before
  });
});

// ─── Event-Based Triggers (device_disconnected, device_connected, battery_low) ──

describe("Event-Based Triggers", () => {

  beforeEach(() => {
    global.mqttClient.publish.mockClear();
    global.scenarios.executionCooldowns.clear();
  });

  test("device_disconnected trigger fires on disconnect event", async () => {
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 1, ?)"
    ).run("Disconnect Alert", "Device went offline", "wifi-off");
    const sid = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, deviceID, bridge) VALUES (?, ?, ?, ?)"
    ).run(sid, "device_disconnected", "sensor_001", "bluetooth");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, deviceID, bridge, property, value, valueType, delay) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(sid, "set_device_value", "light_001", "zigbee", "state", "on", "String", 0);

    await global.scenarios.handleEvent("device_disconnected", {
      deviceID: "sensor_001", bridge: "bluetooth",
    });

    await new Promise((r) => setTimeout(r, 100));
    const setCalls = global.mqttClient.publish.mock.calls.filter((c) => c[0] === "zigbee/devices/values/set");
    expect(setCalls.length).toBe(1);

    db.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(sid);
  });

  test("device_connected trigger fires on connect event", async () => {
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 1, ?)"
    ).run("Reconnect Alert", "Device back online", "wifi");
    const sid = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, deviceID, bridge) VALUES (?, ?, ?, ?)"
    ).run(sid, "device_connected", "sensor_001", "bluetooth");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, deviceID, bridge, property, value, valueType, delay) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(sid, "set_device_value", "light_001", "zigbee", "state", "off", "String", 0);

    await global.scenarios.handleEvent("device_connected", {
      deviceID: "sensor_001", bridge: "bluetooth",
    });

    await new Promise((r) => setTimeout(r, 100));
    const setCalls = global.mqttClient.publish.mock.calls
      .filter((c) => c[0] === "zigbee/devices/values/set")
      .map((c) => JSON.parse(c[1]))
      .filter((message) => message.deviceID === "light_001" && message.values && message.values.state === "off");
    expect(setCalls.length).toBe(1);

    db.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(sid);
  });

  test("battery_low trigger fires when battery below threshold", async () => {
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 1, ?)"
    ).run("Low Battery", "Battery critical", "battery");
    const sid = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, deviceID, bridge, value) VALUES (?, ?, ?, ?, ?)"
    ).run(sid, "battery_low", "sensor_001", "bluetooth", "20");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value) VALUES (?, ?, ?)"
    ).run(sid, "notification", "Battery is low!");

    await global.scenarios.handleEvent("battery_low", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "battery", value: "15",
    });

    await new Promise((r) => setTimeout(r, 100));
    const notifications = db.prepare("SELECT * FROM notifications WHERE text = ?").all("Battery is low!");
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    db.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(sid);
  });

  test("battery_low trigger does NOT fire when battery above threshold", async () => {
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 1, ?)"
    ).run("Low Battery No Fire", "Battery ok", "battery");
    const sid = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, deviceID, bridge, value) VALUES (?, ?, ?, ?, ?)"
    ).run(sid, "battery_low", "sensor_001", "bluetooth", "20");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value) VALUES (?, ?, ?)"
    ).run(sid, "notification", "Should not appear");

    await global.scenarios.handleEvent("battery_low", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "battery", value: "50",
    });

    await new Promise((r) => setTimeout(r, 100));
    const notifications = db.prepare("SELECT * FROM notifications WHERE text = ?").all("Should not appear");
    expect(notifications.length).toBe(0);

    db.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(sid);
  });

  test("push_notification action type works", async () => {
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 1, ?)"
    ).run("Push Test", "Push scenario", "bell");
    const sid = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, deviceID, bridge, property, operator, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(sid, "device_value", "sensor_001", "bluetooth", "heartrate", "greater", "50", "Numeric");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, value, property) VALUES (?, ?, ?, ?)"
    ).run(sid, "push_notification", "Alert!", "Heart rate too high");

    // Mock pushEngine
    const mockPushEngine = { sendAll: jest.fn() };
    global.scenarios.pushEngine = mockPushEngine;

    await global.scenarios.handleEvent("device_value", {
      deviceID: "sensor_001", bridge: "bluetooth", property: "heartrate", value: "80",
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(mockPushEngine.sendAll).toHaveBeenCalledWith("Alert!", "Heart rate too high");

    global.scenarios.pushEngine = null;
    db.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(sid);
  });

  test("time trigger fires at matching time", async () => {
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 1, ?)"
    ).run("Morning Alarm", "Turn on light at 08:00", "alarm");
    const sid = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, value) VALUES (?, ?, ?)"
    ).run(sid, "time", "08:00");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, deviceID, bridge, property, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(sid, "set_device_value", "light_001", "zigbee", "state", "on", "String");

    global.scenarios.executionCooldowns.clear();

    await global.scenarios.handleTimeEvent("08:00");
    await new Promise((r) => setTimeout(r, 100));

    const exec = db.prepare("SELECT * FROM scenarios_executions WHERE scenarioID = ? ORDER BY executionID DESC LIMIT 1").get(sid);
    expect(exec).toBeDefined();
    expect(exec.success).toBe(1);

    db.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_executions WHERE scenarioID = ?").run(sid);
  });

  test("time trigger does NOT fire at non-matching time", async () => {
    const result = db.prepare(
      "INSERT INTO scenarios (name, description, enabled, priority, icon) VALUES (?, ?, 1, 1, ?)"
    ).run("Morning Alarm 2", "Turn on light at 08:00", "alarm");
    const sid = result.lastInsertRowid;

    db.prepare(
      "INSERT INTO scenarios_triggers (scenarioID, type, value) VALUES (?, ?, ?)"
    ).run(sid, "time", "08:00");

    db.prepare(
      "INSERT INTO scenarios_actions (scenarioID, type, deviceID, bridge, property, value, valueType) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(sid, "set_device_value", "light_001", "zigbee", "state", "on", "String");

    global.scenarios.executionCooldowns.clear();

    await global.scenarios.handleTimeEvent("09:00");
    await new Promise((r) => setTimeout(r, 100));

    const exec = db.prepare("SELECT * FROM scenarios_executions WHERE scenarioID = ?").get(sid);
    expect(exec).toBeUndefined();

    db.prepare("DELETE FROM scenarios WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_triggers WHERE scenarioID = ?").run(sid);
    db.prepare("DELETE FROM scenarios_actions WHERE scenarioID = ?").run(sid);
  });
});
