const { createTestDatabase, insertTestDevice } = require("./setup");
const migration = require("../server/_migrations/002_heart_rate_property_casing");

describe("heart-rate property casing migration", () => {
  let db;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  test("renames historical property references and device metadata", () => {
    const device = insertTestDevice(db, {
      properties: JSON.stringify([{ name: "heartrate", subproperties: [{ name: "heartrate" }] }])
    });
    db.prepare("INSERT INTO mqtt_devices_values (deviceID, property, value) VALUES (?, ?, ?)")
      .run(device.deviceID, "heartrate", "72");
    db.prepare("INSERT INTO alert_rules (title, sourceProperty) VALUES (?, ?)")
      .run("Heart rate rule", "heartrate");
    db.prepare("INSERT INTO alerts (type, title, summary, property) VALUES (?, ?, ?, ?)")
      .run("AnomalyDetection", "Heart rate alert", "Summary", "heartrate");
    db.prepare("INSERT INTO alert_signals (alertID, deviceID, property, value) VALUES (?, ?, ?, ?)")
      .run(1, device.deviceID, "heartrate", "72");
    db.prepare("INSERT INTO scenarios_triggers (scenarioID, type, property) VALUES (?, ?, ?)")
      .run(1, "device_value", "heartrate");
    db.prepare("INSERT INTO scenarios_actions (scenarioID, type, property, value) VALUES (?, ?, ?, ?)")
      .run(1, "set_device_value", "heartrate", "72");

    migration.up(db);
    migration.up(db);

    expect(db.prepare("SELECT property FROM mqtt_devices_values").get().property).toBe("heartRate");
    expect(db.prepare("SELECT sourceProperty FROM alert_rules").get().sourceProperty).toBe("heartRate");
    expect(db.prepare("SELECT property FROM alerts").get().property).toBe("heartRate");
    expect(db.prepare("SELECT property FROM alert_signals").get().property).toBe("heartRate");
    expect(db.prepare("SELECT property FROM scenarios_triggers").get().property).toBe("heartRate");
    expect(db.prepare("SELECT property FROM scenarios_actions").get().property).toBe("heartRate");
    expect(JSON.parse(db.prepare("SELECT properties FROM devices WHERE deviceID = ?").get(device.deviceID).properties))
      .toEqual([{ name: "heartRate", subproperties: [{ name: "heartRate" }] }]);
  });
});