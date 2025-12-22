/**
 * Device add page - HTTP
 */

class DevicesAddHTTP extends HTMLElement {
    constructor() {
        super();
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
                <center><ion-text>${window.Translation.get("DevicesWithNoScanHelp")}</ion-text></center><br />
                <center><ion-button expand="block" href="/device-edit/http/0">${window.Translation.get("DevicesAddManually")}</ion-button></center>
            </ion-content>
        `;
    }
}

customElements.define("page-devices-add-http", DevicesAddHTTP);