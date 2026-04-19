/**
 * =============================================================================================
 * Healthcheck Dashboard — i18n Translation Module
 * ================================================
 *
 * Translations are stored separately in i18n.json (same folder as this file).
 * The JSON format uses one entry per key, with a sub-object per language code:
 *
 *   {
 *     "Overview": { "en": "Overview", "de": "Übersicht" },
 *     ...
 *   }
 *
 * Usage:
 *   - Include this script before dashboard.js
 *   - Call await i18n.load() once during initialisation before using any other function
 *   - Call i18n.applyToDOM() to translate all [data-i18n="Key"] elements
 *   - Call i18n.t("Key") to get a translated string in JavaScript
 *   - Call i18n.setLanguage("de") or i18n.setLanguage("en") to switch languages
 *
 * Language preference is stored in localStorage under the key "healthcheck_language".
 * The default language is "en" (English).
 */

const i18n = (function () {

    /**
     * @type {Object} translations
     * Translations indexed by language code, then by key.
     * Populated at runtime by load() — empty until then.
     * Example after loading: { en: { "Overview": "Overview" }, de: { "Overview": "Übersicht" } }
     */
    let translations = {};

    /**
     * @type {string} currentLanguage - The currently active language code ("en" or "de").
     * Loaded from localStorage on module initialisation; defaults to "en".
     */
    let currentLanguage = localStorage.getItem("healthcheck_language") || "de";

    // Make sure we only use a supported language code
    if (currentLanguage !== "en" && currentLanguage !== "de") {
        currentLanguage = "de";
    }

    /**
     * Fetches i18n.json from the same directory and transforms it into the internal
     * lookup structure. Must be called once during dashboard initialisation before
     * t() or applyToDOM() are used.
     *
     * Input format (i18n.json):
     *   { "key": { "en": "...", "de": "..." }, ... }
     *
     * Internal format after loading:
     *   { en: { "key": "..." }, de: { "key": "..." } }
     *
     * @async
     * @function load
     * @returns {Promise<void>}
     */
    async function load() {
        try {
            const response = await fetch("assets/i18n/i18n.json");
            const raw      = await response.json();

            // Reset and rebuild the internal structure
            translations = {};

            for (const [key, langMap] of Object.entries(raw)) {
                for (const [lang, text] of Object.entries(langMap)) {
                    if (!translations[lang]) {
                        translations[lang] = {};
                    }
                    translations[lang][key] = text;
                }
            }
        }
        catch (error) {
            console.error("i18n.load() failed — translations will be unavailable:", error);
        }
    }

    /**
     * Returns the translated string for the given key in the currently active language.
     * If the key is not found, English is tried as a fallback. If that also fails, the
     * key name itself is returned so the UI always shows something readable.
     * @function t
     * @param {string} key - The i18n translation key (e.g. "Dashboard", "Open").
     * @returns {string} The translated string, or the key itself as a fallback.
     */
    function t(key) {
        const langTable = translations[currentLanguage];
        if (langTable && langTable[key] !== undefined) {
            return langTable[key];
        }
        // Fall back to English if the key is missing in the active language
        if (translations["en"] && translations["en"][key] !== undefined) {
            return translations["en"][key];
        }
        return key; // Last resort: return the key name unchanged
    }

    /**
     * Walks the entire DOM and sets the textContent of every element that carries a
     * [data-i18n] attribute to the translated value of that attribute.
     * Called once on page load and again whenever the language is switched.
     * @function applyToDOM
     * @returns {void}
     */
    function applyToDOM() {
        const elements = document.querySelectorAll("[data-i18n]");
        elements.forEach(function (element) {
            const key = element.getAttribute("data-i18n");
            element.textContent = t(key);
        });
    }

    /**
     * Switches the active language, persists the choice to localStorage so it
     * survives page reloads, and immediately re-applies all translations to the DOM.
     * @function setLanguage
     * @param {string} lang - The language code to switch to ("en" or "de").
     * @returns {void}
     */
    function setLanguage(lang) {
        if (lang !== "en" && lang !== "de") {
            return; // Ignore unsupported language codes
        }
        currentLanguage = lang;
        localStorage.setItem("healthcheck_language", lang);
        applyToDOM();
    }

    /**
     * Returns the currently active language code.
     * @function getLanguage
     * @returns {string} The active language code ("en" or "de").
     */
    function getLanguage() {
        return currentLanguage;
    }

    // Expose the public API of the i18n module
    return { load, t, applyToDOM, setLanguage, getLanguage };

})();
