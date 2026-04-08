/**
 * =============================================================================================
 * Scenario Engine - Evaluates and executes scenarios based on events
 * ==================================================================
 * 
 * Supported trigger types:
 *   - device_value:          A device property matches a condition (operator + value)
 *   - device_disconnected:   A device loses its connection
 *   - device_connected:      A device reconnects
 *   - battery_low:           A device's battery drops below a threshold (value = threshold %)
 *   - care_insight_opened:   A Care Insight is newly created
 *   - care_insight_updated:  A Care Insight is updated
 *   - care_insight_resolved: A Care Insight is resolved or dismissed
 *   - time:                  A specific time of day is reached (value = "HH:mm")
 *
 * Supported action types:
 *   - set_device_value:    Set a property on a device via MQTT
 *   - push_notification:   Send a push notification (value = title, property = body)
 *   - notification:        Log a notification without push (value = text)
 */

const appConfig = require("../../config");

class ScenarioEngine {
  constructor() {
    this.executionCooldowns = new Map(); // prevent rapid re-execution
    this.pushEngine         = null; // push notifications engine    
  }

  /**
   * Central entry point for all events
   * @param {string} eventType - Type of event (device_value, device_connected, device_disconnected, battery_low, time)
   * @param {Object} eventData - { deviceID, bridge, property?, value?, valueType? }
   */
  async handleEvent(eventType, eventData) {
    try {
      let scenarios;

      if (["care_insight_opened", "care_insight_updated", "care_insight_resolved"].includes(eventType)) {
        scenarios = database.prepare(
          "SELECT DISTINCT s.* FROM scenarios s JOIN scenarios_triggers st ON s.scenarioID = st.scenarioID WHERE s.enabled = 1 AND st.type = ? ORDER BY s.priority DESC"
        ).all(eventType);
      }
      else {
        scenarios = database.prepare(
          "SELECT DISTINCT s.* FROM scenarios s JOIN scenarios_triggers st ON s.scenarioID = st.scenarioID WHERE s.enabled = 1 AND st.type = ? AND st.deviceID = ? AND st.bridge = ? ORDER BY s.priority DESC"
        ).all(eventType, eventData.deviceID || "", eventData.bridge || "");
      }

      for (const scenario of scenarios) {
        await this.evaluateScenario(scenario, eventType, eventData);
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error handling event '" + eventType + "': " + error.message, "red");
    }
  }

  /**
   * Entry point for time-based triggers (called by scheduler every minute)
   * @param {string} currentTime - Current time as "HH:mm"
   */
  async handleTimeEvent(currentTime) {
    try {
      const scenarios = database.prepare(
        "SELECT DISTINCT s.* FROM scenarios s JOIN scenarios_triggers st ON s.scenarioID = st.scenarioID WHERE s.enabled = 1 AND st.type = 'time' ORDER BY s.priority DESC"
      ).all();

      for (const scenario of scenarios) {
        await this.evaluateScenario(scenario, "time", { time: currentTime });
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error handling time event: " + error.message, "red");
    }
  }

  /**
   * Evaluates a single scenario against an event
   * @param {Object} scenario - Scenario details from DB
   * @param {string} eventType - The event type that triggered evaluation
   * @param {Object} eventData - { deviceID, bridge, property?, value?, valueType? }
   */
  async evaluateScenario(scenario, eventType, eventData) {
    try {
      const cooldownKey   = scenario.scenarioID + "-" + (eventData.deviceID || "time") + "-" + (eventData.property || eventType); // check cooldown to prevent rapid re-execution
      const lastExecution = this.executionCooldowns.get(cooldownKey);
      const now           = Date.now();

      if (lastExecution && (now - lastExecution) < appConfig.CONF_scenarioCooldownMilliseconds) { // scenario was executed recently for this device/property – skip to prevent rapid re-execution
        return;
      }

      if (this.matchesScenarioContext(scenario, eventData) !== true) { // check person and room context
        return;
      }

      const triggers = database.prepare("SELECT * FROM scenarios_triggers WHERE scenarioID = ?").all(scenario.scenarioID); // get all triggers for this scenario

      let triggersAllSatisfied = true; // check if ALL triggers are satisfied
      for (const trigger of triggers) {
        const triggerSatisfied = await this.evaluateTrigger(trigger, eventType, eventData);
        if (!triggerSatisfied) {
          triggersAllSatisfied = false;
          break;
        }
      }

      if (triggersAllSatisfied) {
        common.conLog("Scenario Engine: Executing scenario " + scenario.name, "gre");
        await this.executeScenario(scenario, eventData);
        this.executionCooldowns.set(cooldownKey, now);
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error evaluating scenario " + scenario.scenarioID + ": " + error.message, "red");
    }
  }

  /**
   * Evaluates a single trigger condition
   * @param {Object} trigger - Trigger row from DB 
   * @param {string} eventType - The event type that triggered evaluation
   * @param {Object} eventData - { deviceID, bridge, property?, value?, valueType? }
   * @returns {boolean}
   */
  async evaluateTrigger(trigger, eventType, eventData) {
    switch (trigger.type) {

      case "device_value":
        return this.evaluateDeviceValueTrigger(trigger, eventData);

      case "device_disconnected":
      case "device_connected":
        return trigger.type === eventType && trigger.deviceID === eventData.deviceID && trigger.bridge === eventData.bridge;

      case "battery_low":
        return trigger.type === eventType && trigger.deviceID === eventData.deviceID && trigger.bridge === eventData.bridge && parseFloat(eventData.value) < parseFloat(trigger.value);

      case "care_insight_opened":
      case "care_insight_updated":
      case "care_insight_resolved":
        return this.evaluateCareInsightTrigger(trigger, eventType, eventData);

      case "time":
        return eventType === "time" && trigger.value === eventData.time;

      default:
        return false;
    }
  }

  /**
   * Checks scenario-level person and room context.
   * @param {Object} scenario
   * @param {Object} eventData
   * @returns {boolean}
   */
  matchesScenarioContext(scenario, eventData) {
    if ((Number(scenario.individualID) > 0) && (Number(eventData.individualID) !== Number(scenario.individualID))) {
      return false;
    }

    if ((Number(scenario.roomID) > 0) && (Number(eventData.roomID) !== Number(scenario.roomID))) {
      return false;
    }

    return true;
  }

  /**
   * Evaluates a Care Insight trigger.
   * @param {Object} trigger
   * @param {string} eventType
   * @param {Object} eventData
   * @returns {boolean}
   */
  evaluateCareInsightTrigger(trigger, eventType, eventData) {
    if (trigger.type !== eventType) {
      return false;
    }

    if (trigger.property && String(trigger.property) !== String(eventData.ruleID)) {
      return false;
    }

    if (trigger.deviceID && trigger.deviceID !== eventData.deviceID) {
      return false;
    }

    if (trigger.bridge && trigger.bridge !== eventData.bridge) {
      return false;
    }

    return true;
  }

  /**
   * Evaluates a device_value trigger
   * @param {Object} trigger - Trigger row from DB
   * @param {Object} eventData - { deviceID, bridge, property, value, valueType }
   * @returns {boolean} - Whether the trigger condition is satisfied
   */
  async evaluateDeviceValueTrigger(trigger, eventData) {
    const isSameDevice   = trigger.deviceID === eventData.deviceID; // check whether this trigger refers to the exact device, ...
    const isSameBridge   = trigger.bridge   === eventData.bridge; // ... bridge, ...
    const isSameProperty = trigger.property === eventData.property; // ... and property (if trigger.property is null/empty, it matches any property, so we don't require equality in that case)

    if (isSameDevice && isSameBridge && isSameProperty) { // the trigger matches the event directly – use the value from the event payload without querying the database
      return this.compareValues(eventData.value, trigger.operator, trigger.value, trigger.valueType);
    }
    else {
      const currentValue = await this.getCurrentDeviceValue(trigger.deviceID, trigger.bridge, trigger.property); // the trigger refers to a different device or property (this happens in scenarios with multiple triggers (e.g. "If sensor A > 30 AND switch B = on"), so load current value from the database) 
      if (currentValue === null) { // no stored value available – the trigger cannot be satisfied
        return false;
      }
      else {
        return this.compareValues(currentValue, trigger.operator, trigger.value, trigger.valueType);
      }
    }
  }

  /**
   * Compares values based on operator
   * @param {any} actualValue - Current device value
   * @param {string} operator - Comparison operator (equals, greater, less, between, contains)
   * @param {any} expectedValue - Value to compare against
   * @param {string} valueType - Type of the values (String, Numeric, Boolean)
   * @returns {boolean} - Result of the comparison
   */
  compareValues(actualValue, operator, expectedValue, valueType) {
    try {
      let actual = this.convertValue(actualValue, valueType);

      if (operator === "between" && valueType === "Numeric") {  // handle "between" separately: expectedValue is an array (or JSON string of an array) and must not be passed through convertValue() which would destroy it via parseFloat()
        let range = expectedValue;
        if (typeof range === "string") {
          try {
            range = JSON.parse(range);
          }
          catch (error) {
            return false;
          }
        }

        if (Array.isArray(range) && range.length === 2) { // ensure it's an array of two values
          const low  = parseFloat(range[0]);
          const high = parseFloat(range[1]);
          return actual >= low && actual <= high;
        }
        return false;
      }

      let expected = this.convertValue(expectedValue, valueType);

      switch (operator) {
        case "equals":
          return actual === expected;
        case "greater":
          return valueType === "Numeric" ? actual > expected : false;
        case "less":
          return valueType === "Numeric" ? actual < expected : false;
        case "contains":
          return String(actual).toLowerCase().includes(String(expected).toLowerCase());
        default:
          return false;
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error comparing values: " + error.message, "red");
      return false;
    }
  }

  /**
   * Converts value to the specified type
   * @param {any} value - Value to convert
   * @param {string} valueType - Target type (String, Numeric, Boolean)
   * @returns {any} - Converted value
   */
  convertValue(value, valueType) {
    switch (valueType) {
      case "Numeric":
        return parseFloat(value);
      case "Boolean":
        return Boolean(value === true || value === "true" || value === "1");
      case "String":
      default:
        return String(value);
    }
  }

  /**
   * Gets current device value from database
   * @param {string} deviceID - Device ID
   * @param {string} bridge - Bridge name
   * @param {string} property - Property name
   * @returns {any|null} - Current value or null if not found
   */
  async getCurrentDeviceValue(deviceID, bridge, property) {
    try {
      const result = database.prepare("SELECT valueAsNumeric, value FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? AND property = ? ORDER BY dateTimeAsNumeric DESC LIMIT 1").get(deviceID, bridge, property);

      if (!result) { // no row found for this device/bridge/property
        return null;
      }

      if (result.valueAsNumeric !== null && result.valueAsNumeric !== undefined) {
        return result.valueAsNumeric;
      }
      else { // fallback to string value
        return result.value ?? null;
      }
    }
    catch (error) {
      return null;
    }
  }

  /**
   * Executes all actions for a scenario
   * @param {Object} scenario - Scenario details from DB
   * @param {Object} triggerData - Data about the event that caused execution
   */
  async executeScenario(scenario, triggerData) {
    try {
      const actions = database.prepare("SELECT * FROM scenarios_actions WHERE scenarioID = ? ORDER BY delay ASC").all(scenario.scenarioID);  // get all actions for this scenario

      database.prepare("INSERT INTO scenarios_executions (scenarioID, triggerDeviceID, triggerProperty, triggerValue, dateTimeExecutedAt, success) VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?)").run(
        scenario.scenarioID, triggerData.deviceID || "", triggerData.property || "", String(triggerData.value || ""), 1
      );

      for (const action of actions) {
        setTimeout(() => {
          try {
            this.executeAction(action, scenario);
          }
          catch (timerError) {
            common.conLog("Scenario Engine: Error executing delayed action for scenario " + scenario.scenarioID + ": " + timerError.message, "red");
          }
        }, action.delay * 1000);
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error executing scenario " + scenario.scenarioID + ": " + error.message, "red");

      database.prepare("INSERT INTO scenarios_executions (scenarioID, triggerDeviceID, triggerProperty, triggerValue, success, dateTimeExecutedAt, error) VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)").run(
        scenario.scenarioID, triggerData.deviceID || "", triggerData.property || "", String(triggerData.value || ""), 0, error.message
      );
    }
  }

  /**
   * Execute all actions for a scenario manually (for testing)
   * @param {number} scenarioID - Scenario ID
   */
  async executeScenarioActionsManually(scenarioID) {
    try {
      const scenario = database.prepare("SELECT * FROM scenarios WHERE scenarioID = ?").get(scenarioID);
      if (scenario) {
        database.prepare("INSERT INTO scenarios_executions (scenarioID, triggerDeviceID, triggerProperty, triggerValue, dateTimeExecutedAt, success) VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?)").run(  // log execution
          scenario.scenarioID, "manually", "manually", "manually", 1
        );

        const actions = database.prepare("SELECT * FROM scenarios_actions WHERE scenarioID = ? ORDER BY delay ASC").all(scenarioID);  // get all actions for this scenario

        for (const action of actions) { // execute actions with delays
          setTimeout(() => {
            try {
              this.executeAction(action, scenario);
            }
            catch (timerError) {
              common.conLog("Scenario Engine: Error executing delayed action for scenario " + scenario.scenarioID + ": " + timerError.message, "red");
            }
          }, action.delay * 1000); // delay is in seconds, so convert to milliseconds
        }

        common.conLog("Scenario Engine: Manually executed actions for scenario " + scenario.name, "gre");
      }
      else {
        common.conLog("Scenario Engine: Scenario ID " + scenarioID + " not found for manual execution.", "red");
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error manually executing scenario " + scenarioID + ": " + error.message, "red");
    }
  }

  /**
   * Executes a single action based on its type
   * @param {Object} action - Action details from DB (includes type)
   * @param {Object} scenario - Parent scenario (for context in notifications)
   */
  async executeAction(action, scenario) {
    try {
      switch (action.type) {

        case "set_device_value":
          const message                   = {};
          message.deviceID                = action.deviceID;
          message.bridge                  = action.bridge;
          message.values                  = {};
          message.values[action.property] = this.convertValue(action.value, action.valueType);

          const topic = action.bridge + "/devices/values/set";
          mqttClient.publish(topic, JSON.stringify(message));

          common.conLog("Scenario Engine: Action set_device_value - " + action.deviceID + "/" + action.property + " = " + action.value, "yel");
          break;

        case "push_notification":
          if (this.pushEngine) {
            this.pushEngine.sendAll(action.value || scenario.name, action.property || scenario.description || "");
          }
          common.conLog("Scenario Engine: Action push_notification - " + (action.value || scenario.name), "yel");
          break;

        case "notification":
          database.prepare("INSERT INTO notifications (text, description, scenarioID, icon, dateTime) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))").run(
            action.value || scenario.name, action.property || scenario.description || "", scenario.scenarioID, scenario.icon
          );
          common.conLog("Scenario Engine: Action notification - " + (action.value || scenario.name), "yel");
          break;

        default:
          common.conLog("Scenario Engine: Unknown action type '" + action.type + "'", "red");
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error executing action: " + error.message, "red");
    }
  }
}

module.exports = ScenarioEngine;