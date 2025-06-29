/*
 * =============================================================================================
 * Converters list class
 * =====================
*/

const fs                    = require("fs");
const path                  = require("path");
const common                = require("../common.js");
const { ConverterStandard } = require("./converters/ConverterStandard.js");

/**
 * Converters class manages a collection of device converters. It allows finding a specific converter by product name and instantiating it.
 * @class Converters
 * @description This class is designed to manage different converters for various devices. Each converter is responsible for handling the specific properties and behaviors of a device.
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
            
            files.forEach((file)=> {
                if (file.endsWith(".js") && file !== "ConverterStandard.js") {
                    const filePath          = path.join(convertersDir, file);
                    const converterModule   = require(filePath);
                    
                    // Get the first exported class from the module
                    const className         = Object.keys(converterModule)[0];
                    const ConverterClass    = converterModule[className];
                    
                    if (ConverterClass && typeof ConverterClass === "function") {
                        // Check if class has static productName property
                        if (ConverterClass.productName) {
                            this.converterMap.set(ConverterClass.productName, ConverterClass);
                            common.conLog("Converter: Loaded converter: " + className, "gre");
                        } else {
                            common.conLog("Converter: Failed loading converter (no product name given): " + className, "red");
                        }
                    }
                }
            });
        } catch (error) {
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
        const ConverterClass = this.converterMap.get(productName);
        if (!ConverterClass) {
            return undefined; 
        } else {
            return new ConverterClass();
        }
    }
}

module.exports = { ConverterStandard, Converters };