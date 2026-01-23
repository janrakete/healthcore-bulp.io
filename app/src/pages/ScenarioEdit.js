/**
 * Scenario Edit Page
 */

import { apiGET, apiPATCH, apiPOST} from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { ScenarioEditTriggers } from "./ScenarioEditTriggers.js";
import { ScenarioEditActions } from "./ScenarioEditActions.js";

const ScenarioEditBase = ScenarioEditActions(ScenarioEditTriggers(HTMLElement));

class ScenarioEdit extends ScenarioEditBase {
  
  scenarioData = {
    triggers: [],
    actions: [],
    icon: ""
  };

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
                    <ion-toggle class="custom" color="primary" name="editEnabled" checked="true">${window.Translation.get("Enabled")}</ion-toggle>
                </ion-item>                  
                <ion-item>
                    <ion-toggle class="custom" color="primary" name="editPush" checked="true">${window.Translation.get("PushNotification")}</ion-toggle>
                </ion-item>  
                <ion-item color="light" button="true" id="icon-picker-button">
                    <ion-label class="custom">${window.Translation.get("Icon")}</ion-label>
                    <ion-icon slot="end" name="${this.scenarioData.icon ? this.scenarioData.icon : ''}" id="selected-icon" size="large" color="primary"></ion-icon>
                </ion-item> 
            </ion-list>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-text><center><h3>${window.Translation.get("When")}:</h3></center></ion-text>
            <div id="triggers-list"></div>
            <ion-button id="open-trigger-id" expand="block" color="secondary"><ion-icon slot="start" name="add-sharp"></ion-icon> ${window.Translation.get("AddTrigger")}</ion-button>      
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-text><center><h3>${window.Translation.get("Then")}:</h3></center></ion-text>
            <div id="actions-list"></div>
            <ion-button id="open-action-id" expand="block" color="secondary"><ion-icon slot="start" name="add-sharp"></ion-icon> ${window.Translation.get("AddAction")}</ion-button>      
          </ion-col>
        </ion-row>
        <br />
        <ion-row>
          <ion-col>
            <ion-button expand="block" color="success" id="submit-button"><ion-icon slot="start" name="checkmark-sharp"></ion-icon> ${window.Translation.get("Save")}</ion-button>      
          </ion-col>
        </ion-row>
      </ion-grid>

      ${this.getTriggerEditModalHTML()}
      
      ${this.getActionEditModalHTML()}
      
      ${this.getIconPickerModalHTML()}
 
      </ion-content>
    `;

    this.querySelector("#submit-button").addEventListener("click", () => this.submit());
    
    if (this.ID > 0) {
      this.loadData();
    }

    this.setupTriggerEvents();
    this.setupActionEvents();
    this.setupIconPickerEvents();
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
    formData.icon               = this.scenarioData.icon;

    formData.triggers           = this.scenarioData.triggers;
    formData.actions            = this.scenarioData.actions;

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
        
        this.scenarioData.icon = item.icon || "";
        if (this.scenarioData.icon) {
          this.querySelector("#selected-icon").setAttribute("name", this.scenarioData.icon);
        }

        this.scenarioData.triggers = item.triggers ? item.triggers : [];
        this.scenarioData.actions  = item.actions ? item.actions : [];

        this.triggerRenderList(); 
        this.actionRenderList();

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

  getIconPickerModalHTML() {
    const icons = window.scenarioIcons || [];
    const iconGrid = icons.map(iconName => `
      <ion-col size="3" class="ion-text-center">
        <ion-button fill="clear" class="icon-select-btn ion-padding" data-icon="${iconName}">
          <ion-icon slot="icon-only" name="${iconName}" size="large"></ion-icon>
        </ion-button>
      </ion-col>
    `).join("");

    return `
      <ion-modal id="icon-picker-modal">
        <ion-header>
          <ion-toolbar>
            <ion-title>${window.Translation.get("Edit")}</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="3" class="ion-text-center">
                <ion-button fill="clear" class="icon-select-btn ion-padding" data-icon="">
                  <ion-icon slot="icon-only" name="close-circle-outline" size="large" color="danger"></ion-icon>
                </ion-button>
              </ion-col>
              ${iconGrid}
            </ion-row>
            <ion-row>
              <ion-col>
                <ion-button expand="block" color="danger" id="icon-picker-cancel-button"><ion-icon slot="start" name="close-sharp"></ion-icon> ${window.Translation.get("Cancel")}</ion-button>      
              </ion-col>
            </ion-row>             
          </ion-grid>
        </ion-content>
      </ion-modal>
    `;
  }

  setupIconPickerEvents() {
    const modal       = this.querySelector("#icon-picker-modal");
    const openButton  = this.querySelector("#icon-picker-button");
    const closeButton = this.querySelector("#icon-picker-cancel-button");

    openButton.addEventListener("click", () => {
      modal.present();
    });

    closeButton.addEventListener("click", () => {
      modal.dismiss();
    });

    this.querySelectorAll(".icon-select-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const iconName         = btn.dataset.icon;
        this.scenarioData.icon = iconName;
        this.querySelector("#selected-icon").setAttribute("name", iconName);
        modal.dismiss();
      });
    });
  }

}

customElements.define("page-scenario-edit", ScenarioEdit);