/**
 * SOS Page
 */
class SOS extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar>
          <ion-title>SOS</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        SOS
      </ion-content>
    `;
  }
}

customElements.define("page-sos", SOS);