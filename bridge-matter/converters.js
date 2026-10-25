/**
 * =============================================================================================
 * Converters list class
 * =====================
 */

const fs                    = require("fs");
const path                  = require("path");
const common                = require("../common.js");
const { ConverterStandard } = require("./converters/ConverterStandard.js");

/**
 * Converters class manages a collection of device converters.
 * It allows finding a specific converter by product name and instantiating it.
 * @class Converters
 */
class Converters {
    constructor() {
        this.converterMap = new Map();
        this.loadConverters();
    }

    /**
     * Dynamically loads all converter classes from the converters folder
     */    
    loadConverters() {
        const convertersDir = path.join(__dirname, "converters");

        try {
            const files = fs.readdirSync(convertersDir);
            files.forEach(file => {
                if (!file.endsWith(".js") || file === "ConverterStandard.js") {
                    return;
                }

                const converterModule = require(path.join(convertersDir, file));
                const className = Object.keys(converterModule)[0];
                const ConverterClass = converterModule[className];
                if (typeof ConverterClass !== "function") {
                    return;
                }

                if (ConverterClass.productName) {
                    this.converterMap.set(ConverterClass.productName, ConverterClass);
                    common.conLog("Converter: Loaded converter: " + className, "gre");
                }
                else {
                    common.conLog("Converter: Failed loading converter (no product name given): " + className, "red");
                }
            });
        }
        catch (error) {
            common.conLog("Converter: Error loading converters:", "red");
            common.conLog(error, "std", false);
        }
    }

    /**
     * Finds a converter by product name and returns an instance of it.
     * @param {string} productName - The name of the product to find the converter for.
     * @returns {ConverterStandard|undefined} An instance of the converter if found, otherwise undefined.
     */    
    find(productName) {
        if (productName === ConverterStandard.productName) {
            return new ConverterStandard();
        }

        const ConverterClass = this.converterMap.get(productName);
        return ConverterClass ? new ConverterClass() : undefined;
    }
    /**
     * Finds a converter that supports the given node and returns an instance of it.
     * @param {object} node - The node to find the converter for.
     * @returns {ConverterStandard|undefined} An instance of the converter if found, otherwise the standard converter.
     */
    findForNode(node) {
        for (const ConverterClass of this.converterMap.values()) {
            if (typeof ConverterClass.supportsNode === "function" && ConverterClass.supportsNode(node)) {
                return new ConverterClass();
            }
        }

        return new ConverterStandard();
    }
}

module.exports = { ConverterStandard, Converters };