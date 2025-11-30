/**
 * Start page
 */

/*

README ANPASSEN
Apps using ionic ... und Capactitor



Cd app
Npm run dev


Default URL: http://localhost:5173/

-> For Native:

Install: https://capacitorjs.com/docs/getting-started/environment-setup
Install Java

1. Npm run build
2. npx cap sync 
3. npx cap run android


Firebase admn SSDK; ASch Pricate Schlüssel generieren und als /Users/jan/Desktop/push-firebase-admin.json im Root speochen



*/

// Personen mit Rooms 
// und Requiered
// ... 



import { toastShow } from "../services/toast.js";
import { Zeroconf } from "@ionic-native/zeroconf";
import {barLoadingStart, barLoadingStop} from "../services/helper.js";
import { apiGET, apiPOST } from "../services/api.js";

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
          <ion-col size="6"><ion-button expand="block" href="/individuals"><div><div><ion-icon slot="start" name="person-sharp" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("IndividualsTitle")}</ion-text></div></div></ion-button></ion-col>
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
        <ion-alert backdrop-dismiss="false" header="${window.Translation.get("ServerSearch")}" message="${window.Translation.get("ServerSearchMessage")}"></ion-alert>
        </ion-content>
    `;
    this.serverFind();
  }

  async serverFind() {
    let serverFound = false;

    if (window.appConfig.CONF_serverURL === undefined) {
      document.querySelector("ion-alert").present();
      const loadingInterval = await barLoadingStart("ion-alert", "message");

      try {
        if (window.isCapacitor === true) {
          console.log("App: Is native - starting Bonjour scan ...");
          Zeroconf.watch("_http._tcp.", "local.").subscribe(result => {
            console.log("App: Result from Zeroconf:");
            console.log(result);
            if (result.action === "resolved") {
              console.log("App: Bonjour service resolved, checking name ...");
              if ((result.service.name === window.appConfig.CONF_serverIDBonjour) &&  (serverFound === false)) {
                serverFound = true;
                Zeroconf.close();
                const host = result.service.ipv4Addresses[0];
                const port = result.service.port;
                console.log("App: Bonjour service name matches!");
                window.appConfig.CONF_serverURL = "http://" + host + ":" + port;
                console.log("App: Using server URL: " + window.appConfig.CONF_serverURL);

                barLoadingStop(loadingInterval, "ion-alert", "message");
                
                document.querySelector("ion-alert").dismiss();
                toastShow(window.Translation.get("ServerConnected"), "success");

                this.serverCheckPushToken();
              }
              else {
                console.log("App: Bonjour service name does not match OR already found a server.");
              }
            }
          }); 
        }
        else {
          console.log("App: Is not native - using static URL from appConfig ...");
          window.appConfig.CONF_serverURL = window.appConfig.CONF_serverURLStatic;
          console.log("App: Trying to connect to server URL: " + window.appConfig.CONF_serverURL);
                              
          const tryConnect = async () => {
            const data = await apiGET("/info");
            if (data.status === "ok") {
              console.log("App: Connected to server at static URL: " +  window.appConfig.CONF_serverURL);

              barLoadingStop(loadingInterval, "ion-alert", "message");

              document.querySelector("ion-alert").dismiss();
              toastShow(window.Translation.get("ServerConnected"), "success");
              return true;
            }
            return false;
          };

          const interval = setInterval(async () => { // Interval to retry connection
            try {
              if (await tryConnect() === true) {
                clearInterval(interval);
              }
            }
            catch (error) {
              console.log("App: Connection attempt failed, retrying ...");
            }
          }, 1000);
        }
      }
      catch (error) {
        barLoadingStop(loadingInterval, "ion-alert", "message");
        console.error("App: Error connecting to server:", error);
        toastShow("Error: " + error.message, "danger");
      }
    }
  }

  async serverCheckPushToken() {
    console.log("Push: Checking push notification token ...");
    if (window.devicePushToken !== undefined) {
      console.log("Push: Checking push token on server ...");
      try {
        const dataGET = await apiGET("/data/push_tokens?token=" + window.devicePushToken);
        if (dataGET.status === "ok") {
          if (dataGET.results.length === 0) {
            console.log("Push: Push token not registered on server, registering ...");
            const dataPOST = await apiPOST("/data/push_tokens", { token: window.devicePushToken });
            if (dataPOST.status === "ok") {
              console.log("Push: Push token registered on server.");
            } 
            else {
              console.error("Push: Error registering push token on server:");
              console.log(dataPOST);
            }
          }
          else {
            console.log("Push: Push token already registered on server.");
          }
        }
        else {
          console.error("Push: Error checking push token on server:");
          console.log(dataGET);

        }
      }
      catch (error) {
        console.error("Push: Error during push token check:");
        console.log(error);
      }
    }
  }
}

customElements.define("page-start", Start);