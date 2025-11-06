/**
 * Start page
 */
class Start extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-title>Willkommen!</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-grid>
          <ion-row>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="heart"></ion-icon> Meldungen</ion-button></ion-col>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="heart"></ion-icon> Personen</ion-button></ion-col>
          </ion-row>
          <ion-row>
              <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="heart"></ion-icon> Räume</ion-button></ion-col>
              <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="heart"></ion-icon> Geräte</ion-button></ion-col>
          </ion-row>
          <ion-row>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="heart"></ion-icon> Szenarien</ion-button></ion-col>
            <ion-col><ion-button expand="block" shape="round"><ion-icon slot="start" name="heart"></ion-icon> Einstellungen</ion-button></ion-col>
          </ion-row>
        </ion-grid>
      </ion-content>
    `;
  }
}

customElements.define("page-start", Start);