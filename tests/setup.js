/**
 * Integration Test Setup
 * ======================
 * Shared utilities for creating test database, globals, and Express app.
 */

const Database = require("better-sqlite3");

/**
 * Creates an in-memory SQLite database with the full Healthcore schema.
 */
function createTestDatabase() {
  const db = new Database(":memory:");

  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE "devices" (
      deviceID INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      bridge TEXT NOT NULL,
      "powerType" TEXT NOT NULL,
      vendorName TEXT NOT NULL,
      productName TEXT NOT NULL,
      properties TEXT NOT NULL,
      name TEXT,
      description TEXT,
      strength INTEGER,
      individualID INTEGER DEFAULT 0,
      roomID INTEGER DEFAULT 0,
      dateTimeAdded TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(uuid, bridge)
    );

    CREATE INDEX idx_devices_uuid_bridge ON devices(uuid, bridge);

    CREATE TABLE individuals (
      individualID INTEGER PRIMARY KEY AUTOINCREMENT,
      firstname TEXT NOT NULL,
      lastname TEXT NOT NULL,
      roomID INTEGER DEFAULT 0
    );

    CREATE TABLE rooms (
      roomID INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );

    CREATE TABLE users (
      userID INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      password TEXT NOT NULL
    );

    CREATE TABLE sos (
      sosID INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      number TEXT NOT NULL
    );

    CREATE TABLE settings (
      settingID INTEGER PRIMARY KEY AUTOINCREMENT,
      institutionTitle TEXT NOT NULL
    );

    CREATE TABLE "push_tokens" (
      tokenID INTEGER PRIMARY KEY AUTOINCREMENT,
      userID INTEGER DEFAULT 0,
      token TEXT NOT NULL,
      dateTimeAdded TEXT DEFAULT (datetime('now'))
    );


    CREATE TABLE "mqtt_history" (
      historyID INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      callID TEXT,
      dateTime TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE "mqtt_history_devices_values" (
      valueID INTEGER PRIMARY KEY AUTOINCREMENT,
      deviceID INTEGER NOT NULL REFERENCES devices(deviceID) ON DELETE CASCADE,
      dateTime TEXT NOT NULL DEFAULT (datetime('now')),
      dateTimeAsNumeric NUMERIC,
      property TEXT,
      value TEXT NOT NULL,
      valueAsNumeric NUMERIC NOT NULL DEFAULT 0,
      weekday NUMERIC,
      weekdaySin NUMERIC,
      weekdayCos NUMERIC,
      hour NUMERIC,
      hourSin NUMERIC,
      hourCos NUMERIC,
      month NUMERIC
    );

    CREATE INDEX idx_mqtt_history_device_property ON mqtt_history_devices_values(deviceID, property);

    CREATE TABLE "scenarios" (
      scenarioID INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      enabled BOOLEAN DEFAULT 1,
      priority INTEGER DEFAULT 0,
      icon TEXT NOT NULL,
      roomID INTEGER,
      individualID INTEGER,
      dateTimeAdded TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE "scenarios_triggers" (
      triggerID INTEGER PRIMARY KEY AUTOINCREMENT,
      scenarioID INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'device_value',
      deviceID INTEGER REFERENCES devices(deviceID) ON DELETE CASCADE,
      property TEXT,
      operator TEXT,
      value TEXT,
      valueType TEXT DEFAULT 'String'
    );

    CREATE TABLE "scenarios_actions" (
      actionID INTEGER PRIMARY KEY AUTOINCREMENT,
      scenarioID INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'set_device_value',
      deviceID INTEGER REFERENCES devices(deviceID) ON DELETE CASCADE,
      property TEXT,
      value TEXT,
      valueType TEXT DEFAULT 'String',
      delay INTEGER DEFAULT 0
    );

    CREATE TABLE scenarios_executions (
      executionID INTEGER PRIMARY KEY AUTOINCREMENT,
      scenarioID INTEGER NOT NULL,
      triggerDeviceID INTEGER REFERENCES devices(deviceID) ON DELETE SET NULL,
      triggerProperty TEXT NOT NULL,
      triggerValue TEXT NOT NULL,
      dateTimeExecutedAt TEXT DEFAULT (datetime('now')),
      success BOOLEAN DEFAULT 1,
      error TEXT
    );

    CREATE TABLE alerts (
      alertID INTEGER PRIMARY KEY AUTOINCREMENT,
      ruleID INTEGER DEFAULT 0,
      scenarioID INTEGER DEFAULT 0,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      score NUMERIC DEFAULT 0,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      explanation TEXT,
      recommendation TEXT,
      icon TEXT,
      deviceID INTEGER REFERENCES devices(deviceID) ON DELETE CASCADE,
      property TEXT,
      individualID INTEGER DEFAULT 0,
      roomID INTEGER DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'alerts',
      dateTimeAdded TEXT DEFAULT (datetime('now')),
      dateTimeUpdated TEXT DEFAULT (datetime('now')),
      dateTimeResolved TEXT
    );

    CREATE TABLE alert_signals (
      signalID INTEGER PRIMARY KEY AUTOINCREMENT,
      alertID INTEGER NOT NULL,
      deviceID INTEGER REFERENCES devices(deviceID) ON DELETE CASCADE,
      property TEXT,
      value TEXT,
      valueAsNumeric NUMERIC,
      weight NUMERIC DEFAULT 1,
      dateTimeObserved TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE alert_rules (
      ruleID INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sourceProperty TEXT NOT NULL,
      aggregationType TEXT NOT NULL DEFAULT 'SumBelowThreshold',
      aggregationWindowHours INTEGER DEFAULT 24,
      thresholdMin NUMERIC,
      thresholdMax NUMERIC,
      minReadings INTEGER DEFAULT 1,
      recommendation TEXT,
      dateTimeAdded TEXT DEFAULT (datetime('now')),
      dateTimeUpdated TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

/**
 * Sets up global variables needed by server routes.
 */
function setupGlobals(db) {
  global.database = db;

  // Minimal common mock — conLog suppressed, sendResponse functional
  global.common = {
    conLog: jest.fn(),
    randomHash: (length = 16) => {
      const crypto = require("crypto");
      return crypto.randomBytes(length).toString("hex").slice(0, length);
    },
    sendResponse: (response, data, routeName, errorLabel = "Request") => {
      const statusCode = data.status === "ok" ? 200 : 400;
      return response.status(statusCode).json(data);
    },
    deviceGetIDByUUID: (uuid, bridge, database = null) => {
      const db = database || global.database;
      if (!db) {
        return null;
      }

      const row = db.prepare("SELECT deviceID FROM devices WHERE uuid = ? AND bridge = ? LIMIT 1").get(uuid, bridge);
      return row ? row.deviceID : null;
    },
    deviceGetByUUID: (uuid, bridge, database = null) => {
      const db = database || global.database;
      if (!db) {
        return null;
      }

      return db.prepare("SELECT * FROM devices WHERE uuid = ? AND bridge = ? LIMIT 1").get(uuid, bridge) || null;
    },
    devicePropertiesToArray: jest.fn((properties) => properties),
  };

  global.dayjs = require("dayjs");

  global.mqttClient = {
    publish: jest.fn(),
    subscribe: jest.fn(),
  };

  global.mqttPendingResponses = {};
}

/**
 * Creates an Express app with the server routes mounted.
 * Routes require "../../config" which must be mocked via jest.mock before calling this.
 */
function createTestApp() {
  const express    = require("express");
  const bodyParser = require("body-parser");

  const app = express();
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // JSON error handler (same as server/app.js)
  app.use(function (error, request, response, next) {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      return response.json({ status: "error", error: "JSON in request is invalid" });
    }
    next(error);
  });

  const apiKeyAuth     = require("../server/middleware/auth");
  const routesData     = require("../server/routes/data");
  const routesScenarios = require("../server/routes/scenarios");
  const routesDevices  = require("../server/routes/devices");
  const routesAlerts = require("../server/routes/alerts");

  app.use("/data",      apiKeyAuth, routesData);
  app.use("/scenarios", apiKeyAuth, routesScenarios);
  app.use("/devices",   apiKeyAuth, routesDevices);
  app.use("/alerts",    apiKeyAuth, routesAlerts);

  return app;
}

/**
 * Inserts a test device into the database.
 * Returns the device object with the numeric deviceID assigned by AUTOINCREMENT.
 */
function insertTestDevice(db, overrides = {}) {
  const device = {
    uuid:         "test_device_001",
    bridge:       "http",
    powerType:    "MAINS",
    vendorName:   "TestVendor",
    productName:  "TestProduct",
    properties:   JSON.stringify([{ name: "temperature", dataType: "Numeric", access: "r" }]),
    name:         "Test Device",
    description:  "A test device",
    individualID: 0,
    roomID:       0,
    ...overrides,
  };

  const result = db.prepare(
    "INSERT INTO devices (uuid, bridge, powerType, vendorName, productName, properties, name, description, individualID, roomID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(device.uuid, device.bridge, device.powerType, device.vendorName, device.productName, device.properties, device.name, device.description, device.individualID, device.roomID);

  device.deviceID = result.lastInsertRowid;

  return device;
}

module.exports = { createTestDatabase, setupGlobals, createTestApp, insertTestDevice };
