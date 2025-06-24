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

/** 
 * Converter for the Bulp AZ-123 device
 */
class ConverterBulpAZ123 extends ConverterStandard {
    constructor() {
        super();

        this.powerType = "wire";

        this.properties["19b10000e8f2537e4f6cd104768a1217"] = {
            name:        "rotary_switch",
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        this.properties["19b10000e8f2537e4f6cd104768a1219"] = {
            name:        "button",
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    ["pressed", "not_pressed"],
            valueType:   "Options"
        };

        this.properties["19b10000e8f2537e4f6cd104768a1218"] = {
            name:        "speaker",
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    ["on", "off"],
            valueType:   "Options"
        };

        this.properties["19b10000e8f2537e4f6cd104768a1216"] = {
            name:        "led",
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    ["on", "off"],
            valueType:   "Options"
        };
    }

    /**
     * Converts a value for a specific property.
     * @param {Object} property - The property object containing metadata about the property.
     * @param {any} value - The value to convert.
     * @return {any|undefined} - The converted value if the property is readable, otherwise undefined.
     * @description This method checks if the property is readable. If it is, it converts the value based on the property's name.
     */
    getConvertedValueForProperty(property, value) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) { // if standard property then use common converter
                return this.getConvertedValueForPropertyStandard(property, value);
            }
            else {
                if (property.name === "rotary_switch") {
                    const buf = Buffer.from(value);
                    return buf[0];
                }
                else if (property.name === "button") {
                    if (value[0] === 1) {
                        return "pressed";
                    }
                    else {
                        return "not_pressed";
                    }   
                }
                else if (property.name === "speaker") {
                    if (value[0] === 1) {
                        return "on";
                    }
                    else {
                        return "off";
                    }   
                }
                else if (property.name === "led") {
                    if (value[0] === 1) {
                        return "on";
                    }
                    else {
                        return "off";
                    }   
                }   
                else {
                    return undefined;
                }
            }
        }
    }

    /**
     * Converts a value for a specific property of the Bulp AZ-123 device to a format suitable for writing.
     * @param {Object} property - The property object containing metadata about the property.
     * @param {any} value - The value to convert.
     * @return {Buffer|undefined} - The converted value as a Buffer if the property is writable, otherwise undefined.
     * @description This method checks if the property is writable. If it is, it converts the value based on the property's name. 
     */
    setConvertedValueForProperty(property, value) {
        if (property.write === false) {
            return undefined;
        }
        else {
            if (property.name === "speaker") {
                if (property.anyValue.includes(value)) {
                    if (value === "on") {
                        return Buffer.from([1]);
                    }
                    else {
                        return Buffer.from([0]);
                    }
                }
                else {
                    return undefined;                    
                }
            }
            else if (property.name === "led") {
                if (property.anyValue.includes(value)) {
                    if (value === "on") {
                        return Buffer.from([1]);
                    }
                    else {
                        return Buffer.from([0]);
                    }                
                }
                else {
                    return undefined;                    
                }
            }
            else {
                return undefined;
            }     
        }       
     }
}

/* -> add more converters here */ 

/*
 * =============================================================================================
 * Converters list class
 * =====================
*/

/**
 * Converters class manages a collection of device converters. It allows finding a specific converter by product name and instantiating it.
 * @class Converters
 * @description This class is designed to manage different converters for various Bluetooth devices. Each converter is responsible for handling the specific properties and behaviors of a device.
 */
class Converters {
    constructor() {
        this.converterMap = new Map();
        this.converterMap.set("bulp-AZ-123", ConverterBulpAZ123);
        /* -> add more converters here */ 
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

module.exports = { Converters };
