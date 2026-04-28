/**
 * =============================================================================================
 * Alerts Engine
 * =============================================================================================
 */

const appConfig    = require("../../config");
const translations = require("../../i18n.json");
const common       = require("../../common");

class AlertsEngine {
  /**
   * Creates a new Alerts engine instance
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
    const lang  = appConfig.CONF_alertsLanguage;
    const entry = translations[key];
    let text    = (entry && entry[lang]) ? entry[lang] : (entry && entry["en"]) ? entry["en"] : key;

    args.forEach((arg, index) => {
      text = text.replace("{" + index + "}", arg);
    });

    return text;
  }

  /**
   * Handles device values and evaluates configured alert rules.
   * @param {Object} data
   */
  handleDeviceValues(data) {
    try {
      if (appConfig.CONF_alertsActive !== true || !data || !data.values) { // Skip all processing when Alerts are disabled or payload is incomplete
        return;
      }

      Object.entries(data.values).forEach(([property, valueData]) => {
        this.evaluateConfiguredRules(data, property, valueData);
      });
    }
    catch (error) {
      common.conLog("Alerts: Error while processing device values: " + error.message, "red");
    }
  }

  /**
   * Handles device online and offline status updates.
   * @param {Object} data
   */
  handleDeviceStatus(data) {
    try {
      if (appConfig.CONF_alertsActive !== true || !data || !data.uuid || !data.bridge || !data.status) { // Device status alerts require device identity and a status value
        return;
      }

      const device    = this.getDevice(data.uuid, data.bridge);
      const deviceID  = device?.deviceID || null;

      if (data.status === "offline") { // "offline" opens or updates a connectivity risk alert
        const alert = this.upsertAlert({
          ruleID:         0,
          type:           "device_connectivity_risk",
          score:          0.9,
          title:          this.translate("alertTitleDeviceOffline"),
          summary:        this.buildConnectivitySummary(device),
          explanation:    this.translate("alertExplanationDeviceOffline"),
          recommendation: this.translate("alertRecommendationDeviceOffline"),
          deviceID:       deviceID,
          property:       "status",
          individualID:   Number(device?.individualID) || 0,
          roomID:         Number(device?.roomID) || 0,
          source:         "alerts"
        });

        this.insertSignal(alert.alertID, {
          deviceID:       deviceID,
          property:       "status",
          value:          "offline",
          valueAsNumeric: 0,
          weight:         0.9
        });
        return;
      }

      if (data.status === "online") { // "online" resolves open connectivity risks for the same device
        this.resolveOpenAlerts({ type: "device_connectivity_risk", deviceID: deviceID });
      }
    }
    catch (error) {
      common.conLog("Alerts: Error while processing device status: " + error.message, "red");
    }
  }

  /**
   * Calculates a normalized deviation score for a numeric property.
   * @param {number} deviceID - Numeric FK to devices table
   * @param {string} property
   * @returns {Object|null}
   */
  getDeviationScore(deviceID, property) {
    const history = database.prepare( // Load recent history in descending order; newest reading is at index 0
      "SELECT valueAsNumeric FROM mqtt_history_devices_values WHERE deviceID = ? AND property = ? ORDER BY dateTimeAsNumeric DESC LIMIT ?"
    ).all(deviceID, property, appConfig.CONF_alertsHistorySize);

    if (!history || history.length < appConfig.CONF_alertsMinHistoryEntries) {
      return null;
    }

    const values = history
      .map((entry) => Number(entry.valueAsNumeric))
      .filter((entry) => Number.isFinite(entry));

    if (values.length < appConfig.CONF_alertsMinHistoryEntries) {
      return null;
    }

    const latest      = values[0];
    const baseline    = values.slice(1);
    const median      = this.median(baseline);
    const deviations  = baseline.map((entry) => Math.abs(entry - median));
    const mad         = this.median(deviations);

    let normalizedDeviation;

    if (mad > 0) { // Robust variant: median absolute deviation scaled to approximately standard deviation
      normalizedDeviation = Math.abs(latest - median) / (mad * 1.4826);
    }
    else { // Fallback for perfectly flat baseline where MAD is zero
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
      score:                Math.max(0, Math.min(1, normalizedDeviation / 6)),
      latest:               latest,
      median:               median,
      normalizedDeviation:  normalizedDeviation
    };
  }

  /**
   * Evaluates configured alert rules for one incoming value.
   * @param {Object} data
   * @param {string} property
   * @param {Object} valueData
   */
  evaluateConfiguredRules(data, property, valueData) {
    const rules = this.getMatchingRules(property);

    rules.forEach((rule) => {
      const context = this.buildRuleContext(rule, data.uuid, data.bridge);

      if (!context) {
        return;
      }

      if (rule.aggregationType === "AnomalyDetection") {
        this.evaluateAnomalyRule(rule, data, property, valueData, context);
        return;
      }

      const aggregation = this.getRuleAggregation(rule, context, property);
      const minReadings = Number(rule.minReadings) || 1;

      if (!aggregation || aggregation.readings < minReadings) {
        return;
      }

      if (this.ruleThresholdReached(rule, aggregation) !== true) {
        this.resolveOpenAlerts({ ruleID: rule.ruleID, deviceID: context.deviceID, property: property });
      }
      else {
        const alert = this.upsertAlert({
          ruleID:           rule.ruleID,
          type:             rule.aggregationType,
          score:            this.ruleScore(rule, aggregation),
          title:            this.buildRuleTitle(rule, context.device),
          summary:          this.buildRuleSummary(rule, aggregation, context),
          explanation:      this.buildRuleExplanation(rule, aggregation),
          recommendation:   rule.recommendation || this.translate("alertRecommendationDefault"),
          deviceID:         context.deviceID,
          property:         property,
          individualID:     context.individualID,
          roomID:           context.roomID,
          source:           "alerts_rule"
        });

        this.insertSignal(alert.alertID, {
          deviceID:       context.deviceID,
          property:       property,
          value:          String(valueData.value ?? valueData.valueAsNumeric ?? ""),
          valueAsNumeric: valueData.valueAsNumeric ?? null,
          weight:         aggregation.total
        });
      }
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

    const deviation = this.getDeviationScore(context.deviceID, property);
    if (!deviation) {
      return;
    }

    const threshold = Number(rule.thresholdMin) || appConfig.CONF_alertsAnomalyThreshold;

    if (deviation.score < threshold) {
      this.resolveOpenAlerts({ ruleID: rule.ruleID, type: "AnomalyDetection", deviceID: context.deviceID, property: property });
      return;
    }

    const alert = this.upsertAlert({
      ruleID:           rule.ruleID,
      type:             "AnomalyDetection",
      score:            deviation.score,
      title:            this.buildRuleTitle(rule, context.device),
      summary:          this.buildNumericSummary(context.device, property, valueData.value),
      explanation:      this.buildNumericExplanation(property, valueData.value, deviation),
      recommendation:   rule.recommendation || this.translate("alertRecommendationAnomaly"),
      deviceID:         context.deviceID,
      property:         property,
      individualID:     context.individualID,
      roomID:           context.roomID,
      source:           "alerts_rule"
    });

    this.insertSignal(alert.alertID, {
      deviceID:       context.deviceID,
      property:       property,
      value:          String(valueData.value),
      valueAsNumeric: valueData.valueAsNumeric,
      weight:         deviation.score
    });
  }

  /**
   * Returns all active rules matching a property.
   * @param {string} property
   * @returns {Array}
   */
  getMatchingRules(property) {
    return database.prepare("SELECT * FROM alert_rules WHERE enabled = 1 AND sourceProperty = ? ORDER BY ruleID ASC").all(property);
  }

  /**
   * Builds the context that an alert rule operates on.
   * @param {Object} rule
   * @param {string} uuid
   * @param {string} bridge
   * @returns {Object|null}
   */
  buildRuleContext(rule, uuid, bridge) {
    const device = this.getDevice(uuid, bridge);

    const context = {
      deviceID:     device?.deviceID || null,
      uuid:         uuid,
      bridge:       bridge,
      individualID: Number(device?.individualID) || 0,
      roomID:       Number(device?.roomID) || 0,
      device:       device,
    };

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
    if (!rule) { // A rule can only be evaluated when it has a property and a concrete device target
      return false;
    }

    const hasProperty = (rule.sourceProperty !== undefined) && (String(rule.sourceProperty).trim() !== "");
    const hasDeviceID = (context.deviceID !== null) && (context.deviceID !== undefined);
    const hasBridge   = (context.bridge !== undefined) && (String(context.bridge).trim() !== "");

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
      "SELECT COUNT(*) AS readings, COALESCE(SUM(valueAsNumeric), 0) AS total FROM mqtt_history_devices_values WHERE deviceID = ? AND property = ? AND dateTimeAsNumeric >= ?"
    ).get(context.deviceID, property, thresholdTimestamp);

    if (!result) {
      return null;
    }

    return {
      readings:               Number(result.readings) || 0,
      total:                  Number(result.total) || 0,
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
    if (rule.aggregationType === "SumBelowThreshold") {
      return aggregation.total < Number(rule.thresholdMin || 0);
    }

    if (rule.aggregationType === "SumAboveThreshold") {
      return aggregation.total > Number(rule.thresholdMax || 0);
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
    if (rule.aggregationType === "SumBelowThreshold") {
      const threshold = Number(rule.thresholdMin || 0);
      if (threshold <= 0) {
        return 0;
      }
      return Math.max(0, Math.min(1, (threshold - aggregation.total) / threshold));
    }

    if (rule.aggregationType === "SumAboveThreshold") {
      const threshold = Number(rule.thresholdMax || 0);
      if (threshold <= 0) {
        return 0;
      }
      return Math.max(0, Math.min(1, (aggregation.total - threshold) / threshold));
    }

    return 0;
  }

  /**
   * Resolves all currently open alerts matching the provided filters.
   * @param {Object} filters
   * @returns {void}
   */
  resolveOpenAlerts(filters) {
    const conditions = ["status IN ('open', 'acknowledged')"]; // Start with open/acknowledged entries and narrow down via provided filters
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

    if (filters.property !== undefined) {
      conditions.push("property = ?");
      params.push(filters.property);
    }

    const where = conditions.join(" AND ");

    const alerts = database.prepare(
      "SELECT * FROM alerts WHERE " + where + " ORDER BY alertID DESC"
    ).all(...params);

    if (alerts.length === 0) {
      return;
    }

    database.prepare(
      "UPDATE alerts SET status = 'resolved', dateTimeResolved = datetime('now', 'localtime'), dateTimeUpdated = datetime('now', 'localtime') WHERE " + where
    ).run(...params);

    alerts.forEach((alert) => {
      const resolvedAlert = database.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alert.alertID);
      AlertsEngine.triggerScenarioEvent("alert_resolved", resolvedAlert);
    });
  }

  /**
   * Creates or updates an open alert. Returns the persisted alert row.
   * @param {Object} payload
   * @returns {Object}
   */
  upsertAlert(payload) {
   const existing = database.prepare(
      "SELECT * FROM alerts WHERE ifnull(ruleID, 0) = ifnull(?, 0) AND type = ? AND ifnull(deviceID, 0) = ifnull(?, 0) AND ifnull(property, '') = ifnull(?, '') AND ifnull(scenarioID, 0) = ifnull(?, 0) AND status IN ('open', 'acknowledged') ORDER BY alertID DESC LIMIT 1"
    ).get(payload.ruleID || 0, payload.type, payload.deviceID || 0, payload.property || "", payload.scenarioID || 0);

    let alertID;
    let eventType = "";

    if (existing) {
      const hasScoreChanged           = Number(existing.score) !== Number(payload.score);
      const hasTitleChanged           = existing.title !== payload.title;
      const hasSummaryChanged         = existing.summary !== payload.summary;
      const hasExplanationChanged     = existing.explanation !== payload.explanation;
      const hasRecommendationChanged  = existing.recommendation !== payload.recommendation;
      const hasIndividualChanged      = Number(existing.individualID) !== Number(payload.individualID || 0);
      const hasRoomChanged            = Number(existing.roomID) !== Number(payload.roomID || 0);

      const hasChanged = hasScoreChanged || hasTitleChanged || hasSummaryChanged || hasExplanationChanged || hasRecommendationChanged || hasIndividualChanged || hasRoomChanged;

      database.prepare(
        "UPDATE alerts SET ruleID = ?, score = ?, title = ?, summary = ?, explanation = ?, recommendation = ?, individualID = ?, roomID = ?, source = ?, dateTimeUpdated = datetime('now', 'localtime') WHERE alertID = ?"
      ).run(payload.ruleID || 0, payload.score, payload.title, payload.summary, payload.explanation, payload.recommendation, payload.individualID || 0, payload.roomID || 0, payload.source, existing.alertID);

      alertID   = existing.alertID;
      eventType = hasChanged ? "alert_updated" : "";
    }
    else {
      const result = database.prepare(
        "INSERT INTO alerts (ruleID, scenarioID, type, status, score, title, summary, explanation, recommendation, icon, deviceID, property, individualID, roomID, source, dateTimeAdded, dateTimeUpdated) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))"
      ).run(
        payload.ruleID || 0,
        payload.scenarioID || 0,
        payload.type,
        payload.score,
        payload.title,
        payload.summary,
        payload.explanation || null,
        payload.recommendation || null,
        payload.icon || null,
        payload.deviceID || null,
        payload.property || null,
        payload.individualID || 0,
        payload.roomID || 0,
        payload.source || "alerts"
      );

      alertID   = result.lastInsertRowid;
      eventType = "alert_opened";
    }

    const alert = database.prepare("SELECT * FROM alerts WHERE alertID = ?").get(alertID);

    if (eventType !== "") {
      AlertsEngine.triggerScenarioEvent(eventType, alert);
    }

    return alert;
  }

  /**
   * Creates an alert from a scenario notification/push_notification action.
   * Does NOT insert a signal and does NOT fire a scenario event (to prevent loops).
   * @param {Object} scenario
   * @param {Object} action
   * @returns {Object}
   */
  createScenarioAlert(scenario, action) {
    return this.upsertAlert({
      ruleID:         0,
      scenarioID:     scenario.scenarioID,
      type:           "ScenarioEvent",
      source:         "scenario",
      score:          0,
      title:          action.value || scenario.name,
      summary:        action.property || scenario.description || "",
      explanation:    null,
      recommendation: null,
      icon:           scenario.icon || null,
      deviceID:       null,
      property:       null,
      individualID:   scenario.individualID || 0, // pass scenario's person/room context so the
      roomID:         scenario.roomID       || 0  // alert detail page can show "Assigned person/room"
    });
  }

  /**
   * Stores a signal row for an alert.
   * @param {number} alertID
   * @param {Object} signal
   */
  insertSignal(alertID, signal) {
    const signalDeviceID        = signal.deviceID || null;
    const signalProperty        = signal.property || null;
    const signalValue           = signal.value || null;
    const signalValueAsNumeric  = signal.valueAsNumeric ?? null;
    const signalWeight          = signal.weight ?? 1;

    database.prepare(
      "INSERT INTO alert_signals (alertID, deviceID, property, value, valueAsNumeric, weight, dateTimeObserved) VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))"
    ).run(alertID, signalDeviceID, signalProperty, signalValue, signalValueAsNumeric, signalWeight);

    const maxSignals = appConfig.CONF_alertsMaxSignalsPerAlert; // Keep only the newest N signals per alert to prevent unbounded growth
    database.prepare(
      "DELETE FROM alert_signals WHERE alertID = ? AND signalID NOT IN (SELECT signalID FROM alert_signals WHERE alertID = ? ORDER BY signalID DESC LIMIT ?)"
    ).run(alertID, alertID, maxSignals);
  }

  /**
   * Loads a device from the database.
   * @param {string} uuid
   * @param {string} bridge
   * @returns {Object|null}
   */
  getDevice(uuid, bridge) {
    return common.deviceGetByUUID(uuid, bridge);
  }

  /**
   * Builds the display title for a rule-based alert.
   * @param {Object} rule
   * @param {Object|null} device
   * @returns {string}
   */
  buildRuleTitle(rule, device) {
    if ((rule.title !== undefined) && (String(rule.title).trim() !== "")) {
      return String(rule.title).trim();
    }
    else {
      return this.translate("alertTitleFallback", this.getDeviceName(device));
    }
  }

  /**
   * Builds a short summary for a rule-based alert.
   * @param {Object} rule
   * @param {Object} aggregation
   * @param {Object} context
   * @returns {string}
   */
  buildRuleSummary(rule, aggregation, context) {
    const label = this.buildRuleContextLabel(context);

    if (rule.aggregationType === "SumBelowThreshold") {
      return this.translate("alertSummarySumBelow", label, this.translateProperty(rule.sourceProperty), aggregation.aggregationWindowHours, aggregation.total, Number(rule.thresholdMin || 0));
    }
    else if (rule.aggregationType === "SumAboveThreshold") {
      return this.translate("alertSummarySumAbove", label, this.translateProperty(rule.sourceProperty), aggregation.aggregationWindowHours, aggregation.total, Number(rule.thresholdMax || 0));
    }
    else {
      return this.translate("alertSummaryRuleMatched", label);
    }
  }

  /**
   * Builds the technical explanation for a rule-based alert.
   * @param {Object} rule
   * @param {Object} aggregation
   * @returns {string}
   */
  buildRuleExplanation(rule, aggregation) {
    if (rule.aggregationType === "SumBelowThreshold") {
      return this.translate("alertExplanationSumBelow", this.translateProperty(rule.sourceProperty), aggregation.readings, aggregation.total, aggregation.aggregationWindowHours);
    }
    else if (rule.aggregationType === "SumAboveThreshold") {
      return this.translate("alertExplanationSumAbove", this.translateProperty(rule.sourceProperty), aggregation.readings, aggregation.total, aggregation.aggregationWindowHours);
    }
    else {
      return this.translate("alertExplanationRuleActive");
    }
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
    else {
      return this.getDeviceName(context.device);
    }
  }

  /**
   * Forwards an alert event to the Scenario Engine.
   * Guards against infinite loops: scenario-sourced alerts do not re-trigger scenario events.
   * @param {string} eventType
   * @param {Object} alert
   * @returns {void}
   */
  static triggerScenarioEvent(eventType, alert) {
    if ((global.scenarios === undefined) || (alert === undefined) || (alert === null)) {
      return;
    }

    if (alert.source === "scenario") { // Prevent infinite loop: scenario action → alert → alert_opened → same scenario action
      return;
    }

    global.scenarios.handleEvent(eventType, AlertsEngine.buildScenarioEventData(alert));
  }

  /**
   * Builds normalized event payload data for Scenario Engine evaluation.
   * @param {Object} alert
   * @returns {Object}
   */
  static buildScenarioEventData(alert) {
    const ruleID        = Number(alert.ruleID) || 0;
    const score         = Number(alert.score) || 0;
    const individualID  = Number(alert.individualID) || 0;
    const roomID        = Number(alert.roomID) || 0;

    let uuid   = "";
    let bridge = "";
    if (alert.deviceID) {
      const device = database.prepare("SELECT uuid, bridge FROM devices WHERE deviceID = ? LIMIT 1").get(alert.deviceID);
      if (device) {
        uuid   = device.uuid;
        bridge = device.bridge;
      }
    }

    return {
      alertID:     alert.alertID,
      ruleID:      ruleID,
      alertType:   alert.type,
      score:       score,
      status:      alert.status,
      deviceID:    alert.deviceID || null,
      uuid:        uuid,
      bridge:      bridge,
      property:    alert.property || "",
      individualID: individualID,
      roomID:      roomID
    };
  }

  /**
   * Builds summary text for numeric anomaly alerts.
   * @param {Object|null} device
   * @param {string} property
   * @param {string|number} value
   * @returns {string}
   */
  buildNumericSummary(device, property, value) {
    const deviceName = this.getDeviceName(device);
    return this.translate("alertSummaryAnomaly", deviceName, this.translateProperty(property), value);
  }

  /**
   * Builds explanation text for numeric anomaly alerts.
   * @param {string} property
   * @param {string|number} value
   * @param {Object} deviation
   * @returns {string}
   */
  buildNumericExplanation(property, value, deviation) {
    return this.translate("alertExplanationAnomaly", this.translateProperty(property), value, deviation.median, deviation.normalizedDeviation.toFixed(2));
  }

  /**
   * Builds summary text for connectivity alerts.
   * @param {Object|null} device
   * @returns {string}
   */
  buildConnectivitySummary(device) {
    const deviceName = this.getDeviceName(device);
    return this.translate("alertSummaryDeviceOffline", deviceName);
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

    return this.translate("alertDeviceFallback");
  }

  /**
   * Returns a translated label for a property name using i18n.json.
   * @param {string} property
   * @returns {string}
   */
  translateProperty(property) {
    const lang = appConfig.CONF_alertsLanguage;
    const key  = translations[property];

    if (key && key[lang]) {
      return key[lang];
    }
    else {
      return property;
    }
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

module.exports = AlertsEngine;
