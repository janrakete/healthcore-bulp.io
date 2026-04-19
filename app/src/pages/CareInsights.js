/**
 * Care Insights Page
 */

import { apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { dateFormat, entriesNoDataMessage, spinnerShow } from "../services/helper.js";

class CareInsights extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageCareInsightsHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-refresher id="refresher" slot="fixed">
          <ion-refresher-content refreshing-spinner="bubbles" pulling-text="${window.Translation.get("RefreshPullingText")}">
          </ion-refresher-content>
        </ion-refresher>

        <div id="care-insights-stats"></div>

        <div id="care-insights-list"></div>

        <div id="care-insights-list-no-data"></div>
      </ion-content>
    `;

    this.querySelector("#refresher").addEventListener("ionRefresh", async (event) => { // pull to refresh
      await this.dataLoad();
      event.target.complete();
    });

    this.dataLoad();
  }

  async dataLoad() {
    const spinner = spinnerShow("#care-insights-list");

    try {
      const stats = await apiGET("/care-insights/stats");
      if (String(stats.status) === "ok") {
        this.renderStats(stats.data);
      }

      const data = await apiGET("/care-insights");
      console.log("API call - Output:", data);

      if (String(data.status) === "ok") {
        const listElement = this.querySelector("#care-insights-list");
        const items = data.results;

        if (!items || Number(items.length) === 0) {
          listElement.innerHTML = "";
          entriesNoDataMessage("#care-insights-list-no-data", false);
        }
        else {
          this.querySelector("#care-insights-list-no-data").innerHTML = "";
          listElement.innerHTML = items.map((item) => `
            <ion-card color="primary" data-id="${item.insightID}">
              <ion-card-header>
                <ion-card-title>${item.title}</ion-card-title>
                <ion-card-subtitle>${this.getSubtitle(item)}</ion-card-subtitle>
              </ion-card-header>
              <ion-card-content>
                <ion-text color="light">${item.summary}</ion-text>
              </ion-card-content>
              <ion-button data-id="${item.insightID}" class="action-open-option"><ion-icon slot="start" name="analytics-sharp" color="light"></ion-icon><ion-text color="light">${window.Translation.get("OpenDetail")}</ion-text></ion-button>
            </ion-card>
          `).join("");

          this.querySelectorAll(".action-open-option").forEach((button) => {
            button.addEventListener("click", () => {
              document.querySelector("ion-router").push("/care-insight/" + button.getAttribute("data-id"));
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

  renderStats(data) {
    this.querySelector("#care-insights-stats").innerHTML = `
      <ion-grid class="custom">
        <ion-row>
          <ion-col size="6" class="custom"><ion-card color="danger" class="small"><ion-card-header><ion-card-title class="ion-text-center">${data.critical}</ion-card-title><ion-card-subtitle class="ion-text-center">${window.Translation.get("Critical")}</ion-card-subtitle></ion-card-header></ion-card></ion-col>
          <ion-col size="6" class="custom"><ion-card color="warning" class="small"><ion-card-header><ion-card-title class="ion-text-center">${data.open}</ion-card-title><ion-card-subtitle class="ion-text-center">${window.Translation.get("Open")}</ion-card-subtitle></ion-card-header></ion-card></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6" class="custom"><ion-card color="tertiary" class="small"><ion-card-header><ion-card-title class="ion-text-center">${data.acknowledged}</ion-card-title><ion-card-subtitle class="ion-text-center">${window.Translation.get("Acknowledged")}</ion-card-subtitle></ion-card-header></ion-card></ion-col>
          <ion-col size="6" class="custom"><ion-card color="success" class="small"><ion-card-header><ion-card-title class="ion-text-center">${data.resolved}</ion-card-title><ion-card-subtitle class="ion-text-center">${window.Translation.get("Resolved")}</ion-card-subtitle></ion-card-header></ion-card></ion-col>
        </ion-row>
      </ion-grid>
    `;
  }

  getSubtitle(item) {
    const parts = [];

    parts.push(this.getStatusLabel(item.status));

    if (item.individual) {
      parts.push(window.Translation.get("AssignedPerson") + ": " + item.individual.firstname + " " + item.individual.lastname);
    }

    if (item.room) {
      parts.push(window.Translation.get("AssignedRoom") + ": " + item.room.name);
    }

    if (item.device) {
      parts.push(window.Translation.get("Device") + ": " + (item.device.name || item.device.productName || item.device.deviceID));
    }

    parts.push(dateFormat(item.dateTimeUpdated, window.appConfig.CONF_dateLocale));

    return parts.join(" | ");
  }

  getStatusLabel(status) {
    switch (status) {
      case "acknowledged":
        return "<ion-badge color=\"tertiary\">" + window.Translation.get("Acknowledged") + "</ion-badge>";
      case "resolved":
        return "<ion-badge color=\"success\">" + window.Translation.get("Resolved") + "</ion-badge>";
      case "critical":
        return "<ion-badge color=\"danger\">" + window.Translation.get("Critical") + "</ion-badge>";
      default:
        return "<ion-badge color=\"warning\">" + window.Translation.get("Open") + "</ion-badge>";
    }
  }
}

customElements.define("page-care-insights", CareInsights);
