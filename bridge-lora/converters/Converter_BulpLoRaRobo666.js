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

        this.powerType  = "BATTERY";

        this.properties[0] = {
            name:       "heartRate",
            read:       true,
            anyValue:   0,
            valueType:  "Numeric"
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
     */   
    get(values) {
        let propertiesAndValues             = [];
        let propertiesAndValuesConverted    = {};

        // split the input string into an array of property-value pairs
        propertiesAndValues.push({ "heartRate": values.substring(0, 1) });
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
                    case "heartRate":
                        propertyAndValueConverted[property.name] = {"value": value * 1000, "valueAsNumeric": value * 1000};
                        break;
                    case "color":
                        switch (value) {
                            case 1:
                                propertyAndValueConverted[property.name] = {"value": "red", "valueAsNumeric": 1};
                                break;
                            case 2:
                                propertyAndValueConverted[property.name] = {"value": "green", "valueAsNumeric": 2};
                                break;
                            default:
                                propertyAndValueConverted[property.name] = {"value": "yellow", "valueAsNumeric": 3};
                                break;
                        }
                        break;
                    default:
                        break;
                }
                propertiesAndValuesConverted = { ...propertiesAndValuesConverted, ...propertyAndValueConverted };

            }
        }
        return propertiesAndValuesConverted;
    }
}

module.exports = { Converter_BulpLoRaRobo666 };