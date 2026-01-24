/**
 * Settings page
 */

class Settings extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
        <ion-header>
            <ion-toolbar color="primary">
                <ion-buttons slot="start">
                    <ion-back-button default-href="/"></ion-back-button>
                </ion-buttons>
                <ion-title>${window.Translation.get("PageSettingsHeadline")}</ion-title>
            </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding background-1">
            <ion-grid>
                <ion-row>
                    <ion-col size="6"><ion-button class="selection" expand="block" href="/individuals"><div><div><ion-icon slot="start" name="person-sharp" size="large" color="primary"></ion-icon></div><div><ion-text>${window.Translation.get("IndividualsTitle")}</ion-text></div></div></ion-button></ion-col>
                    <ion-col size="6"><ion-button class="selection" expand="block" href="/rooms"><div><div><ion-icon slot="start" name="scan-sharp" size="large" color="primary"></ion-icon></div><div><ion-text>${window.Translation.get("RoomsTitle")}</ion-text></div></div></ion-button></ion-col>
                </ion-row>
                <ion-row>
                    <ion-col size="6"><ion-button class="selection" expand="block" href="/devices"><div><div><ion-icon slot="start" name="radio-sharp" size="large" color="primary"></ion-icon></div><div><ion-text>${window.Translation.get("DevicesTitle")}</ion-text></div></div></ion-button></ion-col>
                    <ion-col size="6"><ion-button class="selection" expand="block" href="/scenarios"><div><div><ion-icon slot="start" name="unlink-sharp" size="large" color="primary"></ion-icon></div><div><ion-text>${window.Translation.get("ScenariosTitle")}</ion-text></div></div></ion-button></ion-col>
                </ion-row>
            </ion-grid>
        </ion-content>
    `;
  }
}

customElements.define("page-settings", Settings);