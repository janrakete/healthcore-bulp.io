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
 * Converter for the Bulp LoRa-Robo 666 device
 */
class ConverterBulpLoRaRobo666 extends ConverterStandard {
    constructor() {
        super();

        this.properties[0] = {
            name:       "heartrate",
            read:       true,
            anyValue:   0,
            valueType:  "Integer"
        };

        this.properties[1] = {
            name:       "color",
            read:       true,
            anyValue:   ["red", "green", "yellow"],
            valueType:  "Options"
        };
    }

    /**
     * Converts a value for a specific property.
     * @param {string} values - The string containing property values to convert.  
     * @return {Array} - An array of objects containing the converted property values.
     * @description This method processes a string of property values, splits it into individual property-value pairs, and converts them based on the defined properties. It returns an array of objects where each object contains a property name and its converted value.
     */   
    getConvertedValuesForProperties(values) {
        let propertiesAndValues = [];
        let propertiesAndValuesConverted = [];

        // split the input string into an array of property-value pairs
        propertiesAndValues.push({ "heartrate": values.substring(0, 1) });
        propertiesAndValues.push({ "color": values.substring(1, 2) });

        for (const propertyAndValue of propertiesAndValues) { // for each property-value object in array
            let [propertyName, value] = Object.entries(propertyAndValue)[0];
            value = parseInt(value); // convert value to integer

            const property = this.getPropertyByName(propertyName);

            if (property.read === false) {
                break;
            }   
            else {
                let propertyAndValueConverted = {};

                if (property.name === "heartrate") {
                    propertyAndValueConverted[property.name] = value * 1000;
                }
                else if (property.name === "color") {
                    if (value === 1) {
                        propertyAndValueConverted[property.name] = "red";
                    }
                    else if (value === 2) {
                        propertyAndValueConverted[property.name] = "green";
                    }
                    else {
                        propertyAndValueConverted[property.name] = "yellow";
                    }   
                } 
                else {
                    break;
                }
                propertiesAndValuesConverted.push(propertyAndValueConverted);
            }
        }
        return propertiesAndValuesConverted;
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
 * @description This class is designed to manage different converters for various LoRa devices. Each converter is responsible for handling the specific properties and behaviors of a device.
 */
class Converters {
    constructor() {
        this.converterMap = new Map();
        this.converterMap.set("Bulp LoRa-Robo 666", ConverterBulpLoRaRobo666);
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