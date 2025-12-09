/**
 * =============================================================================================
 * Translation service
 * ===================
 */

export class Translation {
    /**
     * Get a translation by key
     * @param {string} key - The translation key
     * @returns {string} - The translated string or the key if not found
     */
    static get(key) {
      let string = "";

      if (window.appTranslations[key] === undefined) {
        console.warn("Translation missing for key:", key);
        string = "#" + key;
      }
      else {
        string = window.appTranslations[key];
      }
      return string;
  }
}