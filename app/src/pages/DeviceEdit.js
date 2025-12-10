/**
 * Device Edit Page
 */

import { apiGET, apiPATCH} from "../services/api.js";
import { toastShow } from "../services/toast.js";

class DeviceEdit extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/devices"></ion-back-button>
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
                <ion-input type="text" placeholder="${window.Translation.get("Name")}" name="editName" required="true" shape="round" fill="outline" class="custom"></ion-input>
              </ion-item>      
              <ion-item color="light">
                <ion-input type="text" placeholder="${window.Translation.get("Description")}" name="editDescription" required="true" shape="round" fill="outline" class="custom"></ion-input>
              </ion-item>      
            </ion-list>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col>
            <ion-button expand="block" color="success" id="submit-button"><ion-icon slot="start" name="checkmark-sharp"></ion-icon> ${window.Translation.get("Save")}</ion-button>      
          </ion-col>
        </ion-row>
      </ion-grid>
      </ion-content>
    `;
    this.querySelector("#submit-button").addEventListener("click", () => this.submit());
    this.loadData();
  }

  async submit() {
    const formData          = {};
    formData.name           = this.querySelector("ion-input[name='editName']").value;
    formData.description    = this.querySelector("ion-input[name='editDescription']").value;

    let data = {};

    try {
      data = await apiPATCH("/devices/" + this.BRIDGE + "/" + this.ID, formData);
        
      if (data.status === "ok") {
        toastShow(window.Translation.get("EntrySaved"), "success");             
        document.querySelector("ion-router").push("/devices");   
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
      const data = await apiGET("/devices/" + this.BRIDGE + "/" + this.ID);
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        const item = data.device;
        this.querySelector("ion-input[name='editName']").value        = item.name;
        this.querySelector("ion-input[name='editDescription']").value = item.description;
        toastShow(window.Translation.get("EntryLoaded"), "success");        
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

customElements.define("page-device-edit", DeviceEdit);