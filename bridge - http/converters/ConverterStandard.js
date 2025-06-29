/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
 */

/**
 * ConverterStandard class provides basic functionality for converting properties of HTTP devices.
 * @class ConverterStandard
 * @description This class is designed to handle standard HTTP properties, such as device name, and provides a framework for extending functionality for specific devices by subclassing.
 */
class ConverterStandard {
    constructor() { 
        this.properties = {};            
    }

    /**
     * Retrieves a property by its name.
     * @param {string} name - The name of the property to retrieve.
     * @return {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns the property object; otherwise, it returns undefined.
     */
    getPropertyByName(name) {
        for (const property of Object.values(this.properties)) {
            if (property.name === name) {
                return property;
            }
        }
        return undefined;
    }
}

module.exports = { ConverterStandard };