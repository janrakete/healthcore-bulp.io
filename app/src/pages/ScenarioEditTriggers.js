/**
 * Scenario Edit - Trigger logic
 */

import { apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { bridgeTranslate } from "../services/helper.js";

export const ScenarioEditTriggers = (Base) => class extends Base {
  triggerSelectedDevice = null;
  triggerID             = null;
  triggerDevices        = [];
  triggerCareInsightRules = [];

  buildTriggerDeviceOptionValue(deviceID, bridge) {
    return String(bridge || "") + "::" + String(deviceID || "");
  }

  parseTriggerDeviceOptionValue(value) {
    if ((value === undefined) || (value === null) || (value === "")) {
      return { deviceID: null, bridge: null };
    }

    const separatorIndex = String(value).indexOf("::");
    if (Number(separatorIndex) === -1) {
      return { deviceID: String(value), bridge: null };
    }

    return {
      bridge: String(value).slice(0, separatorIndex),
      deviceID: String(value).slice(separatorIndex + 2)
    };
  }

  /**
   * Render the HTML for the trigger edit modal
   * @returns HTML string
   */
  getTriggerEditModalHTML() {
    return `
      <ion-modal id="trigger-edit-modal">
        <ion-header>
          <ion-toolbar>
            <ion-title>${window.Translation.get("Edit")}</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-grid>
            <ion-row>
              <ion-col>
                <ion-list inset="true">     
                  <ion-item color="light">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerType" label="${window.Translation.get("TriggerType")}" value="device_value">
                      <ion-select-option value="device_value">${window.Translation.get("TriggerTypeDeviceValue")}</ion-select-option>
                      <ion-select-option value="device_disconnected">${window.Translation.get("TriggerTypeDeviceDisconnected")}</ion-select-option>
                      <ion-select-option value="device_connected">${window.Translation.get("TriggerTypeDeviceConnected")}</ion-select-option>
                      <ion-select-option value="battery_low">${window.Translation.get("TriggerTypeBatteryLow")}</ion-select-option>
                      <ion-select-option value="care_insight_opened">${window.Translation.get("TriggerTypeCareInsightOpened")}</ion-select-option>
                      <ion-select-option value="care_insight_updated">${window.Translation.get("TriggerTypeCareInsightUpdated")}</ion-select-option>
                      <ion-select-option value="care_insight_resolved">${window.Translation.get("TriggerTypeCareInsightResolved")}</ion-select-option>
                      <ion-select-option value="time">${window.Translation.get("TriggerTypeTime")}</ion-select-option>
                    </ion-select>
                  </ion-item>  
                  <ion-item color="light" id="trigger-field-device">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerDevice" label="${window.Translation.get("Device")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>  
                  <ion-item color="light" id="trigger-field-property">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerProperty" label="${window.Translation.get("Property")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>                  
                  <ion-item color="light" id="trigger-field-care-insight-type">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerCareInsightRule" label="${window.Translation.get("CareInsightRule")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>
                  <ion-item color="light" id="trigger-field-operator">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerOperator" label="${window.Translation.get("Operator")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                    </ion-select>
                  </ion-item>                  
                  <ion-item color="light" id="trigger-field-value">
                    <div id="edit-trigger-value-container">
                    </div>
                  </ion-item>
                  <ion-item color="light" id="trigger-field-time">
                    <ion-input type="time" label="${window.Translation.get("Time")}" label-placement="stacked" name="editTriggerTime" shape="round" fill="outline" class="custom"></ion-input>
                  </ion-item>                  
                </ion-list>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-button expand="block" color="success" id="trigger-submit-button"><ion-icon slot="start" name="checkmark-sharp"></ion-icon> ${window.Translation.get("Save")}</ion-button>      
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-button expand="block" color="danger" id="trigger-cancel-button"><ion-icon slot="start" name="close-sharp"></ion-icon> ${window.Translation.get("Cancel")}</ion-button>      
              </ion-col>
            </ion-row>            
          </ion-grid>
        </ion-content>      
      </ion-modal>
    `;
  }

  /**
   * Setup event listeners for trigger edit modal
   */
  setupTriggerEvents() {

    /**
     * Event listener for trigger submit button
     */
    this.querySelector("#trigger-submit-button").addEventListener("click", () => {
      const typeSelect        = document.querySelector("ion-select[name='editTriggerType']");
      const deviceSelect      = document.querySelector("ion-select[name='editTriggerDevice']");
      const propertySelect    = document.querySelector("ion-select[name='editTriggerProperty']");
      const careInsightRuleSelect = document.querySelector("ion-select[name='editTriggerCareInsightRule']");
      const operatorSelect    = document.querySelector("ion-select[name='editTriggerOperator']");
      const type              = typeSelect.value;
      
      let valueSelect;
      if ((document.querySelector("ion-input[name='editTriggerValue']")) && (document.querySelector("ion-input[name='editTriggerValue']") !== undefined)) {
        valueSelect = document.querySelector("ion-input[name='editTriggerValue']");
      }
      else {
        valueSelect = document.querySelector("ion-select[name='editTriggerValue']");
      }
      
      const selectedDeviceData    = this.parseTriggerDeviceOptionValue(deviceSelect.value);
      const isCareInsightTrigger  = ["care_insight_opened", "care_insight_updated", "care_insight_resolved"].includes(type);
      const triggerDevice         = selectedDeviceData.deviceID || null;
      const triggerBridge         = selectedDeviceData.bridge || this.triggerSelectedDevice?.bridge || null;
      const selectedDevice        = triggerDevice === null ? null : this.triggerSelectedDevice;
      const selectedRuleID        = isCareInsightTrigger ? (careInsightRuleSelect.value || null) : null;
      const selectedRule          = isCareInsightTrigger ? this.triggerCareInsightRules.find(r => String(r.ruleID) === String(selectedRuleID)) : null;

      const newTrigger = {
        triggerID:        Date.now(),
        type:             type,
        bridge:           String(type) === "time" ? null : (isCareInsightTrigger ? (triggerBridge || null) : triggerBridge),
        deviceID:         String(type) === "time" ? null : (isCareInsightTrigger ? (triggerDevice || null) : triggerDevice),
        deviceName:       String(type) === "time" ? null : (isCareInsightTrigger ? (selectedDevice?.name || selectedDevice?.productName || null) : (selectedDevice?.name || selectedDevice?.productName || null)),
        property:         String(type) === "device_value" ? propertySelect.value : (isCareInsightTrigger ? selectedRuleID : null),
        operator:         String(type) === "device_value" ? operatorSelect.value : null,
        value:            String(type) === "time" ? document.querySelector("ion-input[name='editTriggerTime']").value : ((String(type) === "device_value" || String(type) === "battery_low") ? valueSelect.value : null),
        valueType:        (String(type) === "device_value" || String(type) === "battery_low") ? (isNaN(valueSelect.value) ? "String" : "Numeric") : null,
        deviceProperties: String(type) === "time" ? [] : (selectedDevice?.properties || []),
        ruleTitle:        isCareInsightTrigger ? (selectedRule?.title || null) : null
      };
      this.scenarioData.triggers.push(newTrigger);

      if (this.triggerID !== null) { // If editing an existing trigger, remove the old one
        this.scenarioData.triggers = this.scenarioData.triggers.filter(item => item.triggerID !== this.triggerID);
        this.triggerID             = null; // Reset triggerID after editing
      }
      
      this.triggerRenderList();
      
      const modal = document.querySelector("#trigger-edit-modal");
      modal.dismiss();
    });

    /**
     * Event listener for trigger cancel button
     */
    this.querySelector("#trigger-cancel-button").addEventListener("click", () => {
      const modal = document.querySelector("#trigger-edit-modal"); 
      modal.dismiss(null, "cancel");
    });

    /*
     * Event listener for open trigger modal button
    */
    this.querySelector("#open-trigger-id").addEventListener("click", async () => {
      this.triggerID = null;

      this.resetTriggerEditModalFields();
      this.triggerUpdateFieldVisibility("device_value");
      this.triggerEnabledDisable();
      this.loadDataTriggerDevices();
      this.loadDataTriggerDeviceOperator();
      this.loadDataCareInsightRules();

      const modal = document.querySelector("#trigger-edit-modal");
      await modal.present();
    });

    /**
     * Event listener for trigger type select change
     */
    this.querySelector("ion-select[name='editTriggerType']").addEventListener("ionChange", (event) => {
      const type              = event.detail.value;
      const deviceSelect      = document.querySelector("ion-select[name='editTriggerDevice']");
      const propertySelect    = document.querySelector("ion-select[name='editTriggerProperty']");
      const careInsightRuleSelect = document.querySelector("ion-select[name='editTriggerCareInsightRule']");
      const operatorSelect    = document.querySelector("ion-select[name='editTriggerOperator']");
      const valueContainer    = document.querySelector("#edit-trigger-value-container");

      deviceSelect.value        = "";
      propertySelect.value      = "";
      careInsightRuleSelect.value = "";
      operatorSelect.value      = "";
      valueContainer.innerHTML  = `<ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom" disabled="true"></ion-input>`;
      
      const timeInput = document.querySelector("ion-input[name='editTriggerTime']");
      if (timeInput) {
        timeInput.value = "";
      }
      
      this.triggerSelectedDevice = null;
      this.triggerUpdateFieldVisibility(type);
      if (!["care_insight_opened", "care_insight_updated", "care_insight_resolved"].includes(type)) {
        this.loadDataTriggerDeviceOperator();
      }
      this.triggerEnabledDisable();
    });

    /**
     * Event listener for time input change
     */
    this.querySelector("ion-input[name='editTriggerTime']")?.addEventListener("ionInput", () => {
      this.triggerEnabledDisable();
    });

    this.querySelector("ion-select[name='editTriggerCareInsightRule']")?.addEventListener("ionChange", () => {
      this.triggerEnabledDisable();
    });

    /**
     * Event listener for trigger device select change
     */
    this.querySelector("ion-select[name='editTriggerDevice']").addEventListener("ionChange", async (event) => {
      const selectedDeviceData = this.parseTriggerDeviceOptionValue(event.detail.value);
      const deviceID  = selectedDeviceData.deviceID;
      const bridge    = selectedDeviceData.bridge;
      const type      = document.querySelector("ion-select[name='editTriggerType']")?.value || "device_value";

      this.setTriggerSelectedDevice(deviceID, bridge);

      if (["care_insight_opened", "care_insight_updated", "care_insight_resolved"].includes(type)) { // Care Insight trigger doesn't require loading properties
        this.triggerEnabledDisable();
        return;
      }

      await this.loadDataTriggerDeviceProperties(bridge, deviceID);

      if (String(type) === "battery_low") { // Battery low trigger requires numeric input instead of property value options
        const valueContainer = document.querySelector("#edit-trigger-value-container");
        valueContainer.innerHTML = `<ion-input type="number" label="${window.Translation.get("BatteryThreshold")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom"></ion-input>`;
        valueContainer.querySelector("ion-input[name='editTriggerValue']").addEventListener("ionInput", () => {
          this.triggerEnabledDisable();
        });
      }

      this.triggerEnabledDisable();
    });

    /**
     * Event listener for trigger property select change
     */
    this.querySelector("ion-select[name='editTriggerProperty']").addEventListener("ionChange", async (event) => {
      const propertyName  = event.detail.value;
      await this.loadDataTriggerDevicePropertiesValues(propertyName);
      this.triggerEnabledDisable();
    });

    /**
     * Event listener for trigger operator select change
     */
    this.querySelector("ion-select[name='editTriggerOperator']").addEventListener("ionChange", () => {
      this.triggerEnabledDisable();
    });
  }

  /**
   * Reset trigger edit modal fields
   */
  async resetTriggerEditModalFields() {
    const typeSelect        = document.querySelector("ion-select[name='editTriggerType']");
    const deviceSelect      = document.querySelector("ion-select[name='editTriggerDevice']");
    const propertySelect    = document.querySelector("ion-select[name='editTriggerProperty']");
    const careInsightRuleSelect = document.querySelector("ion-select[name='editTriggerCareInsightRule']");
    const operatorSelect    = document.querySelector("ion-select[name='editTriggerOperator']");
    const valueContainer    = document.querySelector("#edit-trigger-value-container");

    typeSelect.value         = "device_value";
    deviceSelect.value       = "";
    propertySelect.value     = "";
    careInsightRuleSelect.value = "";
    operatorSelect.value     = "";
    valueContainer.innerHTML = `
      <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom" disabled="true"></ion-input>
    `;
    
    const timeInput = document.querySelector("ion-input[name='editTriggerTime']");
    if (timeInput) {
      timeInput.value = "";
    } 
  }

  /**
   * Enable/Disable trigger edit modal fields based on selections
   */
  async triggerEnabledDisable() {
    const typeSelect        = document.querySelector("ion-select[name='editTriggerType']");
    const deviceSelect      = document.querySelector("ion-select[name='editTriggerDevice']");
    const propertySelect    = document.querySelector("ion-select[name='editTriggerProperty']");
    const careInsightRuleSelect = document.querySelector("ion-select[name='editTriggerCareInsightRule']");
    const operatorSelect    = document.querySelector("ion-select[name='editTriggerOperator']");

    let valueSelect;
    if ((document.querySelector("ion-input[name='editTriggerValue']")) && (document.querySelector("ion-input[name='editTriggerValue']") !== undefined)) {
      valueSelect = document.querySelector("ion-input[name='editTriggerValue']");
    }
    else {
      valueSelect = document.querySelector("ion-select[name='editTriggerValue']");
    }

    const submitButton   = document.querySelector("#trigger-submit-button");
    const type = typeSelect?.value || "device_value";

    propertySelect.disabled = true;
    operatorSelect.disabled = true;
    if (valueSelect) valueSelect.disabled = true;
    submitButton.disabled   = true;

    switch (type) {
      case "device_value":
        
        if (deviceSelect.value !== "") {
          propertySelect.disabled = false;
        }
        
        if ((deviceSelect.value !== "") && (propertySelect.value !== "")) {
          operatorSelect.disabled = false;
        }
        
        if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (operatorSelect.value !== "")) {
          if (valueSelect) {
            valueSelect.disabled = false;
          }
        }
        
        if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (operatorSelect.value !== "") && (valueSelect?.value !== "")) {
          submitButton.disabled = false; 
        }
        break;

      case "device_disconnected":
      case "device_connected":
        if (deviceSelect.value !== "") {
          submitButton.disabled = false;
        }
        break;

      case "battery_low":
        if (deviceSelect.value !== "") {
          if (valueSelect) {
            valueSelect.disabled = false;
          }
        }

        if ((deviceSelect.value !== "") && (valueSelect?.value !== "")) {
          submitButton.disabled = false;
        }
        break;

      case "care_insight_opened":
      case "care_insight_updated":
      case "care_insight_resolved":
        if (careInsightRuleSelect.value !== "") {
          submitButton.disabled = false;
        }
        break;


      case "time":
        const timeInput = document.querySelector("ion-input[name='editTriggerTime']");
        if (timeInput?.value) {
          submitButton.disabled = false;
        }
        break;
    }
  }

  /**
   * Show/hide trigger fields based on trigger type
   */
  triggerUpdateFieldVisibility(type) {
    const deviceField       = document.querySelector("#trigger-field-device");
    const propertyField     = document.querySelector("#trigger-field-property");
    const insightTypeField  = document.querySelector("#trigger-field-care-insight-type");
    const operatorField     = document.querySelector("#trigger-field-operator");
    const valueField        = document.querySelector("#trigger-field-value");
    const timeField         = document.querySelector("#trigger-field-time");

    deviceField.style.display       = "none";
    propertyField.style.display     = "none";
    insightTypeField.style.display  = "none";
    operatorField.style.display     = "none";
    valueField.style.display        = "none";
    timeField.style.display         = "none";

    switch (type) {
      
      case "device_value":
        deviceField.style.display   = "";
        propertyField.style.display = "";
        operatorField.style.display = "";
        valueField.style.display    = "";
        break;
      
      case "device_disconnected":
      case "device_connected":
        deviceField.style.display = "";
        break;
      
      case "battery_low":
        deviceField.style.display   = "";
        valueField.style.display    = "";
        break;

      case "care_insight_opened":
      case "care_insight_updated":
      case "care_insight_resolved":
        insightTypeField.style.display  = "";
        deviceField.style.display       = "";
        break;

      case "time":
        timeField.style.display = "";
        break;
    }
  }

  /**
   * Load trigger devices into the select dropdown
   * @param {number|null} selectedDeviceID - Device ID to pre-select (optional)
   * @returns {Promise<void>}
   */
  async loadDataTriggerDevices(selectedDeviceID = null, selectedBridge = null) {
    try {
      const data = await apiGET("/devices/all");
      console.log("API call - Output:", data);
      if (String(data.status) === "ok") {
        this.triggerDevices = data.results || [];
        const selectDevice = document.querySelector("ion-select[name='editTriggerDevice']");
        if ((selectedDeviceID !== null) && (selectedBridge !== null)) {
          const selectedDevice = this.triggerDevices.find(item => String(item.deviceID) === String(selectedDeviceID) && String(item.bridge) === String(selectedBridge));
          if (selectedDevice !== undefined) {
            this.triggerSelectedDevice = selectedDevice;
          }
        }

        selectDevice.innerHTML  = `<ion-select-option value="">${window.Translation.get("None")}</ion-select-option>` + data.results.map(item => {
          return `<ion-select-option value="${this.buildTriggerDeviceOptionValue(item.deviceID, item.bridge)}" data-bridge="${item.bridge}">${item.name} (${item.deviceID}, ${item.bridge})</ion-select-option>`;
        }).join("");

        if ((selectedDeviceID !== null) && (selectedBridge !== null)) {
          selectDevice.value = this.buildTriggerDeviceOptionValue(selectedDeviceID, selectedBridge);
        }
      }
      else {
        toastShow("Error: " + data.error, "danger");
      }
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
  }

  /**
   * Load Care Insight Rules into the select dropdown
   * @param {string|null} selectedRuleID - Rule ID to pre-select (optional)
   */
  async loadDataCareInsightRules(selectedRuleID = null) {
    try {
      const data = await apiGET("/data/care_insight_rules?orderBy=ruleID,DESC");
      if (String(data.status) === "ok") {
        this.triggerCareInsightRules = data.results || [];
        const selectRule = document.querySelector("ion-select[name='editTriggerCareInsightRule']");

        selectRule.innerHTML = `<ion-select-option value="">${window.Translation.get("None")}</ion-select-option>` + this.triggerCareInsightRules.map(item => {
          return `<ion-select-option value="${item.ruleID}">${item.title} (${item.aggregationType})</ion-select-option>`;
        }).join("");

        if (selectedRuleID !== null) {
          selectRule.value = String(selectedRuleID);
        }
      }
      else {
        toastShow("Error: " + data.error, "danger");
      }
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
  }

  setTriggerSelectedDevice(deviceID, bridge) {
    if ((deviceID === undefined) || (deviceID === null) || (deviceID === "")) {
      this.triggerSelectedDevice = null;
      return;
    }

    const selectedDevice = this.triggerDevices.find(item => String(item.deviceID) === String(deviceID) && String(item.bridge) === String(bridge));
    this.triggerSelectedDevice = selectedDevice || null;
  }

  /**
   * Load trigger device properties into the select dropdown
   * @param {String} bridge 
   * @param {String} deviceID 
   * @param {String} selectedProperty - Property to pre-select (optional)
   */
  async loadDataTriggerDeviceProperties(bridge, deviceID, selectedProperty = null) {
    try {
      const data = await apiGET("/devices/" + bridge + "/" + deviceID);
      console.log("API call - Output:", data);
      if (String(data.status) === "ok") {
        this.triggerSelectedDevice = data.device; // Store selected device

        const selectProperty = document.querySelector("ion-select[name='editTriggerProperty']");
        if (selectedProperty !== null) {
          selectProperty.value = selectedProperty;
        }

        selectProperty.innerHTML = `<ion-select-option value="">${window.Translation.get("None")}</ion-select-option>` + data.device.properties.map(item => {
          if (item.read === true) { // Only show readable properties
            if (item.translation != null && item.translation !== "") {
              return `<ion-select-option value="${item.name}">${item.translation[window.appConfig.CONF_language]}</ion-select-option>`;
            }
            else {
              return `<ion-select-option value="${item.name}">${item.name}</ion-select-option>`;
            }
          }
        }).join("");
      }
      else {
        toastShow("Error: " + data.error, "danger");
      }
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
  }

  /**
   * Load trigger device operator into the select dropdown
   * @param {String|null} selectedOperator - Operator to pre-select (optional)
   * @returns {Promise<void>}
   */
  async loadDataTriggerDeviceOperator(selectedOperator = null) {
    const operatorSelect = document.querySelector("ion-select[name='editTriggerOperator']");
    operatorSelect.innerHTML = `
      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
      <ion-select-option value="equals">${window.Translation.get("Equals")}</ion-select-option>
      <ion-select-option value="greater">${window.Translation.get("Greater")}</ion-select-option>
      <ion-select-option value="less">${window.Translation.get("Less")}</ion-select-option>
      <ion-select-option value="between">${window.Translation.get("Between")}</ion-select-option>
      <ion-select-option value="contains">${window.Translation.get("Contains")}</ion-select-option>                      
    `;

    if (selectedOperator !== null) {
      operatorSelect.value = selectedOperator;
    }
  }

  /**
   * Translate properties and values for triggers
   */
  async translateTriggerPropertiesAndValue() {
    for (const item of this.scenarioData.triggers) { // Translate property
      if (!item.deviceProperties || !item.property)
      {
        continue;
      }

      const propertyTranslation = item.deviceProperties.find(property => String(property.name) === String(item.property));
      if (propertyTranslation && propertyTranslation.translation && propertyTranslation.translation[window.appConfig.CONF_language]) {
        item.propertyTranslated = propertyTranslation.translation[window.appConfig.CONF_language];
      }

      const valueTranslation = item.deviceProperties.find(property => String(property.name) === String(item.property)); // Translate value
      if (valueTranslation && valueTranslation.anyValue) {
        const anyValueItem = valueTranslation.anyValue.find(valueItem => Number(valueItem.value) === Number(item.value));
        if (anyValueItem && anyValueItem.translation && anyValueItem.translation[window.appConfig.CONF_language]) {
          item.valueTranslated = anyValueItem.translation[window.appConfig.CONF_language];
        }
      }
    }
  }

  /**
   * Load trigger device property values into the input/select field
   * @param {String} propertyName 
   * @param {String|null} selectedValue 
   */
  async loadDataTriggerDevicePropertiesValues(propertyName, selectedValue = null) {
    const property        = this.triggerSelectedDevice.properties.find(item => String(item.name) === String(propertyName));
    const valueContainer  = document.querySelector("#edit-trigger-value-container");

    if (String(property.valueType) === "Options") {
      valueContainer.innerHTML = `
        <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerValue" label="${window.Translation.get("Value")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
          <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
          ${property.anyValue.map(option => `<ion-select-option value="${option.value}">${option.translation && option.translation[window.appConfig.CONF_language] !== undefined ? option.translation[window.appConfig.CONF_language] : option.value}</ion-select-option>`).join("")}
        </ion-select>
      `;
      if (selectedValue !== null) {
        valueContainer.querySelector("ion-select[name='editTriggerValue']").value = selectedValue;
      }
    }
    else if (String(property.valueType) === "Numeric")  {
      valueContainer.innerHTML = `
        <ion-input type="number" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom"></ion-input>
      `;
      if (selectedValue !== null) {
        valueContainer.querySelector("ion-input[name='editTriggerValue']").value = selectedValue;
      }
    }
    else {
      valueContainer.innerHTML = `
        <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom"></ion-input>
      `;
      if (selectedValue !== null) {
        valueContainer.querySelector("ion-input[name='editTriggerValue']").value = selectedValue;
      }
    }

    const valueInput = valueContainer.querySelector("ion-input[name='editTriggerValue']");
    const valueSelect = valueContainer.querySelector("ion-select[name='editTriggerValue']");

    if (valueInput !== null) {
      valueInput.addEventListener("ionInput", () => {
        this.triggerEnabledDisable();
      });
    }

    if (valueSelect !== null) {
      valueSelect.addEventListener("ionChange", () => {
        this.triggerEnabledDisable();
      });
    }
  }

  /**
   * Render the list of triggers
   */
  triggerRenderList() {
    console.log("Current scenario data:");
    console.log(this.scenarioData);

    this.translateTriggerPropertiesAndValue();

    const listElementTriggers = this.querySelector("#triggers-list");
    listElementTriggers.innerHTML = this.scenarioData.triggers.map((item, index) => {
      const bridgeInfo = item.bridge ? bridgeTranslate(item.bridge) : "";
      const type = item.type || "device_value";

      let cardTitle, cardSubtitle, cardContent;

      if (String(type) === "device_value") {
        let operatorInfo = "";
        switch(item.operator) {
          case "equals":
            operatorInfo = window.Translation.get("Equals");
            break;
          case "greater":
            operatorInfo = window.Translation.get("Greater");
            break;
          case "less":
            operatorInfo = window.Translation.get("Less");
            break;
          case "between":
            operatorInfo = window.Translation.get("Between");
            break;
          case "contains":
            operatorInfo = window.Translation.get("Contains");
            break;
          default:
            operatorInfo = window.Translation.get("Equals");
        }
        cardTitle    = item.deviceName;
        cardSubtitle = `${item.deviceID} (${bridgeInfo})`;
        cardContent  = `
            <ion-text color="light">${item.propertyTranslated ? item.propertyTranslated : item.property}</ion-text>
            <ion-text color="light">${operatorInfo}</ion-text>
            <ion-text color="light">${item.valueTranslated ? item.valueTranslated : item.value}</ion-text>
        `;
      }
      else if (String(type) === "device_disconnected") {
        cardTitle    = item.deviceName;
        cardSubtitle = `${item.deviceID} (${bridgeInfo})`;
        cardContent  = `<ion-text color="light">${window.Translation.get("TriggerTypeDeviceDisconnected")}</ion-text>`;
      }
      else if (String(type) === "device_connected") {
        cardTitle    = item.deviceName;
        cardSubtitle = `${item.deviceID} (${bridgeInfo})`;
        cardContent  = `<ion-text color="light">${window.Translation.get("TriggerTypeDeviceConnected")}</ion-text>`;
      }
      else if (String(type) === "battery_low") {
        cardTitle    = item.deviceName;
        cardSubtitle = `${item.deviceID} (${bridgeInfo})`;
        cardContent  = `<ion-text color="light">${window.Translation.get("TriggerTypeBatteryLow")} &lt; ${item.value}%</ion-text>`;
      }
      else if (["care_insight_opened", "care_insight_updated", "care_insight_resolved"].includes(type)) {
        cardTitle = window.Translation.get(String(type) === "care_insight_opened" ? "TriggerTypeCareInsightOpened" : String(type) === "care_insight_updated" ? "TriggerTypeCareInsightUpdated" : "TriggerTypeCareInsightResolved");
        cardSubtitle = item.ruleTitle || item.property;
        const deviceInfo = item.deviceID ? `${item.deviceName || item.deviceID} (${bridgeInfo})` : window.Translation.get("AllDevices");
        cardContent = `
            <ion-text color="light">${window.Translation.get("CareInsightRule")}: ${item.ruleTitle || item.property}</ion-text>
            <br />
            <ion-text color="light">${window.Translation.get("Device")}: ${deviceInfo}</ion-text>
        `;
      }
      else if (String(type) === "time") {
        cardTitle    = `${window.Translation.get("TriggerTypeTime")}`;
        cardSubtitle = "";
        cardContent  = `<ion-text color="light">${item.value} ${window.Translation.get("OClock")}</ion-text>`;
      }

      return `
        <ion-card color="primary" data-id="${item.triggerID}">
          <ion-card-header>
              <ion-card-title>${cardTitle}</ion-card-title> 
              <ion-card-subtitle>${cardSubtitle}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-row>
              <ion-col>
                  ${cardContent}
              </ion-col>                
            </ion-row>
          </ion-card-content>
          <ion-button data-id="${item.triggerID}" id="trigger-edit-${item.triggerID}" class="trigger-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
          <ion-button data-id="${item.triggerID}" class="trigger-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
        </ion-card>
        <ion-text>${Number(index) < this.scenarioData.triggers.length - 1 ? `<center>${window.Translation.get("And")}</center>` : ""}</ion-text>
    `;
    }).join("");

    this.querySelectorAll(".trigger-delete-option").forEach(button => { // Add event listeners for delete buttons
      button.addEventListener("click", () => {
        const itemDelete = this.querySelector("#triggers-list").querySelector("ion-card[data-id='" + button.getAttribute("data-id") + "']");
        if (itemDelete) {
          this.scenarioData.triggers = this.scenarioData.triggers.filter(item => item.triggerID !== parseInt(button.getAttribute("data-id")));
          this.triggerRenderList();
        }
      });
    });

    this.querySelectorAll(".trigger-edit-option").forEach(button => { // Add event listeners for edit buttons
      button.addEventListener("click", async () => {
        const triggerData = this.scenarioData.triggers.find(item => Number(item.triggerID) === Number(parseInt(button.getAttribute("data-id"))));

        this.triggerID = triggerData.triggerID; // Store the triggerID being edited

        this.resetTriggerEditModalFields();

        const type = triggerData.type || "device_value";
        document.querySelector("ion-select[name='editTriggerType']").value = type;
        this.triggerUpdateFieldVisibility(type);

        if (type !== "time") {
          await this.loadDataTriggerDevices(triggerData.deviceID, triggerData.bridge);
        }

        if (String(type) === "device_value") {
          await this.loadDataTriggerDeviceProperties(triggerData.bridge, triggerData.deviceID, triggerData.property);
          await this.loadDataTriggerDeviceOperator(triggerData.operator);
          await this.loadDataTriggerDevicePropertiesValues(triggerData.property, triggerData.value);
        }
        else if (String(type) === "battery_low") {
          await this.loadDataTriggerDeviceProperties(triggerData.bridge, triggerData.deviceID);
          const valueContainer = document.querySelector("#edit-trigger-value-container");
          valueContainer.innerHTML = `<ion-input type="number" label="${window.Translation.get("BatteryThreshold")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom"></ion-input>`;
          valueContainer.querySelector("ion-input[name='editTriggerValue']").value = triggerData.value;
          valueContainer.querySelector("ion-input[name='editTriggerValue']").addEventListener("ionInput", () => {
            this.triggerEnabledDisable();
          });
        }
        else if (String(type) === "time") {
          document.querySelector("ion-input[name='editTriggerTime']").value = triggerData.value || "";
        }
        else if (["care_insight_opened", "care_insight_updated", "care_insight_resolved"].includes(type)) {
          await this.loadDataCareInsightRules(triggerData.property || null);
          if (triggerData.deviceID) {
            await this.loadDataTriggerDevices(triggerData.deviceID, triggerData.bridge);
          }
        }
        else {
          await this.loadDataTriggerDeviceProperties(triggerData.bridge, triggerData.deviceID);
        }

        this.triggerEnabledDisable();

        const modal = document.querySelector("#trigger-edit-modal");
        await modal.present();
      });
    });
  }
};