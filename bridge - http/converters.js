/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
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

/**
 * Converter for the Bulp Web-Robo 321 device
 */
class ConverterBulpWebRobo321 extends ConverterStandard {
    constructor() {
        super();

        this.properties[0] = {
            name:       "voltage",
            read:       true,
            anyValue:   0,
            valueType:  "Integer"
        };

        this.properties[1] = {
            name:       "switch",
            read:       true,
            anyValue:   ["tapped", "not_tapped", "long_tapped"],
            valueType:  "Options"
        };
    }

    /**
     * Converts a value for a specific property.
     * @param {string} propertyName - The name of the property to convert the value for.
     * @param {any} value - The value to convert.
     * @return {any} - The converted value based on the property's type and read status.
     * @description This method checks if the property is readable. If it is, it converts the value based on the property's name. For the "voltage" property, it multiplies the value by 100. For the "switch" property, it converts numeric values to string representations of their states. If the property is not readable or does not match any known properties, it returns undefined.
     */
    getConvertedValueForProperty(propertyName, value) {
        const property = this.getPropertyByName(propertyName);

        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.name === "voltage") {
                return (value * 100);
            }
            else if (property.name === "switch") {
                if (value === 1) {
                    return "tapped";
                }
                else if (value === 2) {
                    return "long_tapped";
                }
                else {
                    return "not_tapped";
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
 * @description This class is designed to manage different converters for various HTTP devices. Each converter is responsible for handling the specific properties and behaviors of a device.
 */
class Converters {
    constructor() {
        this.converterMap = new Map();
        this.converterMap.set("Bulp Web-Robo 321", ConverterBulpWebRobo321);
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