/**
 * =============================================================================================
 * Converter for the Bulp Web-Robo 321 device
 * ==========================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_BulpWebRobo321 extends ConverterStandard {
    static productName = "Bulp Web-Robo 321";

    constructor() {
        super();
        
        this.powerType      = "MAINS";

        this.properties[0] = {
            name:       "voltage",
            read:       true,
            anyValue:   0,
            valueType:  "Numeric"
        };

        this.properties[1] = {
            name:       "switch",
            read:       true,
            anyValue:   ["pressed", "notPressed", "longPressed"],
            valueType:  "Options"
        };
    }

    /**
     * Converts a value for a specific property.
     * @param {string} propertyName - The name of the property to convert the value for.
     * @param {any} value - The value to convert.
     * @return {any} - The converted value based on the property's type and read status.
     */
    get(propertyName, value) {
        const property = this.getPropertyByName(propertyName);

        if (property.read === false) {
            return undefined;
        }   
        else {
            switch (property.name) {
                case "voltage":
                    return {"value": value * 100, "valueAsNumeric": value * 100};
                case "switch":
                    switch (value) {
                        case 1:
                            return {"value": "pressed", "valueAsNumeric": 1};
                        case 2:
                            return {"value": "longPressed", "valueAsNumeric": 2};
                        default:
                            return {"value": "notPressed", "valueAsNumeric": 0};
                    }
                default:
                    return undefined;
            }
        }
    }
}

module.exports = { Converter_BulpWebRobo321 };