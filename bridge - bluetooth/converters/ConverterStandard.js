/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
 */

/**
 * ConverterStandard class provides basic functionality for converting properties of Bluetooth devices that follow the standard UUIDs.
 * It includes methods to retrieve properties by UUID or name, and to convert values for standard properties.   
 * @class ConverterStandard
 * @description This class is designed to handle standard Bluetooth properties, such as device name, and provides a framework for extending functionality for specific devices by subclassing.
 */
class ConverterStandard {
    constructor() { 
        this.properties = {};

        // Standard UUID: 0200 - 2a00 - Device Name
        this.properties["2a00"] = {
            name:       "device_name",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "String"
        };        
    }

    /**
     * Retrieves a property by its UUID.
     * @param {string} uuid - The UUID of the property to retrieve.
     * @return {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method checks if the property exists in the `properties` object and returns it. If the property does not exist, it returns undefined.
     */
    getPropertyByUUID(uuid) {   
        if (this.properties[uuid] === undefined) {
            return undefined;
        }   
        else {
            return this.properties[uuid];
        }
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
     * Converts a value for a standard property.
     * @param {Object} property - The property object containing metadata about the property.
     * @param {any} value - The value to convert.
     * @return {any|undefined} - The converted value if the property is readable, otherwise undefined.
     * @description This method checks if the property is readable. If it is, it converts the value based on the property's name. For the "device_name" property, it converts the value from a Buffer to a string. If the property is not readable or does not match any known properties, it returns undefined.
     */  
    getConvertedValueForPropertyStandard(property, value) {  
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.name === "device_name") {
                const buf = Buffer.from(value);
                return buf.toString();
            }
            else {
                return undefined;
            }
        }
    }
}

module.exports = { ConverterStandard };