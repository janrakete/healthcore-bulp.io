/**
 * Determine if the app is running in Capacitor
 */
const isCapacitor = location.protocol === "capacitor:" || (window.Capacitor && window.Capacitor.platform !== "web");

/**
 * Load Ionic
 */
if (isCapacitor) {
  // In Capacitor, import Ionic directly from copied dist files
  import(/* @vite-ignore */ location.origin + "/ionic.esm.js");
} else {
  // In the browser, use the normal loader
  import("@ionic/core/loader").then((m) => m.defineCustomElements(window));
}

/**
 * Icon imports
 */
import { addIcons } from "ionicons";

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