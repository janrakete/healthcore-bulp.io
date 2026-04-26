/**
 * Scenario Edit - Action logic
 */

import { apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { bridgeTranslate, stringCut } from "../services/helper.js";

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
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editActionType" label="${window.Translation.get("ActionType")}" value="set_device_value">
                      <ion-select-option value="set_device_value">${window.Translation.get("ActionTypeSetDeviceValue")}</ion-select-option>
                      <ion-select-option value="push_notification">${window.Translation.get("ActionTypePushNotification")}</ion-select-option>
                      <ion-select-option value="notification">${window.Translation.get("ActionTypeNotification")}</ion-select-option>
                    </ion-select>
                  </ion-item>  
                  <ion-item color="light" id="action-field-device">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editActionDevice" label="${window.Translation.get("Device")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>  
                  <ion-item color="light" id="action-field-property">
                    <ion-select interface="popover" class="custom" label-placement="stacked" name="editActionProperty" label="${window.Translation.get("Property")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                    </ion-select>
                  </ion-item>                                   
                  <ion-item color="light" id="action-field-value">
                    <div id ="edit-action-value-container">
                    </div>
                  </ion-item>                  
                  <ion-item color="light" id="action-field-delay">
                    <ion-input type="number" label="${window.Translation.get("Delay")}" label-placement="stacked" name="editActionDelay" placeholder="${window.Translation.get("Seconds")}" shape="round" fill="outline" class="custom"></ion-input>
                  </ion-item>
                  <ion-item color="light" id="action-field-push-title">
                    <ion-input type="text" label="${window.Translation.get("Title")}" label-placement="stacked" name="editActionPushTitle" shape="round" fill="outline" class="custom"></ion-input>
                  </ion-item>
                  <ion-item color="light" id="action-field-push-message">
                    <ion-input type="text" label="${window.Translation.get("Message")}" label-placement="stacked" name="editActionPushMessage" shape="round" fill="outline" class="custom"></ion-input>
                  </ion-item>
                  <ion-item color="light" id="action-field-notification-text">
                    <ion-input type="text" label="${window.Translation.get("Text")}" label-placement="stacked" name="editActionNotificationText" shape="round" fill="outline" class="custom"></ion-input>
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
      const typeSelect = document.querySelector("ion-select[name='editActionType']");
      const type       = typeSelect.value;

      let newAction;

      if (String(type) === "set_device_value") {
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

        newAction = {
          actionID:         Date.now(),
          type:             type,
          bridge:           this.actionSelectedDevice.bridge,
          uuid:             deviceSelect.value,
          deviceName:       this.actionSelectedDevice.name,
          property:         propertySelect.value,
          value:            valueSelect.value,
          valueType:        isNaN(valueSelect.value) ? "String" : "Numeric",
          delay:            Number(parseInt(delayInput.value)) > 0 ? parseInt(delayInput.value) : 0,
          deviceProperties: this.actionSelectedDevice.properties
        };
      }
      else if (String(type) === "push_notification") {
        const titleInput   = document.querySelector("ion-input[name='editActionPushTitle']");
        const messageInput = document.querySelector("ion-input[name='editActionPushMessage']");

        newAction = {
          actionID:         Date.now(),
          type:             type,
          value:            titleInput.value,
          property:         messageInput.value,
          deviceProperties: []
        };
      }
      else if (String(type) === "notification") {
        const textInput = document.querySelector("ion-input[name='editActionNotificationText']");

        newAction = {
          actionID:         Date.now(),
          type:             type,
          value:            textInput.value,
          deviceProperties: []
        };
      }

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
      this.actionUpdateFieldVisibility("set_device_value");
      this.actionEnabledDisable();
      this.dataLoadActionDevices();

      const modal = document.querySelector("#action-edit-modal");
      await modal.present();
    });

    /**
     * Event listener for action type select change
     */
    this.querySelector("ion-select[name='editActionType']").addEventListener("ionChange", (event) => {
      const type = event.detail.value;
      document.querySelector("ion-select[name='editActionDevice']").value           = "";
      document.querySelector("ion-select[name='editActionProperty']").value         = "";
      document.querySelector("ion-input[name='editActionDelay']").value             = "";
      document.querySelector("ion-input[name='editActionPushTitle']").value         = "";
      document.querySelector("ion-input[name='editActionPushMessage']").value       = "";
      document.querySelector("ion-input[name='editActionNotificationText']").value  = "";
      
      const valueContainer = document.querySelector("#edit-action-value-container");
      valueContainer.innerHTML = `<ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editActionValue" shape="round" fill="outline" class="custom" disabled="true"></ion-input>`;
      
      this.actionSelectedDevice = null;
      this.actionUpdateFieldVisibility(type);
      this.actionEnabledDisable();
    });

    /**
     * Event listeners for push/notification input fields
     */
    this.querySelector("ion-input[name='editActionPushTitle']")?.addEventListener("ionInput", () => this.actionEnabledDisable());
    this.querySelector("ion-input[name='editActionPushMessage']")?.addEventListener("ionInput", () => this.actionEnabledDisable());
    this.querySelector("ion-input[name='editActionNotificationText']")?.addEventListener("ionInput", () => this.actionEnabledDisable());

    /**
     * Event listener for action device select change
     */
    this.querySelector("ion-select[name='editActionDevice']").addEventListener("ionChange", async (event) => {
      const deviceID  = event.detail.value;
      const bridge    = event.target.querySelector(`ion-select-option[value="${deviceID}"]`)?.getAttribute("data-bridge");
      await this.dataLoadActionDeviceProperties(bridge, deviceID);
      this.actionEnabledDisable();
    });

    /**
     * Event listener for action property select change
     */    
    this.querySelector("ion-select[name='editActionProperty']").addEventListener("ionChange", async (event) => {
      const propertyName  = event.detail.value;
      await this.dataLoadActionDevicePropertiesValues(propertyName);
      this.actionEnabledDisable();
    });
  }

  /**
   * Reset action edit modal fields
   */
  async resetActionEditModalFields() {
    const typeSelect       = document.querySelector("ion-select[name='editActionType']");
    const deviceSelect     = document.querySelector("ion-select[name='editActionDevice']");
    const propertySelect   = document.querySelector("ion-select[name='editActionProperty']");
    const valueContainer   = document.querySelector("#edit-action-value-container");
    const delayInput       = document.querySelector("ion-input[name='editActionDelay']");
    const pushTitle        = document.querySelector("ion-input[name='editActionPushTitle']");
    const pushMessage      = document.querySelector("ion-input[name='editActionPushMessage']");
    const notificationText = document.querySelector("ion-input[name='editActionNotificationText']");

    typeSelect.value      = "set_device_value";
    deviceSelect.value    = "";
    propertySelect.value  = "";
    delayInput.value      = "";

    if (pushTitle) {
      pushTitle.value = "";
    }
    
    if (pushMessage) {
      pushMessage.value = "";
    }

    if (notificationText) {
      notificationText.value = "";
    }

    valueContainer.innerHTML = `
      <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editActionValue" shape="round" fill="outline" class="custom" disabled="true"></ion-input>
    `;
  }

  /**
   * Enable/Disable action edit modal fields based on selections
   */
  async actionEnabledDisable() {
    const typeSelect     = document.querySelector("ion-select[name='editActionType']");
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

    const submitButton  = document.querySelector("#action-submit-button");
    const type          = typeSelect?.value || "set_device_value";

    propertySelect.disabled = true;
    
    if (valueSelect) {
      valueSelect.disabled = true;
    }
    
    delayInput.disabled     = true;
    submitButton.disabled   = true;

    switch (type) {
      case "set_device_value":
        if (deviceSelect.value !== "") {
          propertySelect.disabled = false;
        }
        
        if ((deviceSelect.value !== "") && (propertySelect.value !== "")) {
          if (valueSelect) valueSelect.disabled = false;
        }
        
        if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (valueSelect?.value !== "")) {
          delayInput.disabled = false;
        }
        
        if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (valueSelect?.value !== "")) {
          submitButton.disabled = false;
        }
        break;

      case "push_notification":
        const pushTitle   = document.querySelector("ion-input[name='editActionPushTitle']");
        const pushMessage = document.querySelector("ion-input[name='editActionPushMessage']");
        if (pushTitle?.value?.trim() && pushMessage?.value?.trim()) {
          submitButton.disabled = false;
        }
        break;

      case "notification":
        const notificationText = document.querySelector("ion-input[name='editActionNotificationText']");
        if (notificationText?.value?.trim()) {
          submitButton.disabled = false;
        }
        break;
    }
  }

  /**
   * Show/hide action fields based on action type
   */
  actionUpdateFieldVisibility(type) {
    const deviceField      = document.querySelector("#action-field-device");
    const propertyField    = document.querySelector("#action-field-property");
    const valueField       = document.querySelector("#action-field-value");
    const delayField       = document.querySelector("#action-field-delay");
    const pushTitle        = document.querySelector("#action-field-push-title");
    const pushMessage      = document.querySelector("#action-field-push-message");
    const notificationText = document.querySelector("#action-field-notification-text");

    deviceField.style.display      = "none";
    propertyField.style.display    = "none";
    valueField.style.display       = "none";
    delayField.style.display       = "none";
    pushTitle.style.display        = "none";
    pushMessage.style.display      = "none";
    notificationText.style.display = "none";

    switch (type) {
      case "set_device_value":
        deviceField.style.display   = "";
        propertyField.style.display = "";
        valueField.style.display    = "";
        delayField.style.display    = "";
        break;

      case "push_notification":
        pushTitle.style.display   = "";
        pushMessage.style.display = "";
        break;

      case "notification":
        notificationText.style.display = "";
        break;
    }
  }

  /**
   * Load action devices into the select dropdown
   * @param {number|null} selectedDeviceID - Device ID to pre-select (optional)
   * @returns {Promise<void>}
   */
  async dataLoadActionDevices(selectedDeviceID = null) {
    try {
      const data = await apiGET("/devices/all");
      console.log("API call - Output:", data);
      if (String(data.status) === "ok") {
        const selectDevice = document.querySelector("ion-select[name='editActionDevice']");
        if (selectedDeviceID !== null) {
          selectDevice.value = selectedDeviceID;
        }

        selectDevice.innerHTML  = `<ion-select-option value="">${window.Translation.get("None")}</ion-select-option>` + data.results.map(item => {
          return `<ion-select-option value="${item.uuid}" data-bridge="${item.bridge}">${item.name} (${item.uuid}, ${item.bridge})</ion-select-option>`;
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
  async dataLoadActionDeviceProperties(bridge, deviceID, selectedProperty = null) {
    try {
      const data = await apiGET("/devices/" + bridge + "/" + deviceID);
      console.log("API call - Output:", data);
      if (String(data.status) === "ok") {
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
      if (!item.deviceProperties || !item.property) {
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
   * Load action device property values into the input/select field
   * @param {String} propertyName 
   * @param {String|null} selectedValue 
   */
  async dataLoadActionDevicePropertiesValues(propertyName, selectedValue = null) {
    const property        = this.actionSelectedDevice.properties.find(item => String(item.name) === String(propertyName));
    const valueContainer  = document.querySelector("#edit-action-value-container");

    if (String(property.valueType) === "Options") {
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
    else if (String(property.valueType) === "Numeric")  {
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
      const type = item.type || "set_device_value";
      const bridgeInfo = item.bridge ? bridgeTranslate(item.bridge) : "";

      let cardTitle, cardSubtitle, cardContent;

      if (String(type) === "set_device_value") {
        cardTitle    = item.deviceName;
        cardSubtitle = `${stringCut(item.deviceUUID || item.uuid, 20)} | ${bridgeInfo}`;
        cardContent  = `
            <ion-text color="light">${item.propertyTranslated ? item.propertyTranslated : item.property}</ion-text>
            <ion-text color="light">${window.Translation.get("SetTo")}</ion-text>
            <ion-text color="light">${item.valueTranslated ? item.valueTranslated : item.value}</ion-text>
            ${item.delay ? `<ion-text color="light"> (${window.Translation.get("Delay")}: ${item.delay} ${window.Translation.get("Seconds")})</ion-text>` : ``}
        `;
      }
      else if (String(type) === "push_notification") {
        cardTitle    = `${window.Translation.get("ActionTypePushNotification")}`;
        cardSubtitle = "";
        cardContent  = `
            <ion-text color="light">${item.value}</ion-text>
            ${item.property ? `<br /><br /><ion-text color="light">${item.property}</ion-text>` : ""}
        `;
      }
      else if (String(type) === "notification") {
        cardTitle    = `${window.Translation.get("ActionTypeNotification")}`;
        cardSubtitle = "";
        cardContent  = `<ion-text color="light">${item.value}</ion-text>`;
      }

      return `
        <ion-card color="primary" data-id="${item.actionID}">
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
          <ion-button data-id="${item.actionID}" id="action-edit-${item.actionID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
          <ion-button data-id="${item.actionID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
        </ion-card>
        <ion-text>${Number(index) < this.scenarioData.actions.length - 1 ? `<center>${window.Translation.get("And")}</center>` : ""}</ion-text>
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
        const actionData = this.scenarioData.actions.find(item => Number(item.actionID) === Number(parseInt(button.getAttribute("data-id"))));
        
        this.actionID = actionData.actionID;  

        this.resetActionEditModalFields();

        const type = actionData.type || "set_device_value";
        document.querySelector("ion-select[name='editActionType']").value = type;
        this.actionUpdateFieldVisibility(type);

        document.querySelector("ion-input[name='editActionDelay']").value = Number(actionData.delay) > 0 ? actionData.delay : "";

        if (String(type) === "set_device_value") {
          await this.dataLoadActionDevices(actionData.deviceUUID || actionData.uuid);
          await this.dataLoadActionDeviceProperties(actionData.deviceBridge || actionData.bridge, actionData.deviceUUID || actionData.uuid, actionData.property);
          await this.dataLoadActionDevicePropertiesValues(actionData.property, actionData.value);
        }
        else if (String(type) === "push_notification") {
          document.querySelector("ion-input[name='editActionPushTitle']").value   = actionData.value || "";
          document.querySelector("ion-input[name='editActionPushMessage']").value = actionData.property || "";
        }
        else if (String(type) === "notification") {
          document.querySelector("ion-input[name='editActionNotificationText']").value = actionData.value || "";
        }

        this.actionEnabledDisable();

        const modal = document.querySelector("#action-edit-modal");
        await modal.present();
      });
    });
  }
};
