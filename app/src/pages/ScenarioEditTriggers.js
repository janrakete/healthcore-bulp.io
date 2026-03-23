/**
 * Scenario Edit - Trigger logic
 */

import { apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { bridgeTranslate } from "../services/helper.js";

export const ScenarioEditTriggers = (Base) => class extends Base {
  triggerSelectedDevice = null;
  triggerID             = null;

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
                  <ion-item color="light" id="trigger-field-operator">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerOperator" label="${window.Translation.get("Operator")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                    </ion-select>
                  </ion-item>                  
                  <ion-item color="light" id="trigger-field-value">
                    <div id="edit-trigger-value-container">
                    </div>
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
      const typeSelect     = document.querySelector("ion-select[name='editTriggerType']");
      const deviceSelect   = document.querySelector("ion-select[name='editTriggerDevice']");
      const propertySelect = document.querySelector("ion-select[name='editTriggerProperty']");
      const operatorSelect = document.querySelector("ion-select[name='editTriggerOperator']");
      const type           = typeSelect.value;
      
      let valueSelect;
      if ((document.querySelector("ion-input[name='editTriggerValue']")) && (document.querySelector("ion-input[name='editTriggerValue']") !== undefined)) {
        valueSelect = document.querySelector("ion-input[name='editTriggerValue']");
      }
      else {
        valueSelect = document.querySelector("ion-select[name='editTriggerValue']");
      }
      
      const newTrigger = {
        triggerID:        Date.now(),
        type:             type,
        bridge:           this.triggerSelectedDevice?.bridge || null,
        deviceID:         deviceSelect.value || null,
        deviceName:       this.triggerSelectedDevice?.name || null,
        property:         type === "device_value" ? propertySelect.value : null,
        operator:         type === "device_value" ? operatorSelect.value : null,
        value:            (type === "device_value" || type === "battery_low") ? valueSelect.value : null,
        valueType:        (type === "device_value" || type === "battery_low") ? (isNaN(valueSelect.value) ? "String" : "Numeric") : null,
        deviceProperties: this.triggerSelectedDevice?.properties || []
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

      const modal = document.querySelector("#trigger-edit-modal");
      await modal.present();
    });

    /**
     * Event listener for trigger type select change
     */
    this.querySelector("ion-select[name='editTriggerType']").addEventListener("ionChange", (event) => {
      const type = event.detail.value;
      const deviceSelect   = document.querySelector("ion-select[name='editTriggerDevice']");
      const propertySelect = document.querySelector("ion-select[name='editTriggerProperty']");
      const operatorSelect = document.querySelector("ion-select[name='editTriggerOperator']");
      const valueContainer = document.querySelector("#edit-trigger-value-container");

      deviceSelect.value    = "";
      propertySelect.value  = "";
      operatorSelect.value  = "";
      valueContainer.innerHTML = `<ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom" disabled="true"></ion-input>`;
      this.triggerSelectedDevice = null;
      this.triggerUpdateFieldVisibility(type);
      this.triggerEnabledDisable();
    });

    /**
     * Event listener for trigger device select change
     */
    this.querySelector("ion-select[name='editTriggerDevice']").addEventListener("ionChange", async (event) => {
      const deviceID  = event.detail.value;
      const bridge    = event.target.querySelector(`ion-select-option[value="${deviceID}"]`)?.getAttribute("data-bridge");
      const type      = document.querySelector("ion-select[name='editTriggerType']")?.value || "device_value";

      await this.loadDataTriggerDeviceProperties(bridge, deviceID);

      if (type === "battery_low") {
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
    const typeSelect     = document.querySelector("ion-select[name='editTriggerType']");
    const deviceSelect   = document.querySelector("ion-select[name='editTriggerDevice']");
    const propertySelect = document.querySelector("ion-select[name='editTriggerProperty']");
    const operatorSelect = document.querySelector("ion-select[name='editTriggerOperator']");
    const valueContainer = document.querySelector("#edit-trigger-value-container");

    typeSelect.value         = "device_value";
    deviceSelect.value       = "";
    propertySelect.value     = "";
    operatorSelect.value     = "";
    valueContainer.innerHTML = `
      <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom" disabled="true"></ion-input>
    `;
  }

  /**
   * Enable/Disable trigger edit modal fields based on selections
   */
  async triggerEnabledDisable() {
    const typeSelect     = document.querySelector("ion-select[name='editTriggerType']");
    const deviceSelect   = document.querySelector("ion-select[name='editTriggerDevice']");
    const propertySelect = document.querySelector("ion-select[name='editTriggerProperty']");
    const operatorSelect = document.querySelector("ion-select[name='editTriggerOperator']");

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
    }
  }

  /**
   * Show/hide trigger fields based on trigger type
   */
  triggerUpdateFieldVisibility(type) {
    const deviceField   = document.querySelector("#trigger-field-device");
    const propertyField = document.querySelector("#trigger-field-property");
    const operatorField = document.querySelector("#trigger-field-operator");
    const valueField    = document.querySelector("#trigger-field-value");

    deviceField.style.display   = "none";
    propertyField.style.display = "none";
    operatorField.style.display = "none";
    valueField.style.display    = "none";

    switch (type) {
      
      case "device_value":
        deviceField.style.display   = "";
        propertyField.style.display = "";
        operatorField.style.display = "";
        valueField.style.display    = "";
        break;
      
      case "device_disconnected":
      case "device_connected":
        deviceField.style.display   = "";
        break;
      
      case "battery_low":
        deviceField.style.display   = "";
        valueField.style.display    = "";
        break;
    }
  }

  /**
   * Load trigger devices into the select dropdown
   * @param {number|null} selectedDeviceID - Device ID to pre-select (optional)
   * @returns {Promise<void>}
   */
  async loadDataTriggerDevices(selectedDeviceID = null) {
    try {
      const data = await apiGET("/devices/all");
      console.log("API call - Output:", data);
      if (data.status === "ok") {
        const selectDevice = document.querySelector("ion-select[name='editTriggerDevice']");
        if (selectedDeviceID !== null) {
          selectDevice.value = selectedDeviceID;
        }

        selectDevice.innerHTML  = `<ion-select-option value="">${window.Translation.get("None")}</ion-select-option>` + data.results.map(item => {
          return `<ion-select-option value="${item.deviceID}" data-bridge="${item.bridge}">${item.name} (${item.deviceID}, ${item.bridge})</ion-select-option>`;
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
   * Load trigger device properties into the select dropdown
   * @param {String} bridge 
   * @param {String} deviceID 
   * @param {String} selectedProperty - Property to pre-select (optional)
   */
  async loadDataTriggerDeviceProperties(bridge, deviceID, selectedProperty = null) {
    try {
      const data = await apiGET("/devices/" + bridge + "/" + deviceID);
      console.log("API call - Output:", data);
      if (data.status === "ok") {
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

      const propertyTranslation = item.deviceProperties.find(property => property.name === item.property);
      if (propertyTranslation && propertyTranslation.translation && propertyTranslation.translation[window.appConfig.CONF_language]) {
        item.propertyTranslated = propertyTranslation.translation[window.appConfig.CONF_language];
      }

      const valueTranslation = item.deviceProperties.find(property => property.name === item.property); // Translate value
      if (valueTranslation && valueTranslation.anyValue) {
        const anyValueItem = valueTranslation.anyValue.find(valueItem => valueItem.value === item.value);
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
    const property        = this.triggerSelectedDevice.properties.find(item => item.name === propertyName);
    const valueContainer  = document.querySelector("#edit-trigger-value-container");

    if (property.valueType === "Options") {
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
    else if (property.valueType === "Numeric")  {
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

      if (type === "device_value") {
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
      } else if (type === "device_disconnected") {
        cardTitle    = item.deviceName;
        cardSubtitle = `${item.deviceID} (${bridgeInfo})`;
        cardContent  = `<ion-text color="light"><ion-icon name="cloud-offline-sharp" color="danger"></ion-icon> ${window.Translation.get("TriggerTypeDeviceDisconnected")}</ion-text>`;
      } else if (type === "device_connected") {
        cardTitle    = item.deviceName;
        cardSubtitle = `${item.deviceID} (${bridgeInfo})`;
        cardContent  = `<ion-text color="light"><ion-icon name="cloud-done-sharp" color="success"></ion-icon> ${window.Translation.get("TriggerTypeDeviceConnected")}</ion-text>`;
      } else if (type === "battery_low") {
        cardTitle    = item.deviceName;
        cardSubtitle = `${item.deviceID} (${bridgeInfo})`;
        cardContent  = `<ion-text color="light"><ion-icon name="battery-dead-sharp" color="warning"></ion-icon> ${window.Translation.get("TriggerTypeBatteryLow")} &lt; ${item.value}%</ion-text>`;
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
        <ion-text>${index < this.scenarioData.triggers.length - 1 ? `<center>${window.Translation.get("And")}</center>` : ""}</ion-text>
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
        const triggerData = this.scenarioData.triggers.find(item => item.triggerID === parseInt(button.getAttribute("data-id")));

        this.triggerID = triggerData.triggerID; // Store the triggerID being edited

        this.resetTriggerEditModalFields();

        const type = triggerData.type || "device_value";
        document.querySelector("ion-select[name='editTriggerType']").value = type;
        this.triggerUpdateFieldVisibility(type);

        await this.loadDataTriggerDevices(triggerData.deviceID);

        if (type === "device_value") {
          await this.loadDataTriggerDeviceProperties(triggerData.bridge, triggerData.deviceID, triggerData.property);
          await this.loadDataTriggerDeviceOperator(triggerData.operator);
          await this.loadDataTriggerDevicePropertiesValues(triggerData.property, triggerData.value);
        }
        else if (type === "battery_low") {
          await this.loadDataTriggerDeviceProperties(triggerData.bridge, triggerData.deviceID);
          const valueContainer = document.querySelector("#edit-trigger-value-container");
          valueContainer.innerHTML = `<ion-input type="number" label="${window.Translation.get("BatteryThreshold")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom"></ion-input>`;
          valueContainer.querySelector("ion-input[name='editTriggerValue']").value = triggerData.value;
          valueContainer.querySelector("ion-input[name='editTriggerValue']").addEventListener("ionInput", () => {
            this.triggerEnabledDisable();
          });
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