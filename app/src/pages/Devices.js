/**
 * Devices Page
 */

import { apiGET, apiDELETE } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class Devices extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageDevicesHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">

        <ion-segment value="zigbee,bluetooth,lora,http" scrollable="true" swipeGesture="true">
          <ion-segment-button value="zigbee,bluetooth,lora,http">
            <ion-label>${window.Translation.get("All")}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="zigbee">
            <ion-label>${window.Translation.get("Zigbee")}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="bluetooth">
            <ion-label>${window.Translation.get("Bluetooth")}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="lora">
            <ion-label>${window.Translation.get("LoRa")}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="http">
            <ion-label>${window.Translation.get("Wifi")}</ion-label>
          </ion-segment-button>
        </ion-segment>
        <div id="devices-list"></div>
        <ion-action-sheet id="action-sheet" class="action-sheet-style" header="${window.Translation.get("Actions")}"></ion-action-sheet>
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button color="success" id="device-edit-button">
            <ion-icon name="add"></ion-icon>
          </ion-fab-button>
        </ion-fab>
      </ion-content>
    `;
    this.querySelector("#device-edit-button").addEventListener("click", () => { // navigate to Device Add page on button click
      document.querySelector("ion-router").push("/devices-add");
    });
    this.querySelector("ion-segment").addEventListener("ionChange", (event) => { // reload data when segment changes
      this.dataLoad(event.detail.value.split(","));
    });

    this.actionSheetSetup();
    this.dataLoad();
  }

  actionSheetSetup() {
    const actionSheet = this.querySelector("#action-sheet");
    actionSheet.buttons = [
      {
        text: window.Translation.get("Delete"),
        role: "destructive",
        data: {
          action: "delete",
        },
      },
      {
        text: window.Translation.get("Cancel"),
        role: "cancel",
        data: {
          action: "cancel",
        },
      },
    ];

    actionSheet.addEventListener("ionActionSheetDidDismiss", async (event) => { // Handle action sheet dismissal
      actionSheet.isOpen = false;
      const ID      = actionSheet.dataset.ID; // Get ID of entry to delete
      const bridge  = actionSheet.dataset.bridge; // Get bridge of entry to delete
      console.log("Action sheet: ID of entry:", ID);
      if (event.detail.data?.action === "delete") {
        const data = await apiDELETE("/devices/" + bridge + "/" + ID);
        if (data.status === "ok") {
          const itemDelete = this.querySelector("#devices-list").querySelector("ion-card[data-id='" + ID + "']");
          if (itemDelete) {
            itemDelete.remove();
            toastShow(window.Translation.get("EntryDeleted"), "success");
          }
        }
        else {
          toastShow("Error: " + data.error, "danger");
        }
      }
    });
  }

  async dataLoad(filters = ["zigbee","bluetooth","lora","http"]) {
    this.querySelector("#devices-list").innerHTML = "";
    const spinner = document.createElement("ion-spinner");
    spinner.name = "dots";
    spinner.color = "warning";
    const center = document.createElement("center");
    center.appendChild(spinner);
    this.querySelector("#devices-list").prepend(center);

    try {
      for (const filter of filters) {
        console.log("Devices: Loading devices with filter: " +  filter);

        let response = await apiGET("/devices/" +  filter + "/list");
        console.log("API call - Output:", response);

        if (response.status === "ok") {
          response.resultsRegistered  = response.data.devicesRegisteredAtServer;
          response.resultsConnected   = response.data.devicesConnected;

          const listElement = this.querySelector("#devices-list");
          const items       = response.resultsRegistered;

          if (!items || items.length === 0) {
            listElement.innerHTML = `
              <br /><center><ion-text color="light">${window.Translation.get("EntriesNone")}</ion-text></center>
            `;
          }
          else {
            listElement.innerHTML = items.map(item => {
              let displayInfo     = "";
              let deviceConnected = 0; // 0 = not connected, 1 = connected, 2 = status not applicable
            
              switch(item.bridge) {
                case "zigbee":
                  displayInfo = window.Translation.get("Zigbee");
                  if (response.resultsConnected && response.resultsConnected.some(device => device.deviceID === item.deviceID)) { // check if device is connected
                    deviceConnected = 1;
                  }
                  break;
                case "bluetooth":
                  displayInfo = window.Translation.get("Bluetooth");
                  if (response.resultsConnected && response.resultsConnected.some(device => device.deviceID === item.deviceID)) { // check if device is connected
                    deviceConnected = 1;
                  }
                  break;
                case "lora":
                  displayInfo = window.Translation.get("LoRa");
                  deviceConnected = 2;
                  break;
                case "http":
                  displayInfo = window.Translation.get("Wifi");
                  deviceConnected = 2;
                  break;
                default:
                  displayInfo = window.Translation.get("Unknown");
              }
            
              return `
              <ion-card color="primary" data-id="${item.deviceID}">
                <ion-card-header>
                    <ion-card-title>${item.name} <ion-badge color="${deviceConnected === 1 ? "success" : deviceConnected === 0 ? "danger" : "medium"}">${deviceConnected === 1 ? window.Translation.get("Connected") : deviceConnected === 0 ? window.Translation.get("Disconnected") : window.Translation.get("Unknown")}</ion-badge></ion-card-title>
                    <ion-card-subtitle>${item.deviceID} (${displayInfo})</ion-card-subtitle>
                </ion-card-header>
                <ion-button data-id="${item.deviceID}" id="edit-${item.deviceID}" data-bridge="${item.bridge}"class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
                <ion-button data-id="${item.deviceID}" data-bridge="${item.bridge}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
              </ion-card>
            `;
            }).join("");
          
            this.querySelectorAll(".action-edit-option").forEach(button => { // Add event listeners for edit buttons
              button.addEventListener("click", () => {
                document.querySelector("ion-router").push("/device-edit/" + button.getAttribute("data-bridge") + "/" + button.getAttribute("data-id"));
              });
            });
          
            this.querySelectorAll(".action-delete-option").forEach(button => { // Add event listeners for delete buttons
              button.addEventListener("click", () => {
                this.querySelector("#action-sheet").dataset.ID      = button.getAttribute("data-id");
                this.querySelector("#action-sheet").dataset.bridge  = button.getAttribute("data-bridge");
                this.querySelector("#action-sheet").isOpen          = true;
              });
            });
          }
          toastShow(window.Translation.get("EntriesLoaded"), "success");
        }
        else {
          toastShow("Error: " + response.error, "danger");
        }
      }
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
   
    spinner.remove();
  }
}

customElements.define("page-devices", Devices);