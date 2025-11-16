/**
 * SOS Edit Page
 */

class SOSEdit extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
    <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button onclick="cancel()">${window.Translation.get("Cancel")}</ion-button>
          </ion-buttons>
          <ion-title>${window.Translation.get("Edit")}</ion-title>
          <ion-buttons slot="end">
            <ion-button onclick="confirm()" strong="true">${window.Translation.get("Confirm")}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding">

      <ion-item>
        <ion-input label="${window.Translation.get("XXX")}" label-placement="stacked" type="text" placeholder="Your name"></ion-input>
      </ion-item>      
      </ion-content>
    `;
    this.setUpModal();
  }

  setUpModal() {
    var modal = document.querySelector("ion-modal");

    window.cancel = function() {
      modal.dismiss(null, "cancel");
    };    
  }
}

customElements.define("page-sos-edit", SOSEdit);