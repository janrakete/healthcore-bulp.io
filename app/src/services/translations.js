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
        return window.appTranslations[key] || "#" + key;
  }
}