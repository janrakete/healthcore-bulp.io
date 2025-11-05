class HomePage extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar>
          <ion-title>Blank</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <div id="container">
          <strong>Ready to create an app?</strong>
          <p>
            Start with Ionic
            <a target="_blank" rel="noopener noreferrer" href="https://ionicframework.com/docs/components">UI Components</a>
          </p>
        </div>
        <ion-button color="primary">Navigate</ion-button>
                <ion-icon name="heart"></ion-icon>
        <ion-icon name="logo-ionic"></ion-icon>






        </ion-content>
    `;
  }
}

customElements.define("home-page", HomePage);