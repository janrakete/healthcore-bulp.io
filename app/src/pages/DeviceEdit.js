/**
 * Device Edit Page
 */

import { apiGET, apiPATCH, apiPOST } from "../services/api.js";
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
            <ion-select label="${window.Translation.get("AssignedPerson")}" label-placement="stacked" name="editIndividualID" interface="popover" class="custom" placeholder="${window.Translation.get("PleaseSelect")}">
              <ion-select-option value="0">${window.Translation.get("None")}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item color="light">
            <ion-select label="${window.Translation.get("AssignedRoom")}" label-placement="stacked" name="editRoomID" interface="popover" class="custom" placeholder="${window.Translation.get("PleaseSelect")}">
              <ion-select-option value="0">${window.Translation.get("None")}</ion-select-option>
            </ion-select>
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
      const individualSelect = this.querySelector("ion-select[name='editIndividualID']");
      if (individualSelect) {
        individualSelect.addEventListener("ionChange", () => this.roomPrefill());
      }

      this.initializeData();
    }
  }

  async initializeData() {
    await Promise.all([
      this.loadSelectionData(),
      this.dataLoad(),
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

    if (String(this.ID) === "[new]") {
      formData.deviceID     = this.querySelector("ion-input[name='editDeviceID']").value;
      formData.productName  = this.querySelector("ion-input[name='editProductName']").value;
      formData.vendorName   = this.querySelector("ion-input[name='editVendorName']").value;
    }
    else {
      // Include assignment fields in the same PATCH request
      const individualElement = this.querySelector("ion-select[name='editIndividualID']");
      const roomElement       = this.querySelector("ion-select[name='editRoomID']");
      formData.individualID   = Number(individualElement?.value) || 0;
      formData.roomID         = Number(roomElement?.value) || 0;
    }

    try {
      let data = {};

      if (String(this.ID) === "[new]") {
        data = await apiPOST("/devices/" + this.BRIDGE + "/" + formData.deviceID, formData);
      }
      else {
        data = await apiPATCH("/devices/" + this.BRIDGE + "/" + this.ID, formData);
      }

      if (String(data.status) === "ok") {
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

  async loadSelectionData() {
    try {
      const roomsData       = await apiGET("/data/rooms");
      const individualsData = await apiGET("/data/individuals");

      if (String(roomsData.status) !== "ok") {
        toastShow("Error: " + roomsData.error, "danger");
        return;
      }

      if (String(individualsData.status) !== "ok") {
        toastShow("Error: " + individualsData.error, "danger");
        return;
      }

      this.rooms        = roomsData.results || [];
      this.individuals  = individualsData.results || [];

      this.renderSelections();
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
  }

  renderSelections() {
    const individualElement = this.querySelector("ion-select[name='editIndividualID']");
    const roomElement       = this.querySelector("ion-select[name='editRoomID']");

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

    this.applyDataToForm();
  }

  roomPrefill() {
    const individualElement = this.querySelector("ion-select[name='editIndividualID']");
    const roomElement       = this.querySelector("ion-select[name='editRoomID']");

    if ((individualElement === null) || (roomElement === null)) {
      return;
    }

    const individualID = Number(individualElement.value) || 0;
    const individual   = this.individuals.find(item => Number(item.individualID) === individualID);

    if ((individual !== undefined) && (Number(individual.roomID) > 0) && ((Number(roomElement.value) || 0) <= 0)) {
      roomElement.value = String(individual.roomID);
    }
  }

  applyDataToForm() {
    if (this.deviceData === undefined) {
      return;
    }

    const individualElement = this.querySelector("ion-select[name='editIndividualID']");
    const roomElement       = this.querySelector("ion-select[name='editRoomID']");

    if (individualElement) {
      individualElement.value = String(this.deviceData.individualID || 0);
    }

    if (roomElement) {
      roomElement.value = String(this.deviceData.roomID || 0);
    }
  }

  async dataLoad() {
    try {
      const data = await apiGET("/devices/" + this.BRIDGE + "/" + this.ID);
      console.log("API call - Output:", data);

      if (String(data.status) === "ok") {
        const item = data.device;
        this.deviceData = item;

        this.querySelector("ion-input[name='editName']").value        = item.name;
        this.querySelector("ion-input[name='editDescription']").value = item.description;
        this.querySelector("ion-input[name='editDeviceID']").value    = item.deviceID;
        this.querySelector("ion-input[name='editProductName']").value = item.productName;
        this.querySelector("ion-input[name='editVendorName']").value  = item.vendorName;

        this.applyDataToForm();
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
