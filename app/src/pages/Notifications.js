/**
 * Rooms Page
 */

import { apiGET, apiDELETE } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { dateFormat } from "../services/helper.js";

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
        <center><ion-spinner name="dots" color="warning"></ion-spinner></center>
        <div id="notifications-list"></div>
      </ion-content>
    `;
    this.dataLoad();
  }

  async dataLoad() {
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

customElements.define("page-notifications", Notifications);