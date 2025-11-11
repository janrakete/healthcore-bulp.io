/**
 * SOS Page
 */


// HTTP 400 richtig auswerten
//Einträge löschen
// EEinträge editieren
//SSE drin lassen, aber FCM (beides erklären in readme)
// Schaubild anpassen
//Bonjour mit App


import { apiGET, apiDELETE } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class SOS extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-title>${window.Translation.get("PageSOSHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <center><ion-spinner name="dots" color="warning"></ion-spinner></center>
        <ion-list id="sos-list" inset="true">
        </ion-list>
        <ion-action-sheet id="action-sheet" header="${window.Translation.get("Actions")}"></ion-action-sheet>
      </ion-content>
    `;
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
        const data = await apiDELETE("/data/sos?sosID=" + ID);
        if (data.status === "ok") {

          // redirect
          toastShow(window.Translation.get("EntryDeleted"), "success");
        }
        else {
          toastShow("Error: " + data.message, "danger");
        }
      }
    });
  }

  async dataLoad() {
    try {
      const data = await apiGET("/data/sos");
      console.log("API call - Output:", data);
      
      if (data.status === "ok") {
        const listElement = this.querySelector("#sos-list");
        const items = data.results;

        if (!items || items.length === 0) {
          listElement.innerHTML = `
            <ion-item>
              <ion-label>${window.Translation.get("EntriesNone")}</ion-label>
            </ion-item>
          `;
        }
        else {
          listElement.innerHTML = items.map(item => `
            <ion-item-sliding>
              <ion-item href="tel:${item.number}" detail="false" color="light">
                <ion-icon slot="start" name="call-sharp"></ion-icon>
                <ion-label>
                  ${item.name}
                </ion-label>
              </ion-item>
                <ion-item-options>
                  <ion-item-option color="warning" data-id="${item.sosID}" class="action-edit-option">
                    <ion-icon slot="icon-only" name="create-sharp"></ion-icon>
                  </ion-item-option>
                  <ion-item-option color="danger" data-id="${item.sosID}" class="action-delete-option">
                    <ion-icon slot="icon-only" name="trash-sharp"></ion-icon>
                  </ion-item-option>
                </ion-item-options>
            </ion-item-sliding>
          `).join("");
          
          this.querySelectorAll('.action-delete-option').forEach(button => { // Add event listeners for delete buttons
            button.addEventListener("click", () => {
              this.querySelector('#action-sheet').dataset.ID = button.getAttribute("data-id");
              this.querySelector('#action-sheet').isOpen = true;
            });
          });
        }
        toastShow(window.Translation.get("EntriesLoaded"), "success");
      }
      else {
        toastShow("Error: " + data.message, "danger");
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

customElements.define("page-sos", SOS);