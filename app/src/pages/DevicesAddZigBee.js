/**
 * Device add page - ZigBee
 */

import { apiGET, apiDELETE, apiPOST } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class DevicesAddZigBee extends HTMLElement {

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
        this.scanDevices();
    }

    async scanDevices() {
      const data = await apiPOST("/devices/zigbee/scan", {"duration" : window.appConfig.CONF_scanDuration});
      console.log("API call - Output:", data);

      if (data.status === "ok") {
        toastShow(window.Translation.get("ScanStarted"), "success");

        const interval = setInterval(async () => {
            const scanData = await apiGET("/devices/zigbee/scan/info?callID=" + data.data.callID);
            if (this.scanning === true) {
                if (scanData.status === "ok") {
                    if ((scanData.data.devices) && (scanData.data.devices.length !== 0)) {
                        const listElement = this.querySelector("#devices-list-container");
                        listElement.innerHTML = "<center><ion-text color='light'>" +  window.Translation.get("DevicesScanFoundAndAdded") + "</ion-text></center>";
                        listElement.innerHTML += scanData.data.devices.map(device => `
                            <ion-card  color="primary">
                                <ion-card-header>
                                    <ion-card-title>${device.productName}</ion-card-title>
                                    <ion-card-subtitle>${device.vendorName}</ion-card-subtitle>
                                </ion-card-header>
                                <ion-card-content>
                                    ${device.deviceID}
                                </ion-card-content>
                            </ion-card>
                        `).join("");
                    }
                }
            }
            else {
                toastShow("Error: " + scanData.error, "danger");
            }
        }, 2000);

        setTimeout(() => { // stop polling after scan duration
            clearInterval(interval);
            const spinner = this.querySelector("ion-spinner"); // Remove spinner
            spinner.remove();
            this.scanning = false;
            const listElement = this.querySelector("#devices-list-container");
            if (listElement.innerHTML === "") {
                listElement.innerHTML = "<center><ion-text color='light'>" +  window.Translation.get("DevicesScanNoDevicesFound") + "</ion-text></center><br />";
            }
            else {
                listElement.innerHTML += "<center><ion-text color='light'>" +  window.Translation.get("DevicesScanFinished") + "</ion-text></center><br />"; 
            }
            listElement.innerHTML += "<center><ion-button expand='block' href='/devices'>"+ window.Translation.get("PageDevicesGoToDevices") +"</ion-button></center>";
        }, (window.appConfig.CONF_scanDuration) * 1000);
      }
      else {
        toastShow("Error: " + data.error, "danger");
      }
    }
}

customElements.define("page-devices-add-zigbee", DevicesAddZigBee);