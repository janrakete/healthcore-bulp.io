/**
 * Integration Tests: Matter commissioning proxy
 * =============================================
 * Tests POST /devices/matter/commission (server forwards the request via HTTP to the Matter bridge)
 */

jest.mock("../config", () => ({
  CONF_tablesAllowedForAPI:                   [],
  CONF_tablesMaxEntriesReturned:              500,
  CONF_apiKey:                                "secret",
  CONF_apiCallTimeoutMilliseconds:            1000,
  CONF_devicesMatterCommissionTimeoutSeconds: 1,
  CONF_scanTimeDefaultSeconds:                30,
  CONF_bridges:                               ["Matter"],
  CONF_corsURL:                               "",
  CONF_baseURL:                               "http://localhost",
  CONF_portBridgeMatter:                      9992,
}));

const request = require("supertest");
const { createTestDatabase, setupGlobals, createTestApp } = require("./setup");

let app, db, originalFetch;

beforeAll(() => {
  db = createTestDatabase();
  setupGlobals(db);
  app = createTestApp();
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

afterAll(() => {
  db.close();
});

function bridgeAnswer(status, body) {
  return jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}

describe("POST /devices/matter/commission", () => {
  test("requires the API key of the server", async () => {
    global.fetch = jest.fn();
    const res = await request(app).post("/devices/matter/commission").send({ pairingCode: "123" });
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("forwards only known fields to the bridge with the API key and returns the uuid", async () => {
    global.fetch = bridgeAnswer(200, { status: "ok", uuid: "abc-123" });

    const res = await request(app)
      .post("/devices/matter/commission")
      .set("x-api-key", "secret")
      .send({ pairingCode: "12345678901", name: "Lamp", unknownField: "ignored" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", data: { uuid: "abc-123" } });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("http://localhost:9992/commission");
    expect(options.method).toBe("POST");
    expect(options.headers["x-api-key"]).toBe("secret");
    expect(JSON.parse(options.body)).toEqual({ pairingCode: "12345678901", name: "Lamp" });
  });

  test("passes the error of the bridge back to the client", async () => {
    global.fetch = bridgeAnswer(400, { status: "error", error: "A Matter pairingCode is required" });

    const res = await request(app).post("/devices/matter/commission").set("x-api-key", "secret").send({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.error).toBe("A Matter pairingCode is required");
  });

  test("reports an unreachable bridge", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const res = await request(app).post("/devices/matter/commission").set("x-api-key", "secret").send({ pairingCode: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Matter bridge not reachable");
  });

  test("aborts if the bridge does not answer in time", async () => {
    global.fetch = jest.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name  = "AbortError";
        reject(error);
      });
    }));

    const res = await request(app).post("/devices/matter/commission").set("x-api-key", "secret").send({ pairingCode: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No response from Matter bridge");
  });
});
