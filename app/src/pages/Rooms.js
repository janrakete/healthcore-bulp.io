/**
 * Rooms Page
 */

import { apiGET, apiDELETE } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { showSpinner } from "../services/helper.js";

class Rooms extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/settings"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageRoomsHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-refresher id="refresher" slot="fixed">
          <ion-refresher-content refreshing-spinner="bubbles" pulling-text="${window.Translation.get("RefreshPullingText")}">
          </ion-refresher-content>
        </ion-refresher>

        <div id="rooms-list"></div>
        <ion-action-sheet id="action-sheet" class="action-sheet-style" header="${window.Translation.get("Actions")}"></ion-action-sheet>
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button color="success" id="room-edit-button">
            <ion-icon name="add"></ion-icon>
          </ion-fab-button>
        </ion-fab>
      </ion-content>
    `;
    this.querySelector("#room-edit-button").addEventListener("click", () => { // Navigate to Room Edit page on button click
      document.querySelector("ion-router").push("/room-edit/0");
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
        const data = await apiDELETE("/data/rooms?roomID=" + ID);
        if (data.status === "ok") {
          const itemDelete = this.querySelector("#rooms-list").querySelector("ion-card[data-id='" + ID + "']");
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
    const spinner = showSpinner("#rooms-list");        
    try {
      const data = await apiGET("/data/rooms");
      console.log("API call - Output:", data);
      
      if (data.status === "ok") {
        const listElement = this.querySelector("#rooms-list");
        const items = data.results;

        if (!items || items.length === 0) {
          listElement.innerHTML = `
            <center><ion-text color="light">${window.Translation.get("EntriesNone")}</ion-text></center>
          `;
        }
        else {
          listElement.innerHTML = items.map(item => `
            <ion-card color="primary" data-id="${item.roomID}">
              <ion-card-header>
                  <ion-card-title>${item.name}</ion-card-title>
              </ion-card-header>
              <ion-button data-id="${item.roomID}" id="edit-${item.roomID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
              <ion-button data-id="${item.roomID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
            </ion-card>
          `).join("");
          
          this.querySelectorAll(".action-edit-option").forEach(button => { // Add event listeners for edit buttons
            button.addEventListener("click", () => {
              document.querySelector("ion-router").push("/room-edit/" + button.getAttribute("data-id"));
            });
          });
          
          this.querySelectorAll(".action-delete-option").forEach(button => { // Add event listeners for delete buttons
            button.addEventListener("click", () => {
              this.querySelector("#action-sheet").dataset.ID  = button.getAttribute("data-id");
              this.querySelector("#action-sheet").isOpen      = true;
            });
          });
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

customElements.define("page-rooms", Rooms);