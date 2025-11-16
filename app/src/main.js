/**
 * Determine if the app is running in Capacitor
 */
const isCapacitor = location.protocol === "capacitor:" || (window.Capacitor && window.Capacitor.platform !== "web");

/**
 * Load Ionic
 */
if (isCapacitor) {   // In Capacitor, import Ionic directly from copied dist files
  import(/* @vite-ignore */ location.origin + "/ionic.esm.js");
}
else { // In the browser, use the normal loader
  import("@ionic/core/loader").then((m) => m.defineCustomElements(window));
}
window.isCapacitor = isCapacitor;

/**
 * Core CSS required for Ionic components to work properly
 */
import "@ionic/core/css/core.css";

/**
 * Basic CSS for apps built with Ionic
 */
import "@ionic/core/css/normalize.css";
import "@ionic/core/css/structure.css";
import "@ionic/core/css/typography.css";

/**
 * Optional CSS utils that can be commented out
 */
import "@ionic/core/css/padding.css";
import "@ionic/core/css/float-elements.css";
import "@ionic/core/css/text-alignment.css";
import "@ionic/core/css/text-transformation.css";
import "@ionic/core/css/flex-utils.css";
import "@ionic/core/css/display.css";

/**
 * Theme variables
 */
import "./theme/variables.css";

/**
 * Additional controllers
 */
import { toastController } from '@ionic/core';
window.toastController = toastController;

/**
 * Load translations and initialize global translations object
 */
await fetch("./src/assets/i18n/de.json")
  .then(res => res.json())
  .then(translations => {
    console.log("Loading Translations JSON:");
    window.appTranslations = translations;
    console.log(window.appTranslations);
 });
import { Translation  } from "./services/translations.js";
window.Translation = Translation;
window.Ionic.config.backButtonText = window.Translation.get("Back"); // Set back button text globally

/**
 * Load config
 */
await fetch("./src/config.json")
  .then(res => res.json())
  .then(config => {
    console.log("Loading config.json:");
    window.appConfig = config;
    console.log(window.appConfig);
 });