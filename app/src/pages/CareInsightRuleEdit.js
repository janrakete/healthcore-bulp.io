/**
 * Care Insight Rule Edit Page
 */

import { apiGET, apiPATCH, apiPOST } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class CareInsightRuleEdit extends HTMLElement {
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
                <ion-item>
                  <ion-toggle class="custom" color="primary" name="editEnabled" checked="true">${window.Translation.get("Enabled")}</ion-toggle>
                </ion-item>
                <ion-item color="light">
                  <ion-input type="text" label="${window.Translation.get("SourceProperty")}" label-placement="stacked" name="editSourceProperty" required="true" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light">
                  <ion-select label="${window.Translation.get("Aggregation")}" label-placement="stacked" name="editAggregationType" interface="popover" class="custom">
                    <ion-select-option value="SumBelowThreshold">${window.Translation.get("SumBelowThreshold")}</ion-select-option>
                    <ion-select-option value="SumAboveThreshold">${window.Translation.get("SumAboveThreshold")}</ion-select-option>
                    <ion-select-option value="AnomalyDetection">${window.Translation.get("AnomalyDetection")}</ion-select-option>
                  </ion-select>
                </ion-item>
                <ion-item color="light" id="field-aggregation-window-hours">
                  <ion-input type="number" label="${window.Translation.get("WindowHours")}" label-placement="stacked" name="editAggregationWindowHours" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light" id="field-threshold-min">
                  <ion-input type="number" label="${window.Translation.get("MinimumValue")}" label-placement="stacked" name="editThresholdMin" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light" id="field-threshold-max">
                  <ion-input type="number" label="${window.Translation.get("MaximumValue")}" label-placement="stacked" name="editThresholdMax" shape="round" fill="outline" class="custom"></ion-input>
                </ion-item>
                <ion-item color="light" id="field-min-readings">
                  <ion-input type="number" label="${window.Translation.get("MinimumReadings")}" label-placement="stacked" name="editMinReadings" shape="round" fill="outline" class="custom"></ion-input>
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

    this.querySelector("ion-select[name='editAggregationType']").value       = "SumBelowThreshold";
    this.querySelector("ion-input[name='editAggregationWindowHours']").value = 24;
    this.querySelector("ion-input[name='editMinReadings']").value            = 1;

    this.querySelector("#submit-button").addEventListener("click", () => this.submit());
    this.querySelector("ion-select[name='editAggregationType']").addEventListener("ionChange", () => this.updateFieldVisibility());

    this.updateFieldVisibility();

    if (Number(this.ID) > 0) {
      this.dataLoad();
    }
  }

  updateFieldVisibility() {
    const aggregationType = this.querySelector("ion-select[name='editAggregationType']")?.value || "SumBelowThreshold";
    const isSumBelow      = String(aggregationType) === "SumBelowThreshold";
    const isSumAbove      = String(aggregationType) === "SumAboveThreshold";
    const isSumRule        = isSumBelow || isSumAbove;

    this.querySelector("#field-aggregation-window-hours").style.display = isSumRule ? "" : "none";
    this.querySelector("#field-min-readings").style.display             = isSumRule ? "" : "none";
    this.querySelector("#field-threshold-min").style.display            = isSumBelow ? "" : "none";
    this.querySelector("#field-threshold-max").style.display            = isSumAbove ? "" : "none";
  }

  async submit() {
    const title          = String(this.querySelector("ion-input[name='editTitle']")?.value ?? "").trim();
    const sourceProperty = String(this.querySelector("ion-input[name='editSourceProperty']")?.value ?? "").trim();

    if (!title || !sourceProperty) {
      toastShow(window.Translation.get("RequiredFieldsMissing"), "warning");
      return;
    }

    const formData                    = {};
    formData.title                    = title;
    formData.enabled                  = this.querySelector("ion-toggle[name='editEnabled']").checked ? 1 : 0;
    formData.sourceProperty           = sourceProperty;
    formData.aggregationType          = this.querySelector("ion-select[name='editAggregationType']").value;
    formData.aggregationWindowHours   = Number(this.querySelector("ion-input[name='editAggregationWindowHours']").value) || 24;
    formData.thresholdMin             = Number(this.querySelector("ion-input[name='editThresholdMin']").value) || 0;
    formData.thresholdMax             = Number(this.querySelector("ion-input[name='editThresholdMax']").value) || 0;
    formData.minReadings              = Number(this.querySelector("ion-input[name='editMinReadings']").value) || 1;
    formData.recommendation           = this.querySelector("ion-textarea[name='editRecommendation']").value || "";
    formData.dateTimeUpdated          = new Date().toISOString().slice(0, 19).replace("T", " ");

    let data = {};

    try {
      if (Number(this.ID) === 0) {
        data = await apiPOST("/data/care_insight_rules", formData);
      }
      else {
        data = await apiPATCH("/data/care_insight_rules?ruleID=" + this.ID, formData);
      }

      if (String(data.status) === "ok") {
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

  async dataLoad() {
    try {
      const data = await apiGET("/data/care_insight_rules?ruleID=" + this.ID);
      console.log("API call - Output:", data);

      if (String(data.status) === "ok") {
        const item = data.results[0];
        this.querySelector("ion-input[name='editTitle']").value                   = item.title;
        this.querySelector("ion-toggle[name='editEnabled']").checked              = Number(item.enabled) === 1;
        this.querySelector("ion-input[name='editSourceProperty']").value          = item.sourceProperty || "";
        this.querySelector("ion-select[name='editAggregationType']").value        = item.aggregationType || "SumBelowThreshold";
        this.querySelector("ion-input[name='editAggregationWindowHours']").value  = item.aggregationWindowHours;
        this.querySelector("ion-input[name='editThresholdMin']").value            = item.thresholdMin;
        this.querySelector("ion-input[name='editThresholdMax']").value            = item.thresholdMax;
        this.querySelector("ion-input[name='editMinReadings']").value             = item.minReadings;
        this.querySelector("ion-textarea[name='editRecommendation']").value       = item.recommendation || "";

        this.updateFieldVisibility();
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
