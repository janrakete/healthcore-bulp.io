/**
 * Care Insight Detail Page
 */

import { apiGET, apiPATCH, apiPOST } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { dateFormat, spinnerShow } from "../services/helper.js";

class CareInsightDetail extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/care-insights"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageCareInsightDetailHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <div id="care-insight-detail"></div>
      </ion-content>
    `;

    this.dataLoad();
  }

  async dataLoad() {
    const spinner = spinnerShow("#care-insight-detail");

    try {
      const data = await apiGET("/care-insights/" + this.ID);
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        this.renderDetail(data);
        this.setupEvents();
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

  renderDetail(data) {
    const item = data.insight;

    this.querySelector("#care-insight-detail").innerHTML = `
      <ion-card color="${this.getSeverityColor(item.severity)}">
        <ion-card-header>
          <ion-card-title>${item.title}</ion-card-title>
          <ion-card-subtitle>${this.getSeverityLabel(item.severity)} | ${this.getStatusLabel(item.status)} | ${dateFormat(item.dateTimeUpdated, window.appConfig.CONF_dateLocale)}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <p><strong>${window.Translation.get("Summary")}:</strong> ${item.summary}</p>
          ${item.explanation ? `<p><strong>${window.Translation.get("Explanation")}:</strong> ${item.explanation}</p>` : ""}
          ${item.recommendation ? `<p><strong>${window.Translation.get("Recommendation")}:</strong> ${item.recommendation}</p>` : ""}
          ${item.device ? `<p><strong>${window.Translation.get("Device")}:</strong> ${item.device.name || item.device.productName || item.device.deviceID}</p>` : ""}
          ${item.individual ? `<p><strong>${window.Translation.get("AssignedPerson")}:</strong> ${item.individual.firstname} ${item.individual.lastname}</p>` : ""}
          ${item.room ? `<p><strong>${window.Translation.get("AssignedRoom")}:</strong> ${item.room.name}</p>` : ""}
          <ion-button id="status-acknowledged" color="tertiary"><ion-icon slot="start" name="eye-sharp"></ion-icon>${window.Translation.get("Acknowledge")}</ion-button>
          <ion-button id="status-resolved" color="success"><ion-icon slot="start" name="checkmark-sharp"></ion-icon>${window.Translation.get("Resolve")}</ion-button>
          <ion-button id="status-dismissed" color="medium"><ion-icon slot="start" name="close-sharp"></ion-icon>${window.Translation.get("Dismiss")}</ion-button>
          <ion-button id="feedback-helpful" color="primary"><ion-icon slot="start" name="thumbs-up-sharp"></ion-icon>${window.Translation.get("Helpful")}</ion-button>
          <ion-button id="feedback-false-positive" color="warning"><ion-icon slot="start" name="thumbs-down-sharp"></ion-icon>${window.Translation.get("FalsePositive")}</ion-button>
        </ion-card-content>
      </ion-card>

      <ion-card color="primary">
        <ion-card-header>
          <ion-card-title>${window.Translation.get("Signals")}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          ${data.signals.length > 0 ? data.signals.map((signal) => `
            <p>${signal.property}: ${signal.value} (${dateFormat(signal.dateTimeObserved, window.appConfig.CONF_dateLocale)})</p>
          `).join("") : `<p>${window.Translation.get("EntriesNone")}</p>`}
        </ion-card-content>
      </ion-card>

      <ion-card color="primary">
        <ion-card-header>
          <ion-card-title>${window.Translation.get("Feedback")}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          ${data.feedback.length > 0 ? data.feedback.map((entry) => `
            <p>${entry.feedbackType}${entry.comment ? ": " + entry.comment : ""}</p>
          `).join("") : `<p>${window.Translation.get("EntriesNone")}</p>`}
        </ion-card-content>
      </ion-card>
    `;
  }

  setupEvents() {
    this.querySelector("#status-acknowledged").addEventListener("click", async () => this.updateStatus("acknowledged"));
    this.querySelector("#status-resolved").addEventListener("click", async () => this.updateStatus("resolved"));
    this.querySelector("#status-dismissed").addEventListener("click", async () => this.updateStatus("dismissed"));
    this.querySelector("#feedback-helpful").addEventListener("click", async () => this.sendFeedback("helpful"));
    this.querySelector("#feedback-false-positive").addEventListener("click", async () => this.sendFeedback("false_positive"));
  }

  async updateStatus(status) {
    try {
      const data = await apiPATCH("/care-insights/" + this.ID, { status: status });
      if (data.status === "ok") {
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

  async sendFeedback(feedbackType) {
    try {
      const data = await apiPOST("/care-insights/" + this.ID + "/feedback", { feedbackType: feedbackType });
      if (data.status === "ok") {
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

customElements.define("page-care-insight-detail", CareInsightDetail);