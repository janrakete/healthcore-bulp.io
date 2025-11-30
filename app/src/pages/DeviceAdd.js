/**
 * Device add page
 */

class DeviceAdd extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
        <ion-header>
            <ion-toolbar color="primary">
                <ion-title>${window.Translation.get("PageDevicesAddHeadline")}</ion-title>
            </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
            <ion-grid>
                <ion-row>
                    <ion-col size="6"><ion-button expand="block" href="/devices/add/zigbee"><div><div><ion-img src="./assets/icons/bridges/logo_zigbee.svg"></ion-img></div><div><ion-text>${window.Translation.get("Zigbee")}</ion-text></div></div></ion-button></ion-col>
                    <ion-col size="6"><ion-button expand="block" href="/devices/add/bluetooth"><div><div><ion-img src="./assets/icons/bridges/logo_ble.svg"></ion-img></div><div><ion-text>${window.Translation.get("Bluetooth")}</ion-text></div></div></ion-button></ion-col>
                </ion-row>
                <ion-row>
                    <ion-col size="6"><ion-button expand="block" href="/devices/add/lora"><div><div><ion-img src="./assets/icons/bridges/logo_lora.svg"></ion-img></div><div><ion-text>${window.Translation.get("LoRa")}</ion-text></div></div></ion-button></ion-col>
                    <ion-col size="6"><ion-button expand="block" href="/devices/add/http"><div><div><ion-img src="./assets/icons/bridges/logo_wifi.svg"></ion-img></div><div><ion-text>${window.Translation.get("Wifi")}</ion-text></div></div></ion-button></ion-col>
                </ion-row>
            </ion-grid>
        </ion-content>
    `;
  }
}

customElements.define("page-device-add", DeviceAdd);