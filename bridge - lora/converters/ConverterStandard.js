/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
 */

/**
 * ConverterStandard class provides basic functionality for converting properties of LoRa devices.
 * @class ConverterStandard
 */
class ConverterStandard {
    constructor() { 
        this.properties = {};            
    }

    /**
     * Retrieves a property by its name.
     * @param {string} name - The name of the property to retrieve.
     * @return {Object|undefined} - The property object if found, otherwise undefined.
     */
    getPropertyByName(name) {
        for (const property of Object.values(this.properties)) {
            if (String(property.name) === String(name)) {
                return property;
            }
        }
        return undefined;
    }
}

module.exports = { ConverterStandard };