/**
 * Care Insight Rules Page
 */

import { apiDELETE, apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";
import { spinnerShow, entriesNoDataMessage } from "../services/helper.js";

class CareInsightRules extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-back-button default-href="/settings"></ion-back-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("PageCareInsightRulesHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-refresher id="refresher" slot="fixed">
          <ion-refresher-content refreshing-spinner="bubbles" pulling-text="${window.Translation.get("RefreshPullingText")}">
          </ion-refresher-content>
        </ion-refresher>

        <div id="care-insight-rules-list"></div>
        <div id="care-insight-rules-list-no-data"></div>

        <ion-action-sheet id="action-sheet" class="action-sheet-style" header="${window.Translation.get("Actions")}"></ion-action-sheet>
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button color="success" id="care-insight-rule-edit-button">
            <ion-icon name="add"></ion-icon>
          </ion-fab-button>
        </ion-fab>
      </ion-content>
    `;

    this.querySelector("#care-insight-rule-edit-button").addEventListener("click", () => {
      document.querySelector("ion-router").push("/care-insight-rule-edit/0");
    });

    this.querySelector("#refresher").addEventListener("ionRefresh", async (event) => {
      await this.dataLoad();
      event.target.complete();
    });

    this.actionSheetSetup();
    this.dataLoad();
  }

  actionSheetSetup() {
    const actionSheet = this.querySelector("#action-sheet");
    actionSheet.buttons = [
      {
        text: window.Translation.get("Delete"),
        role: "destructive",
        data: {
          action: "delete",
        },
      },
      {
        text: window.Translation.get("Cancel"),
        role: "cancel",
        data: {
          action: "cancel",
        },
      },
    ];

    actionSheet.addEventListener("ionActionSheetDidDismiss", async (event) => {
      actionSheet.isOpen = false;
      const ID = actionSheet.dataset.ID;

      if (String(event.detail.data?.action) === "delete") {
        const data = await apiDELETE("/data/care_insight_rules?ruleID=" + ID);
        if (String(data.status) === "ok") {
          const itemDelete = this.querySelector("#care-insight-rules-list").querySelector("ion-card[data-id='" + ID + "']");
          if (itemDelete) {
            itemDelete.remove();
            toastShow(window.Translation.get("EntryDeleted"), "success");
          }
        }
        else {
          toastShow("Error: " + data.error, "danger");
        }
      }
    });
  }

  async dataLoad() {
    const spinner = spinnerShow("#care-insight-rules-list");

    try {
      const data = await apiGET("/data/care_insight_rules?orderBy=ruleID,DESC");
      console.log("API call - Output:", data);

      if (String(data.status) === "ok") {
        const listElement = this.querySelector("#care-insight-rules-list");
        const items = data.results;

        if (!items || Number(items.length) === 0) {
          listElement.innerHTML = "";
          entriesNoDataMessage("#care-insight-rules-list-no-data");
        }
        else {
          this.querySelector("#care-insight-rules-list-no-data").innerHTML = "";
          listElement.innerHTML = items.map(item => `
            <ion-card color="primary" data-id="${item.ruleID}">
              <ion-card-header>
                <ion-card-title>${item.title}</ion-card-title>
                <ion-card-subtitle>${window.Translation.get("SourceProperty")}: ${item.sourceProperty} (${window.Translation.get(item.aggregationType)})</ion-card-subtitle>
              </ion-card-header>
              <ion-card-content>
                <ion-row>
                  <ion-col>
                    ${Number(item.enabled) === 1 ? `<ion-text color="light"><ion-icon name="play-circle-sharp" color="success"></ion-icon> ${window.Translation.get("Enabled")}</ion-text>` : `<ion-text color="light"><ion-icon name="pause-circle-sharp" color="danger"></ion-icon> ${window.Translation.get("Disabled")}</ion-text>`}
                  </ion-col>
                </ion-row>
              </ion-card-content>
              <ion-button data-id="${item.ruleID}" class="action-edit-option"><ion-icon slot="start" name="create-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Edit")}</ion-text></ion-button>
              <ion-button data-id="${item.ruleID}" class="action-delete-option"><ion-icon slot="start" name="trash-sharp" color="danger"></ion-icon><ion-text color="light">${window.Translation.get("Delete")}</ion-text></ion-button>
            </ion-card>
          `).join("");

          this.querySelectorAll(".action-edit-option").forEach(button => {
            button.addEventListener("click", () => {
              document.querySelector("ion-router").push("/care-insight-rule-edit/" + button.getAttribute("data-id"));
            });
          });

          this.querySelectorAll(".action-delete-option").forEach(button => {
            button.addEventListener("click", () => {
              this.querySelector("#action-sheet").dataset.ID  = button.getAttribute("data-id");
              this.querySelector("#action-sheet").isOpen      = true;
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
}

customElements.define("page-care-insight-rules", CareInsightRules);
