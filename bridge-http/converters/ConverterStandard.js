/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
 */

/**
 * ConverterStandard class provides basic functionality for converting properties of HTTP devices.
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

    /**
     * Validates a value for a specific property before conversion.
     * @param {string} propertyName - The name of the property to validate.
     * @param {any} value - The value to validate.
     * @return {Object} - An object with `valid` (boolean) and `error` (string|null) fields.
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