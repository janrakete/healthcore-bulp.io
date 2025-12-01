/**
 * Device add page - ZigBee
 */

import { apiGET, apiDELETE, apiPOST } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class DevicesAddZigBee extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <ion-header>
                <ion-toolbar color="primary">
                    <ion-title>${window.Translation.get("PageDevicesAddHeadline")}</ion-title>
                </ion-toolbar>
            </ion-header>
            <ion-content class="ion-padding">
                <center><ion-spinner name="dots" color="warning"></ion-spinner></center>
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
          
            if (scanData.status === "ok") {
                console.log(scanData);
            }
            else {
                toastShow("Error: " + scanData.error, "danger");
            }
        }, 2000);

        setTimeout(() => { // stop polling after scan duration
            clearInterval(interval);
            const spinner = this.querySelector("ion-spinner"); // Remove spinner
            spinner.remove();
        }, (window.appConfig.CONF_scanDuration) * 1000);
      }
      else {
        toastShow("Error: " + data.error, "danger");
      }
    }
}

customElements.define("page-devices-add-zigbee", DevicesAddZigBee);