/**
 * =============================================================================================
 * Converter for the SONOFF SNZB-01P device
 * ========================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_SONOFFSNZB01P extends ConverterStandard {
    static productName = "SNZB-01P";

    constructor() {
        super();

        this.powerType = "Battery";

        this.properties["genOnOff"] = {};
        this.properties["genOnOff"]["button"] = {
            name:        "button",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    ["pressed", "not_pressed", "long_pressed", "double_pressed"],
            valueType:   "Options"
        };
    }

    get(property, anyValue, data) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) { // if standard property then use common converter
                return (this.getStandard(property, anyValue));
            }
            else {
                if (property.name === "button") {
                    switch (anyValue) {
                        case "commandToggle":
                            return {"value": "pressed", "valueAsNumeric": 1};
                        case "commandOff":
                            return {"value": "long_pressed", "valueAsNumeric": 2};
                        case "commandOn":
                            return {"value": "double_pressed", "valueAsNumeric": 3};
                        default:
                            return {"value": "not_pressed", "valueAsNumeric": 0};
                    }
                }
                else {
                    return undefined;
                }
            }
        }
    }
}

module.exports = { Converter_SONOFFSNZB01P };