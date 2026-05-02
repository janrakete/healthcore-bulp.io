/**
 * Alert Detail Page
 */

import { apiGET, apiPATCH } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { dateFormat, spinnerShow } from "../services/helper.js";

class AlertDetail extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/alerts"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageAlertDetailHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <div id="alert-detail"></div>
      </ion-content>
    `;

    this.dataLoad();
  }

  async dataLoad() {
    const spinner = spinnerShow("#alert-detail");

    try {
      const data = await apiGET("/alerts/" + this.ID);
      console.log("API call - Output:", data);

      if (String(data.status) === "ok") {
        const item = data.alert;

        this.querySelector("#alert-detail").innerHTML = `
          <ion-card color="primary">
            <ion-card-header>
              <ion-card-title>${item.icon ? `<ion-icon name="${item.icon}"></ion-icon> ` : ""}${item.title}</ion-card-title>
              <ion-card-subtitle>${this.getSubtitle(item)}</ion-card-subtitle>
            </ion-card-header>
            <ion-card-content>
              <p><strong>${window.Translation.get("Summary")}:</strong> ${item.summary}</p><br />
              ${item.explanation ? `<p><strong>${window.Translation.get("Explanation")}:</strong> ${item.explanation}</p><br />` : ""}
              ${item.recommendation ? `<p><strong>${window.Translation.get("Recommendation")}:</strong> ${item.recommendation}</p><br />` : ""}
              ${item.device ? `<p><strong>${window.Translation.get("Device")}:</strong> ${item.device.name || item.device.productName || item.device.uuid}</p><br />` : ""}
              ${item.individual ? `<p><strong>${window.Translation.get("AssignedPerson")}:</strong> ${item.individual.firstname} ${item.individual.lastname}</p><br />` : ""}
              ${item.room ? `<p><strong>${window.Translation.get("AssignedRoom")}:</strong> ${item.room.name}</p><br />` : ""}

              <ion-button expand="block" id="status-open" color="warning">${window.Translation.get("Reopen")}</ion-button>
              <ion-button expand="block" id="status-acknowledged" color="tertiary">${window.Translation.get("Acknowledge")}</ion-button>
              <ion-button expand="block" id="status-resolved" color="success">${window.Translation.get("Resolve")}</ion-button>
              <ion-button expand="block" id="status-critical" color="danger">${window.Translation.get("AsCritical")}</ion-button>
            </ion-card-content>
          </ion-card>

          <ion-card color="primary">
            <ion-card-header>
              <ion-card-title>${window.Translation.get("Signals")}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              ${(data.signals && Number(data.signals.length) > 0) ? data.signals.map((signal) => `
                <p>
                  ${dateFormat(signal.dateTimeObserved, window.appConfig.CONF_dateLocale)}<br />
                  ${signal.property}: ${signal.value}
                </p>
              `).join("") : `<p>${window.Translation.get("EntriesNone")}</p>`}
            </ion-card-content>
          </ion-card>
        `;

        this.querySelector("#status-acknowledged").addEventListener("click", async () => this.updateStatus("acknowledged"));
        this.querySelector("#status-resolved").addEventListener("click", async () => this.updateStatus("resolved"));
        this.querySelector("#status-critical").addEventListener("click", async () => this.updateStatus("critical"));
        this.querySelector("#status-open").addEventListener("click", async () => this.updateStatus("open"));
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

  async updateStatus(status) {
    try {
      const data = await apiPATCH("/alerts/" + this.ID, { status: status });
      if (String(data.status) === "ok") {
        toastShow(window.Translation.get("EntrySaved"), "success");
        await this.dataLoad();
      }
      else {
        toastShow("Error: " + data.error, "danger");
      }
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
  }

  getSubtitle(item) {
    const parts = [];

    parts.push(this.getStatusLabel(item.status));
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

customElements.define("page-alert-detail", AlertDetail);
