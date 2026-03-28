/**
 * Care Insight Rule Edit Page
 */

import { apiGET, apiPATCH, apiPOST } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class CareInsightRuleEdit extends HTMLElement {
  devices = [];

  buildDeviceOptionValue(deviceID, bridge) {
    return String(bridge || "") + "::" + String(deviceID || "");
  }

  parseDeviceOptionValue(value) {
    if ((value === undefined) || (value === null) || (value === "")) {
      return { deviceID: null, bridge: null };
    }

    const separatorIndex = String(value).indexOf("::");
    if (separatorIndex === -1) {
      return { deviceID: String(value), bridge: null };
    }

    return {
      bridge: String(value).slice(0, separatorIndex),
      deviceID: String(value).slice(separatorIndex + 2)
    };
  }

  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/care-insight-rules"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageCareInsightRuleEditHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-grid>
          <ion-row>
            <ion-col>
              <ion-list inset="true">
                <ion-item color="light">
                  <ion-input type="text" label="${window.Translation.get("Name")}" label-placement="stacked" name="editName" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="text" label="${window.Translation.get("InsightType")}" label-placement="stacked" name="editInsightType" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item>
                  <ion-toggle class="custom" color="primary" name="editEnabled" checked="true">${window.Translation.get("Enabled")}</ion-toggle>
                </ion-item>
                <ion-item color="light">
                  <ion-select label="${window.Translation.get("SourceDevice")}" label-placement="stacked" name="editSourceDeviceID" interface="popover"></ion-select>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="text" label="Bridge" label-placement="stacked" name="editSourceBridge" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="text" label="${window.Translation.get("SourceProperty")}" label-placement="stacked" name="editSourceProperty" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-select label="${window.Translation.get("Aggregation")}" label-placement="stacked" name="editAggregationType" interface="popover">
                    <ion-select-option value="sum_below_threshold">${window.Translation.get("RuleTypeSumBelowThreshold")}</ion-select-option>
                  </ion-select>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="number" label="${window.Translation.get("WindowHours")}" label-placement="stacked" name="editAggregationWindowHours" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="number" label="${window.Translation.get("MinimumValue")}" label-placement="stacked" name="editThresholdMin" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="number" label="${window.Translation.get("MinimumReadings")}" label-placement="stacked" name="editMinReadings" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-select label="${window.Translation.get("Severity")}" label-placement="stacked" name="editSeverity" interface="popover">
                    <ion-select-option value="low">${window.Translation.get("Low")}</ion-select-option>
                    <ion-select-option value="medium">${window.Translation.get("Medium")}</ion-select-option>
                    <ion-select-option value="high">${window.Translation.get("High")}</ion-select-option>
                    <ion-select-option value="critical">${window.Translation.get("Critical")}</ion-select-option>
                  </ion-select>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="text" label="${window.Translation.get("Title")}" label-placement="stacked" name="editTitle" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-textarea label="${window.Translation.get("Recommendation")}" label-placement="stacked" name="editRecommendation" auto-grow="true" fill="outline" class="custom"></ion-textarea>
                </ion-item>
              </ion-list>
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col>
              <ion-button expand="block" color="success" id="submit-button"><ion-icon slot="start" name="checkmark-sharp"></ion-icon> ${window.Translation.get("Save")}</ion-button>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-content>
    `;

    this.querySelector("ion-select[name='editAggregationType']").value = "sum_below_threshold";
    this.querySelector("ion-select[name='editSeverity']").value = "medium";
    this.querySelector("ion-input[name='editAggregationWindowHours']").value = 24;
    this.querySelector("ion-input[name='editMinReadings']").value = 1;

    this.querySelector("#submit-button").addEventListener("click", () => this.submit());
    this.querySelector("ion-select[name='editSourceDeviceID']").addEventListener("ionChange", () => this.applySelectedDeviceBridge());

    this.initializeData();
  }

  async initializeData() {
    await this.loadDevices();

    if (this.ID > 0) {
      await this.loadData();
    }
  }

  async loadDevices() {
    try {
      const data = await apiGET("/devices/all");
      if (data.status === "ok") {
        this.devices = data.results || [];
        this.renderDeviceOptions();
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

  renderDeviceOptions() {
    const select = this.querySelector("ion-select[name='editSourceDeviceID']");

    select.innerHTML = `
      <ion-select-option value="">${window.Translation.get("AllDevices")}</ion-select-option>
      ${this.devices.map(item => `<ion-select-option value="${this.buildDeviceOptionValue(item.deviceID, item.bridge)}" data-bridge="${item.bridge}">${item.name || item.productName || item.deviceID} (${item.deviceID}, ${item.bridge})</ion-select-option>`).join("")}
    `;
  }

  applySelectedDeviceBridge() {
    const selectedDevice = this.parseDeviceOptionValue(this.querySelector("ion-select[name='editSourceDeviceID']").value || "");
    const bridgeInput = this.querySelector("ion-input[name='editSourceBridge']");
    const device = this.devices.find(item => item.deviceID === selectedDevice.deviceID && item.bridge === selectedDevice.bridge);

    if (device !== undefined) {
      bridgeInput.value = device.bridge;
    }
    else if (selectedDevice.deviceID === null) {
      bridgeInput.value = "";
    }
  }

  async submit() {
    if ([...this.querySelectorAll("ion-input[required]")].some(input => !String(input.value ?? "").trim())) {
      toastShow(window.Translation.get("RequiredFieldsMissing"), "warning");
      return;
    }

    const formData = {};
    formData.name = this.querySelector("ion-input[name='editName']").value;
    formData.insightType = this.querySelector("ion-input[name='editInsightType']").value;
    formData.enabled = this.querySelector("ion-toggle[name='editEnabled']").checked ? 1 : 0;
    const selectedDevice = this.parseDeviceOptionValue(this.querySelector("ion-select[name='editSourceDeviceID']").value || "");

    formData.sourceDeviceID = selectedDevice.deviceID || null;
    formData.sourceBridge = selectedDevice.deviceID ? (selectedDevice.bridge || null) : (this.querySelector("ion-input[name='editSourceBridge']").value || null);
    formData.sourceProperty = this.querySelector("ion-input[name='editSourceProperty']").value;
    formData.aggregationType = this.querySelector("ion-select[name='editAggregationType']").value;
    formData.aggregationWindowHours = Number(this.querySelector("ion-input[name='editAggregationWindowHours']").value) || 24;
    formData.thresholdMin = Number(this.querySelector("ion-input[name='editThresholdMin']").value) || 0;
    formData.minReadings = Number(this.querySelector("ion-input[name='editMinReadings']").value) || 1;
    formData.severity = this.querySelector("ion-select[name='editSeverity']").value;
    formData.title = this.querySelector("ion-input[name='editTitle']").value || "";
    formData.recommendation = this.querySelector("ion-textarea[name='editRecommendation']").value || "";
    formData.dateTimeUpdated = new Date().toISOString().slice(0, 19).replace("T", " ");

    let data = {};

    try {
      if (parseInt(this.ID) === 0) {
        data = await apiPOST("/data/care_insight_rules", formData);
      }
      else {
        data = await apiPATCH("/data/care_insight_rules?ruleID=" + this.ID, formData);
      }

      if (data.status === "ok") {
        toastShow(window.Translation.get("EntrySaved"), "success");
        document.querySelector("ion-router").push("/care-insight-rules");
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

  async loadData() {
    try {
      const data = await apiGET("/data/care_insight_rules?ruleID=" + this.ID);
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        const item = data.results[0];
        this.querySelector("ion-input[name='editName']").value = item.name;
        this.querySelector("ion-input[name='editInsightType']").value = item.insightType;
        this.querySelector("ion-toggle[name='editEnabled']").checked = Number(item.enabled) === 1;
        this.querySelector("ion-select[name='editSourceDeviceID']").value = item.sourceDeviceID ? this.buildDeviceOptionValue(item.sourceDeviceID, item.sourceBridge) : "";
        this.querySelector("ion-input[name='editSourceBridge']").value = item.sourceBridge || "";
        this.querySelector("ion-input[name='editSourceProperty']").value = item.sourceProperty;
        this.querySelector("ion-select[name='editAggregationType']").value = item.aggregationType || "sum_below_threshold";
        this.querySelector("ion-input[name='editAggregationWindowHours']").value = item.aggregationWindowHours;
        this.querySelector("ion-input[name='editThresholdMin']").value = item.thresholdMin;
        this.querySelector("ion-input[name='editMinReadings']").value = item.minReadings;
        this.querySelector("ion-select[name='editSeverity']").value = item.severity || "medium";
        this.querySelector("ion-input[name='editTitle']").value = item.title || "";
        this.querySelector("ion-textarea[name='editRecommendation']").value = item.recommendation || "";
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
}

customElements.define("page-care-insight-rule-edit", CareInsightRuleEdit);
