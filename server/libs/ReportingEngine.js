/**
 * =============================================================================================
 * Reporting Engine - Generates structured care reports from deterministic facts
 * =============================================================================
 */

const appConfig = require("../../config");
const common    = require("../../common");

const { reportLanguageNormalize, reportLanguageNameGet } = require("./ReportingEngineLanguage");

class ReportingEngine {
    constructor() {
        this.llama              = null;
        this.model              = null;
        this.modelPath          = null;
        this.LlamaChatSession   = null;
    }

    /**
     * Initializes the Reporting Engine with the specified model.
     * @param {string} modelPath - Path to the AI model file.
     */
    async initialize(modelPath) {
        const resolvedModelPath = "./libs/ReportingEngine-models/" + modelPath;

        if (!resolvedModelPath) {
            throw new Error("Model path is required for initialization.");
        }

        try {
            const llamaModule   = await import("node-llama-cpp");
            const getLlama      = llamaModule.getLlama;

            this.llama              = await getLlama();
            this.model              = await this.llama.loadModel({ modelPath: resolvedModelPath });
            this.LlamaChatSession   = llamaModule.LlamaChatSession;
            this.modelPath          = resolvedModelPath;
            common.conLog("Reporting: Engine initialized with model: " + resolvedModelPath, "gre");
        }
        catch (error) {
            common.conLog("Failed to initialize Reporting Engine: " + error.message, "red");
            throw error;
        }
    }

    /**
     * Generates a report from deterministic facts.
     * @param {Object} facts
     * @param {Object} [options]
     * @returns {Promise<string>}
     */
    async generateReport(facts, options = {}) {
        if (!this.model) {
            throw new Error("Reporting Engine is not initialized. Call initialize() first.");
        }

        if (!this.LlamaChatSession) {
            throw new Error("Reporting Engine chat session is not available. Call initialize() first.");
        }

        try {
            const context   = await this.model.createContext();
            const session   = new this.LlamaChatSession({ contextSequence: context.getSequence() });
            const language  = reportLanguageNormalize(options.language || appConfig.CONF_reportingLanguage);
            const prompt    = this.buildReportPrompt(facts || {}, language);
            const report    = await session.prompt(prompt, { temperature: appConfig.CONF_reportingEngineTemperature, maxTokens: appConfig.CONF_reportingEngineMaxTokens });
            return String(report || "").trim();
        }
        catch (error) {
            common.conLog("Reporting generation failed: " + error.message, "red");
            throw error;
        }
    }

    /**
    * Builds the prompt for report generation.
     * @param {Object} facts
     * @param {string} language
     * @returns {string}
     */
    buildReportPrompt(facts, language) {
        const promptLanguageName = reportLanguageNameGet(language);

        return [
            "You are a nursing assistant AI. Create a factual, concise care report for the selected period.",
            "Output language must be: " + promptLanguageName + " (code: " + language + ").",
            "Use only the provided facts. Do not invent values and do not provide diagnoses.",
            "Structure: 1) Brief overview, 2) Observed activity, 3) Notable findings, 4) Suggested observation for the next period.",
            "If data is sparse, say this clearly.",
            "Facts (JSON):",
            JSON.stringify(facts)
        ].join("\n");
    }

    /**
     * Returns active model path for metadata storage.
     * @returns {string|null}
     */
    getModelPath() {
        return this.modelPath;
    }
}

module.exports = ReportingEngine;
