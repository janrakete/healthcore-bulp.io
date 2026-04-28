/**
 * Integration Tests: API Authentication & Security
 * ==================================================
 * Tests the auth middleware with different API key configurations.
 */

// Mock config — loaded before any route modules
jest.mock("../config", () => ({
  CONF_tablesAllowedForAPI:        ["individuals", "rooms", "users", "sos", "settings", "push_tokens", "alert_rules"],
  CONF_tablesMaxEntriesReturned:   500,
  CONF_apiKey:                     "test-secret-key-12345",
  CONF_apiCallTimeoutMilliseconds: 3000,
  CONF_scenarioCooldownMilliseconds: 5000,
  CONF_scanTimeDefaultSeconds:     30,
  CONF_bridges:                    ["ZigBee", "HTTP", "Bluetooth", "LoRa"],
  CONF_corsURL:                    "",
  CONF_baseURL:                    "http://localhost",
}));

const request = require("supertest");
const { createTestDatabase, setupGlobals, createTestApp } = require("./setup");

let app, db;

beforeAll(() => {
  db = createTestDatabase();
  setupGlobals(db);
  app = createTestApp();
});

afterAll(() => {
  db.close();
});

describe("API Key Authentication", () => {

  describe("Protected routes require x-api-key header", () => {

    test("GET /data/sos without API key → 401", async () => {
      const res = await request(app).get("/data/sos");
      expect(res.status).toBe(401);
      expect(res.body.status).toBe("error");
      expect(res.body.error).toContain("Authentication required");
    });

    test("POST /data/sos without API key → 401", async () => {
      const res = await request(app)
        .post("/data/sos")
        .send({ name: "Test", number: "12345" });
      expect(res.status).toBe(401);
      expect(res.body.status).toBe("error");
    });

    test("GET /devices/all without API key → 401", async () => {
      const res = await request(app).get("/devices/all");
      expect(res.status).toBe(401);
    });

    test("GET /scenarios/all without API key → 401", async () => {
      const res = await request(app).get("/scenarios/all");
      expect(res.status).toBe(401);
    });
  });

  describe("Wrong API key → 403", () => {

    test("GET /data/sos with wrong key → 403", async () => {
      const res = await request(app)
        .get("/data/sos")
        .set("x-api-key", "wrong-key");
      expect(res.status).toBe(403);
      expect(res.body.status).toBe("error");
      expect(res.body.error).toContain("Invalid API key");
    });

    test("POST /data/sos with wrong key → 403", async () => {
      const res = await request(app)
        .post("/data/sos")
        .set("x-api-key", "another-wrong-key")
        .send({ name: "Test", number: "12345" });
      expect(res.status).toBe(403);
    });

    test("GET /scenarios/all with wrong key → 403", async () => {
      const res = await request(app)
        .get("/scenarios/all")
        .set("x-api-key", "bad");
      expect(res.status).toBe(403);
    });
  });

  describe("Correct API key → passes through to route", () => {

    test("GET /data/sos with correct key → 200", async () => {
      const res = await request(app)
        .get("/data/sos")
        .set("x-api-key", "test-secret-key-12345");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    test("GET /devices/all with correct key → 200", async () => {
      const res = await request(app)
        .get("/devices/all")
        .set("x-api-key", "test-secret-key-12345");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    test("GET /scenarios/all with correct key → 200", async () => {
      const res = await request(app)
        .get("/scenarios/all")
        .set("x-api-key", "test-secret-key-12345");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });
});

describe("Access Control", () => {

  test("Access to disallowed table → 400", async () => {
    const res = await request(app)
      .get("/data/devices")
      .set("x-api-key", "test-secret-key-12345");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowed");
  });

  test("Access to disallowed table mqtt_history → 400", async () => {
    const res = await request(app)
      .get("/data/mqtt_history")
      .set("x-api-key", "test-secret-key-12345");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowed");
  });

  test("Access to disallowed table scenarios → 400", async () => {
    const res = await request(app)
      .get("/data/scenarios")
      .set("x-api-key", "test-secret-key-12345");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowed");
  });

  test("SQL injection in table name → 400", async () => {
    const res = await request(app)
      .get("/data/sos;DROP TABLE sos")
      .set("x-api-key", "test-secret-key-12345");
    expect(res.status).toBe(400);
  });

  test("All allowed tables are accessible", async () => {
    const allowedTables = ["individuals", "rooms", "users", "sos", "settings", "push_tokens", "alert_rules"];
    for (const table of allowedTables) {
      const res = await request(app)
        .get(`/data/${table}`)
        .set("x-api-key", "test-secret-key-12345");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    }
  });
});
