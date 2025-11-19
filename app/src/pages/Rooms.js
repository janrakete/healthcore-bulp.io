/**
 * Rooms Page
 */

import { apiGET, apiDELETE } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class Rooms extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageRoomsHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <center><ion-spinner name="dots" color="warning"></ion-spinner></center>
        <ion-list id="rooms-list" inset="true">
        </ion-list>
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
          const itemDelete = this.querySelector("#rooms-list").querySelector("ion-item-option[data-id='" + ID + "']").closest("ion-item-sliding");
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
      const data = await apiGET("/data/rooms");
      console.log("API call - Output:", data);
      
      if (data.status === "ok") {
        const listElement = this.querySelector("#rooms-list");
        const items = data.results;

        if (!items || items.length === 0) {
          listElement.innerHTML = `
            <ion-item color="light">
              <ion-label>${window.Translation.get("EntriesNone")}</ion-label>
            </ion-item>
          `;
        }
        else {
          listElement.innerHTML = items.map(item => `
            <ion-item-sliding>
              <ion-item detail="false" color="light">
                <ion-icon slot="start" name="scan-sharp"></ion-icon>
                <ion-label>
                  ${item.name}
                </ion-label>
              </ion-item>
                <ion-item-options side="end">
                  <ion-item-option color="warning" data-id="${item.roomID}" class="action-edit-option" id="edit-${item.roomID}">
                    <ion-icon slot="icon-only" name="create-sharp"></ion-icon>
                  </ion-item-option>
                  <ion-item-option color="danger" data-id="${item.roomID}" class="action-delete-option">
                    <ion-icon slot="icon-only" name="trash-sharp"></ion-icon>
                  </ion-item-option>
                </ion-item-options>
            </ion-item-sliding>
          `).join("");
          
          this.querySelectorAll(".action-edit-option").forEach(button => { // Add event listeners for edit buttons
            button.addEventListener("click", () => {
              document.querySelector("ion-router").push("/room-edit/" + button.getAttribute("data-id"));
            });
          });
          
          this.querySelectorAll(".action-delete-option").forEach(button => { // Add event listeners for delete buttons
            button.addEventListener("click", () => {
              this.querySelector("#action-sheet").dataset.ID = button.getAttribute("data-id");
              this.querySelector("#action-sheet").isOpen = true;
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

customElements.define("page-rooms", Rooms);