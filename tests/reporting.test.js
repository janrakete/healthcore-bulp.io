/**
 * Integration Tests: Reporting
 * ================================
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
  CONF_language:                         "de",
  CONF_reportingEngineModel:             "",
  CONF_reportingEnabled:                 false,
  CONF_reportingCron:                    "5 0 * * *",
  CONF_reportingLanguage:                "de",
  CONF_reportingLanguageSupported:       ["de", "en"],
}));

const request = require("supertest");
const ReportingService = require("../server/libs/ReportingEngineService");
const { reportLanguageNormalize, reportNoDataSummaryGet } = require("../server/libs/ReportingEngineLanguage");
const { createTestDatabase, setupGlobals, createTestApp, insertTestDevice } = require("./setup");

let app;
let db;
let individualID;
let reportDate;

beforeAll(() => {
  db = createTestDatabase();
  setupGlobals(db);
  app = createTestApp();

  const roomResult = db.prepare("INSERT INTO rooms (name) VALUES (?)").run("Bathroom");
  const individualResult = db.prepare("INSERT INTO individuals (firstname, lastname, roomID) VALUES (?, ?, ?)").run("Lea", "Example", roomResult.lastInsertRowid);
  individualID = individualResult.lastInsertRowid;

  const device = insertTestDevice(db, {
    uuid: "report_device_001",
    bridge: "http",
    productName: "MotionSensor",
    name: "Bathroom Sensor",
    individualID: individualID,
    roomID: roomResult.lastInsertRowid,
    properties: JSON.stringify([
      { name: "motion", valueType: "Options", reportingInclude: true, reportingRole: "activity" },
      { name: "state", valueType: "Options", reportingInclude: false, reportingRole: "actuator" }
    ])
  });

  reportDate = new Date().toISOString().slice(0, 10);

  const now = Date.now();

  const readings = [
    { property: "motion", value: "1", valueAsNumeric: 1, unixMs: now - (3 * 60 * 60 * 1000) },
    { property: "motion", value: "1", valueAsNumeric: 1, unixMs: now - (2 * 60 * 60 * 1000) },
    { property: "motion", value: "1", valueAsNumeric: 1, unixMs: now - (60 * 60 * 1000) }
  ];

  for (const entry of readings) {
    const dateObj = new Date(entry.unixMs);
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, dateTimeAsNumeric, property, value, valueAsNumeric, hour) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      device.deviceID,
      entry.unixMs,
      entry.property,
      entry.value,
      entry.valueAsNumeric,
      Number(String(dateObj.getHours()))
    );
  }
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  db.prepare("DELETE FROM reporting_reports").run();
});

describe("Reporting generation", () => {
  test("shared language helper normalizes and falls back", () => {
    expect(reportLanguageNormalize("EN")).toBe("en");
    expect(reportLanguageNormalize("xx")).toBe("de");
    expect(reportNoDataSummaryGet("en")).toContain("No relevant data");
  });

  test("generates and stores one report for an individual", async () => {
    const reportingEngineMock = {
      generateReport: jest.fn().mockResolvedValue("Kurzbericht: Nachtaktivitaet vorhanden."),
      getModelPath: jest.fn().mockReturnValue("mock-model")
    };

    const service = new ReportingService(reportingEngineMock);
    const endDateTime = new Date().toISOString();
    const startDateTime = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
    const reports = await service.generateAndStoreReports(reportDate, { startDateTime, endDateTime });

    expect(reports.length).toBe(1);
    expect(reportingEngineMock.generateReport).toHaveBeenCalledTimes(1);
    expect(reportingEngineMock.generateReport).toHaveBeenCalledWith(expect.any(Object), { language: "de" });

    const row = db.prepare("SELECT * FROM reporting_reports WHERE individualID = ? AND reportDate = ?").get(individualID, reportDate);
    expect(row).toBeDefined();
    expect(row.summaryText).toContain("Kurzbericht");
    expect(row.reportLanguage).toBe("de");

    const facts = JSON.parse(row.factsJson);
    expect(facts.windowStart).toBeTruthy();
    expect(facts.windowEnd).toBeTruthy();
    expect(typeof facts.windowStart).toBe("string");
    expect(typeof facts.windowEnd).toBe("string");
    expect(facts.totalReadings).toBe(3);
    expect(facts.firstActivity).toBeTruthy();
    expect(facts.lastActivity).toBeTruthy();

    // numericPropertyStats: motion has numeric values so must appear with correct aggregates
    expect(facts.numericPropertyStats).toBeDefined();
    expect(facts.numericPropertyStats.motion).toBeDefined();
    expect(facts.numericPropertyStats.motion.min).toBe(1);
    expect(facts.numericPropertyStats.motion.max).toBe(1);
    expect(facts.numericPropertyStats.motion.avg).toBe(1);
    expect(facts.numericPropertyStats.motion.count).toBe(3);

    expect(facts.propertyDailySummaries).toBeDefined();
    expect(facts.propertyDailySummaries.motion).toBeDefined();
    expect(facts.propertyDailySummaries.motion.totalCount).toBe(3);
    expect(Array.isArray(facts.propertyDailySummaries.motion.dailyCounts)).toBe(true);
    expect(Array.isArray(facts.propertyDailySummaries.motion.spikeDays)).toBe(true);
    expect(Array.isArray(facts.propertySpikeFindings)).toBe(true);
    expect(facts.propertyDailySummaries.motion.dailyCounts.length).toBeGreaterThanOrEqual(1);

    // openAlerts: array present (empty because no alerts inserted for this individual)
    expect(Array.isArray(facts.openAlerts)).toBe(true);
  });

  test("validates explicit start/end range", () => {
    const service = new ReportingService(null);

    expect(() => service.resolveRange(undefined, new Date().toISOString())).toThrow();
    expect(() => service.resolveRange(new Date().toISOString(), undefined)).toThrow();
    expect(() => service.resolveRange("invalid", new Date().toISOString())).toThrow();

    const startDateTime = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
    const endDateTime = new Date().toISOString();
    const range = service.resolveRange(startDateTime, endDateTime);
    expect(range.startUnix).toBeLessThan(range.endUnix);
  });

  test("reads generated reports via API route", async () => {
    db.prepare(
      "INSERT INTO reporting_reports (individualID, reportDate, factsJson, summaryText, modelName, reportLanguage, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      individualID,
      reportDate,
      JSON.stringify({ totalReadings: 3 }),
      "API Bericht",
      "mock-model",
      "de",
      "generated"
    );

    const response = await request(app)
      .get("/reports")
      .query({ date: reportDate, includeFacts: true });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.results.length).toBe(1);
    expect(response.body.results[0].summaryText).toBe("API Bericht");
    expect(response.body.results[0].reportLanguage).toBe("de");
    expect(response.body.results[0].facts.totalReadings).toBe(3);
  });

  test("generates reports via manual API trigger", async () => {
    const reportingEngineMock = {
      generateReport: jest.fn().mockResolvedValue("Manuell erzeugter Bericht."),
      getModelPath: jest.fn().mockReturnValue("mock-model")
    };

    global.reportingService = new ReportingService(reportingEngineMock);
    const endDateTime = new Date().toISOString();
    const startDateTime = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

    const response = await request(app)
      .post("/reports/generate")
      .send({ startDateTime, endDateTime, language: "en" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.results.length).toBe(1);

    const generatedReportDate = response.body.results[0].reportDate;
    const row = db.prepare("SELECT * FROM reporting_reports WHERE individualID = ? AND reportDate = ?").get(individualID, generatedReportDate);
    expect(row).toBeDefined();
    expect(row.summaryText).toContain("Manuell erzeugter Bericht");
    expect(row.reportLanguage).toBe("en");

    const readResponse = await request(app)
      .get("/reports")
      .query({ date: generatedReportDate, language: "en" });

    expect(readResponse.status).toBe(200);
    expect(readResponse.body.results.length).toBe(1);
  });

  test("end-to-end: /reports/generate persists generic property summary fields", async () => {
    const reportingEngineMock = {
      generateReport: jest.fn().mockResolvedValue("E2E Bericht"),
      getModelPath: jest.fn().mockReturnValue("mock-model")
    };

    global.reportingService = new ReportingService(reportingEngineMock);

    const endDateTime = new Date().toISOString();
    const startDateTime = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

    const generateResponse = await request(app)
      .post("/reports/generate")
      .send({ startDateTime, endDateTime, language: "de" });

    expect(generateResponse.status).toBe(200);
    expect(generateResponse.body.status).toBe("ok");
    expect(generateResponse.body.results.length).toBe(1);

    const generatedReportDate = generateResponse.body.results[0].reportDate;
    const reportsResponse = await request(app)
      .get("/reports")
      .query({ date: generatedReportDate, includeFacts: true });

    expect(reportsResponse.status).toBe(200);
    expect(reportsResponse.body.status).toBe("ok");
    expect(reportsResponse.body.results.length).toBe(1);

    const facts = reportsResponse.body.results[0].facts;
    expect(facts).toBeDefined();
    expect(facts.motionDailySummary).toBeUndefined();
    expect(facts.propertyDailySummaries).toBeDefined();
    expect(facts.propertyDailySummaries.motion).toBeDefined();
    expect(facts.propertyDailySummaries.motion.totalCount).toBeGreaterThan(0);
    expect(Array.isArray(facts.propertySpikeFindings)).toBe(true);
  });

  test("detects daily property spikes against previous days", () => {
    const service = new ReportingService(null);
    const reportingDefinitions = new Map([
      [1, new Map([
        ["motion", { reportingInclude: true, reportingRole: "activity" }],
        ["state", { reportingInclude: false, reportingRole: "actuator" }]
      ])]
    ]);

    const readings = [
      { deviceID: 1, property: "motion", value: "1", valueAsNumeric: 1, dateTimeAsNumeric: Date.parse("2026-07-07T08:00:00Z") },
      { deviceID: 1, property: "motion", value: "1", valueAsNumeric: 1, dateTimeAsNumeric: Date.parse("2026-07-08T08:00:00Z") },
      { deviceID: 1, property: "motion", value: "1", valueAsNumeric: 1, dateTimeAsNumeric: Date.parse("2026-07-08T09:00:00Z") },
      { deviceID: 1, property: "motion", value: "1", valueAsNumeric: 1, dateTimeAsNumeric: Date.parse("2026-07-09T08:00:00Z") },
      { deviceID: 1, property: "motion", value: "1", valueAsNumeric: 1, dateTimeAsNumeric: Date.parse("2026-07-09T09:00:00Z") },
      { deviceID: 1, property: "motion", value: "1", valueAsNumeric: 1, dateTimeAsNumeric: Date.parse("2026-07-09T10:00:00Z") },
      { deviceID: 1, property: "motion", value: "0", valueAsNumeric: 0, dateTimeAsNumeric: Date.parse("2026-07-09T11:00:00Z") },
      { deviceID: 1, property: "state", value: "1", valueAsNumeric: 1, dateTimeAsNumeric: Date.parse("2026-07-09T12:00:00Z") }
    ];

    const summaries = service.buildPropertyDailySummaries(readings, reportingDefinitions);
    const summary = summaries.motion;
    const findings = service.buildSpikeFindingsFromDailySummaries(summaries);

    expect(summary.totalCount).toBe(6);
    expect(summary.dailyCounts).toEqual([
      { date: "2026-07-07", count: 1 },
      { date: "2026-07-08", count: 2 },
      { date: "2026-07-09", count: 3 }
    ]);
    expect(summary.spikeDays).toEqual([
      { date: "2026-07-08", count: 2, previousMax: 1, deltaToPreviousMax: 1 },
      { date: "2026-07-09", count: 3, previousMax: 2, deltaToPreviousMax: 1 }
    ]);
    expect(findings).toEqual([
      { property: "motion", date: "2026-07-08", count: 2, previousMax: 1, deltaToPreviousMax: 1 },
      { property: "motion", date: "2026-07-09", count: 3, previousMax: 2, deltaToPreviousMax: 1 }
    ]);
  });

  test("excludes properties without reportingInclude metadata", () => {
    const service = new ReportingService(null);
    const devices = [
      {
        deviceID: 1,
        properties: JSON.stringify([
          { name: "motion", reportingInclude: true },
          { name: "temperature" }
        ])
      }
    ];

    const definitions = service.buildReportingPropertyDefinitionsByDevice(devices);
    const readings = [
      { deviceID: 1, property: "motion", value: "1", valueAsNumeric: 1, dateTimeAsNumeric: Date.parse("2026-07-10T08:00:00Z") },
      { deviceID: 1, property: "temperature", value: "22", valueAsNumeric: 22, dateTimeAsNumeric: Date.parse("2026-07-10T09:00:00Z") }
    ];

    const summaries = service.buildPropertyDailySummaries(readings, definitions);

    expect(summaries.motion).toBeDefined();
    expect(summaries.temperature).toBeUndefined();
  });
});
