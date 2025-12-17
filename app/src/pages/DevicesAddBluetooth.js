/**
 * Device add page - Bluetooth
 */

import { apiGET, apiPOST } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class DevicesAddBluetooth extends HTMLElement {

    constructor() {
        super();
        this.scanning = true;
    }

    connectedCallback() {
        this.innerHTML = `
            <ion-header>
                <ion-toolbar color="primary">
                    <ion-buttons slot="start">
                        <ion-back-button default-href="/devices-add"></ion-back-button>
                    </ion-buttons>
                    <ion-title>${window.Translation.get("PageDevicesAddHeadline")}</ion-title>
                </ion-toolbar>
            </ion-header>
            <ion-content class="ion-padding">
                <center><ion-spinner name="dots" color="warning"></ion-spinner></center>
                <div id="devices-list-container"></div>
            </ion-content>
        `;
        
        this.addEventListener("click", (event) => {
            if (event.target.closest(".action-connect-option")) {
                const button    = event.target.closest(".action-connect-option");
                const deviceID  = button.getAttribute("data-id");
                this.addAndConnectDevice(deviceID);
            }
        });
        
        this.scanDevices();
    }

    async scanDevices() {
      const data = await apiPOST("/devices/bluetooth/scan", {"duration" : window.appConfig.CONF_scanDuration});
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        toastShow(window.Translation.get("ScanStarted"), "success");

        const interval = setInterval(async () => {
            const scanData = await apiGET("/devices/bluetooth/scan/info?callID=" + data.data.callID);
            if (this.scanning === true) {
                if (scanData.status === "ok") {
                    if ((scanData.data.devices) && (scanData.data.devices.length !== 0)) {
                        const listElement = this.querySelector("#devices-list-container");
                        listElement.innerHTML = "<center><ion-text>" +  window.Translation.get("DevicesScanFound") + "</ion-text></center>";
                        listElement.innerHTML += scanData.data.devices.map(device => `
                            <ion-card data-id="${device.deviceID}" color="primary">
                                <ion-card-header>
                                    <ion-card-title>${device.productName}</ion-card-title>
                                    <ion-card-subtitle>${device.vendorName}</ion-card-subtitle>
                                </ion-card-header>
                                <ion-card-content>
                                    ${device.deviceID}
                                </ion-card-content>
                                <ion-button data-id="${device.deviceID}" id="connect-${device.deviceID}" class="action-connect-option"><ion-icon slot="start" name="swap-horizontal-sharp" color="warning"></ion-icon><ion-text color="light">${window.Translation.get("Connect")}</ion-text></ion-button>
                            </ion-card>
                        `).join("");
                    }
                }
                else {
                    toastShow("Error: " + scanData.error, "danger");
                }
            }
        }, window.appConfig.CONF_scanRefreshInterval);

        setTimeout(() => {
            clearInterval(interval);
            const spinner = this.querySelector("ion-spinner");
            spinner.remove();
            this.scanning = false;
            const listElement = this.querySelector("#devices-list-container");
            if (listElement.innerHTML === "") {
                listElement.innerHTML = "<center><ion-text>" +  window.Translation.get("DevicesScanNoDevicesFound") + "</ion-text></center><br />";
            }
            else {
                listElement.innerHTML += "<center><ion-text>" +  window.Translation.get("DevicesScanFinished") + "</ion-text></center><br />"; 
            }
            listElement.innerHTML += "<center><ion-button expand='block' href='/devices'>"+ window.Translation.get("PageDevicesGoToDevices") +"</ion-button></center>";
        }, (window.appConfig.CONF_scanDuration) * 1000);
      }
      else {
        toastShow("Error: " + data.error, "danger");
      }
    }

    async addAndConnectDevice(deviceID) {
        const data = await apiPOST("/devices/bluetooth/" + deviceID + "/connect", {"addDeviceToServer" : true});
        console.log("API call - Output:", data);
        if (data.status === "ok") {
            toastShow(window.Translation.get("DeviceAddedAndConnected"), "success");

            const button = this.querySelector(`#connect-${deviceID}`); // remove connect button
            if (button) {
                button.remove();
            }

            const card = this.querySelector("ion-card[data-id=" + deviceID + "]"); // add badge to card title
            if (card) {
                const titleElement = card.querySelector("ion-card-title");
                if (titleElement) {
                    titleElement.innerHTML += ` <ion-badge color="success">${window.Translation.get("Connected")}</ion-badge>`;
                }
            }
        }
        else {
            toastShow("Error: " + data.error, "danger");
        }
    }
}

customElements.define("page-devices-add-bluetooth", DevicesAddBluetooth);