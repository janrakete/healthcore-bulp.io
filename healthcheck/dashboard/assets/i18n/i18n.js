/**
 * =============================================================================================
 * Healthcheck Dashboard — i18n Translation Module
 * ================================================
 */

const i18n = (function () {

    let translations = {};
    let currentLanguage = localStorage.getItem("healthcheck_language") || "de";

    if (currentLanguage !== "en" && currentLanguage !== "de") { // Make sure we only use a supported language code
        currentLanguage = "de";
    }

    /**
     * Fetches i18n.json from the same directory, parses it, and builds an internal structure for fast lookups. Called once on page load.
     * @async
     * @function load
     * @returns {Promise<void>}
     */
    async function load() {
        try {
            const response = await fetch("assets/i18n/i18n.json");
            const raw      = await response.json();
            
            translations = {}; // Reset and rebuild the internal structure

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
     * Returns the translated string for the given key in the currently active language. If the key is missing in the active language, falls back to English. If it's missing in English too, returns the key itself.
     * @function t
     * @param {string} key - The i18n translation key (e.g. "Dashboard", "Open").
     * @returns {string} The translated string, or the key itself as a fallback.
     */
    function t(key) {
        const langTable = translations[currentLanguage];
        if (langTable && langTable[key] !== undefined) {
            return langTable[key];
        }
        
        if (translations["en"] && translations["en"][key] !== undefined) { // Fall back to English if the key is missing in the active language
            return translations["en"][key];
        }
        return key; // Last resort: return the key name unchanged
    }

    /**
     * Walks the entire DOM and sets the textContent of every element that carries a [data-i18n] attribute to the translated value of that attribute. Called once on page load and again whenever the language is switched.
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
     * Switches the active language, persists the choice to localStorage so it survives page reloads, and immediately re-applies all translations to the DOM.
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
    
    return { load, t, applyToDOM, setLanguage, getLanguage }; 
})();
