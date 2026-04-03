/**
 * =============================================================================================
 * Care Insights Engine
 * =============================================================================================
 */

const appConfig    = require("../../config");
const translations = require("../../i18n.json");

class CareInsightsEngine {
  /**
   * Creates a new Care Insights engine instance.
   */
  constructor() {
  }

  /**
   * Returns a translated string from i18n.json for the configured language.
   * Supports placeholder replacement: {0}, {1}, {2}, etc.
   * @param {string} key
   * @param  {...any} args
   * @returns {string}
   */
  translate(key, ...args) {
    const lang  = appConfig.CONF_careInsightsLanguage;
    const entry = translations[key];
    let text    = (entry && entry[lang]) ? entry[lang] : (entry && entry["en"]) ? entry["en"] : key;

    args.forEach((arg, index) => {
      text = text.replace("{" + index + "}", arg);
    });

    return text;
  }

  /**
   * Handles device values and evaluates configured Care Insight rules.
   * @param {Object} data
   */
  handleDeviceValues(data) {
    try {
      if (appConfig.CONF_careInsightsActive !== true || !data || !data.values) { // Skip all processing when Care Insights are disabled or payload is incomplete.
        return;
      }

      Object.entries(data.values).forEach(([property, valueData]) => {
        this.evaluateConfiguredRules(data, property, valueData);
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
     
      if (appConfig.CONF_careInsightsActive !== true || !data || !data.deviceID || !data.bridge || !data.status) { // Device status insights require device identity and a status value.
        return;
      }

      if (data.status === "offline") {
        const device     = this.getDevice(data.deviceID, data.bridge);
        const assignment = this.getDeviceAssignment(data.deviceID, data.bridge);

        // "offline" opens or updates a connectivity risk insight.
        const insight = this.upsertInsight({
          ruleID: 0,
          type: "device_connectivity_risk",
          score: 0.9,
          title: this.translate("CareInsightTitleDeviceOffline"),
          summary: this.buildConnectivitySummary(device),
          explanation: this.translate("CareInsightExplanationDeviceOffline"),
          recommendation: this.translate("CareInsightRecommendationDeviceOffline"),
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
        // "online" resolves open connectivity risks for the same device.
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
    // Load recent history in descending order; newest reading is at index 0.
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
      // Robust variant: median absolute deviation scaled to approximately standard deviation.
      normalizedDeviation = Math.abs(latest - median) / (mad * 1.4826);
    }
    else {
      // Fallback for perfectly flat baseline where MAD is zero.
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
    const rules = this.getMatchingRules(property);

    rules.forEach((rule) => {
      const context = this.buildRuleContext(rule, data.deviceID, data.bridge);

      if (!context) {
        return;
      }

      if (rule.aggregationType === "anomaly_detection") {
        this.evaluateAnomalyRule(rule, data, property, valueData, context);
        return;
      }

      const aggregation = this.getRuleAggregation(rule, context, property);
      const minReadings = Number(rule.minReadings) || 1;

      if (!aggregation || aggregation.readings < minReadings) {
        return;
      }

      if (this.ruleThresholdReached(rule, aggregation) !== true) {
        this.resolveOpenInsights({ ruleID: rule.ruleID, deviceID: context.deviceID, bridge: context.bridge, property: property });
        return;
      }

      const insight = this.upsertInsight({
        ruleID: rule.ruleID,
        type: rule.aggregationType,
        score: this.ruleScore(rule, aggregation),
        title: this.buildRuleTitle(rule, context.device),
        summary: this.buildRuleSummary(rule, aggregation, context),
        explanation: this.buildRuleExplanation(rule, aggregation),
        recommendation: rule.recommendation || this.translate("CareInsightRecommendationDefault"),
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
   * Evaluates an anomaly detection rule for one incoming value.
   * @param {Object} rule
   * @param {Object} data
   * @param {string} property
   * @param {Object} valueData
   * @param {Object} context
   */
  evaluateAnomalyRule(rule, data, property, valueData, context) {
    if (!this.isNumericValue(valueData)) {
      return;
    }

    const deviation = this.getDeviationScore(data.deviceID, data.bridge, property);
    if (!deviation) {
      return;
    }

    const threshold = Number(rule.thresholdMin) || appConfig.CONF_careInsightsAnomalyThreshold;

    if (deviation.score < threshold) {
      this.resolveOpenInsights({ ruleID: rule.ruleID, type: "anomaly_detection", deviceID: data.deviceID, bridge: data.bridge, property: property });
      return;
    }

    const insight = this.upsertInsight({
      ruleID: rule.ruleID,
      type: "anomaly_detection",
      score: deviation.score,
      title: this.buildRuleTitle(rule, context.device),
      summary: this.buildNumericSummary(context.device, property, valueData.value),
      explanation: this.buildNumericExplanation(property, valueData.value, deviation),
      recommendation: rule.recommendation || this.translate("CareInsightRecommendationAnomaly"),
      deviceID: data.deviceID,
      bridge: data.bridge,
      property: property,
      individualID: context.individualID,
      roomID: context.roomID,
      source: "careinsights_rule"
    });

    this.insertSignal(insight.insightID, {
      deviceID: data.deviceID,
      bridge: data.bridge,
      property: property,
      value: String(valueData.value),
      valueAsNumeric: valueData.valueAsNumeric,
      weight: deviation.score
    });
  }

  /**
   * Returns all active rules matching a property.
   * @param {string} property
   * @returns {Array}
   */
  getMatchingRules(property) {
    return database.prepare(
      "SELECT * FROM care_insight_rules WHERE enabled = 1 AND sourceProperty = ? ORDER BY ruleID ASC"
    ).all(property);
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
      deviceID: deviceID,
      bridge: bridge,
      individualID: 0,
      roomID: 0,
      device: null,
      assignment: null
    };
    context.device = this.getDevice(context.deviceID, context.bridge);
    context.assignment = this.getDeviceAssignment(context.deviceID, context.bridge);
    context.individualID = this.getAssignmentIndividualID(context.assignment);
    context.roomID = this.getAssignmentRoomID(context.assignment);

    if (!this.isValidRuleContext(rule, context)) {
      return null;
    }

    return context;
  }

  /**
   * Validates whether a rule context contains all required values.
   * @param {Object} rule
   * @param {Object} context
   * @returns {boolean}
   */
  isValidRuleContext(rule, context) {
    // A rule can only be evaluated when it has a property and a concrete device target.
    if (!rule) {
      return false;
    }

    const hasProperty = (rule.sourceProperty !== undefined) && (String(rule.sourceProperty).trim() !== "");
    const hasDeviceID = (context.deviceID !== undefined) && (String(context.deviceID).trim() !== "");
    const hasBridge = (context.bridge !== undefined) && (String(context.bridge).trim() !== "");

    if (!hasProperty || !hasDeviceID || !hasBridge) {
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

  /**
   * Evaluates whether a rule threshold is currently reached.
   * @param {Object} rule
   * @param {Object} aggregation
   * @returns {boolean}
   */
  ruleThresholdReached(rule, aggregation) {
    if (rule.aggregationType === "sum_below_threshold") {
      return aggregation.total < Number(rule.thresholdMin || 0);
    }

    return false;
  }

  /**
   * Calculates a normalized score (0..1) for a triggered rule.
   * @param {Object} rule
   * @param {Object} aggregation
   * @returns {number}
   */
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

  /**
   * Resolves all currently open insights matching the provided filters.
   * @param {Object} filters
   * @returns {void}
   */
  resolveOpenInsights(filters) {
    // Start with open/acknowledged entries and narrow down via provided filters.
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
      const hasScoreChanged = Number(existing.score) !== Number(payload.score);
      const hasTitleChanged = existing.title !== payload.title;
      const hasSummaryChanged = existing.summary !== payload.summary;
      const hasExplanationChanged = existing.explanation !== payload.explanation;
      const hasRecommendationChanged = existing.recommendation !== payload.recommendation;
      const hasIndividualChanged = Number(existing.individualID) !== Number(payload.individualID || 0);
      const hasRoomChanged = Number(existing.roomID) !== Number(payload.roomID || 0);

      const hasChanged = hasScoreChanged || hasTitleChanged || hasSummaryChanged || hasExplanationChanged || hasRecommendationChanged || hasIndividualChanged || hasRoomChanged;

      database.prepare(
        "UPDATE care_insights SET ruleID = ?, score = ?, title = ?, summary = ?, explanation = ?, recommendation = ?, individualID = ?, roomID = ?, source = ?, dateTimeUpdated = datetime('now', 'localtime') WHERE insightID = ?"
      ).run(payload.ruleID || 0, payload.score, payload.title, payload.summary, payload.explanation, payload.recommendation, payload.individualID || 0, payload.roomID || 0, payload.source, existing.insightID);

      insightID = existing.insightID;
      notify    = false;
      eventType = hasChanged ? "care_insight_updated" : "";
    }
    else {
      const result = database.prepare(
        "INSERT INTO care_insights (ruleID, type, status, score, title, summary, explanation, recommendation, deviceID, bridge, property, individualID, roomID, source, dateTimeAdded, dateTimeUpdated) VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))"
      ).run(payload.ruleID || 0, payload.type, payload.score, payload.title, payload.summary, payload.explanation, payload.recommendation, payload.deviceID || null, payload.bridge || null, payload.property || null, payload.individualID || 0, payload.roomID || 0, payload.source || "careinsights");

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
    const signalDeviceID = signal.deviceID || null;
    const signalBridge = signal.bridge || null;
    const signalProperty = signal.property || null;
    const signalValue = signal.value || null;
    const signalValueAsNumeric = signal.valueAsNumeric ?? null;
    const signalWeight = signal.weight ?? 1;

    database.prepare(
      "INSERT INTO care_insight_signals (insightID, deviceID, bridge, property, value, valueAsNumeric, weight, dateTimeObserved) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))"
    ).run(insightID, signalDeviceID, signalBridge, signalProperty, signalValue, signalValueAsNumeric, signalWeight);

    // Keep only the newest N signals per insight to prevent unbounded growth.
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
    ).run(insight.title, insight.summary, insight.insightID, "information-circle");
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

  /**
   * Loads a device assignment from the database.
   * @param {string} deviceID
   * @param {string} bridge
   * @returns {Object|null}
   */
  getDeviceAssignment(deviceID, bridge) {
    const result = database.prepare(
      "SELECT * FROM device_assignments WHERE deviceID = ? AND bridge = ? LIMIT 1"
    ).get(deviceID, bridge);

    if (!result) {
      return null;
    }

    return result;
  }

  /**
   * Returns individualID from an assignment object.
   * @param {Object|null} assignment
   * @returns {number}
   */
  getAssignmentIndividualID(assignment) {
    if ((assignment === null) || (assignment === undefined)) {
      return 0;
    }

    return Number(assignment.individualID) || 0;
  }

  /**
   * Returns roomID from an assignment object.
   * @param {Object|null} assignment
   * @returns {number}
   */
  getAssignmentRoomID(assignment) {
    if ((assignment === null) || (assignment === undefined)) {
      return 0;
    }

    return Number(assignment.roomID) || 0;
  }

  /**
   * Builds the display title for a rule-based insight.
   * @param {Object} rule
   * @param {Object|null} device
   * @returns {string}
   */
  buildRuleTitle(rule, device) {
    if ((rule.title !== undefined) && (String(rule.title).trim() !== "")) {
      return String(rule.title).trim();
    }

    return this.translate("CareInsightTitleFallback", this.getDeviceName(device));
  }

  /**
   * Builds a short summary for a rule-based insight.
   * @param {Object} rule
   * @param {Object} aggregation
   * @param {Object} context
   * @returns {string}
   */
  buildRuleSummary(rule, aggregation, context) {
    const label = this.buildRuleContextLabel(context);

    if (rule.aggregationType === "sum_below_threshold") {
      return this.translate("CareInsightSummarySumBelow", label, rule.sourceProperty, aggregation.aggregationWindowHours, aggregation.total, Number(rule.thresholdMin || 0));
    }

    return this.translate("CareInsightSummaryRuleMatched", label);
  }

  /**
   * Builds the technical explanation for a rule-based insight.
   * @param {Object} rule
   * @param {Object} aggregation
   * @returns {string}
   */
  buildRuleExplanation(rule, aggregation) {
    if (rule.aggregationType === "sum_below_threshold") {
      return this.translate("CareInsightExplanationSumBelow", rule.sourceProperty, aggregation.readings, aggregation.total, aggregation.aggregationWindowHours);
    }

    return this.translate("CareInsightExplanationRuleActive");
  }

  /**
   * Builds a context label for summaries (individual full name or device name).
   * @param {Object} context
   * @returns {string}
   */
  buildRuleContextLabel(context) {
    if (Number(context.individualID) > 0) {
      const individual = database.prepare("SELECT firstname, lastname FROM individuals WHERE individualID = ? LIMIT 1").get(context.individualID);

      if (individual) {
        return individual.firstname + " " + individual.lastname;
      }
    }

    return this.getDeviceName(context.device);
  }

  /**
   * Forwards a Care Insight event to the Scenario Engine.
   * @param {string} eventType
   * @param {Object} insight
   * @returns {void}
   */
  static triggerScenarioEvent(eventType, insight) {
    if ((global.scenarios === undefined) || (insight === undefined) || (insight === null)) {
      return;
    }

    global.scenarios.handleEvent(eventType, CareInsightsEngine.buildScenarioEventData(insight));
  }

  /**
   * Builds normalized event payload data for Scenario Engine evaluation.
   * @param {Object} insight
   * @returns {Object}
   */
  static buildScenarioEventData(insight) {
    const ruleID = Number(insight.ruleID) || 0;
    const score = Number(insight.score) || 0;
    const individualID = Number(insight.individualID) || 0;
    const roomID = Number(insight.roomID) || 0;

    return {
      insightID: insight.insightID,
      ruleID: ruleID,
      insightType: insight.type,
      score: score,
      status: insight.status,
      deviceID: insight.deviceID || "",
      bridge: insight.bridge || "",
      property: insight.property || "",
      individualID: individualID,
      roomID: roomID
    };
  }

  /**
   * Builds summary text for numeric anomaly insights.
   * @param {Object|null} device
   * @param {string} property
   * @param {string|number} value
   * @returns {string}
   */
  buildNumericSummary(device, property, value) {
    const deviceName = this.getDeviceName(device);
    return this.translate("CareInsightSummaryAnomaly", deviceName, property, value);
  }

  /**
   * Builds explanation text for numeric anomaly insights.
   * @param {string} property
   * @param {string|number} value
   * @param {Object} deviation
   * @returns {string}
   */
  buildNumericExplanation(property, value, deviation) {
    return this.translate("CareInsightExplanationAnomaly", property, value, deviation.median, deviation.normalizedDeviation.toFixed(2));
  }

  /**
   * Builds summary text for connectivity insights.
   * @param {Object|null} device
   * @returns {string}
   */
  buildConnectivitySummary(device) {
    const deviceName = this.getDeviceName(device);
    return this.translate("CareInsightSummaryDeviceOffline", deviceName);
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

    return this.translate("CareInsightDeviceFallback");
  }

  /**
   * Checks whether a device value payload contains a valid numeric value.
   * @param {Object} valueData
   * @returns {boolean}
   */
  isNumericValue(valueData) {
    if (!valueData) {
      return false;
    }

    const numericValue = Number(valueData.valueAsNumeric);

    if (!Number.isFinite(numericValue)) {
      return false;
    }

    return true;
  }

  /**
   * Calculates the median for a list of numeric values.
   * @param {number[]} values
   * @returns {number}
   */
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

}

module.exports = CareInsightsEngine;
