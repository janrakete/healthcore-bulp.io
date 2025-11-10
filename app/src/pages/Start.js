/**
 * Start page
 */
import { toastShow } from "../services/toast.js";

class Start extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="ion-page">
        <ion-header>
          <ion-toolbar color="primary">
            <ion-title>${window.Translation.get("PageStartHeadline")}</ion-title>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">

        <ion-grid>
          <ion-row>
            <ion-col>
              <ion-img src="./src/assets/customer_logo_background.jpg"></ion-img>
            </ion-col>
          </ion-row>
        </ion-grid>

        <ion-grid>
          <ion-row>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="notifications-sharp" size="large"></ion-icon> ${window.Translation.get("MessagesTitle")}</ion-button></ion-col>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="person-sharp" size="large"></ion-icon> ${window.Translation.get("PeopleTitle")}</ion-button></ion-col>
          </ion-row>
          <ion-row>
              <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="scan-sharp" size="large"></ion-icon> ${window.Translation.get("RoomsTitle")}</ion-button></ion-col>
              <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="radio-sharp" size="large"></ion-icon> ${window.Translation.get("DevicesTitle")}</ion-button></ion-col>
          </ion-row>
          <ion-row>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="unlink-sharp" size="large"></ion-icon> ${window.Translation.get("ScenariosTitle")}</ion-button></ion-col>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="build-sharp" size="large"></ion-icon> ${window.Translation.get("SettingsTitle")}</ion-button></ion-col>
          </ion-row>
        </ion-grid>
        </ion-content>
      </div>
    `;
    this.serverFind();
  }

  async serverFind() {
    if (window.appConfig.CONF_serverURL === undefined) {
      try {
        let serverURL = "";
        if (window.isCapacitor) {
          console.log("Is native - starting Bonjour scan ...");
          serverURL = "http://";
        }
        else {
          console.log("Is not native - using static URL from appConfig ...");
          serverURL = window.appConfig.CONF_serverURLStatic;
        }
        window.appConfig.CONF_serverURL = serverURL;
        console.log("Using server URL:", window.appConfig.CONF_serverURL);
        toastShow(window.Translation.get("ServerConnected"), "success");
      }
      catch (error) {
        console.error("Error connecting to server:", error);
        toastShow("Error: " + error.message, "danger");
      }
    }
  }
}

customElements.define("page-start", Start);