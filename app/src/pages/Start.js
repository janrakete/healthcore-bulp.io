/**
 * Start page
 */

//Bonjour mit App
//SSE drin lassen, aber FCM (beides erklären in readme)
// Personen
// Schaubild anpassen


import { toastShow } from "../services/toast.js";
import { Zeroconf } from "@ionic-native/zeroconf";

class Start extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-title>${window.Translation.get("PageStartHeadline")}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">

      <ion-grid>
        <ion-row>
          <ion-col>
            <ion-img src="./assets/customer_logo_background.jpg"></ion-img>
          </ion-col>
        </ion-row>
      </ion-grid>

      <ion-grid>
        <ion-row>
          <ion-col size="6"><ion-button expand="block" color="danger"><div><div><ion-icon slot="start" name="notifications-sharp" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("MessagesTitle")}</ion-text></div></div></div></ion-button></ion-col>
          <ion-col size="6"><ion-button expand="block"><div><div><ion-icon slot="start" name="person-sharp" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("PeopleTitle")}</ion-text></div></div></ion-button></ion-col>
        </ion-row>
        <ion-row>
            <ion-col size="6"><ion-button expand="block" href="/rooms"><div><div><ion-icon slot="start" name="scan-sharp" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("RoomsTitle")}</ion-text></div></div></ion-button></ion-col>
            <ion-col size="6"><ion-button expand="block"><div><div><ion-icon slot="start" name="radio-sharp" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("DevicesTitle")}</ion-text></div></div></ion-button></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="6"><ion-button expand="block"><div><div><ion-icon slot="start" name="unlink-sharp" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("ScenariosTitle")}</ion-text></div></div></ion-button></ion-col>
          <ion-col size="6"><ion-button expand="block"><div><div><ion-icon slot="start" name="build-sharp" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("SettingsTitle")}</ion-text></div></div></ion-button></ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="12"><ion-button href="/sos" color="tertiary" expand="block"><ion-icon slot="start" name="call-sharp" size="large"></ion-icon><ion-text>${window.Translation.get("SOSTitle")}</ion-text></ion-button></ion-col>
        </ion-row>
        </ion-grid>
      </ion-content>
    `;
    this.serverFind();
  }

  async serverFind() {
    if (window.appConfig.CONF_serverURL === undefined) {
      try {
        if (window.isCapacitor) {
          console.log("Is native - starting Bonjour scan ...");
          Zeroconf.watch("_http._tcp.", "local.").subscribe(result => {
            console.log("Result from Zeroconf:");
            console.log(result);
            if (result.action === "resolved") {
              console.log("Bonjour service resolved, checking name ...");
              if (result.service.name === window.appConfig.CONF_serverIDBonjour) {
                const host = result.service.ipv4Addresses[0];
                const port = result.service.port;
                console.log("Bonjour service name matches!");
                window.appConfig.CONF_serverURL = "http://" + host + ":" + port;
                console.log("Using server URL:", window.appConfig.CONF_serverURL);
                toastShow(window.Translation.get("ServerConnected"), "success");
                Zeroconf.close();
              }
              else {
                console.log("Bonjour service name does not match - ignoring.");
              }
            }
          }); 
        }
        else {
          console.log("Is not native - using static URL from appConfig ...");
          window.appConfig.CONF_serverURL = window.appConfig.CONF_serverURLStatic;
          console.log("Using server URL:", window.appConfig.CONF_serverURL);
          toastShow(window.Translation.get("ServerConnected"), "success");
        }
        
      }
      catch (error) {
        console.error("Error connecting to server:", error);
        toastShow("Error: " + error.message, "danger");
      }
    }
  }
}

customElements.define("page-start", Start);