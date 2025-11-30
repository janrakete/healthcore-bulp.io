/**
 * SOS Edit Page
 */

import { apiGET, apiPATCH, apiPOST} from "../services/api.js";
import { toastShow } from "../services/toast.js";

class SOSEdit extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-back-button default-href="/sos"></ion-back-button>
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
                <ion-input type="text" placeholder="${window.Translation.get("Phone")}" name="editPhone" required="true" shape="round" fill="outline" class="custom"></ion-input>
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
    if (this.ID > 0) {
      this.loadData();
    }
  }

  async submit() {
    const formData  = {};
    formData.name   = this.querySelector("ion-input[name='editName']").value;
    formData.number = this.querySelector("ion-input[name='editPhone']").value;

    let data = {};

    try {
      if (parseInt(this.ID) === 0) // New entry    
      {
        data = await apiPOST("/data/sos", formData);
      }
      else {
        data = await apiPATCH("/data/sos?sosID=" + this.ID, formData);
      }
        
      if (data.status === "ok") {
        toastShow(window.Translation.get("EntrySaved"), "success");             
        document.querySelector("ion-router").push("/sos");   
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
      const data = await apiGET("/data/sos?sosID=" + this.ID);
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        const item = data.results[0];
        this.querySelector("ion-input[name='editName']").value   = item.name;
        this.querySelector("ion-input[name='editPhone']").value  = item.number;
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

customElements.define("page-sos-edit", SOSEdit);