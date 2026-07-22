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

        this.powerType  = "BATTERY";
        this.vendorName = "eWeLink";

        this.properties["genOnOff"] = {};
        this.properties["genOnOff"]["button"] = {
            name:               "button",
            reportingInclude:   false,
            reportingRole:      "actuator",
            standard:           false,
            notify:             true,
            read:               true,
            write:              false,
            anyValue:           ["pressed", "notPressed", "longPressed", "doublePressed"],
            valueType:          "Options"
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
                            return {"value": "longPressed", "valueAsNumeric": 2};
                        case "commandOn":
                            return {"value": "doublePressed", "valueAsNumeric": 3};
                        default:
                            return {"value": "notPressed", "valueAsNumeric": 0};
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