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

  db.exec(`
    CREATE TABLE "devices" (
      deviceID TEXT PRIMARY KEY,
      bridge TEXT NOT NULL,
      "powerType" TEXT NOT NULL,
      vendorName TEXT NOT NULL,
      productName TEXT NOT NULL,
      properties TEXT NOT NULL,
      name TEXT,
      description TEXT,
      strength INTEGER,
      dateTimeAdded TEXT NOT NULL DEFAULT (datetime('now'))
    );

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

    CREATE TABLE "notifications" (
      notificationID INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      description TEXT,
      scenarioID INTEGER DEFAULT 0,
      icon TEXT,
      dateTime TEXT DEFAULT (datetime('now'))
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
      deviceID TEXT NOT NULL,
      dateTime TEXT NOT NULL DEFAULT (datetime('now')),
      dateTimeAsNumeric NUMERIC,
      bridge TEXT NOT NULL,
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

    CREATE TABLE "scenarios" (
      scenarioID INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      enabled BOOLEAN DEFAULT 1,
      priority INTEGER DEFAULT 0,
      pushNotification BOOLEAN DEFAULT 1,
      icon TEXT NOT NULL,
      roomID INTEGER,
      individualID INTEGER,
      dateTimeAdded TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE "scenarios_triggers" (
      triggerID INTEGER PRIMARY KEY AUTOINCREMENT,
      scenarioID INTEGER NOT NULL,
      deviceID TEXT NOT NULL,
      bridge TEXT NOT NULL,
      property TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL,
      valueType TEXT DEFAULT 'String'
    );

    CREATE TABLE "scenarios_actions" (
      actionID INTEGER PRIMARY KEY AUTOINCREMENT,
      scenarioID INTEGER NOT NULL,
      deviceID TEXT NOT NULL,
      bridge TEXT NOT NULL,
      property TEXT NOT NULL,
      value TEXT NOT NULL,
      valueType TEXT DEFAULT 'String',
      delay INTEGER DEFAULT 0
    );

    CREATE TABLE scenarios_executions (
      executionID INTEGER PRIMARY KEY AUTOINCREMENT,
      scenarioID INTEGER NOT NULL,
      triggerDeviceID TEXT NOT NULL,
      triggerProperty TEXT NOT NULL,
      triggerValue TEXT NOT NULL,
      dateTimeExecutedAt TEXT DEFAULT (datetime('now')),
      success BOOLEAN DEFAULT 1,
      error TEXT
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

  app.use("/data",      apiKeyAuth, routesData);
  app.use("/scenarios", apiKeyAuth, routesScenarios);
  app.use("/devices",   apiKeyAuth, routesDevices);

  return app;
}

/**
 * Inserts a test device into the database.
 */
function insertTestDevice(db, overrides = {}) {
  const device = {
    deviceID:      "test_device_001",
    bridge:        "http",
    powerType:     "MAINS",
    vendorName:    "TestVendor",
    productName:   "TestProduct",
    properties:    JSON.stringify([{ name: "temperature", dataType: "Numeric", access: "r" }]),
    name:          "Test Device",
    description:   "A test device",
    ...overrides,
  };

  db.prepare(
    "INSERT INTO devices (deviceID, bridge, powerType, vendorName, productName, properties, name, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(device.deviceID, device.bridge, device.powerType, device.vendorName, device.productName, device.properties, device.name, device.description);

  return device;
}

module.exports = { createTestDatabase, setupGlobals, createTestApp, insertTestDevice };
