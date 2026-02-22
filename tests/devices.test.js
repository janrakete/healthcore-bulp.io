/**
 * Integration Tests: Device API
 * ===============================
 * Tests /devices endpoints (GET all, scan, connect, values, etc.)
 */

jest.mock("../config", () => ({
  CONF_tablesAllowedForAPI:        ["individuals", "rooms", "users", "sos", "settings", "push_tokens", "notifications"],
  CONF_tablesMaxEntriesReturned:   500,
  CONF_apiKey:                     "",  // dev mode
  CONF_apiCallTimeoutMilliseconds: 1000,  // short timeout for tests
  CONF_scenarioCooldownMilliseconds: 5000,
  CONF_scanTimeDefaultSeconds:     30,
  CONF_bridges:                    ["ZigBee", "HTTP", "Bluetooth", "LoRa"],
  CONF_corsURL:                    "",
  CONF_baseURL:                    "http://localhost",
}));

const request = require("supertest");
const { createTestDatabase, setupGlobals, createTestApp, insertTestDevice } = require("./setup");

let app, db;

beforeAll(() => {
  db = createTestDatabase();
  setupGlobals(db);

  const ScenarioEngine = require("../server/libs/ScenarioEngine");
  global.scenarios     = new ScenarioEngine();

  app = createTestApp();
});

afterAll(() => {
  db.close();
});

// ─── GET /devices/all ────────────────────────────────────────────────────────

describe("GET /devices/all", () => {

  beforeAll(() => {
    insertTestDevice(db, {
      deviceID:    "dev_bt_001",
      bridge:      "bluetooth",
      productName: "BangleJS2",
      properties:  JSON.stringify([
        { name: "heartrate", dataType: "Numeric", access: "r" },
        { name: "light", dataType: "Boolean", access: "rw" },
      ]),
    });
    insertTestDevice(db, {
      deviceID:    "dev_zb_001",
      bridge:      "zigbee",
      productName: "IKEA TRADFRI",
      properties:  JSON.stringify([{ name: "state", dataType: "Boolean", access: "rw" }]),
    });
  });

  test("returns all registered devices", async () => {
    const res = await request(app).get("/devices/all");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeGreaterThanOrEqual(2);
  });

  test("device properties are parsed from JSON string to object", async () => {
    const res = await request(app).get("/devices/all");
    const btDevice = res.body.results.find((d) => d.deviceID === "dev_bt_001");
    expect(btDevice).toBeDefined();
    expect(Array.isArray(btDevice.properties)).toBe(true);
    expect(btDevice.properties[0].name).toBe("heartrate");
  });

  test("returns correct bridge info per device", async () => {
    const res = await request(app).get("/devices/all");
    const zbDevice = res.body.results.find((d) => d.deviceID === "dev_zb_001");
    expect(zbDevice).toBeDefined();
    expect(zbDevice.bridge).toBe("zigbee");
  });
});

// ─── GET /devices/:bridge/:deviceID ─────────────────────────────────────────

describe("GET /devices/:bridge/:deviceID", () => {

  test("returns single device with parsed properties", async () => {
    const res = await request(app).get("/devices/bluetooth/dev_bt_001");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.device.deviceID).toBe("dev_bt_001");
    expect(Array.isArray(res.body.device.properties)).toBe(true);
  });

  test("non-existent device → 400", async () => {
    const res = await request(app).get("/devices/bluetooth/nonexistent");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });

  test("wrong bridge for existing device → 400", async () => {
    const res = await request(app).get("/devices/zigbee/dev_bt_001");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not found");
  });
});

// ─── POST /devices/:bridge/scan ─────────────────────────────────────────────

describe("POST /devices/:bridge/scan", () => {

  test("initiates scan and returns callID", async () => {
    const res = await request(app)
      .post("/devices/bluetooth/scan")
      .send({ duration: 10 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.data.callID).toBeDefined();
    expect(typeof res.body.data.callID).toBe("string");

    // Verify MQTT publish was called
    expect(global.mqttClient.publish).toHaveBeenCalledWith(
      "bluetooth/devices/scan",
      expect.any(String)
    );
  });

  test("scan uses default duration when not specified", async () => {
    const res = await request(app)
      .post("/devices/zigbee/scan")
      .send({});

    expect(res.status).toBe(200);

    // Check that published message has default duration
    const lastCall = global.mqttClient.publish.mock.calls[global.mqttClient.publish.mock.calls.length - 1];
    const message  = JSON.parse(lastCall[1]);
    expect(message.duration).toBe(30); // CONF_scanTimeDefaultSeconds
  });
});

// ─── GET /devices/:bridge/scan/info ─────────────────────────────────────────

describe("GET /devices/:bridge/scan/info", () => {

  test("returns scan results for callID", async () => {
    const callID = "test_scan_123";

    // Seed mqtt_history with a scan discover message
    db.prepare(
      "INSERT INTO mqtt_history (topic, message, callID) VALUES (?, ?, ?)"
    ).run(
      "server/devices/discover",
      JSON.stringify({ deviceID: "discovered_001", productName: "SomeDevice" }),
      callID
    );

    const res = await request(app).get(`/devices/bluetooth/scan/info?callID=${callID}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("missing callID → 400", async () => {
    const res = await request(app).get("/devices/bluetooth/scan/info");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

// ─── POST /devices/:bridge/:deviceID/connect (MQTT timeout) ────────────────

describe("MQTT pending responses (connect/disconnect)", () => {

  test("POST connect — times out when no MQTT response", async () => {
    const res = await request(app)
      .post("/devices/bluetooth/dev_bt_001/connect")
      .send({});

    // Should timeout after CONF_apiCallTimeoutMilliseconds (1000ms)
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No response from broker");
  }, 5000);

  test("POST disconnect — times out when no MQTT response", async () => {
    const res = await request(app)
      .post("/devices/bluetooth/dev_bt_001/disconnect")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No response from broker");
  }, 5000);
});

// ─── GET /devices/:bridge/:deviceID/values ──────────────────────────────────

describe("GET /devices/:bridge/:deviceID/values", () => {

  test("HTTP/LoRa bridge — returns latest values from DB", async () => {
    // Insert a device value for an HTTP device
    insertTestDevice(db, { deviceID: "dev_http_001", bridge: "http", productName: "BulpWebRobo321" });

    db.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("dev_http_001", "http", "voltage", "3.3", 3.3, Date.now());
    db.prepare(
      "INSERT INTO mqtt_history_devices_values (deviceID, bridge, property, value, valueAsNumeric, dateTimeAsNumeric) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("dev_http_001", "http", "switch", "tapped", 0, Date.now());

    const res = await request(app).get("/devices/http/dev_http_001/values");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.data).toBeDefined();
    // HTTP/LoRa values are returned as { values: { property: { value, valueAsNumeric } } }
    expect(res.body.data.values).toBeDefined();
    expect(res.body.data.values.voltage).toBeDefined();
    expect(res.body.data.values.voltage.value).toBe("3.3");
    expect(res.body.data.values.switch).toBeDefined();
  });

  test("Bluetooth bridge — times out when no MQTT response", async () => {
    const res = await request(app).get("/devices/bluetooth/dev_bt_001/values");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No response from broker");
  }, 5000);
});

// ─── POST /devices/:bridge/:deviceID/values (set) ──────────────────────────

describe("POST /devices/:bridge/:deviceID/values (set)", () => {

  test("publishes set command via MQTT", async () => {
    global.mqttClient.publish.mockClear();

    // This will publish to MQTT and then timeout waiting for response
    const res = await request(app)
      .post("/devices/zigbee/dev_zb_001/values")
      .send({ values: { state: "on" } });

    // It times out since no MQTT response, but the publish should have happened
    expect(global.mqttClient.publish).toHaveBeenCalledWith(
      "zigbee/devices/values/set",
      expect.any(String)
    );
  }, 5000);
});

// ─── DELETE /devices/:bridge/:deviceID ──────────────────────────────────────

describe("DELETE /devices/:bridge/:deviceID", () => {

  test("publishes remove command and waits for MQTT response (timeout)", async () => {
    const res = await request(app).delete("/devices/bluetooth/dev_bt_001");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No response from broker");
  }, 5000);
});
