/**
 * Individual Edit Page
 */

import { apiGET, apiPATCH, apiPOST} from "../services/api.js";
import { toastShow } from "../services/toast.js";

class IndividualEdit extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/individuals"></ion-back-button>
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
                <ion-input type="text" label="${window.Translation.get("FirstName")}" label-placement="stacked" name="editFirstName" required="true" shape="round" fill="outline" class="custom"></ion-input>
              </ion-item>      
              <ion-item color="light">
                <ion-input type="text" label="${window.Translation.get("LastName")}" label-placement="stacked" name="editLastName" shape="round" fill="outline" class="custom"></ion-input>
              </ion-item>      
              <ion-item color="light">
                <ion-select interface="popover" class="custom" label-placement="stacked" name="editRoom" label="${window.Translation.get("Room")}" placeholder="${window.Translation.get("PleaseSelect")}">
                  <ion-select-option value="0">${window.Translation.get("None")}</ion-select-option>
                </ion-select>
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
    this.loadRoomsData();
    if (this.ID > 0) {
      this.loadData();
    }
  }

  async submit() {
    if ([...this.querySelectorAll("ion-input[required]")].some(input => !input.value?.trim())) { // Validate required fields
      toastShow(window.Translation.get("RequiredFieldsMissing"), "warning");
      return;
    }

    const formData      = {};
    formData.firstname  = this.querySelector("ion-input[name='editFirstName']").value;
    formData.lastname   = this.querySelector("ion-input[name='editLastName']").value;
    formData.roomID     = this.querySelector("ion-select[name='editRoom']").value;

    let data = {};

    try {
      if (parseInt(this.ID) === 0) // New entry    
      {
        data = await apiPOST("/data/individuals", formData);
      }
      else {
        data = await apiPATCH("/data/individuals?individualID=" + this.ID, formData);
      }
        
      if (data.status === "ok") {
        toastShow(window.Translation.get("EntrySaved"), "success");             
        document.querySelector("ion-router").push("/individuals");   
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

  async loadRoomsData() {
    try {
      const data = await apiGET("/data/rooms"); // load rooms for select
      console.log("API call - Output:", data);
      if (data.status === "ok") { 
        const select = this.querySelector("ion-select[name='editRoom']");
        data.results.forEach(room => {
          const option = document.createElement("ion-select-option");
          option.value     = room.roomID;
          option.innerHTML = room.name;
          select.appendChild(option);
        });
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
      const data = await apiGET("/data/individuals?individualID=" + this.ID);
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        const item = data.results[0];
        this.querySelector("ion-input[name='editFirstName']").value = item.firstname;
        this.querySelector("ion-input[name='editLastName']").value  = item.lastname;
        const select = this.querySelector("ion-select[name='editRoom']");
        select.value = item.roomID;
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

customElements.define("page-individual-edit", IndividualEdit);