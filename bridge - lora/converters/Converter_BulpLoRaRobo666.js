/**
 * =============================================================================================
 * Converter for the Bulp LoRa-Robo 666 device
 * ===========================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_BulpLoRaRobo666 extends ConverterStandard {
    static productName = "Bulp LoRa-Robo 666";

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
    get(values) {
        let propertiesAndValues             = [];
        let propertiesAndValuesConverted    = [];

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

                switch (property.name) {
                    case "heartrate":
                        propertyAndValueConverted[property.name] = value * 1000;
                        break;
                    case "color":
                        switch (value) {
                            case 1:
                                propertyAndValueConverted[property.name] = "red";
                                break;
                            case 2:
                                propertyAndValueConverted[property.name] = "green";
                                break;
                            default:
                                propertyAndValueConverted[property.name] = "yellow";
                                break;
                        }
                        break;
                    default:
                        break;
                }
                propertiesAndValuesConverted.push(propertyAndValueConverted);
            }
        }
        return propertiesAndValuesConverted;
    }
}

module.exports = { Converter_BulpLoRaRobo666 };