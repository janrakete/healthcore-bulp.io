/**
 * Integration Tests: CredentialEngine + server integration MQTT handlers
 * =======================================================================
 * Tests cover:
 *   - CredentialEngine: token update, sync-run start/finish
 *   - Server MQTT handler behaviour for each integrations topic (valid + invalid payloads)
 */

jest.mock("../config", () => ({
  CONF_tablesAllowedForAPI:          ["individuals"],
  CONF_tablesMaxEntriesReturned:     500,
  CONF_apiKey:                       "",
  CONF_apiCallTimeoutMilliseconds:   1000,
  CONF_scenarioCooldownMilliseconds: 5000,
  CONF_scanTimeDefaultSeconds:       30,
  CONF_bridges:                      ["HTTP", "integrations"],
  CONF_corsURL:                      "",
  CONF_baseURL:                      "http://localhost",
}));

const { createTestDatabase, setupGlobals } = require("./setup");

let db;

beforeAll(() => {
  db = createTestDatabase();
  setupGlobals(db);
});

afterAll(() => {
  db.close();
});

// ─── CredentialEngine ────────────────────────────────────────────────────────

describe("CredentialEngine", () => {
  let CredentialEngine;

  beforeAll(() => {
    // Require after global.database is set so initSchema() runs against the test DB
    CredentialEngine = require("../server/libs/CredentialEngine");
  });

  beforeEach(() => {
    // Seed a test account before each test
    db.prepare(`
      INSERT OR REPLACE INTO integrations_accounts
        (accountID, provider, enabled, accessToken, refreshToken, expiresAt, metadata)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `).run("acc-1", "googleHealth", "tok-old", "ref-1", null, JSON.stringify({ clientID: "cid", clientSecret: "cs" }));
  });

  afterEach(() => {
    db.prepare("DELETE FROM integrations_accounts").run();
    db.prepare("DELETE FROM integrations_sync_runs").run();
  });

  // listAccounts
  it("listAccounts returns enabled accounts", () => {
    const accounts = CredentialEngine.listAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0].accountID).toBe("acc-1");
    expect(accounts[0].provider).toBe("googleHealth");
    expect(accounts[0].enabled).toBe(true);
  });

  it("listAccounts excludes disabled accounts", () => {
    db.prepare("UPDATE integrations_accounts SET enabled = 0 WHERE accountID = ?").run("acc-1");
    const accounts = CredentialEngine.listAccounts();
    expect(accounts.length).toBe(0);
  });

  // setToken
  it("setToken updates accessToken and expiresAt", () => {
    const newExpiry = "2099-01-01T00:00:00.000Z";
    CredentialEngine.setToken("acc-1", "tok-new", newExpiry);

    const accounts = CredentialEngine.listAccounts();
    expect(accounts[0].accessToken).toBe("tok-new");
    expect(accounts[0].expiresAt).toBe(newExpiry);
  });

  it("setToken accepts null expiresAt", () => {
    CredentialEngine.setToken("acc-1", "tok-null-expiry", null);
    const accounts = CredentialEngine.listAccounts();
    expect(accounts[0].accessToken).toBe("tok-null-expiry");
    expect(accounts[0].expiresAt).toBeNull();
  });

  // syncRunStart / syncRunFinish
  it("syncRunStart inserts a row and returns a syncRunID", () => {
    const runID = CredentialEngine.syncRunStart("acc-1");
    expect(typeof runID).toBe("number");
    expect(runID).toBeGreaterThan(0);
  });

  it("syncRunFinish marks success when no error", () => {
    const runID = CredentialEngine.syncRunStart("acc-1");
    CredentialEngine.syncRunFinish(runID, null);

    const row = db.prepare("SELECT * FROM integrations_sync_runs WHERE syncRunID = ?").get(runID);
    expect(row.success).toBe(1);
    expect(row.error).toBeNull();
    expect(row.finishedAt).not.toBeNull();
  });

  it("syncRunFinish records error message on failure", () => {
    const runID = CredentialEngine.syncRunStart("acc-1");
    CredentialEngine.syncRunFinish(runID, "provider rate-limit");

    const row = db.prepare("SELECT * FROM integrations_sync_runs WHERE syncRunID = ?").get(runID);
    expect(row.success).toBe(0);
    expect(row.error).toBe("provider rate-limit");
  });
});

// ─── Server MQTT handler behaviour ───────────────────────────────────────────

describe("Server integration MQTT handlers", () => {
  /**
   * We test handler behaviour by directly invoking the handler functions
   * through the MQTT publish mock, simulating what server/app.js would do
   * when it receives a message. Since the handlers live inside the
   * startServer() closure we cannot require them directly; instead we drive
   * them indirectly through CredentialEngine (already tested above) and
   * verify the published response shape using the mock.
   *
   * The publish mock is set up in setupGlobals as jest.fn().
   */

  let CredentialEngine;
  const BRIDGE = "integrations";

  /**
   * Simulates the integrationRespond helper from server/app.js so we can
   * build expected publish calls without depending on the live server closure.
   */
  function makeResponse(action, callID, payload) {
    return {
      topic:   BRIDGE + "/integrations/" + action + "/response",
      message: Object.assign({}, payload, { callID, bridge: BRIDGE }),
    };
  }

  beforeAll(() => {
    CredentialEngine = require("../server/libs/CredentialEngine");
  });

  beforeEach(() => {
    // Seed a test account
    db.prepare(`
      INSERT OR REPLACE INTO integrations_accounts
        (accountID, provider, enabled, accessToken, refreshToken, expiresAt, metadata)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `).run("h-acc", "garminHealth", "atk", "rtk", null, "{}");

    // Reset publish mock
    global.mqttClient.publish.mockClear();
  });

  afterEach(() => {
    db.prepare("DELETE FROM integrations_accounts").run();
    db.prepare("DELETE FROM integrations_sync_runs").run();
  });

  /**
   * Thin shim that replicates the handler logic from server/app.js without
   * depending on the actual running server. This lets us test handler
   * validation rules and CredentialEngine calls in isolation.
   */
  function integrationRespond(data, action, payload) {
    const msg        = Object.assign({}, payload, { callID: data.callID, bridge: data.bridge });
    const topic      = (data.bridge || "integrations") + "/integrations/" + action + "/response";
    global.mqttClient.publish(topic, JSON.stringify(msg));
  }

  async function handleAccountsList(data) {
    if (!data.bridge || !data.callID)
    {
      return;
    }
    try {
      const accounts = CredentialEngine.listAccounts();
      integrationRespond(data, "accounts/list", { status: "ok", accounts });
    } catch (err) {
      integrationRespond(data, "accounts/list", { status: "error", error: err.message });
    }
  }

  async function handleTokensSet(data) {
    if (!data.bridge || !data.callID)
    {
      return;
    }
    if (!data.accountID || !data.accessToken)
    {
      integrationRespond(data, "accounts/tokens/set", { status: "error", error: "accountID and accessToken are required" });
      return;
    }
    try {
      CredentialEngine.setToken(data.accountID, data.accessToken, data.expiresAt || null);
      integrationRespond(data, "accounts/tokens/set", { status: "ok", accountID: data.accountID });
    } catch (err) {
      integrationRespond(data, "accounts/tokens/set", { status: "error", error: err.message });
    }
  }

  async function handleSyncRunStart(data) {
    if (!data.bridge || !data.callID)
    {
      return;
    }
    if (!data.accountID)
    {
      integrationRespond(data, "syncrun/start", { status: "error", error: "accountID is required" });
      return;
    }
    try {
      const syncRunID = CredentialEngine.syncRunStart(data.accountID);
      integrationRespond(data, "syncrun/start", { status: "ok", accountID: data.accountID, syncRunID });
    } catch (err) {
      integrationRespond(data, "syncrun/start", { status: "error", error: err.message });
    }
  }

  async function handleSyncRunFinish(data) {
    if (!data.bridge || !data.callID)
    {
      return;
    }
    if (!data.syncRunID)
    {
      integrationRespond(data, "syncrun/finish", { status: "error", error: "syncRunID is required" });
      return;
    }
    try {
      CredentialEngine.syncRunFinish(data.syncRunID, data.error || null);
      integrationRespond(data, "syncrun/finish", { status: "ok", syncRunID: data.syncRunID });
    } catch (err) {
      integrationRespond(data, "syncrun/finish", { status: "error", error: err.message });
    }
  }

  // ── accounts/list ──────────────────────────────────────────────────────────

  it("accounts/list: responds with account list on valid request", async () => {
    await handleAccountsList({ bridge: BRIDGE, callID: "c1" });
    expect(global.mqttClient.publish).toHaveBeenCalledWith(
      BRIDGE + "/integrations/accounts/list/response",
      expect.stringContaining("\"status\":\"ok\"")
    );
    const [, raw] = global.mqttClient.publish.mock.calls[0];
    const body    = JSON.parse(raw);
    expect(body.accounts.length).toBe(1);
    expect(body.accounts[0].accountID).toBe("h-acc");
    expect(body.callID).toBe("c1");
  });

  it("accounts/list: silent when bridge or callID missing", async () => {
    await handleAccountsList({ bridge: BRIDGE }); // no callID
    expect(global.mqttClient.publish).not.toHaveBeenCalled();
  });

  // ── accounts/tokens/set ────────────────────────────────────────────────────

  it("accounts/tokens/set: persists new token", async () => {
    await handleTokensSet({ bridge: BRIDGE, callID: "c2", accountID: "h-acc", accessToken: "new-tok", expiresAt: "2099-01-01T00:00:00.000Z" });
    expect(global.mqttClient.publish).toHaveBeenCalledWith(
      BRIDGE + "/integrations/accounts/tokens/set/response",
      expect.stringContaining("\"status\":\"ok\"")
    );
    // Verify DB was actually updated
    const accounts = CredentialEngine.listAccounts();
    expect(accounts[0].accessToken).toBe("new-tok");
  });

  it("accounts/tokens/set: returns error when accessToken missing", async () => {
    await handleTokensSet({ bridge: BRIDGE, callID: "c3", accountID: "h-acc" });
    const [, raw] = global.mqttClient.publish.mock.calls[0];
    expect(JSON.parse(raw).status).toBe("error");
  });

  // ── syncrun/start + syncrun/finish ────────────────────────────────────────

  it("syncrun/start: returns a syncRunID", async () => {
    await handleSyncRunStart({ bridge: BRIDGE, callID: "c12", accountID: "h-acc" });
    const [, raw] = global.mqttClient.publish.mock.calls[0];
    const body    = JSON.parse(raw);
    expect(body.status).toBe("ok");
    expect(typeof body.syncRunID).toBe("number");
  });

  it("syncrun/finish: marks run as successful", async () => {
    const runID = CredentialEngine.syncRunStart("h-acc");
    await handleSyncRunFinish({ bridge: BRIDGE, callID: "c13", syncRunID: runID, error: null });
    const [, raw] = global.mqttClient.publish.mock.calls[0];
    expect(JSON.parse(raw).status).toBe("ok");

    const row = db.prepare("SELECT * FROM integrations_sync_runs WHERE syncRunID = ?").get(runID);
    expect(row.success).toBe(1);
  });

  it("syncrun/finish: records error string on failure", async () => {
    const runID = CredentialEngine.syncRunStart("h-acc");
    await handleSyncRunFinish({ bridge: BRIDGE, callID: "c14", syncRunID: runID, error: "rate-limit" });
    const row = db.prepare("SELECT * FROM integrations_sync_runs WHERE syncRunID = ?").get(runID);
    expect(row.success).toBe(0);
    expect(row.error).toBe("rate-limit");
  });

  it("syncrun/start: returns error when accountID missing", async () => {
    await handleSyncRunStart({ bridge: BRIDGE, callID: "c15" }); // no accountID
    const [, raw] = global.mqttClient.publish.mock.calls[0];
    expect(JSON.parse(raw).status).toBe("error");
  });

  it("syncrun/finish: returns error when syncRunID missing", async () => {
    await handleSyncRunFinish({ bridge: BRIDGE, callID: "c16" }); // no syncRunID
    const [, raw] = global.mqttClient.publish.mock.calls[0];
    expect(JSON.parse(raw).status).toBe("error");
  });
});
