/**
 * =============================================================================================
 * Scenario Engine - Evaluates and executes scenarios based on device values
 * =========================================================================
 */

const appConfig = require("../../config");

class ScenarioEngine {
  constructor() {
    this.executionCooldowns = new Map(); // Prevent rapid re-execution
  }

  /**
   * Evaluates all active scenarios when a device value changes
   * @param {Object} deviceData - { deviceID, bridge, property, value, valueType }
   */
  async evaluateScenarios(deviceData) {

    try {
      // Get all enabled scenarios with triggers that match this device/property
      const scenarios = database.prepare("SELECT DISTINCT s.*, st.triggerID, st.operator, st.value AS triggerValue, st.valueType AS triggerValueType FROM scenarios AS s JOIN scenarios_triggers AS st ON s.scenarioID = st.scenarioID WHERE s.enabled = 1 AND st.deviceID = ? AND st.bridge = ?  AND st.property = ? ORDER BY s.priority DESC").all(deviceData.deviceID, deviceData.bridge, deviceData.property);

      for (const scenario of scenarios) {
        await this.evaluateScenario(scenario, deviceData);
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error evaluating scenarios: " + error.message, "red");
    }
  }

  /**
   * Evaluates a single scenario
   * @param {Object} scenario - Scenario details from DB
   * @param {Object} deviceData - { deviceID, bridge, property, value, valueType }
   */
  async evaluateScenario(scenario, deviceData) {
    try {
      // Check cooldown to prevent rapid re-execution
      const cooldownKey     = scenario.scenarioID + "-" + deviceData.deviceID + "-" + deviceData.property;
      const lastExecution   = this.executionCooldowns.get(cooldownKey);
      const now             = Date.now();
      
      if (lastExecution && (now - lastExecution) < appConfig.CONF_scenarioCooldownMilliseconds) {
        return;
      }

      // Get all triggers for this scenario
      const triggers = database.prepare("SELECT * FROM scenarios_triggers WHERE scenarioID = ?").all(scenario.scenarioID);

      // Check if ALL triggers are satisfied
      let allTriggersSatisfied = true;
      
      for (const trigger of triggers) {
        const triggerSatisfied = await this.evaluateTrigger(trigger, deviceData);
        if (!triggerSatisfied) {
          allTriggersSatisfied = false;
          break;
        }
      }

      if (allTriggersSatisfied) {
        common.conLog("Scenario Engine: Executing scenario " + scenario.name, "gre");
        await this.executeScenario(scenario, deviceData);
        this.executionCooldowns.set(cooldownKey, now);
      }
    }
    catch (error) {
      common.conLog("Scenario Engine: Error evaluating scenario " + scenario.scenarioID + ": " + error.message, "red");
    }
  }

  /**
   * Evaluates a single trigger condition
   * @param {Object} trigger - Trigger details from DB
   * @param {Object} deviceData - { deviceID, bridge, property, value, valueType }
   * @returns {boolean} - Whether the trigger condition is satisfied
   */
  async evaluateTrigger(trigger, deviceData) {
    // if this trigger is for the current device/property, use the incoming value
    if (trigger.deviceID === deviceData.deviceID && trigger.bridge === deviceData.bridge &&  trigger.property === deviceData.property) {
      return this.compareValues(deviceData.value, trigger.operator, trigger.value, trigger.valueType);
    }

    // For other triggers, get the current value from the database
    const currentValue = await this.getCurrentDeviceValue(trigger.deviceID, trigger.bridge, trigger.property);
    if (currentValue === null) {
      return false; // Device/property not found
    }

    return this.compareValues(currentValue, trigger.operator, trigger.value, trigger.valueType);
  }

  /**
   * Compares values based on operator
   * @param {any} actualValue - Current device value
   * @param {string} operator - Comparison operator (equals, greater, less, between, contains)
   * @param {any} expectedValue - Value to compare against
   * @param {string} valueType - Type of the values (String, Integer, Boolean)
   * @returns {boolean} - Result of the comparison
   */
  compareValues(actualValue, operator, expectedValue, valueType) {
    try {
      // Convert values based on type
      let actual   = this.convertValue(actualValue, valueType);
      let expected = this.convertValue(expectedValue, valueType);

      switch (operator) {
        case "equals":
          return actual === expected;
        case "greater":
          return valueType === "Integer" ? actual > expected : false;
        case "less":
          return valueType === "Integer" ? actual < expected : false;
        case "between":
          if (valueType === "Integer" && Array.isArray(expected) && expected.length === 2) {
            return actual >= expected[0] && actual <= expected[1];
          }
          return false;
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
   * @param {string} valueType - Target type (String, Integer, Boolean)
   * @returns {any} - Converted value
   */
  convertValue(value, valueType) {
    switch (valueType) {
      case "Integer":
        return parseInt(value);
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
      const result = this.database.prepare("SELECT valueAsNumeric, valueAsString FROM mqtt_history_devices_values WHERE deviceID = ? AND bridge = ? AND property = ? ORDER BY dateTimeAsNumeric DESC LIMIT 1").get(deviceID, bridge, property);
      return result ? (result.valueAsNumeric || result.valueAsString) : null;
    }
    catch (error) {
      return null;
    }
  }

  /**
   * Executes all actions for a scenario
   * @param {Object} scenario - Scenario details from DB
   * @param {Object} triggerData - Data about the trigger that caused execution
   */
  async executeScenario(scenario, triggerData) {
    try {
      // Get all actions for this scenario
      const actions = database.prepare("SELECT * FROM scenarios_actions WHERE scenarioID = ? ORDER BY delay ASC").all(scenario.scenarioID);

      // Log execution
      database.prepare("INSERT INTO scenarios_executions (scenarioID, triggerDeviceID, triggerProperty, triggerValue, success) VALUES (?, ?, ?, ?, ?)").run(
        scenario.scenarioID, triggerData.deviceID, triggerData.property, String(triggerData.value), 1
      );

      // Execute actions with delays
      for (const action of actions) {
        setTimeout(() => {
          this.executeAction(action);
        }, action.delay);
      }

    }
    catch (error) {
      common.conLog("Scenario Engine: Error executing scenario " + scenario.scenarioID + ": " + error.message, "red");

      // Log failed execution
      this.database.prepare("INSERT INTO scenarios_executions (scenarioID, triggerDeviceID, triggerProperty, triggerValue, success, errorMessage) VALUES (?, ?, ?, ?, ?, ?)").run(
        scenario.scenarioID, triggerData.deviceID, triggerData.property, String(triggerData.value), 0, error.message
      );
    }
  }

  /**
   * Executes a single action
   * @param {Object} action - Action details from DB
   */
  async executeAction(action) {
    try {
        const message = {};
        message.deviceID                    = action.deviceID;
        message.bridge                      = action.bridge;
        message.properties                  = {};
        message.properties[action.property] = this.convertValue(action.value, action.valueType);

        const topic = action.bridge + "/devices/set";
        mqttClient.publish(topic, JSON.stringify(message));

        common.conLog("Scenario Engine: Executed action - Set " + action.deviceID + "/" + action.property + " = " + action.value, "yel");
    }
    catch (error) {
      common.conLog("Scenario Engine: Error executing action: " + error.message, "red");
    }
  }
}

module.exports = ScenarioEngine;