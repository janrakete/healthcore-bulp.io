/**
 * Scenario Edit - Action logic
 */

import { apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { bridgeTranslate } from "../services/helper.js";

export const ScenarioEditActions = (Base) => class extends Base {
  actionSelectedDevice  = null;
  actionID              = null;

  /**
   * Render the HTML for the action edit modal
   * @returns HTML string
   */  
  getActionEditModalHTML() {
    return `
      <ion-modal id="action-edit-modal">
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
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editActionDevice" label="${window.Translation.get("Device")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>  
                  <ion-item color="light">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editActionProperty" label="${window.Translation.get("Property")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>                                   
                  <ion-item color="light">
                    <div id ="edit-action-value-container">
                    </div>
                  </ion-item>                  
                  <ion-item color="light">
                    <ion-input type="number" label="${window.Translation.get("Delay")}" label-placement="stacked" name="editActionDelay" placeholder="${window.Translation.get("Seconds")}" shape="round" fill="outline" class="custom"></ion-input>
                  </ion-item>
                </ion-list>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-button expand="block" color="success" id="action-submit-button"><ion-icon slot="start" name="checkmark-sharp"></ion-icon> ${window.Translation.get("Save")}</ion-button>      
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-button expand="block" color="danger" id="action-cancel-button"><ion-icon slot="start" name="close-sharp"></ion-icon> ${window.Translation.get("Cancel")}</ion-button>      
              </ion-col>
            </ion-row>            
          </ion-grid>
        </ion-content>      
      </ion-modal>
    `;
  }

  /**
   * Setup event listeners for action edit modal
   */
  setupActionEvents() {

    /**
     * Event listener for action submit button
     */
    this.querySelector("#action-submit-button")?.addEventListener("click", () => {
      const deviceSelect   = document.querySelector("ion-select[name='editActionDevice']");
      const propertySelect = document.querySelector("ion-select[name='editActionProperty']");
      const delayInput     = document.querySelector("ion-input[name='editActionDelay']");

      let valueSelect;
      if ((document.querySelector("ion-input[name='editActionValue']")) && (document.querySelector("ion-input[name='editActionValue']") !== undefined)) {
        valueSelect = document.querySelector("ion-input[name='editActionValue']");
      }
      else {
        valueSelect = document.querySelector("ion-select[name='editActionValue']");
      }

      const newAction = {
        actionID:         Date.now(),
        bridge:           this.actionSelectedDevice.bridge,
        deviceID:         deviceSelect.value,
        deviceName:       this.actionSelectedDevice.name,
        property:         propertySelect.value,
        value:            valueSelect.value,
        valueType:        isNaN(valueSelect.value) ? "String" : "Numeric",
        delay:            parseInt(delayInput.value) > 0 ? parseInt(delayInput.value) : 0,
        deviceProperties: this.actionSelectedDevice.properties
      };

      this.scenarioData.actions.push(newAction);

      if (this.actionID !== null) { // If editing an existing action, remove the old one
        this.scenarioData.actions = this.scenarioData.actions.filter(item => item.actionID !== this.actionID);
        this.actionID             = null; // Reset actionID after editing
      }

      this.actionRenderList();

      const modal = document.querySelector("#action-edit-modal");
      modal.dismiss();
    });

    /**
     * Event listener for action cancel button
     */    
    this.querySelector("#action-cancel-button")?.addEventListener("click", () => {
      const modal = document.querySelector("#action-edit-modal");
      modal.dismiss(null, "cancel");
    });

    /*
     * Event listener for open action modal button
     */
    this.querySelector("#open-action-id")?.addEventListener("click", async () => {
      this.actionID = null;

      this.resetActionEditModalFields();
      this.actionEnabledDisable();
      this.loadDataActionDevices();

      const modal = document.querySelector("#action-edit-modal");
      await modal.present();
    });

    /**
     * Event listener for action device select change
     */
    this.querySelector("ion-select[name='editActionDevice']").addEventListener("ionChange", async (event) => {
      const deviceID  = event.detail.value;
      const bridge    = event.target.querySelector(`ion-select-option[value="${deviceID}"]`)?.getAttribute("data-bridge");
      await this.loadDataActionDeviceProperties(bridge, deviceID);
      this.actionEnabledDisable();
    });

    /**
     * Event listener for action property select change
     */    
    this.querySelector("ion-select[name='editActionProperty']").addEventListener("ionChange", async (event) => {
      const propertyName  = event.detail.value;
      await this.loadDataActionDevicePropertiesValues(propertyName);
      this.actionEnabledDisable();
    });
  }

  /**
   * Reset action edit modal fields
   */
  async resetActionEditModalFields() {
    const deviceSelect   = document.querySelector("ion-select[name='editActionDevice']");
    const propertySelect = document.querySelector("ion-select[name='editActionProperty']");
    const valueContainer = document.querySelector("#edit-action-value-container");
    const delayInput     = document.querySelector("ion-input[name='editActionDelay']");

    deviceSelect.value    = "";
    propertySelect.value  = "";
    delayInput.value      = "";

    valueContainer.innerHTML = `
      <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editActionValue" shape="round" fill="outline" class="custom" disabled="true"></ion-input>
    `;
  }

  /**
   * Enable/Disable action edit modal fields based on selections
   */
  async actionEnabledDisable() {
    const deviceSelect   = document.querySelector("ion-select[name='editActionDevice']");
    const propertySelect = document.querySelector("ion-select[name='editActionProperty']");
    const delayInput     = document.querySelector("ion-input[name='editActionDelay']");

    let valueSelect;
    if ((document.querySelector("ion-input[name='editActionValue']")) && (document.querySelector("ion-input[name='editActionValue']") !== undefined)) {
      valueSelect = document.querySelector("ion-input[name='editActionValue']");
    }
    else {
      valueSelect = document.querySelector("ion-select[name='editActionValue']");
    }

    const submitButton   = document.querySelector("#action-submit-button");

    propertySelect.disabled = true;
    valueSelect.disabled    = true;
    delayInput.disabled     = true;
    submitButton.disabled   = true;

    if (deviceSelect.value !== "") {
      propertySelect.disabled = false;
    }

    if ((deviceSelect.value !== "") && (propertySelect.value !== "")) {
      valueSelect.disabled = false;
    }

    if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (valueSelect.value !== "")) {
      delayInput.disabled = false;
    }

    if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (valueSelect.value !== "") && ((delayInput.value === ""))) {
      submitButton.disabled = false;
    }
  }

  /**
   * Load action devices into the select dropdown
   * @param {number|null} selectedDeviceID - Device ID to pre-select (optional)
   * @returns {Promise<void>}
   */
  async loadDataActionDevices(selectedDeviceID = null) {
    try {
      const data = await apiGET("/devices/all");
      console.log("API call - Output:", data);
      if (data.status === "ok") {
        const selectDevice = document.querySelector("ion-select[name='editActionDevice']");
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
   * Load action device properties into the select dropdown
   * @param {String} bridge 
   * @param {String} deviceID 
   * @param {String} selectedProperty - Property to pre-select (optional)
   */  
  async loadDataActionDeviceProperties(bridge, deviceID, selectedProperty = null) {
    try {
      const data = await apiGET("/devices/" + bridge + "/" + deviceID);
      console.log("API call - Output:", data);
      if (data.status === "ok") {
        this.actionSelectedDevice = data.device; // Store selected device

        const selectProperty = document.querySelector("ion-select[name='editActionProperty']");
        if (selectedProperty !== null) {
          selectProperty.value = selectedProperty;
        }

        selectProperty.innerHTML = `<ion-select-option value="">${window.Translation.get("None")}</ion-select-option>` + data.device.properties.map(item => {
          if (item.write === true) { // Only show writable properties          
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
   * Translate properties and values for actions
   */
  async translateActionsPropertiesAndValue() {
    for (const item of this.scenarioData.actions) { // Translate property
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
   * Load action device property values into the input/select field
   * @param {String} propertyName 
   * @param {String|null} selectedValue 
   */
  async loadDataActionDevicePropertiesValues(propertyName, selectedValue = null) {
    const property        = this.actionSelectedDevice.properties.find(item => item.name === propertyName);
    const valueContainer  = document.querySelector("#edit-action-value-container");

    if (property.valueType === "Options") {
      valueContainer.innerHTML = `
        <ion-select interface="popover" class="custom" label-placement="stacked" name="editActionValue" label="${window.Translation.get("Value")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
          <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
          ${property.anyValue.map(option => `<ion-select-option value="${option.value}">${option.translation && option.translation[window.appConfig.CONF_language] !== undefined ? option.translation[window.appConfig.CONF_language] : option.value}</ion-select-option>`).join("")}
        </ion-select>
      `;
      if (selectedValue !== null) {
        valueContainer.querySelector("ion-select[name='editActionValue']").value = selectedValue;
      }
    }
    else if (property.valueType === "Numeric")  {
      valueContainer.innerHTML = `
        <ion-input type="number" label="${window.Translation.get("Value")}" label-placement="stacked" name="editActionValue" shape="round" fill="outline" class="custom"></ion-input>
      `;
      if (selectedValue !== null) {
        valueContainer.querySelector("ion-input[name='editActionValue']").value = selectedValue;
      }
    }
    else {
      valueContainer.innerHTML = `
        <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editActionValue" shape="round" fill="outline" class="custom"></ion-input>
      `;
      if (selectedValue !== null) {
        valueContainer.querySelector("ion-input[name='editActionValue']").value = selectedValue;
      }
    }

    const valueInput = valueContainer.querySelector("ion-input[name='editActionValue']");
    const valueSelect = valueContainer.querySelector("ion-select[name='editActionValue']");

    if (valueInput !== null) {
      valueInput.addEventListener("ionInput", () => {
        this.actionEnabledDisable();
      });
    }

    if (valueSelect !== null) {
      valueSelect.addEventListener("ionChange", () => {
        this.actionEnabledDisable();
      });
    }
  }

  /**
   * Render the list of actions
   */
  actionRenderList() {
    console.log("Current scenario data:");
    console.log(this.scenarioData);

    this.translateActionsPropertiesAndValue();

    const listElementActions = this.querySelector("#actions-list");
    listElementActions.innerHTML = this.scenarioData.actions.map((item, index) => {
      const bridgeInfo = bridgeTranslate(item.bridge);

      return `
        <ion-card color="primary" data-id="${item.actionID}">
          <ion-card-header>
              <ion-card-title>${item.deviceName}</ion-card-title>
              <ion-card-subtitle>${item.deviceID} (${bridgeInfo})</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-row>
              <ion-col>
                  <ion-text color="light">${item.propertyTranslated ? item.propertyTranslated : item.property}</ion-text>
                  <ion-text color="light">${window.Translation.get("SetTo")}</ion-text>
                  <ion-text color="light">${item.valueTranslated ? item.valueTranslated : item.value}</ion-text>
                  ${item.delay ? `<ion-text color="light"> (${window.Translation.get("Delay")}: ${item.delay} ${window.Translation.get("Seconds")})</ion-text>` : ``}
              </ion-col>
            </ion-row>
          </ion-card-content>
          <ion-button data-id="${item.actionID}" id="action-edit-${item.actionID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
          <ion-button data-id="${item.actionID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
        </ion-card>
        <ion-text>${index < this.scenarioData.actions.length - 1 ? `<center>${window.Translation.get("And")}</center>` : ""}</ion-text>
    `;
    }).join("");

    this.querySelectorAll(".action-delete-option").forEach(button => { // Add event listeners for delete buttons
      button.addEventListener("click", () => {
        const itemDelete = this.querySelector("#actions-list").querySelector("ion-card[data-id='" + button.getAttribute("data-id") + "']");
        if (itemDelete) {
          this.scenarioData.actions = this.scenarioData.actions.filter(item => item.actionID !== parseInt(button.getAttribute("data-id")));
          this.actionRenderList();
        }
      });
    });

    this.querySelectorAll(".action-edit-option").forEach(button => {
      button.addEventListener("click", async () => {
        const actionData = this.scenarioData.actions.find(item => item.actionID === parseInt(button.getAttribute("data-id")));
        
        this.actionID = actionData.actionID;  

        this.resetActionEditModalFields();

        await this.loadDataActionDevices(actionData.deviceID);
        await this.loadDataActionDeviceProperties(actionData.bridge, actionData.deviceID, actionData.property);
        await this.loadDataActionDevicePropertiesValues(actionData.property, actionData.value);

        this.actionEnabledDisable();

        const modal = document.querySelector("#action-edit-modal");
        await modal.present();
      });
    });
  }
};
