/**
 * Care Insights Page
 */

import { apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { dateFormat, entriesNoDataMessage, spinnerShow } from "../services/helper.js";

class CareInsights extends HTMLElement {
  filters = {
    status: "",
    severity: "",
  };

  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/settings"></ion-back-button>
          </ion-buttons>
          <ion-buttons slot="end">
            <ion-button href="/care-insight-rules">
              <ion-icon slot="icon-only" name="options-sharp"></ion-icon>
            </ion-button>
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
        <ion-list inset="true">
          <ion-item color="light">
            <ion-segment id="filter-status" value="all" scrollable="true">
              <ion-segment-button value="all">
                <ion-label>${window.Translation.get("All")}</ion-label>
              </ion-segment-button>
              <ion-segment-button value="open">
                <ion-label>${window.Translation.get("Open")}</ion-label>
              </ion-segment-button>
              <ion-segment-button value="acknowledged">
                <ion-label>${window.Translation.get("Acknowledged")}</ion-label>
              </ion-segment-button>
              <ion-segment-button value="resolved">
                <ion-label>${window.Translation.get("Resolved")}</ion-label>
              </ion-segment-button>
              <ion-segment-button value="dismissed">
                <ion-label>${window.Translation.get("Dismissed")}</ion-label>
              </ion-segment-button>
            </ion-segment>
          </ion-item>
          <ion-item color="light">
            <ion-select label="${window.Translation.get("Severity")}" label-placement="stacked" id="filter-severity" interface="popover">
              <ion-select-option value="">${window.Translation.get("All")}</ion-select-option>
              <ion-select-option value="critical">${window.Translation.get("Critical")}</ion-select-option>
              <ion-select-option value="high">${window.Translation.get("High")}</ion-select-option>
              <ion-select-option value="medium">${window.Translation.get("Medium")}</ion-select-option>
              <ion-select-option value="low">${window.Translation.get("Low")}</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item color="light" lines="none">
            <ion-button id="filter-reset" expand="block" color="medium">
              <ion-icon slot="start" name="refresh-sharp"></ion-icon>
              ${window.Translation.get("ResetFilter")}
            </ion-button>
          </ion-item>
        </ion-list>
        <div id="care-insights-list"></div>
        <div id="care-insights-list-no-data"></div>
      </ion-content>
    `;

    this.querySelector("#refresher").addEventListener("ionRefresh", async (event) => { // pull to refresh
      await this.dataLoad();
      event.target.complete();
    });

    this.querySelector("#filter-status").addEventListener("ionChange", async (event) => { // reload list when status filter changes
      this.filters.status = event.detail.value === "all" ? "" : event.detail.value;
      await this.dataLoad();
    });

    this.querySelector("#filter-severity").addEventListener("ionChange", async (event) => { // reload list when severity filter changes
      this.filters.severity = event.detail.value || "";
      await this.dataLoad();
    });

    this.querySelector("#filter-reset").addEventListener("click", async () => { // reset all active filters
      this.filters.status = "";
      this.filters.severity = "";
      this.querySelector("#filter-status").value = "all";
      this.querySelector("#filter-severity").value = "";
      await this.dataLoad();
    });

    this.dataLoad();
  }

  async dataLoad() {
    const spinner = spinnerShow("#care-insights-list");

    try {
      const stats = await apiGET("/care-insights/stats");
      if (stats.status === "ok") {
        this.renderStats(stats.data);
      }

      const queryString = this.buildQueryString();
      const data = await apiGET("/care-insights?limit=100" + queryString);
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        const listElement = this.querySelector("#care-insights-list");
        const items = data.results;

        if (!items || items.length === 0) {
          listElement.innerHTML = "";
          entriesNoDataMessage("#care-insights-list-no-data");
        }
        else {
          this.querySelector("#care-insights-list-no-data").innerHTML = "";
          listElement.innerHTML = items.map((item) => `
            <ion-card color="${this.getSeverityColor(item.severity)}" data-id="${item.insightID}">
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
              document.querySelector("ion-router").push("/care-insights/" + button.getAttribute("data-id"));
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

  buildQueryString() {
    const params = new URLSearchParams();

    if (this.filters.status !== "") {
      params.set("status", this.filters.status);
    }

    if (this.filters.severity !== "") {
      params.set("severity", this.filters.severity);
    }

    const queryString = params.toString();
    if (queryString === "") {
      return "";
    }

    return "&" + queryString;
  }

  renderStats(data) {
    this.querySelector("#care-insights-stats").innerHTML = `
      <ion-grid>
        <ion-row>
          <ion-col size="6"><ion-card color="warning" class="small"><ion-card-header><ion-card-title>${data.open}</ion-card-title><ion-card-subtitle>${window.Translation.get("Open")}</ion-card-subtitle></ion-card-header></ion-card></ion-col>
          <ion-col size="6"><ion-card color="tertiary" class="small"><ion-card-header><ion-card-title>${data.acknowledged}</ion-card-title><ion-card-subtitle>${window.Translation.get("Acknowledged")}</ion-card-subtitle></ion-card-header></ion-card></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-card color="success" class="small"><ion-card-header><ion-card-title>${data.resolved}</ion-card-title><ion-card-subtitle>${window.Translation.get("Resolved")}</ion-card-subtitle></ion-card-header></ion-card></ion-col>
          <ion-col size="6"><ion-card color="danger" class="small"><ion-card-header><ion-card-title>${data.critical}</ion-card-title><ion-card-subtitle>${window.Translation.get("Critical")}</ion-card-subtitle></ion-card-header></ion-card></ion-col>
        </ion-row>
      </ion-grid>
    `;
  }

  getSubtitle(item) {
    const parts = [];

    parts.push(this.getSeverityLabel(item.severity));
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

  getSeverityColor(severity) {
    switch (severity) {
      case "critical":
        return "danger";
      case "high":
        return "warning";
      case "medium":
        return "primary";
      default:
        return "medium";
    }
  }

  getSeverityLabel(severity) {
    switch (severity) {
      case "critical":
        return window.Translation.get("Critical");
      case "high":
        return window.Translation.get("High");
      case "medium":
        return window.Translation.get("Medium");
      default:
        return window.Translation.get("Low");
    }
  }

  getStatusLabel(status) {
    switch (status) {
      case "acknowledged":
        return window.Translation.get("Acknowledged");
      case "resolved":
        return window.Translation.get("Resolved");
      case "dismissed":
        return window.Translation.get("Dismissed");
      default:
        return window.Translation.get("Open");
    }
  }
}

customElements.define("page-care-insights", CareInsights);
