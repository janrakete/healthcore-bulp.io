/**
 * Individuals Page
 */

import { apiGET, apiDELETE } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { showSpinner } from "../services/helper.js";

class Individuals extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageIndividualsHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-refresher id="refresher" slot="fixed">
          <ion-refresher-content refreshing-spinner="bubbles" pulling-text="${window.Translation.get("RefreshPullingText")}">
          </ion-refresher-content>
        </ion-refresher>

        <div id="individuals-list"></div>
        <ion-action-sheet id="action-sheet" class="action-sheet-style" header="${window.Translation.get("Actions")}"></ion-action-sheet>
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button color="success" id="individual-edit-button">
            <ion-icon name="add"></ion-icon>
          </ion-fab-button>
        </ion-fab>
      </ion-content>
    `;
    this.querySelector("#individual-edit-button").addEventListener("click", () => { // Navigate to Individual Edit page on button click
      document.querySelector("ion-router").push("/individual-edit/0");
    });

    this.querySelector("#refresher").addEventListener("ionRefresh", async (event) => { // pull to refresh
      await this.dataLoad();
      event.target.complete();
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
        const data = await apiDELETE("/data/individuals?individualID=" + ID);
        if (data.status === "ok") {
          const itemDelete = this.querySelector("#individuals-list").querySelector("ion-card[data-id='" + ID + "']");
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
    const spinner = showSpinner("#individuals-list");        
    try {
      const roomData = await apiGET("/data/rooms"); // load rooms for select
      console.log("API call - Output:", roomData);
      if (roomData.status === "ok") { 
        const data = await apiGET("/data/individuals");
        console.log("API call - Output:", data);
        
        if (data.status === "ok") {
          const listElement = this.querySelector("#individuals-list");
          const items = data.results;

          if (!items || items.length === 0) {
            listElement.innerHTML = `
              <center><ion-text color="light">${window.Translation.get("EntriesNone")}</ion-text></center>
            `;
          }
          else {
            listElement.innerHTML = items.map(item => `
              <ion-card color="primary" data-id="${item.individualID}">
                <ion-card-header>
                    <ion-card-title>${item.firstname} ${item.lastname}</ion-card-title>
                    <ion-card-subtitle>${item.roomID > 0 && roomData.results.find(room => room.roomID === item.roomID) ? `${window.Translation.get("Room")}: ${roomData.results.find(room => room.roomID === item.roomID).name}` : '' }</ion-card-subtitle>
                </ion-card-header>
                <ion-button data-id="${item.individualID}" id="edit-${item.individualID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
                <ion-button data-id="${item.individualID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
              </ion-card>
            `).join("");
            
            this.querySelectorAll(".action-edit-option").forEach(button => { // Add event listeners for edit buttons
              button.addEventListener("click", () => {
                document.querySelector("ion-router").push("/individual-edit/" + button.getAttribute("data-id"));
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
      else {
        toastShow("Error: " + data.error, "danger");        
      }
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }

    spinner.remove();
  }
}

customElements.define("page-individuals", Individuals);