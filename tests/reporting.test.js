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
  CONF_reportingNightStartHour:          22,
  CONF_reportingNightEndHour:            5,
}));

const request = require("supertest");
const appConfig = require("../config");
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
  });

  reportDate = "2026-07-04";

  const readings = [
    { property: "motion", value: "1", valueAsNumeric: 1, dateTime: reportDate + "T01:15:00" },
    { property: "motion", value: "1", valueAsNumeric: 1, dateTime: reportDate + "T06:30:00" },
    { property: "motion", value: "1", valueAsNumeric: 1, dateTime: reportDate + "T23:10:00" }
  ];

  for (const entry of readings) {
    db.prepare(
      "INSERT INTO mqtt_devices_values (deviceID, dateTimeAsNumeric, property, value, valueAsNumeric, hour) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      device.deviceID,
      Math.floor(new Date(entry.dateTime).getTime() / 1000),
      entry.property,
      entry.value,
      entry.valueAsNumeric,
      Number(entry.dateTime.slice(11, 13))
    );
  }
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  db.prepare("DELETE FROM reporting_reports").run();
  appConfig.CONF_reportingNightStartHour = 22;
  appConfig.CONF_reportingNightEndHour = 5;
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
    const reports = await service.generateAndStoreReports(reportDate);

    expect(reports.length).toBe(1);
    expect(reportingEngineMock.generateReport).toHaveBeenCalledTimes(1);
    expect(reportingEngineMock.generateReport).toHaveBeenCalledWith(expect.any(Object), { language: "de" });

    const row = db.prepare("SELECT * FROM reporting_reports WHERE individualID = ? AND reportDate = ?").get(individualID, reportDate);
    expect(row).toBeDefined();
    expect(row.summaryText).toContain("Kurzbericht");
    expect(row.reportLanguage).toBe("de");

    const facts = JSON.parse(row.factsJson);
    expect(facts.totalReadings).toBe(3);
    expect(facts.nightActivityCount).toBeGreaterThan(0);
    expect(facts.nightAssignedRoomActivityCount).toBeGreaterThan(0);
    expect(facts.unusualTimeSignals.length).toBeGreaterThan(0);
  });

  test("uses configurable overnight night window", () => {
    const service = new ReportingService(null);

    appConfig.CONF_reportingNightStartHour = 22;
    appConfig.CONF_reportingNightEndHour = 5;

    expect(service.isNightHour(23)).toBe(true);
    expect(service.isNightHour(2)).toBe(true);
    expect(service.isNightHour(12)).toBe(false);
  });

  test("uses configurable same-day night window", () => {
    const service = new ReportingService(null);

    appConfig.CONF_reportingNightStartHour = 1;
    appConfig.CONF_reportingNightEndHour = 6;

    expect(service.isNightHour(2)).toBe(true);
    expect(service.isNightHour(6)).toBe(true);
    expect(service.isNightHour(23)).toBe(false);
  });

  test("derives very-early and very-late from overnight night window", () => {
    const service = new ReportingService(null);

    appConfig.CONF_reportingNightStartHour = 22;
    appConfig.CONF_reportingNightEndHour = 5;

    expect(service.isVeryEarlyHour(3)).toBe(true);
    expect(service.isVeryEarlyHour(7)).toBe(false);
    expect(service.isVeryLateHour(23)).toBe(true);
    expect(service.isVeryLateHour(18)).toBe(false);
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

    const response = await request(app)
      .post("/reports/generate")
      .send({ date: reportDate, language: "en" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.results.length).toBe(1);

    const row = db.prepare("SELECT * FROM reporting_reports WHERE individualID = ? AND reportDate = ?").get(individualID, reportDate);
    expect(row).toBeDefined();
    expect(row.summaryText).toContain("Manuell erzeugter Bericht");
    expect(row.reportLanguage).toBe("en");

    const readResponse = await request(app)
      .get("/reports")
      .query({ date: reportDate, language: "en" });

    expect(readResponse.status).toBe(200);
    expect(readResponse.body.results.length).toBe(1);
  });
});
