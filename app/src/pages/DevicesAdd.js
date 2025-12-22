/**
 * Device add page
 */

class DevicesAdd extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
        <ion-header>
            <ion-toolbar color="primary">
            <ion-buttons slot="start">
                <ion-back-button default-href="/devices"></ion-back-button>
            </ion-buttons>
                <ion-title>${window.Translation.get("PageDevicesAddHeadline")}</ion-title>
            </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding background-1">
            <ion-grid>
                <ion-row>
                    <ion-col size="6"><ion-button expand="block" class="selection" href="/devices-add/zigbee"><div><div><ion-icon slot="start" name="icon-zigbee" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("Zigbee")}</ion-text></div></div></div></ion-button></ion-col>
                    <ion-col size="6"><ion-button expand="block" class="selection" href="/devices-add/bluetooth"><div><div><ion-icon slot="start" name="icon-bluetooth" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("Bluetooth")}</ion-text></div></div></div></ion-button></ion-col>
                </ion-row>
                <ion-row>
                    <ion-col size="6"><ion-button expand="block" class="selection" href="/devices-add/lora"><div><div><ion-icon slot="start" name="icon-lora" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("LoRa")}</ion-text></div></div></div></ion-button></ion-col>
                    <ion-col size="6"><ion-button expand="block" class="selection" href="/devices-add/http"><div><div><ion-icon slot="start" name="icon-http" size="large"></ion-icon></div><div><ion-text>${window.Translation.get("Wifi")}</ion-text></div></div></div></ion-button></ion-col>
                </ion-row>
            </ion-grid>
        </ion-content>
    `;
  }
}

customElements.define("page-devices-add", DevicesAdd);