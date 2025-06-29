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

        this.powerType = "battery";

        this.properties["genOnOff"] = {
            name:        "button",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    ["pressed", "not_pressed", "long_pressed", "double_pressed"],
            valueType:   "Options"
        };
    }

    getConvertedValueForProperty(property, anyValue, data) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) { // if standard property then use common converter
                return (this.getConvertedValueForPropertyStandard(property, anyValue));
            }
            else {
                if (property.name === "button") {
                    if (anyValue === "commandToggle") {
                        return "pressed";
                    }
                    if (anyValue === "commandOff") {
                        return "long_pressed";
                    }
                    if (anyValue === "commandOn") {
                        return "double_pressed";
                    }
                    else {
                        return "not_pressed";
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