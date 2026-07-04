/**
 * =============================================================================================
 * Understanding Engine - Analyzes and interprets complex data via AI algorithms.
 * ==============================================================================
 */

const appConfig = require("../../config");
const common    = require("../../common");

const llama     = require("node-llama-cpp");

class UnderstandingEngine {
    constructor() {
        this.model = null;
    }

    /**
     * Initializes the Understanding Engine with the specified model.
     * @param {string} modelPath - Path to the AI model file.
     */
    async initialize(modelPath) {
        if (!modelPath) {
            throw new Error("Model path is required for initialization.");
        }
        
        try {
            this.model = await llama.loadModel(modelPath);
            common.conLog("Understanding Engine initialized with model: " + modelPath, "grn");
        } catch (error) {
            common.conLog("Failed to initialize Understanding Engine: " + error.message, "red");
            throw error;
        }
    }

    /**
     * Analyzes the provided data and returns insights.
     * @param {string} data - The data to analyze.
     * @returns {Promise<string>} - Insights derived from the analysis.
     */
    async analyze(data) {
        if (!this.model) {
            throw new Error("Understanding Engine is not initialized. Call initialize() first.");
        }

        try {
            const insights = await this.model.analyze(data);
            return insights;
        } catch (error) {
            common.conLog("Analysis failed: " + error.message, "red");
            throw error;
        }
    }
}

module.exports = UnderstandingEngine;
