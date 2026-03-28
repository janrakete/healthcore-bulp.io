/**
 * Integration Tests: Data CRUD API
 * ==================================
 * Tests POST, GET, PATCH, DELETE on /data/:table endpoints.
 */

jest.mock("../config", () => ({
  CONF_tablesAllowedForAPI:        ["individuals", "rooms", "users", "sos", "settings", "push_tokens", "notifications", "device_assignments", "care_insight_rules"],
  CONF_tablesMaxEntriesReturned:   500,
  CONF_apiKey:                     "",  // dev mode — no auth required
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

// ─── POST (Insert) ──────────────────────────────────────────────────────────

describe("POST /data/:table (Insert)", () => {

  test("Insert into sos → 200 with ID", async () => {
    const res = await request(app)
      .post("/data/sos")
      .send({ name: "Emergency", number: "112" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.ID).toBeDefined();
    expect(typeof res.body.ID).toBe("number");
  });

  test("Insert into rooms → 200 with ID", async () => {
    const res = await request(app)
      .post("/data/rooms")
      .send({ name: "Living Room" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.ID).toBe("number");
  });

  test("Insert into individuals → 200 with ID", async () => {
    const res = await request(app)
      .post("/data/individuals")
      .send({ firstname: "Jan", lastname: "Tester", roomID: 1 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("Insert into device_assignments → 200 with ID", async () => {
    const res = await request(app)
      .post("/data/device_assignments")
      .send({ deviceID: "device_123", bridge: "http", individualID: 1, roomID: 1 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.ID).toBe("number");
  });

  test("Insert into care_insight_rules → 200 with ID", async () => {
    const res = await request(app)
      .post("/data/care_insight_rules")
      .send({
        name: "Hydration Risk",
        insightType: "hydration_risk",
        sourceDeviceID: "device_123",
        sourceBridge: "http",
        sourceProperty: "drink_ml",
        aggregationType: "sum_below_threshold",
        aggregationWindowHours: 72,
        thresholdMin: 1500,
        minReadings: 3,
        severity: "high"
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.ID).toBe("number");
  });

  test("Insert with unknown column → 400", async () => {
    const res = await request(app)
      .post("/data/sos")
      .send({ name: "Test", number: "123", nonExistentColumn: "bad" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("does not exists in table");
  });

  test("Insert with empty payload → 400", async () => {
    const res = await request(app)
      .post("/data/sos")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Payload is empty");
  });

  test("Insert into disallowed table → 400", async () => {
    const res = await request(app)
      .post("/data/devices")
      .send({ deviceID: "test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowed");
  });
});

// ─── GET (Read) ──────────────────────────────────────────────────────────────

describe("GET /data/:table (Read)", () => {

  beforeAll(async () => {
    // Seed some data
    db.prepare("INSERT INTO sos (name, number) VALUES (?, ?)").run("Fire Dept", "112");
    db.prepare("INSERT INTO sos (name, number) VALUES (?, ?)").run("Police", "110");
    db.prepare("INSERT INTO sos (name, number) VALUES (?, ?)").run("Ambulance", "112");
    db.prepare("INSERT INTO rooms (name) VALUES (?)").run("Bedroom");
    db.prepare("INSERT INTO rooms (name) VALUES (?)").run("Kitchen");
  });

  test("GET all sos entries → returns array", async () => {
    const res = await request(app).get("/data/sos");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeGreaterThanOrEqual(3);
  });

  test("GET with filter condition → returns matching", async () => {
    const res = await request(app).get("/data/sos?number=110");
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(1);
    expect(res.body.results[0].name).toBe("Police");
  });

  test("GET with orderBy → respects sort", async () => {
    const res = await request(app).get("/data/sos?orderBy=name,ASC");
    expect(res.status).toBe(200);
    const names = res.body.results.map((r) => r.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  test("GET with orderBy DESC → respects sort", async () => {
    const res = await request(app).get("/data/sos?orderBy=name,DESC");
    expect(res.status).toBe(200);
    const names = res.body.results.map((r) => r.name);
    const sorted = [...names].sort().reverse();
    expect(names).toEqual(sorted);
  });

  test("GET with limit → limits results", async () => {
    const res = await request(app).get("/data/sos?limit=2");
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBe(2);
  });

  test("GET with invalid orderBy column → 400", async () => {
    const res = await request(app).get("/data/sos?orderBy=nonexistent,ASC");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("does not exists in table");
  });

  test("GET with invalid condition column → 400", async () => {
    const res = await request(app).get("/data/sos?fakeColumn=123");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("does not exists in table");
  });

  test("GET rooms → returns seeded data", async () => {
    const res = await request(app).get("/data/rooms");
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(2);
  });

  test("GET disallowed table → 400", async () => {
    const res = await request(app).get("/data/scenarios");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowed");
  });

  test("GET empty table → returns empty array", async () => {
    const res = await request(app).get("/data/settings");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  test("GET device_assignments → returns array", async () => {
    const res = await request(app).get("/data/device_assignments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });

  test("GET care_insight_rules → returns array", async () => {
    const res = await request(app).get("/data/care_insight_rules");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── PATCH (Update) ────────────────────────────────────────────────────────

describe("PATCH /data/:table (Update)", () => {

  let sosID;

  beforeAll(async () => {
    const result = db.prepare("INSERT INTO sos (name, number) VALUES (?, ?)").run("UpdateMe", "000");
    sosID = result.lastInsertRowid;
  });

  test("Update sos entry → 200", async () => {
    const res = await request(app)
      .patch(`/data/sos?sosID=${sosID}`)
      .send({ name: "Updated Name", number: "999" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");

    // Verify in DB
    const row = db.prepare("SELECT * FROM sos WHERE sosID = ?").get(sosID);
    expect(row.name).toBe("Updated Name");
    expect(row.number).toBe("999");
  });

  test("Update without condition → 400", async () => {
    const res = await request(app)
      .patch("/data/sos")
      .send({ name: "No Condition" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("PATCH needs a condition");
  });

  test("Update with invalid column → 400", async () => {
    const res = await request(app)
      .patch(`/data/sos?sosID=${sosID}`)
      .send({ nonExistent: "bad" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("does not exists in table");
  });

  test("Update non-existing entry → 400 entry not found", async () => {
    const res = await request(app)
      .patch("/data/sos?sosID=99999")
      .send({ name: "Ghost" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Entry not found");
  });

  test("Update with empty body → 400", async () => {
    const res = await request(app)
      .patch(`/data/sos?sosID=${sosID}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Payload is empty");
  });
});

// ─── DELETE ─────────────────────────────────────────────────────────────────

describe("DELETE /data/:table (Delete)", () => {

  let sosID;

  beforeEach(async () => {
    const result = db.prepare("INSERT INTO sos (name, number) VALUES (?, ?)").run("DeleteMe", "000");
    sosID = result.lastInsertRowid;
  });

  test("Delete sos entry → 200", async () => {
    const res = await request(app).delete(`/data/sos?sosID=${sosID}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");

    // Verify removed
    const row = db.prepare("SELECT * FROM sos WHERE sosID = ?").get(sosID);
    expect(row).toBeUndefined();
  });

  test("Delete without condition → 400", async () => {
    const res = await request(app).delete("/data/sos");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("DELETE needs a condition");
  });

  test("Delete non-existing entry → 400 entry not found", async () => {
    const res = await request(app).delete("/data/sos?sosID=99999");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Entry not found");
  });

  test("Delete from disallowed table → 400", async () => {
    const res = await request(app).delete("/data/devices?deviceID=test");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not allowed");
  });

  test("Delete only removes 1 row (LIMIT 1)", async () => {
    db.prepare("INSERT INTO sos (name, number) VALUES (?, ?)").run("DuplicateName", "111");
    db.prepare("INSERT INTO sos (name, number) VALUES (?, ?)").run("DuplicateName", "111");
    const countBefore = db.prepare("SELECT COUNT(*) AS c FROM sos WHERE name = 'DuplicateName'").get().c;

    const res = await request(app).delete("/data/sos?name=DuplicateName");
    expect(res.status).toBe(200);

    const countAfter = db.prepare("SELECT COUNT(*) AS c FROM sos WHERE name = 'DuplicateName'").get().c;
    expect(countAfter).toBe(countBefore - 1);
  });
});

// ─── SQL Injection Protection ───────────────────────────────────────────────

describe("SQL Injection Protection", () => {

  test("Table name with SQL injection → 400", async () => {
    const res = await request(app).get("/data/sos;DROP%20TABLE%20sos");
    expect(res.status).toBe(400);
  });

  test("Semicolon in table name is rejected", async () => {
    const res = await request(app).get("/data/sos;--");
    expect(res.status).toBe(400);
  });

  test("UNION SELECT in table name → 400", async () => {
    const res = await request(app).get("/data/sos%20UNION%20SELECT%20*%20FROM%20users");
    expect(res.status).toBe(400);
  });

  test("Values are parameterized (not injectable)", async () => {
    // Inserting a value with SQL-like content should work fine (it's parameterized)
    const res = await request(app)
      .post("/data/sos")
      .send({ name: "Robert'; DROP TABLE sos;--", number: "123" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");

    // Table should still exist
    const check = await request(app).get("/data/sos");
    expect(check.status).toBe(200);
    expect(check.body.results.length).toBeGreaterThan(0);
  });
});
