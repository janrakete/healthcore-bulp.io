/**
 * =============================================================================================
 * Care Insights Engine
 * =============================================================================================
 */

const appConfig = require("../../config");

class CareInsightsEngine {
  constructor() {
    this.ensureTables();
  }

  /**
   * Creates the required Care Insights tables if they do not exist yet.
   */
  ensureTables() {
    database.exec(`
      CREATE TABLE IF NOT EXISTS care_insights (
        insightID INTEGER PRIMARY KEY AUTOINCREMENT,
        ruleID INTEGER DEFAULT 0,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        severity TEXT NOT NULL DEFAULT 'medium',
        score NUMERIC DEFAULT 0,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        explanation TEXT,
        recommendation TEXT,
        deviceID TEXT,
        bridge TEXT,
        property TEXT,
        individualID INTEGER DEFAULT 0,
        roomID INTEGER DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'careinsights',
        dateTimeAdded TEXT DEFAULT (datetime('now')),
        dateTimeUpdated TEXT DEFAULT (datetime('now')),
        dateTimeResolved TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_care_insights_status
      ON care_insights (status);

      CREATE INDEX IF NOT EXISTS idx_care_insights_dateTimeUpdated
      ON care_insights (dateTimeUpdated);

      CREATE INDEX IF NOT EXISTS idx_care_insights_device
      ON care_insights (deviceID, bridge, property);

      CREATE INDEX IF NOT EXISTS idx_care_insights_rule
      ON care_insights (ruleID);

      CREATE TABLE IF NOT EXISTS care_insight_signals (
        signalID INTEGER PRIMARY KEY AUTOINCREMENT,
        insightID INTEGER NOT NULL,
        deviceID TEXT,
        bridge TEXT,
        property TEXT,
        value TEXT,
        valueAsNumeric NUMERIC,
        weight NUMERIC DEFAULT 1,
        dateTimeObserved TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_care_insight_signals_insight
      ON care_insight_signals (insightID);

      CREATE TABLE IF NOT EXISTS care_feedback (
        feedbackID INTEGER PRIMARY KEY AUTOINCREMENT,
        insightID INTEGER NOT NULL,
        userID INTEGER DEFAULT 0,
        feedbackType TEXT NOT NULL,
        comment TEXT,
        dateTimeAdded TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_care_feedback_insight
      ON care_feedback (insightID);

      CREATE TABLE IF NOT EXISTS care_insight_rules (
        ruleID INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        insightType TEXT NOT NULL,
        sourceDeviceID TEXT,
        sourceBridge TEXT,
        sourceProperty TEXT NOT NULL,
        aggregationType TEXT NOT NULL DEFAULT 'sum_below_threshold',
        aggregationWindowHours INTEGER DEFAULT 24,
        thresholdMin NUMERIC,
        thresholdMax NUMERIC,
        minReadings INTEGER DEFAULT 1,
        severity TEXT NOT NULL DEFAULT 'medium',
        title TEXT,
        recommendation TEXT,
        dateTimeAdded TEXT DEFAULT (datetime('now')),
        dateTimeUpdated TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_care_insight_rules_lookup
      ON care_insight_rules (enabled, sourceProperty, sourceDeviceID, sourceBridge);
    `);

    const careInsightColumns = database.prepare("PRAGMA table_info(care_insights)").all();

    if (!careInsightColumns.some((column) => column.name === "ruleID")) {
      database.exec("ALTER TABLE care_insights ADD COLUMN ruleID INTEGER DEFAULT 0");
    }
  }

  /**
   * Handles device values and creates Care Insights for unusual numeric patterns.
   * @param {Object} data
   */
  handleDeviceValues(data) {
    try {
      if (appConfig.CONF_careInsightsActive !== true || !data || !data.values) {
        return;
      }

      const device     = this.getDevice(data.deviceID, data.bridge);
      const assignment = this.getDeviceAssignment(data.deviceID, data.bridge);

      Object.entries(data.values).forEach(([property, valueData]) => {
        this.evaluateConfiguredRules(data, property, valueData);

        if (!this.isNumericValue(valueData)) {
          return;
        }

        const deviation = this.getDeviationScore(data.deviceID, data.bridge, property);
        if (!deviation) {
          return;
        }

        if (deviation.score < appConfig.CONF_careInsightsAnomalyThreshold) {
          this.resolveOpenInsights({ ruleID: 0, type: "unusual_numeric_pattern", deviceID: data.deviceID, bridge: data.bridge, property: property });
          return;
        }

        const insight = this.upsertInsight({
          ruleID: 0,
          type: "unusual_numeric_pattern",
          severity: this.severityFromScore(deviation.score),
          score: deviation.score,
          title: "Unusual reading detected",
          summary: this.buildNumericSummary(device, property, valueData.value),
          explanation: this.buildNumericExplanation(property, valueData.value, deviation),
          recommendation: "Review the latest reading and the surrounding care context.",
          deviceID: data.deviceID,
          bridge: data.bridge,
          property: property,
          individualID: this.getAssignmentIndividualID(assignment),
          roomID: this.getAssignmentRoomID(assignment),
          source: "careinsights"
        });

        this.insertSignal(insight.insightID, {
          deviceID: data.deviceID,
          bridge: data.bridge,
          property: property,
          value: String(valueData.value),
          valueAsNumeric: valueData.valueAsNumeric,
          weight: deviation.score
        });
      });
    }
    catch (error) {
      common.conLog("Care Insights: Error while processing device values: " + error.message, "red");
    }
  }

  /**
   * Handles device online and offline status updates.
   * @param {Object} data
   */
  handleDeviceStatus(data) {
    try {
      if (appConfig.CONF_careInsightsActive !== true || !data || !data.deviceID || !data.bridge || !data.status) {
        return;
      }

      if (data.status === "offline") {
        const device     = this.getDevice(data.deviceID, data.bridge);
        const assignment = this.getDeviceAssignment(data.deviceID, data.bridge);
        const insight = this.upsertInsight({
          ruleID: 0,
          type: "device_connectivity_risk",
          severity: "high",
          score: 0.9,
          title: "Monitoring device offline",
          summary: this.buildConnectivitySummary(device),
          explanation: "A monitoring device went offline and may currently stop delivering relevant care signals.",
          recommendation: "Check the device connection, power supply, and radio path.",
          deviceID: data.deviceID,
          bridge: data.bridge,
          property: "status",
          individualID: this.getAssignmentIndividualID(assignment),
          roomID: this.getAssignmentRoomID(assignment),
          source: "careinsights"
        });

        this.insertSignal(insight.insightID, {
          deviceID: data.deviceID,
          bridge: data.bridge,
          property: "status",
          value: "offline",
          valueAsNumeric: 0,
          weight: 0.9
        });
        return;
      }

      if (data.status === "online") {
        this.resolveOpenInsights({ type: "device_connectivity_risk", deviceID: data.deviceID, bridge: data.bridge });
      }
    }
    catch (error) {
      common.conLog("Care Insights: Error while processing device status: " + error.message, "red");
    }
  }

  /**
   * Calculates a normalized deviation score for a numeric property.
   * @param {string} deviceID
   * @param {string} bridge
   * @param {string} property
   * @returns {Object|null}
   */
  getDeviationScore(deviceID, bridge, property) {
    const history = database.prepare(
      "SELECT valueAsNumeric FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? AND property = ? ORDER BY dateTimeAsNumeric DESC LIMIT ?"
    ).all(deviceID, bridge, property, appConfig.CONF_careInsightsHistorySize);

    if (!history || history.length < 5) {
      return null;
    }

    const values = history
      .map((entry) => Number(entry.valueAsNumeric))
      .filter((entry) => Number.isFinite(entry));

    if (values.length < 5) {
      return null;
    }

    const latest      = values[0];
    const baseline    = values.slice(1);
    const median      = this.median(baseline);
    const deviations  = baseline.map((entry) => Math.abs(entry - median));
    const mad         = this.median(deviations);

    let normalizedDeviation;

    if (mad > 0) {
      normalizedDeviation = Math.abs(latest - median) / (mad * 1.4826);
    }
    else {
      const mean      = baseline.reduce((sum, entry) => sum + entry, 0) / baseline.length;
      const variance  = baseline.reduce((sum, entry) => sum + Math.pow(entry - mean, 2), 0) / baseline.length;
      const stdDev    = Math.sqrt(variance);

      if (stdDev === 0) {
        normalizedDeviation = (latest !== median) ? 6 : 0;
      }
      else {
        normalizedDeviation = Math.abs(latest - mean) / stdDev;
      }
    }

    return {
      score: Math.max(0, Math.min(1, normalizedDeviation / 6)),
      latest: latest,
      median: median,
      normalizedDeviation: normalizedDeviation
    };
  }

  /**
   * Evaluates configured Care Insight rules for one incoming value.
   * @param {Object} data
   * @param {string} property
   * @param {Object} valueData
   */
  evaluateConfiguredRules(data, property, valueData) {
    const rules = this.getMatchingRules(data.deviceID, data.bridge, property);

    rules.forEach((rule) => {
      const context = this.buildRuleContext(rule, data.deviceID, data.bridge);

      if (!context) {
        return;
      }

      const aggregation = this.getRuleAggregation(rule, context, property);
      if (!aggregation || aggregation.readings < (Number(rule.minReadings) || 1)) {
        return;
      }

      if (this.ruleThresholdReached(rule, aggregation) !== true) {
        this.resolveOpenInsights({ ruleID: rule.ruleID, deviceID: context.deviceID, bridge: context.bridge, property: property });
        return;
      }

      const insight = this.upsertInsight({
        ruleID: rule.ruleID,
        type: rule.insightType,
        severity: rule.severity || "medium",
        score: this.ruleScore(rule, aggregation),
        title: this.buildRuleTitle(rule, context.device),
        summary: this.buildRuleSummary(rule, aggregation, context),
        explanation: this.buildRuleExplanation(rule, aggregation),
        recommendation: rule.recommendation || "Review the recent values and decide whether an intervention is required.",
        deviceID: context.deviceID,
        bridge: context.bridge,
        property: property,
        individualID: context.individualID,
        roomID: context.roomID,
        source: "careinsights_rule"
      });

      this.insertSignal(insight.insightID, {
        deviceID: context.deviceID,
        bridge: context.bridge,
        property: property,
        value: String(valueData.value ?? valueData.valueAsNumeric ?? ""),
        valueAsNumeric: valueData.valueAsNumeric ?? null,
        weight: aggregation.total
      });
    });
  }

  /**
   * Returns all active rules matching a device/property input.
   * @param {string} deviceID
   * @param {string} bridge
   * @param {string} property
   * @returns {Array}
   */
  getMatchingRules(deviceID, bridge, property) {
    return database.prepare(
      "SELECT * FROM care_insight_rules WHERE enabled = 1 AND sourceProperty = ? AND (ifnull(sourceDeviceID, '') = '' OR sourceDeviceID = ?) AND (ifnull(sourceBridge, '') = '' OR sourceBridge = ?) ORDER BY ruleID ASC"
    ).all(property, deviceID, bridge);
  }

  /**
   * Builds the context that an insight rule operates on.
   * @param {Object} rule
   * @param {string} deviceID
   * @param {string} bridge
   * @returns {Object|null}
   */
  buildRuleContext(rule, deviceID, bridge) {
    const context = {
      deviceID: rule.sourceDeviceID || deviceID,
      bridge: rule.sourceBridge || bridge,
      individualID: 0,
      roomID: 0,
      device: null,
      assignment: null
    };

    if (rule.aggregationType === "sum_below_threshold" && !this.isValidRuleContext(rule, context)) {
      return null;
    }

    context.device = this.getDevice(context.deviceID, context.bridge);
    context.assignment = this.getDeviceAssignment(context.deviceID, context.bridge);
    context.individualID = this.getAssignmentIndividualID(context.assignment);
    context.roomID = this.getAssignmentRoomID(context.assignment);

    return context;
  }

  isValidRuleContext(rule, context) {
    if (String(rule.sourceProperty || "").trim() === "") {
      return false;
    }

    if (String(context.deviceID || "").trim() === "" || String(context.bridge || "").trim() === "") {
      return false;
    }

    return true;
  }

  /**
   * Aggregates history for a configured rule.
   * @param {Object} rule
   * @param {Object} context
   * @param {string} property
   * @returns {Object|null}
   */
  getRuleAggregation(rule, context, property) {
    const aggregationWindowHours = Math.max(1, Number(rule.aggregationWindowHours) || 24);
    const thresholdTimestamp = Date.now() - (aggregationWindowHours * 60 * 60 * 1000);

    const result = database.prepare(
      "SELECT COUNT(*) AS readings, COALESCE(SUM(valueAsNumeric), 0) AS total FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? AND property = ? AND dateTimeAsNumeric >= ?"
    ).get(context.deviceID, context.bridge, property, thresholdTimestamp);

    if (!result) {
      return null;
    }

    return {
      readings: Number(result.readings) || 0,
      total: Number(result.total) || 0,
      aggregationWindowHours: aggregationWindowHours
    };
  }

  ruleThresholdReached(rule, aggregation) {
    if (rule.aggregationType === "sum_below_threshold") {
      return aggregation.total < Number(rule.thresholdMin || 0);
    }

    return false;
  }

  ruleScore(rule, aggregation) {
    if (rule.aggregationType !== "sum_below_threshold") {
      return 0;
    }

    const threshold = Number(rule.thresholdMin || 0);
    if (threshold <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(1, (threshold - aggregation.total) / threshold));
  }

  resolveOpenInsights(filters) {
    const conditions = ["status IN ('open', 'acknowledged')"];
    const params = [];

    if (filters.ruleID !== undefined) {
      conditions.push("ruleID = ?");
      params.push(filters.ruleID);
    }
    if (filters.type !== undefined) {
      conditions.push("type = ?");
      params.push(filters.type);
    }
    if (filters.deviceID !== undefined) {
      conditions.push("deviceID = ?");
      params.push(filters.deviceID);
    }
    if (filters.bridge !== undefined) {
      conditions.push("bridge = ?");
      params.push(filters.bridge);
    }
    if (filters.property !== undefined) {
      conditions.push("property = ?");
      params.push(filters.property);
    }

    const where = conditions.join(" AND ");

    const insights = database.prepare(
      "SELECT * FROM care_insights WHERE " + where + " ORDER BY insightID DESC"
    ).all(...params);

    if (insights.length === 0) {
      return;
    }

    database.prepare(
      "UPDATE care_insights SET status = 'resolved', dateTimeResolved = datetime('now', 'localtime'), dateTimeUpdated = datetime('now', 'localtime') WHERE " + where
    ).run(...params);

    insights.forEach((insight) => {
      const resolvedInsight = database.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insight.insightID);
      CareInsightsEngine.triggerScenarioEvent("care_insight_resolved", resolvedInsight);
    });
  }

  /**
   * Creates or updates an open Care Insight.
   * @param {Object} payload
   * @returns {Object}
   */
  upsertInsight(payload) {
    const existing = database.prepare(
      "SELECT * FROM care_insights WHERE ifnull(ruleID, 0) = ifnull(?, 0) AND type = ? AND ifnull(deviceID, '') = ifnull(?, '') AND ifnull(bridge, '') = ifnull(?, '') AND ifnull(property, '') = ifnull(?, '') AND status IN ('open', 'acknowledged') ORDER BY insightID DESC LIMIT 1"
    ).get(payload.ruleID || 0, payload.type, payload.deviceID || "", payload.bridge || "", payload.property || "");

    let insightID;
    let notify = false;
    let eventType = "";

    if (existing) {
      const previousRank = this.severityRank(existing.severity);
      const nextRank     = this.severityRank(payload.severity);
      const hasChanged   = existing.severity !== payload.severity || Number(existing.score) !== Number(payload.score) || existing.title !== payload.title || existing.summary !== payload.summary || existing.explanation !== payload.explanation || existing.recommendation !== payload.recommendation || Number(existing.individualID) !== Number(payload.individualID || 0) || Number(existing.roomID) !== Number(payload.roomID || 0);

      database.prepare(
        "UPDATE care_insights SET ruleID = ?, severity = ?, score = ?, title = ?, summary = ?, explanation = ?, recommendation = ?, individualID = ?, roomID = ?, source = ?, dateTimeUpdated = datetime('now', 'localtime') WHERE insightID = ?"
      ).run(payload.ruleID || 0, payload.severity, payload.score, payload.title, payload.summary, payload.explanation, payload.recommendation, payload.individualID || 0, payload.roomID || 0, payload.source, existing.insightID);

      insightID = existing.insightID;
      notify    = nextRank > previousRank;
      eventType = hasChanged ? "care_insight_updated" : "";
    }
    else {
      const result = database.prepare(
        "INSERT INTO care_insights (ruleID, type, status, severity, score, title, summary, explanation, recommendation, deviceID, bridge, property, individualID, roomID, source, dateTimeAdded, dateTimeUpdated) VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))"
      ).run(payload.ruleID || 0, payload.type, payload.severity, payload.score, payload.title, payload.summary, payload.explanation, payload.recommendation, payload.deviceID || null, payload.bridge || null, payload.property || null, payload.individualID || 0, payload.roomID || 0, payload.source || "careinsights");

      insightID = result.lastInsertRowid;
      notify    = true;
      eventType = "care_insight_opened";
    }

    const insight = database.prepare("SELECT * FROM care_insights WHERE insightID = ?").get(insightID);
    if (notify) {
      this.createNotification(insight);
      mqttClient.publish("server/care-insights", JSON.stringify({
        status: "ok",
        insightID: insight.insightID,
        type: insight.type,
        severity: insight.severity,
        title: insight.title
      }));
    }

    if (eventType !== "") {
      CareInsightsEngine.triggerScenarioEvent(eventType, insight);
    }

    return insight;
  }

  /**
   * Stores a signal row for a Care Insight.
   * @param {number} insightID
   * @param {Object} signal
   */
  insertSignal(insightID, signal) {
    database.prepare(
      "INSERT INTO care_insight_signals (insightID, deviceID, bridge, property, value, valueAsNumeric, weight, dateTimeObserved) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))"
    ).run(insightID, signal.deviceID || null, signal.bridge || null, signal.property || null, signal.value || null, signal.valueAsNumeric ?? null, signal.weight ?? 1);

    const maxSignals = appConfig.CONF_careInsightsMaxSignalsPerInsight || 50;
    database.prepare(
      "DELETE FROM care_insight_signals WHERE insightID = ? AND signalID NOT IN (SELECT signalID FROM care_insight_signals WHERE insightID = ? ORDER BY signalID DESC LIMIT ?)"
    ).run(insightID, insightID, maxSignals);
  }

  /**
   * Creates a notification entry for a new or escalated Care Insight.
   * @param {Object} insight
   */
  createNotification(insight) {
    database.prepare(
      "INSERT INTO notifications (text, description, insightID, icon, dateTime) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))"
    ).run(insight.title, insight.summary, insight.insightID, this.iconForSeverity(insight.severity));
  }

  /**
   * Loads a device from the database.
   * @param {string} deviceID
   * @param {string} bridge
   * @returns {Object|null}
   */
  getDevice(deviceID, bridge) {
    const result = database.prepare("SELECT * FROM devices WHERE deviceID = ? AND bridge = ? LIMIT 1").get(deviceID, bridge);

    if (!result) {
      return null;
    }

    return result;
  }

  getDeviceAssignment(deviceID, bridge) {
    return database.prepare(
      "SELECT * FROM device_assignments WHERE deviceID = ? AND bridge = ? LIMIT 1"
    ).get(deviceID, bridge) || null;
  }

  getAssignmentIndividualID(assignment) {
    if ((assignment === null) || (assignment === undefined)) {
      return 0;
    }

    return Number(assignment.individualID) || 0;
  }

  getAssignmentRoomID(assignment) {
    if ((assignment === null) || (assignment === undefined)) {
      return 0;
    }

    return Number(assignment.roomID) || 0;
  }

  buildRuleTitle(rule, device) {
    if ((rule.title !== undefined) && (String(rule.title).trim() !== "")) {
      return String(rule.title).trim();
    }

    return this.getDeviceName(device) + " requires attention";
  }

  buildRuleSummary(rule, aggregation, context) {
    const label = this.buildRuleContextLabel(context);

    if (rule.aggregationType === "sum_below_threshold") {
      return label + " stayed below the configured total for '" + rule.sourceProperty + "' in the last " + aggregation.aggregationWindowHours + " hours (current total: " + aggregation.total + ", expected minimum: " + Number(rule.thresholdMin || 0) + ").";
    }

    return label + " matched the configured Care Insight rule.";
  }

  buildRuleExplanation(rule, aggregation) {
    if (rule.aggregationType === "sum_below_threshold") {
      return "The rolling sum for '" + rule.sourceProperty + "' across " + aggregation.readings + " readings is " + aggregation.total + " within the last " + aggregation.aggregationWindowHours + " hours.";
    }

    return "A configured Care Insight rule became active.";
  }

  buildRuleContextLabel(context) {
    if (Number(context.individualID) > 0) {
      const individual = database.prepare("SELECT firstname, lastname FROM individuals WHERE individualID = ? LIMIT 1").get(context.individualID);

      if (individual) {
        return individual.firstname + " " + individual.lastname;
      }
    }

    return this.getDeviceName(context.device);
  }

  static triggerScenarioEvent(eventType, insight) {
    if ((global.scenarios === undefined) || (insight === undefined) || (insight === null)) {
      return;
    }

    global.scenarios.handleEvent(eventType, CareInsightsEngine.buildScenarioEventData(insight));
  }

  static buildScenarioEventData(insight) {
    return {
      insightID: insight.insightID,
      ruleID: Number(insight.ruleID) || 0,
      insightType: insight.type,
      severity: insight.severity,
      score: Number(insight.score) || 0,
      status: insight.status,
      deviceID: insight.deviceID || "",
      bridge: insight.bridge || "",
      property: insight.property || "",
      individualID: Number(insight.individualID) || 0,
      roomID: Number(insight.roomID) || 0
    };
  }

  buildNumericSummary(device, property, value) {
    const deviceName = this.getDeviceName(device);
    return deviceName + " reported an unusual value for '" + property + "' (latest value: " + value + ").";
  }

  buildNumericExplanation(property, value, deviation) {
    return "The latest '" + property + "' value (" + value + ") deviates strongly from its recent baseline. Median: " + deviation.median + ", normalized deviation: " + deviation.normalizedDeviation.toFixed(2) + ".";
  }

  buildConnectivitySummary(device) {
    const deviceName = this.getDeviceName(device);
    return deviceName + " went offline and may stop providing monitoring data.";
  }

  /**
   * Returns a readable device name.
   * @param {Object|null} device
   * @returns {string}
   */
  getDeviceName(device) {
    if ((device !== null) && (device !== undefined)) {
      if ((device.name !== undefined) && (device.name !== "")) {
        return device.name;
      }

      if ((device.productName !== undefined) && (device.productName !== "")) {
        return device.productName;
      }
    }

    return "Device";
  }

  isNumericValue(valueData) {
    if (!valueData) {
      return false;
    }

    if (!Number.isFinite(Number(valueData.valueAsNumeric))) {
      return false;
    }

    return true;
  }

  median(values) {
    if (!values || values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
  }

  severityFromScore(score) {
    if (score >= 0.9) {
      return "critical";
    }

    if (score >= 0.75) {
      return "high";
    }

    if (score >= 0.6) {
      return "medium";
    }

    return "low";
  }

  severityRank(severity) {
    const rank = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4
    };

    return rank[severity] || 0;
  }

  iconForSeverity(severity) {
    switch (severity) {
      case "critical":
        return "warning";
      case "high":
        return "alert-circle";
      case "medium":
        return "analytics";
      default:
        return "information-circle";
    }
  }
}

module.exports = CareInsightsEngine;
