/**
 * Scenario Edit Page
 */

import { apiGET, apiPATCH, apiPOST} from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { bridgeTranslate } from "../services/helper.js";

class ScenarioEdit extends HTMLElement {
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
            <ion-button id="openTriggerEdit" expand="block" color="secondary"><ion-icon slot="start" name="add-sharp"></ion-icon> ${window.Translation.get("AddTrigger")}</ion-button>      
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-text><h3>${window.Translation.get("Then")}:</h3></ion-text>
            <div id="actions-list"></div>
            <ion-button id="openActionEdit" expand="block" color="secondary"><ion-icon slot="start" name="add-sharp"></ion-icon> ${window.Translation.get("AddAction")}</ion-button>      
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-button expand="block" color="success" id="submit-button"><ion-icon slot="start" name="checkmark-sharp"></ion-icon> ${window.Translation.get("Save")}</ion-button>      
          </ion-col>
        </ion-row>
      </ion-grid>

      <ion-modal trigger="openTriggerEdit"></ion-modal>
      <ion-modal trigger="openActionEdit"></ion-modal>
      </ion-content>
    `;
    this.querySelector("#submit-button").addEventListener("click", () => this.submit());
    if (this.ID > 0) {
      this.loadData();
    }
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

  async loadData() {
    try {
      const data = await apiGET("/scenarios/" + this.ID);
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        const item = data.results[0];
        this.querySelector("ion-input[name='editName']").value        = item.name; 
        this.querySelector("ion-toggle[name='editPush']").checked     = item.pushNotification === true;
        this.querySelector("ion-toggle[name='editEnabled']").checked  = item.enabled === true;    

        const listElementTriggers = this.querySelector("#triggers-list");
        listElementTriggers.innerHTML = item.triggers.map(item => {
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
                      <ion-text color="light">${item.property}</ion-text>  <ion-text color="light">${operatorInfo}</ion-text> <ion-text color="light">${item.value}</ion-text>
                  </ion-col>                
                </ion-row>
              </ion-card-content>
              <ion-button data-id="${item.triggerID}" id="edit-${item.triggerID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
              <ion-button data-id="${item.triggerID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
            </ion-card>
        `;          
        }).join("");

        const listElementActions = this.querySelector("#actions-list");
        listElementActions.innerHTML = item.actions.map(item => {
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
                      <ion-text color="light">${item.property}</ion-text> ${window.Translation.get("PropertySetTo")} <ion-text color="light">${item.value}</ion-text>
                  </ion-col>                
                </ion-row>
              </ion-card-content>
              <ion-button color="primary" data-id="${item.actionID}" id="edit-${item.actionID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
              <ion-button color="primary" data-id="${item.actionID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
            </ion-card>
        `;          
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
}

customElements.define("page-scenario-edit", ScenarioEdit);