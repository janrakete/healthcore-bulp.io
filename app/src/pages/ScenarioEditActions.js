/**
 * Scenario Edit - Action logic
 */

import { apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { bridgeTranslate } from "../services/helper.js";

export const ScenarioEditActions = (Base) => class extends Base {
  actionSelectedDevice = null;

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
                      <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editActionValue" shape="round" fill="outline" class="custom"></ion-input>
                    </div>
                  </ion-item>                  
                  <ion-item color="light">
                    <ion-input type="number" label="${window.Translation.get("Delay")}" label-placement="stacked" name="editActionDelay" placeholder="ms" shape="round" fill="outline" class="custom"></ion-input>
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

  setupActionEvents() {
    this.actionEnabledDisable();

    this.querySelector("#open-action-id")?.addEventListener("click", async () => {
      await this.loadDataActionDevices();
      const modal = document.querySelector("#action-edit-modal");
      await modal.present();
    });

    this.querySelector("#action-cancel-button")?.addEventListener("click", () => {
      const modal = document.querySelector("#action-edit-modal");
      modal.dismiss(null, "cancel");
    });

    this.querySelector("#action-submit-button")?.addEventListener("click", () => {
      const deviceSelect   = document.querySelector("ion-select[name='editActionDevice']");
      const propertySelect = document.querySelector("ion-select[name='editActionProperty']");

      const delayInput = document.querySelector("ion-input[name='editActionDelay']");
      const delay = Math.max(0, parseInt(delayInput?.value ?? "0", 10) || 0);

      let valueSelect;
      if ((document.querySelector("ion-input[name='editActionValue']")) && (document.querySelector("ion-input[name='editActionValue']") !== undefined)) {
        valueSelect = document.querySelector("ion-input[name='editActionValue']");
      }
      else {
        valueSelect = document.querySelector("ion-select[name='editActionValue']");
      }

      const propertyDef = this.actionSelectedDevice?.properties?.find(p => p.name === propertySelect.value);
      const valueType = propertyDef?.valueType ?? "String";

      const newAction = {
        actionID:        Date.now(),
        bridge:          this.actionSelectedDevice.bridge,
        deviceID:        deviceSelect.value,
        deviceName:      this.actionSelectedDevice.name,
        property:        propertySelect.value,
        value:           valueSelect.value,
        valueType,
        delay,
        deviceProperties: this.actionSelectedDevice.properties
      };

      this.scenarioData.actions.push(newAction);
      this.actionRenderList();
      const modal = document.querySelector("#action-edit-modal");
      modal.dismiss();
    });

    this.querySelector("ion-select[name='editActionDevice']")?.addEventListener("ionChange", async (event) => {
      const deviceID  = event.detail.value;
      const bridge    = event.target.querySelector(`ion-select-option[value="${deviceID}"]`)?.getAttribute("data-bridge");
      await this.loadDataActionDeviceProperties(bridge, deviceID);
      this.actionEnabledDisable();
    });

    this.querySelector("ion-select[name='editActionProperty']")?.addEventListener("ionChange", async (event) => {
      const propertyName  = event.detail.value;
      await this.loadDataActionDevicePropertiesValues(propertyName);
      this.actionEnabledDisable();
    });
  }

  async actionEnabledDisable() {
    const deviceSelect   = document.querySelector("ion-select[name='editActionDevice']");
    const propertySelect = document.querySelector("ion-select[name='editActionProperty']");

    let valueSelect;
    if ((document.querySelector("ion-input[name='editActionValue']")) && (document.querySelector("ion-input[name='editActionValue']") !== undefined)) {
      valueSelect = document.querySelector("ion-input[name='editActionValue']");
    }
    else {
      valueSelect = document.querySelector("ion-select[name='editActionValue']");
    }

    const submitButton   = document.querySelector("#action-submit-button");

    if (!deviceSelect || !propertySelect || !valueSelect || !submitButton) {
      return;
    }

    propertySelect.disabled = true;
    valueSelect.disabled    = true;
    submitButton.disabled   = true;

    if (deviceSelect.value !== "") {
      propertySelect.disabled = false;
    }

    if ((deviceSelect.value !== "") && (propertySelect.value !== "")) {
      valueSelect.disabled = false;
    }

    if ((deviceSelect.value !== "") && (propertySelect.value !== "") && (valueSelect.value !== "")) {
      submitButton.disabled = false;
    }
  }

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

  async loadDataActionDeviceProperties(bridge, deviceID, selectedProperty = null) {
    try {
      const data = await apiGET("/devices/" + bridge + "/" + deviceID);
      console.log("API call - Output:", data);
      if (data.status === "ok") {
        this.actionSelectedDevice = data.device;

        const selectProperty = document.querySelector("ion-select[name='editActionProperty']");
        if (selectedProperty !== null) {
          selectProperty.value = selectedProperty;
        }

        selectProperty.innerHTML = `<ion-select-option value="">${window.Translation.get("None")}</ion-select-option>` + data.device.properties.map(item => {
          if (item.translation != null && item.translation !== "") {
            return `<ion-select-option value="${item.name}">${item.translation[window.appConfig.CONF_language]}</ion-select-option>`;
          }
          else {
            return `<ion-select-option value="${item.name}">${item.name}</ion-select-option>`;
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

  async translateActionPropertiesAndValue() {
    for (const item of this.scenarioData.actions) {
      const propertyTranslation = item.deviceProperties?.find(property => property.name === item.property);
      if (propertyTranslation && propertyTranslation.translation && propertyTranslation.translation[window.appConfig.CONF_language]) {
        item.propertyTranslated = propertyTranslation.translation[window.appConfig.CONF_language];
      }

      const valueTranslation = item.deviceProperties?.find(property => property.name === item.property);
      if (valueTranslation && valueTranslation.anyValue) {
        const anyValueItem = valueTranslation.anyValue.find(valueItem => valueItem.value === item.value);
        if (anyValueItem && anyValueItem.translation && anyValueItem.translation[window.appConfig.CONF_language]) {
          item.valueTranslated = anyValueItem.translation[window.appConfig.CONF_language];
        }
      }
    }
  }

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

  actionRenderList() {
    console.log("Current action data:");
    console.log(this.scenarioData);

    this.translateActionPropertiesAndValue();

    const listElementActions = this.querySelector("#actions-list");
    if (!listElementActions) {
      return;
    }

    listElementActions.innerHTML = this.scenarioData.actions.map((item, index) => {
      const bridgeInfo = bridgeTranslate(item.bridge);

      return `
        <ion-card color="secondary" data-id="${item.actionID}">
          <ion-card-header>
              <ion-card-title>${item.deviceName}</ion-card-title>
              <ion-card-subtitle>${item.deviceID} (${bridgeInfo})</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-row>
              <ion-col>
                  <ion-text color="light">${item.propertyTranslated ? item.propertyTranslated : item.property}</ion-text>
                  <ion-text color="light"> = </ion-text>
                  <ion-text color="light">${item.valueTranslated ? item.valueTranslated : item.value}</ion-text>
                  ${item.delay ? `<ion-text color="light"> (${item.delay}ms)</ion-text>` : ``}
              </ion-col>
            </ion-row>
          </ion-card-content>
          <ion-button data-id="${item.actionID}" id="action-edit-${item.actionID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
          <ion-button data-id="${item.actionID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
        </ion-card>
        <ion-text>${index < this.scenarioData.actions.length - 1 ? `<center>${window.Translation.get("And")}</center>` : ""}</ion-text>
    `;
    }).join("");

    this.querySelectorAll(".action-delete-option").forEach(button => {
      button.addEventListener("click", () => {
        const id = parseInt(button.getAttribute("data-id"));
        this.scenarioData.actions = this.scenarioData.actions.filter(item => item.actionID !== id);
        this.actionRenderList();
      });
    });

    this.querySelectorAll(".action-edit-option").forEach(button => {
      button.addEventListener("click", async () => {
        const actionData = this.scenarioData.actions.find(item => item.actionID === parseInt(button.getAttribute("data-id")));
        if (!actionData) {
          return;
        }

        await this.loadDataActionDevices(actionData.deviceID);
        await this.loadDataActionDeviceProperties(actionData.bridge, actionData.deviceID, actionData.property);
        await this.loadDataActionDevicePropertiesValues(actionData.property, actionData.value);

        const delayInput = document.querySelector("ion-input[name='editActionDelay']");
        if (delayInput) {
          delayInput.value = actionData.delay ?? 0;
        }

        this.actionEnabledDisable();

        const modal = document.querySelector("#action-edit-modal");
        await modal.present();
      });
    });
  }
};
