/**
 * Start page
 */

import { toastShow } from "../services/toast.js";
import { Zeroconf } from "@ionic-native/zeroconf";
import { barLoadingStart, barLoadingStop, spinnerShow, dateFormat } from "../services/helper.js";
import { apiGET, apiPOST } from "../services/api.js";

class Start extends HTMLElement {

  serverFindCurrentAttemptSecond = 0;

  async connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-title>${window.Translation.get("PageStartHeadline")}</ion-title>
          <ion-buttons slot="end">
            <ion-button id="server-reconnect">
              <ion-icon name="refresh-sharp"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding background-1">
        <ion-refresher id="refresher" slot="fixed">
          <ion-refresher-content refreshing-spinner="bubbles" pulling-text="${window.Translation.get("RefreshPullingText")}">
          </ion-refresher-content>
        </ion-refresher>

        <ion-grid>
          <ion-row>
            <ion-col>
              <!--<ion-img class="custom" src="./assets/customer_logo_background.jpg"></ion-img>-->
              <div id="logo">
                <span id="logo-pre">bulp</span><span id="logo-post">.io</span>
              </div>
            </ion-col>
          </ion-row>
        </ion-grid>

        <div id="notifications-list"></div>

        <ion-grid>
          <ion-row>
            <ion-col size="6"><ion-button class="selection" expand="block" href="/notifications"><div><div><ion-icon slot="start" name="notifications-sharp" size="large" color="primary"></ion-icon></div><div><ion-text>${window.Translation.get("MessagesTitle")}</ion-text></div></div></div></ion-button></ion-col>
            <ion-col size="6"><ion-button href="/sos" class="selection" color="tertiary" expand="block"><div><div><ion-icon slot="start" name="call-sharp" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("SOSTitle")}</ion-text></div></div></ion-button></ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12"><ion-button class="selection" expand="block" href="/settings"><ion-icon slot="start" name="build-sharp" size="large" color="primary"></ion-icon><ion-text>${window.Translation.get("SettingsTitle")}</ion-text></ion-button></ion-col>
          </ion-row>
        </ion-grid>
        <ion-alert backdrop-dismiss="false" header="${window.Translation.get("ServerSearch")}"></ion-alert>
      </ion-content>
    `;

    const animation = window.createAnimation() // Logo animation
      .addElement(document.querySelector("#logo"))
      .duration(400)
      .iterations(1)
      .keyframes([{ offset: 0, transform: "scale(0.8)", opacity: "0.5" }, { offset: 1, transform: "scale(1)", opacity: "1"}
      ]);
    animation.play();

    this.querySelector("#refresher").addEventListener("ionRefresh", async (event) => { // pull to refresh
      await this.dataLoad();
      event.target.complete();
    });

    this.querySelector("#server-reconnect").addEventListener("click", async () => { // Reconnect to server on button click  
      this.serverFindCurrentAttemptSecond = 0;
      window.appConfig.CONF_serverURL     = undefined;

      await this.serverFind();
      await this.dataLoad();
    });

    await this.serverFind();
    await this.dataLoad();
  }

  async dataLoad() {
    if (window.appConfig.CONF_serverURL !== undefined) { // only load data if server URL is known, so server is connected
      const spinner = spinnerShow("#notifications-list");        
      try {
        const data = await apiGET("/data/notifications?orderBy=dateTime,DESC&limit=3");
        console.log("API call - Output:", data);
        
        if (data.status === "ok") {
          const listElement = this.querySelector("#notifications-list");
          const items = data.results;

          if (items && items.length > 0) {
              listElement.innerHTML = items.map(item => `
              <ion-card color="primary" data-id="${item.notificationID}" class="small">
                <ion-card-header>
                  <ion-card-title>${item.icon ? `<ion-icon name="${item.icon}" color="light"></ion-icon>` : ""} ${item.text}</ion-card-title>
                  <ion-card-subtitle>${dateFormat(item.dateTime, window.appConfig.CONF_dateLocale)}</ion-card-subtitle>
                </ion-card-header>
              </ion-card>
            `).join("");
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

  async serverFind() {
    let serverFound = false;

    if (window.appConfig.CONF_serverURL === undefined) {
      return new Promise(async (resolve) => {
        document.querySelector("ion-alert").present();
        const loadingInterval = await barLoadingStart("ion-alert", "message");

        try {
          if (window.isCapacitor === true) { // If native app
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
                  resolve();
                }
                else {
                  console.log("App: Bonjour service name does not match OR already found a server.");
                }
              }
            });

            setTimeout(() => { // Timeout for Zeroconf scan if server not found
              if (serverFound === false) {
                console.log("App: Zeroconf scan timed out.");
                Zeroconf.close();
                barLoadingStop(loadingInterval, "ion-alert", "message");
                document.querySelector("ion-alert").dismiss();
                toastShow(window.Translation.get("ServerNotFound"), "danger");
                resolve();
              }
            }, window.appConfig.CONF_serverFindTimeout * 1000); 
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

              if (this.serverFindCurrentAttemptSecond >= window.appConfig.CONF_serverFindTimeout) {
                clearInterval(interval);
                barLoadingStop(loadingInterval, "ion-alert", "message");
                document.querySelector("ion-alert").dismiss();
                toastShow(window.Translation.get("ServerNotFound"), "danger");
                resolve();
                return;
              }
              
              this.serverFindCurrentAttemptSecond++;

              try {
                if (await tryConnect() === true) {
                  this.serverFindCurrentAttemptSecond = 0;
                  clearInterval(interval);
                  resolve();
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
          resolve();
        }
      });
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