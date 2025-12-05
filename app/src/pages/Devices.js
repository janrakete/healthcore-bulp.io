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
        <center><ion-spinner name="dots" color="warning"></ion-spinner></center>
        <div id="devices-list"></div>
        <ion-action-sheet id="action-sheet" class="action-sheet-style" header="${window.Translation.get("Actions")}"></ion-action-sheet>
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button color="success" id="device-edit-button">
            <ion-icon name="add"></ion-icon>
          </ion-fab-button>
        </ion-fab>
      </ion-content>
    `;
    this.querySelector("#device-edit-button").addEventListener("click", () => { // Navigate to Device Add page on button click
      document.querySelector("ion-router").push("/devices-add");
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
      const ID = actionSheet.dataset.ID; // Get ID of entry to delete
      console.log("Action sheet: ID of entry:", ID);
      if (event.detail.data?.action === "delete") {
        const data = await apiDELETE("/data/devices?deviceID=" + ID);
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

  async dataLoad() {
    try {
      const data = await apiGET("/devices/all");
      console.log("API call - Output:", data);
      
      if (data.status === "ok") {
        const listElement = this.querySelector("#devices-list");
        const items = data.results;

        if (!items || items.length === 0) {
          listElement.innerHTML = `
            <center><ion-text color="light">${window.Translation.get("EntriesNone")}</ion-text></center>
          `;
        }
        else {
          listElement.innerHTML = items.map(item => {
            let displayInfo = "";
            
            switch(item.bridge) {
              case "zigbee":
                displayInfo = window.Translation.get("Zigbee");
                break;
              case "bluetooth":
                displayInfo = window.Translation.get("Bluetooth");
                break;
              case "lora":
                displayInfo = window.Translation.get("LoRa");
                break;
              case "http":
                displayInfo = window.Translation.get("Wifi");
                break;
              default:
                displayInfo = window.Translation.get("Unknown");
            }
            
            return `
            <ion-card color="primary" data-id="${item.deviceID}">
              <ion-card-header>
                  <ion-card-title>${item.name}</ion-card-title>
                  <ion-card-subtitle>${item.deviceID} (${displayInfo})</ion-card-subtitle>
              </ion-card-header>
              <ion-button data-id="${item.deviceID}" id="edit-${item.deviceID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
              <ion-button data-id="${item.deviceID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
            </ion-card>
          `;
          }).join("");
          
          this.querySelectorAll(".action-edit-option").forEach(button => { // Add event listeners for edit buttons
            button.addEventListener("click", () => {
              document.querySelector("ion-router").push("/device-edit/" + button.getAttribute("data-id"));
            });
          });
          
          this.querySelectorAll(".action-delete-option").forEach(button => { // Add event listeners for delete buttons
            button.addEventListener("click", () => {
              this.querySelector("#action-sheet").dataset.ID  = button.getAttribute("data-id");
              this.querySelector("#action-sheet").isOpen      = true;
            });
          });
        }
        toastShow(window.Translation.get("EntriesLoaded"), "success");
      }
      else {
        toastShow("Error: " + data.error, "danger");
      }
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
    
    const spinner = this.querySelector("ion-spinner"); // Remove spinner
    spinner.remove();
  }
}

customElements.define("page-devices", Devices);