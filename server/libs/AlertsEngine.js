/**
 * =============================================================================================
 * Alerts Engine
 * =============
 *
 * The engine follows one simple flow:
 * 1. Read a device value or status update.
 * 2. Find the matching alert rules and normalize their database values.
 * 3. Evaluate the rule type: sum below, sum above, anomaly, or inactivity.
 * 4. Open, update, or resolve the corresponding alert and store its signal.
 *
 * Rules describe when an alert should occur. Alerts are the user-facing events;
 * signals are the concrete device readings that support an alert. Inactivity
 * rules are evaluated by the scheduler because their trigger is missing activity.
 */

const appConfig    = require("../../config");
const translations = require("../../i18n.json");
const common       = require("../../common");

const RULE_TYPE_ANOMALY_DETECTION         = "AnomalyDetection"; // Rule type for detecting anomalies based on statistical deviations
const RULE_TYPE_SUM_BELOW_THRESHOLD       = "SumBelowThreshold"; // Rule type for triggering alerts when the sum of values falls below a specified threshold
const RULE_TYPE_SUM_ABOVE_THRESHOLD       = "SumAboveThreshold"; // Rule type for triggering alerts when the sum of values exceeds a specified threshold
const RULE_TYPE_NO_ACTIVITY_FOR_DURATION  = "NoActivityForDuration"; // Rule type for triggering alerts when no activity is detected for a specified duration
const INACTIVE_SENSOR_VALUES              = new Set(["", "0", "false", "off", "no", "inactive", "undetected", "closed", "idle"]); // values treated as "no activity" by truthy/falsy inactivity rules
const DEVICE_ALERT_SEVERITY_SCORE         = 0.9; // fixed severity for device-reported alerts (offline/low battery), which have no rule threshold to derive a score from
const MAD_TO_STDDEV_SCALE_FACTOR          = 1.4826; // scales median absolute deviation to be comparable to a standard deviation, assuming a normal distribution
const MAX_NORMALIZED_DEVIATION            = 6; // deviation (in "standard deviations") considered maximally severe; caps/normalizes the anomaly score

class AlertsEngine {
  /**
   * Creates a new Alerts engine instance
   */
  constructor() {
  }

  /**
   * =============================================================================================
   * Main functions: device events and rule evaluation
   * =================================================
   */

  /**
   * Returns a translated string from i18n.json for the configured language.
   * Supports placeholder replacement: {0}, {1}, {2}, etc.
   * @param {string} key
   * @param  {...any} args
   * @returns {string}
   */
  translate(key, ...args) {
    const lang  = appConfig.CONF_language;
    const entry = translations[key];
    let text    = key;

    if (entry && entry[lang]) {
      text = entry[lang];
    }
    else if (entry && entry.en) {
      text = entry.en;
    }

    args.forEach((arg, index) => { // Replace placeholders with corresponding arguments
      text = text.replace("{" + index + "}", arg);
    });

    return text;
  }

  /**
   * Handles device values and evaluates configured alert rules.
   * @param {Object} data
   */
  deviceValuesHandle(data) {
    try {
      if (appConfig.CONF_alertsActive !== true || !data || !data.values) { // Skip all processing when Alerts are disabled or payload is incomplete
        return;
      }

      Object.entries(data.values).forEach(([property, valueData]) => { // Iterate over each device property and its corresponding value data
        this.configuredRulesEvaluate(data, property, valueData); // Evaluate the alert rules configured for this device property and its value data
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
  deviceStatusHandle(data) {
    try {
      if (appConfig.CONF_alertsActive !== true || !data || !data.uuid || !data.bridge || !data.status) { // Device status alerts require device identity and a status value
        return;
      }

      const device    = this.deviceGet(data.uuid, data.bridge);
      const deviceID  = device?.deviceID || null;

      if (data.status === "offline") { // "offline" opens or updates a connectivity risk alert
        const alert = this.alertOpenUpdate({
          ruleID:         0,
          type:           "device_connectivity_risk",
          score:          DEVICE_ALERT_SEVERITY_SCORE,
          title:          this.translate("alertTitleDeviceOffline"),
          summary:        this.connectivitySummaryBuild(device),
          explanation:    this.translate("alertExplanationDeviceOffline"),
          recommendation: this.translate("alertRecommendationDeviceOffline"),
          deviceID:       deviceID,
          property:       "status",
          individualID:   Number(device?.individualID) || 0,
          roomID:         Number(device?.roomID) || 0,
          source:         "alerts"
        });

        this.signalInsert(alert.alertID, {
          deviceID:       deviceID,
          property:       "status",
          value:          "offline",
          valueAsNumeric: 0,
          weight:         DEVICE_ALERT_SEVERITY_SCORE
        });
        return;
      }

      if (data.status === "online") { // "online" resolves open connectivity risks for the same device
        this.alertsOpenResolve({ type: "device_connectivity_risk", deviceID: deviceID });
      }
    }
    catch (error) {
      common.conLog("Alerts: Error while processing device status: " + error.message, "red");
    }
  }

  /**
   * Handles device alerts emitted by hardware bridges.
   * @param {Object} data - Bridge alert payload with uuid, bridge, type, and type-specific values.
   */
  deviceBridgeAlertHandle(data) {
    try {
      if (appConfig.CONF_alertsActive !== true || !data || !data.uuid || !data.bridge) {
        return;
      }

      const device = this.deviceGet(data.uuid, data.bridge);
      if (!device) {
        common.conLog("Alerts: Bridge alert received for an unregistered device " + data.uuid, "yel");
        return;
      }

      if (data.type === "unresponsive") {
        this.deviceStatusHandle({ uuid: data.uuid, bridge: data.bridge, status: "offline" });
        return;
      }

      if (data.type !== "low_battery") {
        common.conLog("Alerts: Unsupported bridge alert type " + data.type, "yel");
        return;
      }

      const batteryLevel = Number(data.value);
      const threshold    = Number(data.threshold);
      if (!Number.isFinite(batteryLevel) || !Number.isFinite(threshold)) {
        common.conLog("Alerts: Invalid low-battery alert payload for device " + data.uuid, "yel");
        return;
      }

      const alert = this.alertOpenUpdate({
        ruleID:         0,
        type:           "device_low_battery",
        score:          DEVICE_ALERT_SEVERITY_SCORE,
        title:          this.translate("alertTitleLowBattery"),
        summary:        this.translate("alertSummaryLowBattery", this.deviceNameGet(device), batteryLevel, threshold),
        explanation:    null,
        recommendation: this.translate("alertRecommendationLowBattery"),
        deviceID:       device.deviceID,
        property:       "battery",
        individualID:   Number(device.individualID) || 0,
        roomID:         Number(device.roomID) || 0,
        source:         "bridge"
      });

      this.signalInsert(alert.alertID, {
        deviceID:       device.deviceID,
        property:       "battery",
        value:          String(data.value),
        valueAsNumeric: batteryLevel,
        weight:         DEVICE_ALERT_SEVERITY_SCORE
      });
    }
    catch (error) {
      common.conLog("Alerts: Error while processing bridge alert: " + error.message, "red");
    }
  }

  /**
   * Evaluates all inactivity rules against the latest qualifying reading for every
   * device that has supplied the configured property. Unlike value-based rules,
   * this method is intended to be called by a scheduler because no new event is
   * received while a device remains inactive.
   *
   * @param {number} [currentTimestamp=Date.now()]
   * @returns {void}
   */
  inactivityRulesEvaluate(currentTimestamp = Date.now()) {
    try {
      if (appConfig.CONF_alertsActive !== true) {
        return;
      }

      const rules = database.prepare("SELECT * FROM alert_rules WHERE aggregationType = ? ORDER BY ruleID ASC").all(RULE_TYPE_NO_ACTIVITY_FOR_DURATION).map((rule) => this.ruleNormalize(rule));

      rules.forEach((rule) => { // Evaluate each inactivity rule individually
        if (rule.inactivityMinutes <= 0) {
          common.conLog("Alerts: Inactivity rule " + rule.ruleID + " has no valid inactivityDurationMinutes", "yel");
          return;
        }

        const scope = this.inactivityRuleScopeResolve(rule); // Determine the scope of devices affected by this inactivity rule
        if (scope.devices.length === 0) {
          return;
        }

        // groupID=0 means all devices (evaluate per-device), else evaluate as shared group scope
        if (rule.groupID === 0) {
          scope.devices.forEach((device) => {
            this.inactivityRuleForDeviceEvaluate(rule, device, currentTimestamp);
          });
        }
        else {
          this.inactivityRuleForScopeEvaluate(rule, scope, currentTimestamp);
        }
      });
    }
    catch (error) {
      common.conLog("Alerts: Error while evaluating inactivity rules: " + error.message, "red");
    }
  }

  /**
   * Evaluates a single inactivity rule for one device.
   * @param {Object} rule
   * @param {Object} device
   * @param {number} currentTimestamp
   * @returns {void}
   */
  inactivityRuleForDeviceEvaluate(rule, device, currentTimestamp) {
    const context = {
      deviceID:     device.deviceID,
      uuid:         device.uuid,
      bridge:       device.bridge,
      individualID: Number(device.individualID) || 0,
      roomID:       Number(device.roomID) || 0,
      device:       device
    };

    if (!this.ruleContextIsValid(rule, context)) {
      return;
    }

    const activeTimeWindow = this.activeTimeWindowGet(rule); // Get the active time window for this rule, i.e. the period during which the rule should be evaluated
    if (activeTimeWindow && !this.timestampIsInActiveTimeWindow(currentTimestamp, activeTimeWindow)) {
      this.alertsOpenResolve({ ruleID: rule.ruleID, deviceID: context.deviceID, property: rule.property }); // Resolve any open alerts for this device and rule since it is outside the active time window
      return;
    }

    const lastActiveReading = this.lastActiveReadingGet(context.deviceID, rule); // Get the last active reading for this device and rule
    if (!lastActiveReading) {
      this.alertsOpenResolve({ ruleID: rule.ruleID, deviceID: context.deviceID, property: rule.property }); // Resolve any open alerts for this device and rule since there is no last active reading
      return;
    }

    const durationMilliseconds = rule.inactivityMinutes * 60 * 1000;
    const inactivityMilliseconds = Math.max(0, currentTimestamp - Number(lastActiveReading.dateTimeAsNumeric));

    if (inactivityMilliseconds < durationMilliseconds) {
      this.alertsOpenResolve({ ruleID: rule.ruleID, deviceID: context.deviceID, property: rule.property }); // Resolve any open alerts for this device and rule since the inactivity duration has not been reached
      return;
    }

    const alert = this.alertOpenUpdate({ // Create or update an alert for this device and rule based on the inactivity duration
      ruleID:           rule.ruleID,
      type:             rule.type,
      score:            this.inactivityScoreCalculate(inactivityMilliseconds, durationMilliseconds),
      title:            this.ruleTitleBuild(rule, context.device),
      summary:          this.inactivitySummaryBuild(rule, context, lastActiveReading, inactivityMilliseconds),
      explanation:      this.inactivityExplanationBuild(rule, lastActiveReading, inactivityMilliseconds),
      recommendation:   rule.recommendation || this.translate("alertRecommendationDefault"),
      deviceID:         context.deviceID,
      property:         rule.property,
      individualID:     context.individualID,
      roomID:           context.roomID,
      source:           "alerts_rule"
    });

    this.signalInsert(alert.alertID, { // Insert a signal associated with this alert, representing the last active reading and its weight
      deviceID:       context.deviceID,
      property:       rule.property,
      value:          String(lastActiveReading.value),
      valueAsNumeric: lastActiveReading.valueAsNumeric,
      weight:         this.inactivityScoreCalculate(inactivityMilliseconds, durationMilliseconds)
    });
  }

  /**
   * =============================================================================================
   * Helper functions: inactivity scope and activity values
   * ======================================================
   */

  /**
   * Resolves device scope from alert rule configuration.
   * Unified model: scopeGroupID = 0 means all devices, >0 means a specific device group.
   * scopeIndividualID and scopeRoomID are optional context filters; they do not replace
   * the device group and do not change the independent meaning of a device's room.
   * @param {Object} rule - Alert rule from database
   * @returns {{devices:Array<Object>, label:string, individualID:number, roomID:number}}
   */
  inactivityRuleScopeResolve(rule) {
    const groupID = rule.groupID;
    const individualID = rule.individualID;
    const roomID       = rule.roomID;

    if (groupID === 0) { // All devices, no specific group
      return {
        devices:  this.devicesWithPropertyGet(rule.property),
        label:    "",
        individualID,
        roomID
      };
    }

    const deviceIDs = this.deviceIDsInGroupGet(groupID);
    if (deviceIDs.length === 0) { // No devices found in the specified group
      return { devices: [], label: "", individualID, roomID };
    }

    return {
      devices: this.devicesWithPropertyGet(rule.property, deviceIDs),
      label: this.deviceGroupNameGet(groupID),
      individualID,
      roomID
    };
  }

  /**
   * Returns the device IDs assigned to a group.
   * @param {number} groupID
   * @returns {Array<number>}
   */
  deviceIDsInGroupGet(groupID) {
    return database.prepare("SELECT deviceID FROM devices_group_members WHERE groupID = ? ORDER BY deviceID")
      .all(groupID)
      .map((row) => Number(row.deviceID))
      .filter((deviceID) => Number.isInteger(deviceID) && deviceID > 0);
  }

  /**
   * Returns a group's display name.
   * @param {number} groupID
   * @returns {string}
   */
  deviceGroupNameGet(groupID) {
    const group = database.prepare("SELECT name FROM devices_groups WHERE groupID = ? LIMIT 1").get(groupID);
    return group?.name || "";
  }

  /**
   * Returns devices that have supplied the selected property, optionally limited
   * to an explicit device list.
   * @param {string} property
   * @param {Array<number>} [deviceIDs]
   * @returns {Array<Object>}
   */
  devicesWithPropertyGet(property, deviceIDs = []) {
    const conditions = ["mdv.property = ?"];
    const parameters = [property];

    if (deviceIDs.length > 0) {
      conditions.push("d.deviceID IN (" + deviceIDs.map(() => "?").join(",") + ")");
      parameters.push(...deviceIDs);
    }

    return database.prepare(
      "SELECT DISTINCT d.* FROM devices AS d INNER JOIN mqtt_devices_values AS mdv ON mdv.deviceID = d.deviceID WHERE " + conditions.join(" AND ")
    ).all(...parameters);
  }

  /**
   * Evaluates one shared inactivity period across all devices in a scope. Any
   * matching active value resets the group clock to the newest such value.
   * @param {Object} rule
   * @param {Object} scope
   * @param {number} currentTimestamp
   * @returns {void}
   */
  inactivityRuleForScopeEvaluate(rule, scope, currentTimestamp) {
    const activeTimeWindow = this.activeTimeWindowGet(rule);
    if (activeTimeWindow && !this.timestampIsInActiveTimeWindow(currentTimestamp, activeTimeWindow)) { // Outside the active time window, resolve any open alerts and exit.
      this.alertsOpenResolve({ ruleID: rule.ruleID, property: rule.property });
      return;
    }

    const readingsByDevice = scope.devices.map((device) => { // Get the last active reading for each device in the scope.
      return {
        device:  device,
        reading: this.lastActiveReadingGet(device.deviceID, rule)
      };
    });

    const readingsWithActivity = readingsByDevice.filter((entry) => { // Keep only devices that have an active reading.
      return entry.reading !== null;
    });

    const readings = readingsWithActivity.sort((left, right) => { // Sort the readings by recency, newest first.
      return Number(right.reading.dateTimeAsNumeric) - Number(left.reading.dateTimeAsNumeric);
    });

    if (readings.length === 0) { // No active readings found, resolve any open alerts and exit.
      this.alertsOpenResolve({ ruleID: rule.ruleID, property: rule.property });
      return;
    }

    const latest                  = readings[0];
    const durationMilliseconds    = rule.inactivityMinutes * 60 * 1000;
    const inactivityMilliseconds  = Math.max(0, currentTimestamp - Number(latest.reading.dateTimeAsNumeric));

    if (inactivityMilliseconds < durationMilliseconds) {
      this.alertsOpenResolve({ ruleID: rule.ruleID, property: rule.property });
      return;
    }

    const context = {
      // A shared scope must have one stable alert, regardless of which member was active last.
      deviceID:       null,
      individualID:   scope.individualID,
      roomID:         scope.roomID,
      device:         latest.device,
      scopeLabel:     scope.label
    };
    const alert = this.alertOpenUpdate({
      ruleID:           rule.ruleID,
      type:             rule.type,
      score:            this.inactivityScoreCalculate(inactivityMilliseconds, durationMilliseconds),
      title:            this.ruleTitleBuild(rule, latest.device),
      summary:          this.inactivitySummaryBuild(rule, context, latest.reading, inactivityMilliseconds),
      explanation:      this.inactivityExplanationBuild(rule, latest.reading, inactivityMilliseconds),
      recommendation:   rule.recommendation || this.translate("alertRecommendationDefault"),
      deviceID:         context.deviceID,
      property:         rule.property,
      individualID:     context.individualID,
      roomID:           context.roomID,
      source:           "alerts_rule"
    });

    readings.forEach((entry) => {
      this.signalInsert(alert.alertID, {
        deviceID:       entry.device.deviceID,
        property:       rule.property,
        value:          String(entry.reading.value),
        valueAsNumeric: entry.reading.valueAsNumeric,
        weight:         entry.device.deviceID === latest.device.deviceID ? 1 : 0
      });
    });
  }

  /**
   * Calculates the severity score (0..1) for a triggered inactivity alert.
   * Note: this is only called once inactivityMilliseconds has already reached
   * durationMilliseconds, so today it always evaluates to exactly 1.
   * @param {number} inactivityMilliseconds
   * @param {number} durationMilliseconds
   * @returns {number}
   */
  inactivityScoreCalculate(inactivityMilliseconds, durationMilliseconds) {
    return Math.min(1, inactivityMilliseconds / durationMilliseconds);
  }

  /**
   * Loads the newest reading considered active by the rule. The comparison is
   * intentionally performed in JavaScript so it works equally for numbers,
   * booleans, and categorical sensor values.
   * @param {number} deviceID
   * @param {Object} rule
   * @returns {Object|null}
   */
  lastActiveReadingGet(deviceID, rule) {
    const readings = database.prepare(
      "SELECT value, valueAsNumeric, dateTimeAsNumeric FROM mqtt_devices_values WHERE deviceID = ? AND property = ? ORDER BY dateTimeAsNumeric DESC"
    ).all(deviceID, rule.property);

    return readings.find((reading) => this.ruleValueIsActive(rule, reading)) || null;
  }

  /**
   * Determines whether one sensor reading represents activity for an inactivity rule.
   * Supported operators are truthy, falsy, equals, and not_equals.
   * @param {Object} rule
   * @param {Object} reading
   * @returns {boolean}
   */
  ruleValueIsActive(rule, reading) {
    const operator              = rule.operator;
    const value                 = reading.value;
    const numericValue          = Number(reading.valueAsNumeric);
    const expectedValue         = rule.activityValue;
    const expectedNumericValue  = Number(expectedValue);
    const numericComparison     = Number.isFinite(numericValue) && Number.isFinite(expectedNumericValue);

    switch (operator) {
      case "truthy":
        return this.truthySensorValueIs(value, numericValue);
      case "falsy":
        return !this.truthySensorValueIs(value, numericValue);
      case "equals":
        return numericComparison ? numericValue === expectedNumericValue : String(value) === String(expectedValue);
      case "not_equals":
        return numericComparison ? numericValue !== expectedNumericValue : String(value) !== String(expectedValue);
      default:
        return false;
    }
  }

  /**
   * Converts common boolean and numeric sensor representations into activity.
   * @param {unknown} value
   * @param {number} numericValue
   * @returns {boolean}
   */
  truthySensorValueIs(value, numericValue) {
    if (Number.isFinite(numericValue) && numericValue !== 0) {
      return true;
    }

    return !INACTIVE_SENSOR_VALUES.has(String(value || "").trim().toLowerCase());
  }

  /**
   * Calculates a normalized deviation score for a numeric property.
   * @param {number} deviceID - Numeric FK to devices table
   * @param {string} property
   * @returns {Object|null}
   */
  deviationScoreGet(deviceID, property) {
    const history = database.prepare( // Load recent history in descending order; newest reading is at index 0
      "SELECT valueAsNumeric FROM mqtt_devices_values WHERE deviceID = ? AND property = ? ORDER BY dateTimeAsNumeric DESC LIMIT ?"
    ).all(deviceID, property, appConfig.CONF_alertsHistorySize);

    if (!history || history.length < appConfig.CONF_alertsMinHistoryEntries) {
      return null;
    }

    const values = history.map((entry) => Number(entry.valueAsNumeric)).filter((entry) => Number.isFinite(entry));

    if (values.length < appConfig.CONF_alertsMinHistoryEntries) {
      return null;
    }

    const latest      = values[0];
    const baseline    = values.slice(1);
    const median      = this.valuesMedian(baseline);
    const deviations  = baseline.map((entry) => Math.abs(entry - median));
    const mad         = this.valuesMedian(deviations);

    let normalizedDeviation;

    if (mad > 0) { // Robust variant: median absolute deviation scaled to approximately standard deviation
      normalizedDeviation = Math.abs(latest - median) / (mad * MAD_TO_STDDEV_SCALE_FACTOR);
    }
    else { // Fallback for perfectly flat baseline where MAD is zero
      const mean      = baseline.reduce((sum, entry) => sum + entry, 0) / baseline.length;
      const variance  = baseline.reduce((sum, entry) => sum + Math.pow(entry - mean, 2), 0) / baseline.length;
      const stdDev    = Math.sqrt(variance);

      if (stdDev === 0) {
        normalizedDeviation = (latest !== median) ? MAX_NORMALIZED_DEVIATION : 0;
      }
      else {
        normalizedDeviation = Math.abs(latest - mean) / stdDev;
      }
    }

    return {
      score:                Math.max(0, Math.min(1, normalizedDeviation / MAX_NORMALIZED_DEVIATION)),
      latest:               latest,
      median:               median,
      normalizedDeviation:  normalizedDeviation
    };
  }

  /**
   * =============================================================================================
   * Main functions: configured value rules
   * ======================================
   */

  /**
   * Evaluates configured alert rules for one incoming value.
   * @param {Object} data
   * @param {string} property
   * @param {Object} valueData
   */
  configuredRulesEvaluate(data, property, valueData) {
    const rules = this.matchingRulesGet(property);

    rules.forEach((rule) => {
      const context = this.ruleContextBuild(rule, data.uuid, data.bridge);

      if (!context) {
        return;
      }

      switch (rule.type) {
        case RULE_TYPE_ANOMALY_DETECTION:
          this.anomalyRuleEvaluate(rule, property, valueData, context);
          break;

        case RULE_TYPE_SUM_BELOW_THRESHOLD:
          this.sumRuleEvaluate(rule, property, valueData, context, "below");
          break;

        case RULE_TYPE_SUM_ABOVE_THRESHOLD:
          this.sumRuleEvaluate(rule, property, valueData, context, "above");
          break;

        case RULE_TYPE_NO_ACTIVITY_FOR_DURATION:
          // Absence needs the clock-driven evaluation below, not the incoming value event.
          break;
      }
    });
  }

  /**
   * Evaluates either threshold-based sum rule.
   * @param {Object} rule
   * @param {string} property
   * @param {Object} valueData
   * @param {Object} context
   * @param {string} comparison
   */
  sumRuleEvaluate(rule, property, valueData, context, comparison) {
    const aggregation     = this.recentValuesSum(rule, context, property);
    const minimumReadings = rule.minimumReadings;

    if (!aggregation || aggregation.readings < minimumReadings) {
      return;
    }

    if (!this.sumThresholdIsReached(rule, aggregation, comparison)) {
      this.alertsOpenResolve({ ruleID: rule.ruleID, deviceID: context.deviceID, property });
      return;
    }

    const alert = this.alertOpenUpdate({
      ruleID:         rule.ruleID,
      type:           rule.type,
      score:          this.sumSeverityCalculate(rule, aggregation, comparison),
      title:          this.ruleTitleBuild(rule, context.device),
      summary:        this.ruleSummaryBuild(rule, aggregation, context),
      explanation:    this.ruleExplanationBuild(rule, aggregation),
      recommendation: rule.recommendation || this.translate("alertRecommendationDefault"),
      deviceID:       context.deviceID,
      property,
      individualID:   context.individualID,
      roomID:         context.roomID,
      source:         "alerts_rule"
    });

    this.signalInsert(alert.alertID, {
      deviceID:       context.deviceID,
      property,
      value:          String(valueData.value ?? valueData.valueAsNumeric ?? ""),
      valueAsNumeric: valueData.valueAsNumeric ?? null,
      weight:         aggregation.total
    });
  }

  /**
   * Evaluates an anomaly detection rule for one incoming value.
   * @param {Object} rule
   * @param {string} property
   * @param {Object} valueData
   * @param {Object} context
   */
  anomalyRuleEvaluate(rule, property, valueData, context) {
    if (!this.numericReadingIsValid(valueData)) {
      return;
    }

    const deviation = this.deviationScoreGet(context.deviceID, property);
    if (!deviation) {
      return;
    }

    const threshold = rule.anomalyScoreThreshold || appConfig.CONF_alertsAnomalyThreshold;

    if (deviation.score < threshold) {
      this.alertsOpenResolve({ ruleID: rule.ruleID, type: RULE_TYPE_ANOMALY_DETECTION, deviceID: context.deviceID, property: property });
      return;
    }

    const alert = this.alertOpenUpdate({
      ruleID:           rule.ruleID,
      type:             RULE_TYPE_ANOMALY_DETECTION,
      score:            deviation.score,
      title:            this.ruleTitleBuild(rule, context.device),
      summary:          this.numericSummaryBuild(context.device, property, valueData.value),
      explanation:      this.numericExplanationBuild(property, valueData.value, deviation),
      recommendation:   rule.recommendation || this.translate("alertRecommendationAnomaly"),
      deviceID:         context.deviceID,
      property:         property,
      individualID:     context.individualID,
      roomID:           context.roomID,
      source:           "alerts_rule"
    });

    this.signalInsert(alert.alertID, {
      deviceID:       context.deviceID,
      property:       property,
      value:          String(valueData.value),
      valueAsNumeric: valueData.valueAsNumeric,
      weight:         deviation.score
    });
  }

  /**
   * =============================================================================================
   * Helper functions: rule normalization and sum/time calculations
   * ==============================================================
   */

  /**
   * Returns all active rules matching a property.
   * @param {string} property
   * @returns {Array}
   */
  matchingRulesGet(property) {
    return database.prepare("SELECT * FROM alert_rules WHERE sourceProperty = ? ORDER BY ruleID ASC")
      .all(property)
      .map((rule) => this.ruleNormalize(rule));
  }

  /**
   * Normalizes values read from SQLite before rule evaluation.
   * @param {Object} rule
   * @returns {Object}
   */
  ruleNormalize(rule) {
    return {
      ...rule,
      type:                   String(rule.aggregationType || ""),
      property:               String(rule.sourceProperty || "").trim(),
      minimumSum:             Number(rule.thresholdMin) || 0,
      maximumSum:             Number(rule.thresholdMax) || 0,
      anomalyScoreThreshold:  Number(rule.anomalyThreshold) || 0,
      minimumReadings:        Math.max(1, Number(rule.minReadings) || 1),
      inactivityMinutes:      Number(rule.inactivityDurationMinutes) || 0,
      groupID:                Number(rule.scopeGroupID) || 0,
      individualID:           Number(rule.scopeIndividualID) || 0,
      roomID:                 Number(rule.scopeRoomID) || 0,
      operator:               String(rule.activityOperator || "truthy").trim().toLowerCase(),
      windowHours:            Math.max(1, Number(rule.aggregationWindowHours) || 24),
      activeFrom:             String(rule.activeTimeStart || "").trim(),
      activeUntil:            String(rule.activeTimeEnd || "").trim()
    };
  }

  /**
   * Builds the context that an alert rule operates on.
   * @param {Object} rule
   * @param {string} uuid
   * @param {string} bridge
   * @returns {Object|null}
   */
  ruleContextBuild(rule, uuid, bridge) {
    const device = this.deviceGet(uuid, bridge);

    const context = {
      deviceID:     device?.deviceID || null,
      uuid:         uuid,
      bridge:       bridge,
      individualID: Number(device?.individualID) || 0,
      roomID:       Number(device?.roomID) || 0,
      device:       device,
    };

    if (!this.ruleContextIsValid(rule, context)) {
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
  ruleContextIsValid(rule, context) {
    if (!rule || rule.property === "") {
      return false;
    }

    if (context.deviceID === null || context.deviceID === undefined) {
      return false;
    }

    if (context.bridge === undefined || String(context.bridge).trim() === "") {
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
  recentValuesSum(rule, context, property) {
    const aggregationWindowHours  = rule.windowHours;
    const thresholdTimestamp      = Date.now() - (aggregationWindowHours * 60 * 60 * 1000);
    const activeTimeWindow        = this.activeTimeWindowGet(rule);
    const conditions              = ["deviceID = ?", "property = ?", "dateTimeAsNumeric >= ?"];
    const parameters              = [context.deviceID, property, thresholdTimestamp];

    if (activeTimeWindow) {
      conditions.push("valueAsNumeric > 0");
      conditions.push(this.activeTimeWindowSqlBuild(activeTimeWindow));
      parameters.push(activeTimeWindow.start, activeTimeWindow.end);
    }

    const result = database.prepare(
      "SELECT COUNT(*) AS readings, COALESCE(SUM(valueAsNumeric), 0) AS total FROM mqtt_devices_values WHERE " + conditions.join(" AND ")
    ).get(...parameters);

    if (!result) {
      return null;
    }

    return {
      readings:               Number(result.readings) || 0,
      total:                  Number(result.total) || 0,
      aggregationWindowHours: aggregationWindowHours,
      activeTimeWindow:       activeTimeWindow
    };
  }

  /**
   * Returns a validated optional daily time window configured on a rule.
   * @param {Object} rule
   * @returns {{start:string,end:string}|null}
   */
  activeTimeWindowGet(rule) {
    if (rule.type !== RULE_TYPE_NO_ACTIVITY_FOR_DURATION) {
      return null;
    }

    const start       = rule.activeFrom;
    const end         = rule.activeUntil;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    return timePattern.test(start) && timePattern.test(end) ? { start, end } : null;
  }

  /**
   * Checks whether a timestamp falls in a configured daily time window.
   * @param {number} timestamp
   * @param {{start:string,end:string}} activeTimeWindow
   * @returns {boolean}
   */
  timestampIsInActiveTimeWindow(timestamp, activeTimeWindow) {
    const date = new Date(timestamp);
    const time = String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");

    if (activeTimeWindow.start <= activeTimeWindow.end) {
      return time >= activeTimeWindow.start && time <= activeTimeWindow.end;
    }

    return time >= activeTimeWindow.start || time <= activeTimeWindow.end;
  }

  /**
   * Builds a SQLite predicate for a daily time window, including windows across midnight.
   * @param {{start:string,end:string}} activeTimeWindow
   * @returns {string}
   */
  activeTimeWindowSqlBuild(activeTimeWindow) {
    const timeColumn = "strftime('%H:%M', dateTimeAsNumeric / 1000, 'unixepoch', 'localtime')";

    if (activeTimeWindow.start <= activeTimeWindow.end) {
      return timeColumn + " >= ? AND " + timeColumn + " <= ?";
    }

    return "(" + timeColumn + " >= ? OR " + timeColumn + " <= ?)";
  }

  /**
   * Evaluates whether a rule threshold is currently reached.
  * @param {Object} rule
  * @param {Object} aggregation
  * @param {string} comparison
   * @returns {boolean}
   */
  sumThresholdIsReached(rule, aggregation, comparison) {
    if (comparison === "below") {
      return aggregation.total < rule.minimumSum;
    }

    if (comparison === "above") {
      return aggregation.total > rule.maximumSum;
    }

    return false;
  }

  /**
   * Calculates a normalized score (0..1) for a triggered sum rule.
   * @param {Object} rule
   * @param {Object} aggregation
   * @param {string} comparison
   * @returns {number}
   */
  sumSeverityCalculate(rule, aggregation, comparison) {
    const threshold = comparison === "below" ? rule.minimumSum : rule.maximumSum;

    if (threshold <= 0) {
      return 0;
    }

    const difference = comparison === "below"
      ? threshold - aggregation.total
      : aggregation.total - threshold;

    return Math.max(0, Math.min(1, difference / threshold));
  }

  /**
   * =============================================================================================
   * Helper functions: alert persistence and scenario integration
   * ============================================================
   */

  /**
   * Resolves all currently open alerts matching the provided filters.
   * @param {Object} filters
   * @returns {void}
   */
  alertsOpenResolve(filters) {
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
  alertOpenUpdate(payload) {
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
      ).run(
        payload.ruleID || 0,
        payload.score,
        payload.title,
        payload.summary,
        payload.explanation,
        payload.recommendation,
        payload.individualID || 0,
        payload.roomID || 0,
        payload.source,
        existing.alertID
      );

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
  scenarioAlertCreate(scenario, action) {
    return this.alertOpenUpdate({
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
  signalInsert(alertID, signal) {
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
   * =============================================================================================
   * Helper functions: labels, translations, and numeric utilities
   * =============================================================
   */

  /**
   * Loads a device from the database.
   * @param {string} uuid
   * @param {string} bridge
   * @returns {Object|null}
   */
  deviceGet(uuid, bridge) {
    return common.deviceGetByUUID(uuid, bridge);
  }

  /**
   * Builds the display title for a rule-based alert.
   * @param {Object} rule
   * @param {Object|null} device
   * @returns {string}
   */
  ruleTitleBuild(rule, device) {
    if ((rule.title !== undefined) && (String(rule.title).trim() !== "")) {
      return String(rule.title).trim();
    }
    else {
      return this.translate("alertTitleFallback", this.deviceNameGet(device));
    }
  }

  /**
   * Builds a short summary for a rule-based alert.
   * @param {Object} rule
   * @param {Object} aggregation
   * @param {Object} context
   * @returns {string}
   */
  ruleSummaryBuild(rule, aggregation, context) {
    const label = this.ruleContextLabelBuild(context);

    if (rule.type === RULE_TYPE_SUM_BELOW_THRESHOLD) {
      return this.translate("alertSummarySumBelow", label, this.propertyTranslate(rule.property), aggregation.aggregationWindowHours, aggregation.total, rule.minimumSum);
    }
    else if (rule.type === RULE_TYPE_SUM_ABOVE_THRESHOLD) {
      return this.translate("alertSummarySumAbove", label, this.propertyTranslate(rule.property), aggregation.aggregationWindowHours, aggregation.total, rule.maximumSum);
    }
    else {
      return this.translate("alertSummaryRuleMatched", label);
    }
  }

  /**
   * Builds a user-facing summary for an inactivity alert.
   * @param {Object} rule
   * @param {Object} context
   * @param {Object} lastActiveReading
   * @param {number} inactivityMilliseconds
   * @returns {string}
   */
  inactivitySummaryBuild(rule, context, lastActiveReading, inactivityMilliseconds) {
    const inactiveMinutes   = Math.floor(inactivityMilliseconds / 60000);
    const lastActiveAt      = new Date(lastActiveReading.dateTimeAsNumeric).toLocaleString(appConfig.CONF_language || "en");
    return this.translate("alertSummaryNoActivity", this.ruleContextLabelBuild(context), this.propertyTranslate(rule.property), inactiveMinutes, lastActiveAt);
  }

  /**
   * Builds a technical explanation for an inactivity alert.
   * @param {Object} rule
   * @param {Object} lastActiveReading
   * @param {number} inactivityMilliseconds
   * @returns {string}
   */
  inactivityExplanationBuild(rule, lastActiveReading, inactivityMilliseconds) {
    const configuredMinutes = rule.inactivityMinutes;
    const inactiveMinutes   = Math.floor(inactivityMilliseconds / 60000);
    return this.translate("alertExplanationNoActivity", this.propertyTranslate(rule.property), rule.operator, inactiveMinutes, configuredMinutes);
  }

  /**
   * Builds the technical explanation for a rule-based alert.
   * @param {Object} rule
   * @param {Object} aggregation
   * @returns {string}
   */
  ruleExplanationBuild(rule, aggregation) {
    if (rule.type === RULE_TYPE_SUM_BELOW_THRESHOLD) {
      return this.translate("alertExplanationSumBelow", this.propertyTranslate(rule.property), aggregation.readings, aggregation.total, aggregation.aggregationWindowHours);
    }
    else if (rule.type === RULE_TYPE_SUM_ABOVE_THRESHOLD) {
      return this.translate("alertExplanationSumAbove", this.propertyTranslate(rule.property), aggregation.readings, aggregation.total, aggregation.aggregationWindowHours);
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
  ruleContextLabelBuild(context) {
    if (context.scopeLabel) {
      return context.scopeLabel;
    }

    if (Number(context.individualID) > 0) {
      const individual = database.prepare("SELECT firstname, lastname FROM individuals WHERE individualID = ? LIMIT 1").get(context.individualID);

      if (individual) {
        return individual.firstname + " " + individual.lastname;
      }
    }
    return this.deviceNameGet(context.device);
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
  numericSummaryBuild(device, property, value) {
    const deviceName = this.deviceNameGet(device);
    return this.translate("alertSummaryAnomaly", deviceName, this.propertyTranslate(property), value);
  }

  /**
   * Builds explanation text for numeric anomaly alerts.
   * @param {string} property
   * @param {string|number} value
   * @param {Object} deviation
   * @returns {string}
   */
  numericExplanationBuild(property, value, deviation) {
    return this.translate("alertExplanationAnomaly", this.propertyTranslate(property), value, deviation.median, deviation.normalizedDeviation.toFixed(2));
  }

  /**
   * Builds summary text for connectivity alerts.
   * @param {Object|null} device
   * @returns {string}
   */
  connectivitySummaryBuild(device) {
    const deviceName = this.deviceNameGet(device);
    return this.translate("alertSummaryDeviceOffline", deviceName);
  }

  /**
   * Returns a readable device name.
   * @param {Object|null} device
   * @returns {string}
   */
  deviceNameGet(device) {
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
  propertyTranslate(property) {
    const lang = appConfig.CONF_language;
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
  numericReadingIsValid(valueData) {
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
   * Calculates the median (middle value) for a list of numeric values.
   * @param {number[]} values
   * @returns {number}
   */
  valuesMedian(values) {
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
