/**
 * Care Insight Rule Edit Page
 */

import { apiGET, apiPATCH, apiPOST } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class CareInsightRuleEdit extends HTMLElement {
  devices              = [];
  sourceSelectedDevice = null;

  buildSourceDeviceOptionValue(deviceID, bridge) {
    return String(bridge || "") + "::" + String(deviceID || "");
  }

  parseSourceDeviceOptionValue(value) {
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
                  <ion-input type="text" label="${window.Translation.get("Title")}" label-placement="stacked" name="editTitle" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="text" label="${window.Translation.get("InsightType")}" label-placement="stacked" name="editInsightType" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item>
                  <ion-toggle class="custom" color="primary" name="editEnabled" checked="true">${window.Translation.get("Enabled")}</ion-toggle>
                </ion-item>
                <ion-item color="light">
                  <ion-select label="${window.Translation.get("SourceDevice")}" label-placement="stacked" name="editSourceDeviceID" interface="popover" class="custom" placeholder="${window.Translation.get("None")}"></ion-select>
                </ion-item>
                <ion-item color="light">
                  <ion-select label="${window.Translation.get("SourceProperty")}" label-placement="stacked" name="editSourceProperty" interface="popover" class="custom" placeholder="${window.Translation.get("None")}" disabled="true">
                    <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
                  </ion-select>
                </ion-item>
                <ion-item color="light">
                  <ion-select label="${window.Translation.get("Aggregation")}" label-placement="stacked" name="editAggregationType" interface="popover" class="custom">
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

    this.querySelector("ion-select[name='editAggregationType']").value       = "sum_below_threshold";
    this.querySelector("ion-input[name='editAggregationWindowHours']").value = 24;
    this.querySelector("ion-input[name='editMinReadings']").value            = 1;

    this.querySelector("#submit-button").addEventListener("click", () => this.submit());

    this.querySelector("ion-select[name='editSourceDeviceID']").addEventListener("ionChange", (event) => this.onSourceDeviceChanged(event));
    this.querySelector("ion-select[name='editSourceProperty']").addEventListener("ionChange", () => this.sourceEnabledDisable());

    this.initializeData();
  }

  async initializeData() {
    await this.loadDataSourceDevices();

    if (this.ID > 0) {
      await this.loadData();
    }
  }

  async loadDataSourceDevices() {
    try {
      const data = await apiGET("/devices/all");
      if (data.status === "ok") {
        this.devices = data.results || [];
        this.renderSourceDeviceOptions();
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

  renderSourceDeviceOptions() {
    const select = this.querySelector("ion-select[name='editSourceDeviceID']");

    select.innerHTML = `
      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
      ${this.devices.map(item => `<ion-select-option value="${this.buildSourceDeviceOptionValue(item.deviceID, item.bridge)}" data-bridge="${item.bridge}">${item.name} (${item.deviceID}, ${item.bridge})</ion-select-option>`).join("")}
    `;

    this.sourceEnabledDisable();
  }

  async onSourceDeviceChanged(event) {
    const selectedDevice = this.parseSourceDeviceOptionValue(event.detail.value || "");
    this.setSourceSelectedDevice(selectedDevice.deviceID, selectedDevice.bridge);

    if ((selectedDevice.deviceID === null) || (selectedDevice.bridge === null)) {
      this.renderSourcePropertyOptions();
      this.sourceEnabledDisable();
      return;
    }

    await this.loadDataSourceDeviceProperties(selectedDevice.bridge, selectedDevice.deviceID);
    this.sourceEnabledDisable();
  }

  setSourceSelectedDevice(deviceID, bridge) {
    if ((deviceID === undefined) || (deviceID === null) || (deviceID === "")) {
      this.sourceSelectedDevice = null;
      return;
    }

    const selectedDevice = this.devices.find(item => item.deviceID === deviceID && item.bridge === bridge);
    this.sourceSelectedDevice = selectedDevice || null;
  }

  renderSourcePropertyOptions(properties = [], selectedProperty = null) {
    const propertySelect = this.querySelector("ion-select[name='editSourceProperty']");
    const readableProperties = properties.filter(item => item.read === true);

    propertySelect.innerHTML = `
      <ion-select-option value="">${window.Translation.get("None")}</ion-select-option>
      ${readableProperties.map(item => {
        if (item.translation != null && item.translation !== "") {
          const translatedLabel = item.translation[window.appConfig.CONF_language] || item.name;
          return `<ion-select-option value="${item.name}">${translatedLabel}</ion-select-option>`;
        }

        return `<ion-select-option value="${item.name}">${item.name}</ion-select-option>`;
      }).join("")}
    `;

    propertySelect.disabled = readableProperties.length === 0;
    propertySelect.value = selectedProperty !== null ? selectedProperty : "";
    this.sourceEnabledDisable();
  }

  async loadDataSourceDeviceProperties(bridge, deviceID, selectedProperty = null) {
    try {
      const data = await apiGET("/devices/" + bridge + "/" + deviceID);
      if (data.status === "ok") {
        this.sourceSelectedDevice = data.device || this.sourceSelectedDevice;
        this.renderSourcePropertyOptions(data.device?.properties || [], selectedProperty);
      }
      else {
        this.renderSourcePropertyOptions();
        toastShow("Error: " + data.error, "danger");
      }
    }
    catch (error) {
      this.renderSourcePropertyOptions();
      console.error("API call - Error:", error);
      toastShow("Error: " + error.message, "danger");
    }
  }

  sourceEnabledDisable() {
    const submitButton          = this.querySelector("#submit-button");
    const selectedDeviceValue   = this.querySelector("ion-select[name='editSourceDeviceID']")?.value || "";
    const selectedPropertyValue = this.querySelector("ion-select[name='editSourceProperty']")?.value || "";

    if (!submitButton) {
      return;
    }

    submitButton.disabled = (selectedDeviceValue === "") || (selectedPropertyValue === "");
  }

  async submit() {
    if ([...this.querySelectorAll("ion-input[required]")].some(input => !String(input.value ?? "").trim())) {
      toastShow(window.Translation.get("RequiredFieldsMissing"), "warning");
      return;
    }

    if (!String(this.querySelector("ion-select[name='editSourceDeviceID']")?.value ?? "").trim()) {
      toastShow(window.Translation.get("RequiredFieldsMissing"), "warning");
      return;
    }

    if (!String(this.querySelector("ion-select[name='editSourceProperty']")?.value ?? "").trim()) {
      toastShow(window.Translation.get("RequiredFieldsMissing"), "warning");
      return;
    }

    const formData                    = {};
    formData.title                    = this.querySelector("ion-input[name='editTitle']").value;
    formData.insightType              = this.querySelector("ion-input[name='editInsightType']").value;
    formData.enabled                  = this.querySelector("ion-toggle[name='editEnabled']").checked ? 1 : 0;

    const selectedDevice              = this.parseSourceDeviceOptionValue(this.querySelector("ion-select[name='editSourceDeviceID']").value || "");
    formData.sourceDeviceID           = selectedDevice.deviceID || null;
    formData.sourceBridge             = selectedDevice.bridge || null;
    formData.sourceProperty           = this.querySelector("ion-select[name='editSourceProperty']").value;
    formData.aggregationType          = this.querySelector("ion-select[name='editAggregationType']").value;
    formData.aggregationWindowHours   = Number(this.querySelector("ion-input[name='editAggregationWindowHours']").value) || 24;
    formData.thresholdMin             = Number(this.querySelector("ion-input[name='editThresholdMin']").value) || 0;
    formData.minReadings              = Number(this.querySelector("ion-input[name='editMinReadings']").value) || 1;
    formData.recommendation           = this.querySelector("ion-textarea[name='editRecommendation']").value || "";
    formData.dateTimeUpdated          = new Date().toISOString().slice(0, 19).replace("T", " ");

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
        this.querySelector("ion-input[name='editTitle']").value           = item.title;
        this.querySelector("ion-input[name='editInsightType']").value     = item.insightType;
        this.querySelector("ion-toggle[name='editEnabled']").checked      = Number(item.enabled) === 1;
        this.querySelector("ion-select[name='editSourceDeviceID']").value = item.sourceDeviceID ? this.buildSourceDeviceOptionValue(item.sourceDeviceID, item.sourceBridge) : "";

        if (item.sourceDeviceID && item.sourceBridge) {
          await this.loadDataSourceDeviceProperties(item.sourceBridge, item.sourceDeviceID, item.sourceProperty || null);
        }
        else {
          this.renderSourcePropertyOptions([], item.sourceProperty || null);
        }

        this.sourceEnabledDisable();

        this.querySelector("ion-select[name='editAggregationType']").value        = item.aggregationType || "sum_below_threshold";
        this.querySelector("ion-input[name='editAggregationWindowHours']").value  = item.aggregationWindowHours;
        this.querySelector("ion-input[name='editThresholdMin']").value            = item.thresholdMin;
        this.querySelector("ion-input[name='editMinReadings']").value             = item.minReadings;
        this.querySelector("ion-textarea[name='editRecommendation']").value       = item.recommendation || "";
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
