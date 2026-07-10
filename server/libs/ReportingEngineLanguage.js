/**
 * =============================================================================================
 * Reporting Language Utilities
 * ============================
 */
const appConfig = require("../../config");

const reportLanguageNames = {
    en: "English",
    de: "German"
};

const reportNoData = {
    en: "No relevant data is available for the selected period.",
    de: "Keine relevanten Daten fuer den gewaehlten Zeitraum vorhanden."
};

/**
 * Normalizes and validates report language codes.
 * @param {string} value
 * @returns {string}
 */
function reportLanguageNormalize(value) {
    const normalizedLanguage = String(value || appConfig.CONF_reportingLanguage).trim().toLowerCase();

    if (appConfig.CONF_reportingLanguageSupported.includes(normalizedLanguage)) {
        return (normalizedLanguage);
    }
    else {
        return (appConfig.CONF_reportingLanguage);
    }
}

/**
 * Returns human-readable language names for prompt instructions.
 * @param {string} language
 * @returns {string}
 */
function reportLanguageNameGet(language) {
    return reportLanguageNames[reportLanguageNormalize(language)] || reportLanguageNames.en;
}

/**
 * Returns language-specific fallback text when no data exists.
 * @param {string} language
 * @returns {string}
 */
function reportNoDataSummaryGet(language) {
    const normalized = reportLanguageNormalize(language);
    return reportNoData[normalized] || reportNoData.en;
}

module.exports = { reportLanguageNormalize, reportLanguageNameGet, reportNoDataSummaryGet };
