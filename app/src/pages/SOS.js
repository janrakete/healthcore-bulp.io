/**
 * SOS Page
 */

//Einträge löschen
//SSE drin lassen, aber FCM (beides erklären in readme)
// Schaubild anpassen
//Bonjour mit App


import { apiGET } from "../services/api.js";
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
      </ion-content>
    `;
    this.loadData();
  }

  async loadData() {
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
                  <ion-item-option>Favorite</ion-item-option>
                  <ion-item-option color="danger">Delete</ion-item-option>
                </ion-item-options>
            </ion-item-sliding>
          `).join("");
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
    
    // Remove spinner
    const spinner = this.querySelector("ion-spinner");
    spinner.remove();
  }  
}
customElements.define("page-sos", SOS);