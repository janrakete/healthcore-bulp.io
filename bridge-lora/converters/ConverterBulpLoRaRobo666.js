/**
 * =============================================================================================
 * Converter for the Bulp LoRa-Robo 666 device
 * ===========================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class ConverterBulpLoRaRobo666 extends ConverterStandard {
    static productName = "Bulp LoRa-Robo 666";

    constructor() {
        super();

        this.powerType  = "BATTERY";

        this.properties[0] = {
            name:               "heartRate",
            reportingInclude:   true,
            reportingRole:      "activity",
            read:               true,
            anyValue:           0,
            valueType:          "Numeric"
        };

        this.properties[1] = {
            name:               "color",
            reportingInclude:   false,
            reportingRole:      "actuator",
            read:               true,
            anyValue:           ["red", "green", "yellow"],
            valueType:          "Options"
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

        // "values" is the decoded LoRa payload with the 16-char device UUID already stripped
        // (see bridge-lora/app.js). This demo device packs exactly 2 more ASCII digits:
        // offset 0 = heart rate digit, offset 1 = color code (mapped to red/green/yellow below).
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

module.exports = { ConverterBulpLoRaRobo666 };