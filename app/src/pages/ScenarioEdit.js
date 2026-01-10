/**
 * Scenario Edit Page
 */

import { apiGET, apiPATCH, apiPOST} from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { bridgeTranslate } from "../services/helper.js";

class ScenarioEdit extends HTMLElement {
  triggerSelectedDevice = null;
  actionSelectedDevice  = null;
  
  scenarioData = {
    triggers: [],
    actions: []
  };

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
                      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                      <ion-select-option value="equal">${window.Translation.get("Equals")}</ion-select-option>
                      <ion-select-option value="greater">${window.Translation.get("Greater")}</ion-select-option>
                      <ion-select-option value="less">${window.Translation.get("Less")}</ion-select-option>
                      <ion-select-option value="between">${window.Translation.get("Between")}</ion-select-option>
                      <ion-select-option value="contains">${window.Translation.get("Contains")}</ion-select-option>                      
                    </ion-select>
                  </ion-item>                  
                  <ion-item color="light">
                    <div id ="edit-trigger-value-container">
                      <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" required="true" shape="round" fill="outline" class="custom"></ion-input>
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
                      <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editActionValue" required="true" shape="round" fill="outline" class="custom"></ion-input>
                    </div>
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

  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/scenarios"></ion-back-button>
          </ion-buttons> 
          <ion-title>${window.Translation.get("Edit")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <ion-col>
            <ion-list inset="true">
                <ion-item color="light">
                    <ion-input type="text" label="${window.Translation.get("Name")}" label-placement="stacked" name="editName" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item> 
                <ion-item>
                    <ion-toggle class="custom" color="primary" name="editEnabled">${window.Translation.get("Enabled")}</ion-toggle>
                </ion-item>                  
                <ion-item>
                    <ion-toggle class="custom" color="primary" name="editPush">${window.Translation.get("PushNotification")}</ion-toggle>
                </ion-item>     
            </ion-list>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-text><h3>${window.Translation.get("When")}:</h3></ion-text>
            <div id="triggers-list"></div>
            <ion-button id="open-trigger-id" expand="block" color="secondary"><ion-icon slot="start" name="add-sharp"></ion-icon> ${window.Translation.get("AddTrigger")}</ion-button>      
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-text><h3>${window.Translation.get("Then")}:</h3></ion-text>
            <div id="actions-list"></div>
            <ion-button id="open-action-id" expand="block" color="secondary"><ion-icon slot="start" name="add-sharp"></ion-icon> ${window.Translation.get("AddAction")}</ion-button>      
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-button expand="block" color="success" id="submit-button"><ion-icon slot="start" name="checkmark-sharp"></ion-icon> ${window.Translation.get("Save")}</ion-button>      
          </ion-col>
        </ion-row>
      </ion-grid>

      ${this.getTriggerEditModalHTML()}
      
      ${this.getActionEditModalHTML()}
 
      </ion-content>
    `;

    this.querySelector("#submit-button").addEventListener("click", () => this.submit());
    
    if (this.ID > 0) {
      this.loadData();
    }

    this.triggerEnabledDisable();    

    this.querySelector("#trigger-submit-button").addEventListener("click", () => {
      toastShow("Not implemented yet", "warning");
    });

    this.querySelector("#trigger-cancel-button").addEventListener("click", () => {
      const modal = document.querySelector("#trigger-edit-modal");
      modal.dismiss(null, "cancel");
    });

    this.querySelector("#open-trigger-id").addEventListener("click", async () => {
      this.loadDataTriggerDevices();
      const modal = document.querySelector("#trigger-edit-modal");
      await modal.present();
    });

    this.querySelector("ion-select[name='editTriggerDevice']").addEventListener("ionChange", async (event) => {
      const deviceID  = event.detail.value;
      const bridge    = event.target.querySelector(`ion-select-option[value="${deviceID}"]`)?.getAttribute("data-bridge");
      await this.loadDataTriggerDeviceProperties(bridge, deviceID);
      this.triggerEnabledDisable();
    });

    this.querySelector("ion-select[name='editTriggerProperty']").addEventListener("ionChange", async (event) => {
      const propertyName  = event.detail.value;
      await this.loadDataTriggerDevicePropertiesValues(propertyName);
      this.triggerEnabledDisable();
    });
    
    this.querySelector("ion-select[name='editTriggerOperator']").addEventListener("ionChange", () => {
      this.triggerEnabledDisable();
    });
  }

  async submit() {
    if ([...this.querySelectorAll("ion-input[required]")].some(input => !input.value?.trim())) { // Validate required fields
      toastShow(window.Translation.get("RequiredFieldsMissing"), "warning");
      return;
    }

    const formData              = {};
    formData.name               = this.querySelector("ion-input[name='editName']").value;
    formData.pushNotification   = this.querySelector("ion-toggle[name='editPush']").checked;
    formData.enabled            = this.querySelector("ion-toggle[name='editEnabled']").checked;

    let data = {};

    try {
      if (parseInt(this.ID) === 0) // New entry    
      {
        data = await apiPOST("/scenarios", formData);
      }
      else {
        data = await apiPATCH("/scenarios/" + this.ID, formData);
      }
        
      if (data.status === "ok") {
        toastShow(window.Translation.get("EntrySaved"), "success");             
        document.querySelector("ion-router").push("/scenarios");   
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

  async loadDataTriggerDevices() {
    try {
      const data = await apiGET("/devices/all");
      console.log("API call - Output:", data);
      if (data.status === "ok") {
        const selectDevice      = document.querySelector("ion-select[name='editTriggerDevice']");
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

  async loadDataTriggerDeviceProperties(bridge, deviceID) {
    try {
      const data = await apiGET("/devices/" + bridge + "/" + deviceID);
      console.log("API call - Output:", data);
      if (data.status === "ok") {
        this.triggerSelectedDevice = data.device; // Store selected device

        const selectProperty     = document.querySelector("ion-select[name='editTriggerProperty']");
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

  async loadDataTriggerDevicePropertiesValues(propertyName) {
    const property        = this.triggerSelectedDevice.properties.find(item => item.name === propertyName);
    const valueContainer  = document.querySelector("#edit-trigger-value-container");

    if (property.valueType === "Options") {
      valueContainer.innerHTML = `
        <ion-select interface="popover" class="custom" label-placement="stacked" name="editTriggerValue" label="${window.Translation.get("Value")}" placeholder="${window.Translation.get("PleaseSelect")}" value="">
          <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
          ${property.anyValue.map(option => `<ion-select-option value="${option.value}">${option.translation && option.translation[window.appConfig.CONF_language] !== undefined ? option.translation[window.appConfig.CONF_language] : option.value}</ion-select-option>`).join("")}
        </ion-select>
      `;
    }
    else if (property.valueType === "Numeric")  {
      valueContainer.innerHTML = `
        <ion-input type="number" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" required="true" shape="round" fill="outline" class="custom"></ion-input>
      `;
    }
    else {
      valueContainer.innerHTML = `
        <ion-input type="text" label="${window.Translation.get("Value")}" label-placement="stacked" name="editTriggerValue" required="true" shape="round" fill="outline" class="custom"></ion-input>
      `;
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

  async loadData() {
    try {
      const data = await apiGET("/scenarios/" + this.ID);
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        const item = data.results[0];
        this.querySelector("ion-input[name='editName']").value        = item.name; 
        this.querySelector("ion-toggle[name='editPush']").checked     = item.pushNotification === true;
        this.querySelector("ion-toggle[name='editEnabled']").checked  = item.enabled === true; 

        this.scenarioData.triggers = item.triggers;
        console.log(this.scenarioData.triggers);

        // loop triggers


        this.triggerRenderList(); 

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

  triggerRenderList() {
    const listElementTriggers = this.querySelector("#triggers-list");
    listElementTriggers.innerHTML = this.scenarioData.triggers.map(item => {
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
                  <ion-text color="light">${item.property}</ion-text> <ion-text color="light">${operatorInfo}</ion-text> <ion-text color="light">${item.value}</ion-text>
              </ion-col>                
            </ion-row>
          </ion-card-content>
          <ion-button data-id="${item.triggerID}" id="trigger-edit-${item.triggerID}" class="trigger-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
          <ion-button data-id="${item.triggerID}" class="trigger-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
        </ion-card>
    `;          
    }).join("");
        
    this.querySelectorAll(".trigger-delete-option").forEach(button => { // Add event listeners for delete buttons
      button.addEventListener("click", () => {
        const itemDelete = this.querySelector("#triggers-list").querySelector("ion-card[data-id='" + button.getAttribute("data-id") + "']");
        if (itemDelete) {
          itemDelete.remove();
        }
      });
    });

    this.querySelectorAll(".trigger-edit-option").forEach(button => { // Add event listeners for edit buttons
      button.addEventListener("click", () => {
        
      });
    });

  }

}

customElements.define("page-scenario-edit", ScenarioEdit);