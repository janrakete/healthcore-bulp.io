/**
 * SOS Page
 */
import { apiGET } from "../services/api.js";
import { toastShow } from "../services/toast.js";

class SOS extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <ion-header>
        <ion-toolbar color="primary">
          <ion-title>SOS</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        SOS
      </ion-content>
    `;
    this.loadData();
  }

  async loadData() {
    try {
      const data = await apiGET("https://filesamples.com/samples/code/json/sample1.json");
      console.log("API call - Output:", data);
      toastShow("API call successful", "success");
    }
    catch (error) {
      console.error("API call - Error:", error);
      toastShow("API call failed", "error");
    }
  }  
}
customElements.define("page-sos", SOS);