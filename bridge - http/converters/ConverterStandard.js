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

    /**
     * Validates a value for a specific property before conversion.
     * @param {string} propertyName - The name of the property to validate.
     * @param {any} value - The value to validate.
     * @return {Object} - An object with `valid` (boolean) and `error` (string|null) fields.
     * @description Checks that the property exists, is readable, that the value is not null/undefined and that the value type matches the property's valueType (Numeric or Options).
     */
    validate(propertyName, value) {
        const property = this.getPropertyByName(propertyName);

        if (!property) {
            return { valid: false, error: "Unknown property: \"" + propertyName + "\"" };
        }

        if (property.read === false) {
            return { valid: false, error: "Property \"" + propertyName + "\" is not readable" };
        }

        if (value === undefined || value === null) {
            return { valid: false, error: "Value for property \"" + propertyName + "\" must not be empty" };
        }

        switch (property.valueType) {
            case "Numeric":
                if (typeof value !== "number" || isNaN(value)) {
                    return { valid: false, error: "Property \"" + propertyName + "\" expects a numeric value, got " + typeof value };
                }
                break;
            case "Options":
                if (typeof value !== "number" && typeof value !== "string") {
                    return { valid: false, error: "Property \"" + propertyName + "\" expects a numeric or string value, got " + typeof value };
                }
                break;
        }

        return { valid: true, error: null };
    }
}

module.exports = { ConverterStandard };