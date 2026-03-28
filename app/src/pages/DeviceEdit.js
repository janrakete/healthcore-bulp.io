/**
 * Device Edit Page
 */

import { apiDELETE, apiGET, apiPATCH, apiPOST } from "../services/api.js";
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
            <ion-input type="text" label-placement="stacked" label="${window.Translation.get("DeviceID")}" name="editDeviceID" required="true" ${this.ID !== "[new]" ? 'disabled="true"' : ''} shape="round" fill="outline" class="custom"></ion-input>
          </ion-item>         
          <ion-item color="light">
            <ion-input type="text" label-placement="stacked" label="${window.Translation.get("VendorName")}" name="editVendorName" required="true" ${this.ID !== "[new]" ? 'disabled="true"' : ''} shape="round" fill="outline" class="custom"></ion-input>
          </ion-item>           
          <ion-item color="light">
            <ion-input type="text" label-placement="stacked" label="${window.Translation.get("ProductName")}" name="editProductName" required="true" ${this.ID !== "[new]" ? 'disabled="true"' : ''} shape="round" fill="outline" class="custom"></ion-input>
          </ion-item>           
          <ion-item color="light">
            <ion-input type="text" label-placement="stacked" label="${window.Translation.get("Name")}" name="editName" required="true" shape="round" fill="outline" class="custom"></ion-input>
          </ion-item>      
          <ion-item color="light">
            <ion-input type="text" label-placement="stacked" label="${window.Translation.get("Description")}" name="editDescription" shape="round" fill="outline" class="custom"></ion-input>
          </ion-item>      
        </ion-list>
        ${this.ID !== "[new]" ? `
        <ion-list inset="true">
          <ion-item color="light">
            <ion-label position="stacked">${window.Translation.get("DeviceAssignment")}</ion-label>
            <ion-note>${window.Translation.get("DeviceAssignmentHint")}</ion-note>
          </ion-item>
          <ion-item color="light">
            <ion-select label="${window.Translation.get("AssignedPerson")}" label-placement="stacked" name="editAssignmentIndividualID" interface="popover"></ion-select>
          </ion-item>
          <ion-item color="light">
            <ion-select label="${window.Translation.get("AssignedRoom")}" label-placement="stacked" name="editAssignmentRoomID" interface="popover"></ion-select>
          </ion-item>
        </ion-list>
        ` : ""}
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
    if (this.ID !== "[new]") {
      const individualSelect = this.querySelector("ion-select[name='editAssignmentIndividualID']");
      if (individualSelect) {
        individualSelect.addEventListener("ionChange", () => this.assignmentRoomPrefill());
      }

      this.initializeData();
    }
  }

  async initializeData() {
    await Promise.all([
      this.loadSelectionData(),
      this.loadData(),
    ]);
  }

  async submit() {
    if ([...this.querySelectorAll("ion-input[required]")].some(input => !input.value?.trim())) { // Validate required fields
      toastShow(window.Translation.get("RequiredFieldsMissing"), "warning");
      return;
    }

    const formData          = {};
    formData.name           = this.querySelector("ion-input[name='editName']").value;
    formData.description    = this.querySelector("ion-input[name='editDescription']").value;
    
    if (this.ID === "[new]") {
      formData.deviceID     = this.querySelector("ion-input[name='editDeviceID']").value;
      formData.productName  = this.querySelector("ion-input[name='editProductName']").value;
      formData.vendorName   = this.querySelector("ion-input[name='editVendorName']").value;
    }

    let data = {};

    try {
      if (this.ID === "[new]") {
        data = await apiPOST("/devices/" + this.BRIDGE + "/" + formData.deviceID, formData);
      }
      else {  
        data = await apiPATCH("/devices/" + this.BRIDGE + "/" + this.ID, formData);
      }
        
      if (data.status === "ok") {
        if (this.ID !== "[new]") {
          const assignmentResponse = await this.submitAssignment();
          if (assignmentResponse.status !== "ok") {
            toastShow("Error: " + assignmentResponse.error, "danger");
            return;
          }
        }

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

  async submitAssignment() {
    const individualElement = this.querySelector("ion-select[name='editAssignmentIndividualID']");
    const roomElement       = this.querySelector("ion-select[name='editAssignmentRoomID']");
    const individualID      = Number(individualElement?.value) || 0;
    const roomID            = Number(roomElement?.value) || 0;

    if ((individualID <= 0) && (roomID <= 0)) {
      if (this.assignmentExists === true) {
        const data = await apiDELETE("/devices/" + this.BRIDGE + "/" + this.ID + "/assignment");
        if (data.status === "ok") {
          this.assignmentExists = false;
        }
        return data;
      }

      return { status: "ok" };
    }

    const payload = {
      individualID: individualID,
      roomID: roomID,
    };

    let data = {};
    if (this.assignmentExists === true) {
      data = await apiPATCH("/devices/" + this.BRIDGE + "/" + this.ID + "/assignment", payload);
    }
    else {
      data = await apiPOST("/devices/" + this.BRIDGE + "/" + this.ID + "/assignment", payload);
    }

    if (data.status === "ok") {
      this.assignmentExists = true;
    }

    return data;
  }

  async loadSelectionData() {
    try {
      const roomsData = await apiGET("/data/rooms");
      const individualsData = await apiGET("/data/individuals");

      if (roomsData.status !== "ok") {
        toastShow("Error: " + roomsData.error, "danger");
        return;
      }

      if (individualsData.status !== "ok") {
        toastShow("Error: " + individualsData.error, "danger");
        return;
      }

      this.rooms = roomsData.results || [];
      this.individuals = individualsData.results || [];

      this.renderAssignmentSelections();
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
  }

  renderAssignmentSelections() {
    const individualElement = this.querySelector("ion-select[name='editAssignmentIndividualID']");
    const roomElement       = this.querySelector("ion-select[name='editAssignmentRoomID']");

    if (individualElement) {
      individualElement.innerHTML = `
        <ion-select-option value="0">${window.Translation.get("None")}</ion-select-option>
        ${this.individuals.map(item => `<ion-select-option value="${item.individualID}">${item.firstname} ${item.lastname}</ion-select-option>`).join("")}
      `;
    }

    if (roomElement) {
      roomElement.innerHTML = `
        <ion-select-option value="0">${window.Translation.get("None")}</ion-select-option>
        ${this.rooms.map(item => `<ion-select-option value="${item.roomID}">${item.name}</ion-select-option>`).join("")}
      `;
    }

    this.applyAssignmentToForm();
  }

  assignmentRoomPrefill() {
    const individualElement = this.querySelector("ion-select[name='editAssignmentIndividualID']");
    const roomElement       = this.querySelector("ion-select[name='editAssignmentRoomID']");

    if ((individualElement === null) || (roomElement === null)) {
      return;
    }

    const individualID = Number(individualElement.value) || 0;
    const individual   = this.individuals.find(item => Number(item.individualID) === individualID);

    if ((individual !== undefined) && (Number(individual.roomID) > 0) && ((Number(roomElement.value) || 0) <= 0)) {
      roomElement.value = String(individual.roomID);
    }
  }

  applyAssignmentToForm() {
    if (this.assignmentData === undefined) {
      return;
    }

    const individualElement = this.querySelector("ion-select[name='editAssignmentIndividualID']");
    const roomElement       = this.querySelector("ion-select[name='editAssignmentRoomID']");

    if (individualElement) {
      individualElement.value = String(this.assignmentData?.individualID || 0);
    }

    if (roomElement) {
      roomElement.value = String(this.assignmentData?.roomID || 0);
    }
  }

  async loadData() {
    try {
      const data = await apiGET("/devices/" + this.BRIDGE + "/" + this.ID);
      const assignmentData = await apiGET("/devices/" + this.BRIDGE + "/" + this.ID + "/assignment");
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        const item = data.device;
        this.querySelector("ion-input[name='editName']").value        = item.name;
        this.querySelector("ion-input[name='editDescription']").value = item.description;
        this.querySelector("ion-input[name='editDeviceID']").value    = item.deviceID;
        this.querySelector("ion-input[name='editProductName']").value = item.productName;     
        this.querySelector("ion-input[name='editVendorName']").value  = item.vendorName; 

        if (assignmentData.status === "ok") {
          this.assignmentData = assignmentData.assignment;
          this.assignmentExists = assignmentData.assignment !== null;
          this.applyAssignmentToForm();
        }
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