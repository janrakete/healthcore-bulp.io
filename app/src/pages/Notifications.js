/**
 * Rooms Page
 */

import { apiGET, apiDELETE } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { dateFormat, showSpinner } from "../services/helper.js";

class Notifications extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageNotificationsHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-refresher id="refresher" slot="fixed">
          <ion-refresher-content refreshing-spinner="bubbles" pulling-text="${window.Translation.get("RefreshPullingText")}">
          </ion-refresher-content>
        </ion-refresher>

        <div id="notifications-list"></div>
      </ion-content>
    `;
    
    this.querySelector("#refresher").addEventListener("ionRefresh", async (event) => { // pull to refresh
      await this.dataLoad();
      event.target.complete();
    });

    this.dataLoad();
  }

  async dataLoad() {
    const spinner = showSpinner("#notifications-list");    
    try {
      const data = await apiGET("/data/notifications?orderBy=dateTime,DESC");
      console.log("API call - Output:", data);
      
      if (data.status === "ok") {
        const listElement = this.querySelector("#notifications-list");
        const items = data.results;

        if (!items || items.length === 0) {
          listElement.innerHTML = `
            <center><ion-text color="light">${window.Translation.get("EntriesNone")}</ion-text></center>
          `;
        }
        else {
            listElement.innerHTML = items.map(item => `
            <ion-card color="primary" data-id="${item.notificationID}">
              <ion-card-header>
                <ion-card-title>${item.text}</ion-card-title>
                <ion-card-subtitle>${dateFormat(item.dateTime, window.appConfig.CONF_dateLocale)}</ion-card-subtitle>
              </ion-card-header>
              ${item.description !== null ? `<ion-card-content><ion-text color="light">${item.description}</ion-text></ion-card-content>` : ""}
              ${item.scenarioID > 0 ? `<ion-button href="/scenario-edit/${item.scenarioID}"><ion-icon slot="start" name="unlink-sharp" color="tertiary"></ion-icon><ion-text color="light">${window.Translation.get("ScenarioGoTo")}</ion-text></ion-button>` : ''}
              </ion-card>
            `).join("");
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

customElements.define("page-notifications", Notifications);