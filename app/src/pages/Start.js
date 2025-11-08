/**
 * Start page
 */
class Start extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-title>Übersicht</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">

        <ion-grid>
          <ion-row>
            <ion-col>
              <ion-img src="./src/assets/customer_logo_background.jpg"></ion-img>
            </ion-col>
          </ion-row>
        </ion-grid>

        <ion-grid>
          <ion-row>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="notifications-sharp" size="large"></ion-icon> Meldungen</ion-button></ion-col>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="person-sharp" size="large"></ion-icon> Personen</ion-button></ion-col>
          </ion-row>
          <ion-row>
              <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="scan-sharp" size="large"></ion-icon> Räume</ion-button></ion-col>
              <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="radio-sharp" size="large"></ion-icon> Geräte</ion-button></ion-col>
          </ion-row>
          <ion-row>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="unlink-sharp" size="large"></ion-icon> Szenarien</ion-button></ion-col>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="build-sharp" size="large"></ion-icon> Einstellungen</ion-button></ion-col>
          </ion-row>
        </ion-grid>
      </ion-content>
    `;
  }
}

customElements.define("page-start", Start);