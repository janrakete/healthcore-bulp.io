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
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerDevice" label="${window.Translation.get("Device")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>  
                  <ion-item color="light">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerProperty" label="${window.Translation.get("Property")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>                  
                  <ion-item color="light">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerOperator" label="${window.Translation.get("Operator")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                    </ion-select>
                  </ion-item>                  
                  <ion-item color="light">
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
      
      const newTrigger = {
        triggerID:        Date.now(), // Temporary ID, because triggers are not stored in DB separately
        bridge:           this.triggerSelectedDevice.bridge,
        deviceID:         deviceSelect.value,
        deviceName:       this.triggerSelectedDevice.name,
        property:         propertySelect.value,
        operator:         operatorSelect.value,
        value:            valueSelect.value,
        valueType:        isNaN(valueSelect.value) ? "String" : "Numeric",
        deviceProperties: this.triggerSelectedDevice.properties
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
      this.triggerEnabledDisable();
      this.loadDataTriggerDevices();
      this.loadDataTriggerDeviceOperator();

      const modal = document.querySelector("#trigger-edit-modal");
      await modal.present();
    });

    /**
     * Event listener for trigger device select change
     */
    this.querySelector("ion-select[name='editTriggerDevice']").addEventListener("ionChange", async (event) => {
      const deviceID  = event.detail.value;
      const bridge    = event.target.querySelector(`ion-select-option[value="${deviceID}"]`)?.getAttribute("data-bridge");
      await this.loadDataTriggerDeviceProperties(bridge, deviceID);
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
    const deviceSelect   = document.querySelector("ion-select[name='editTriggerDevice']");
    const propertySelect = document.querySelector("ion-select[name='editTriggerProperty']");
    const operatorSelect = document.querySelector("ion-select[name='editTriggerOperator']");
    const valueContainer = document.querySelector("#edit-trigger-value-container");

    deviceSelect.value    = "";
    propertySelect.value  = "";
    operatorSelect.value  = "";
    valueContainer.innerHTML = `
      <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" shape="round" fill="outline" class="custom" disabled="true"></ion-input>
    `;
  }

  /**
   * Enable/Disable trigger edit modal fields based on selections
   */
  async triggerEnabledDisable() {
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

    propertySelect.disabled = true;
    operatorSelect.disabled = true;
    valueSelect.disabled    = true;
    submitButton.disabled   = true;

    if (deviceSelect.value !== "") {
      propertySelect.disabled = false;
    }

    if ((deviceSelect.value !== "") && (propertySelect.value !== "")) {
      operatorSelect.disabled = false;
    }

    if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (operatorSelect.value !== "")) {
      valueSelect.disabled    = false;
    }

    if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (operatorSelect.value !== "") && (valueSelect.value !== "")) {
      submitButton.disabled   = false; 
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
  async translatePropertiesAndValue() {
    for (const item of this.scenarioData.triggers) { // Translate property
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
    console.log("Current trigger data:");
    console.log(this.scenarioData);

    this.translatePropertiesAndValue();

    const listElementTriggers = this.querySelector("#triggers-list");
    listElementTriggers.innerHTML = this.scenarioData.triggers.map((item, index) => {
      const bridgeInfo = bridgeTranslate(item.bridge);

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

      return `
        <ion-card color="primary" data-id="${item.triggerID}">
          <ion-card-header>
              <ion-card-title>${item.deviceName}</ion-card-title> 
              <ion-card-subtitle>${item.deviceID} (${bridgeInfo})</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-row>
              <ion-col>
                  <ion-text color="light">${item.propertyTranslated ? item.propertyTranslated : item.property}</ion-text> <ion-text color="light">${operatorInfo}</ion-text> <ion-text color="light">${item.valueTranslated ? item.valueTranslated : item.value}</ion-text>
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

        await this.loadDataTriggerDevices(triggerData.deviceID); 
        await this.loadDataTriggerDeviceProperties(triggerData.bridge, triggerData.deviceID, triggerData.property);
        await this.loadDataTriggerDeviceOperator(triggerData.operator);
        await this.loadDataTriggerDevicePropertiesValues(triggerData.property, triggerData.value);

        this.triggerEnabledDisable();

        const modal = document.querySelector("#trigger-edit-modal");
        await modal.present();
      });
    });
  }
};