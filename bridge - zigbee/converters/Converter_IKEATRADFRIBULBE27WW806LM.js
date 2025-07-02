/**
 * =============================================================================================
 * Converter for the IKEA TRADFRI bulb E27 WW 806lm device
 * =======================================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_IKEATRADFRIBULBE27WW806LM extends ConverterStandard {
    static productName = "TRADFRI bulb E27 WW 806lm";

    constructor() {
        super();

        this.powerType = "mains";

        this.properties["genOnOff"] = {};
        this.properties["genOnOff"]["onOff"] = {
            name:        "state",
            standard:    false,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    ["on", "off"],
            valueType:   "Options"
        };

        this.properties["genLevelCtrl"] = {};
        this.properties["genLevelCtrl"]["currentLevel"] = {
            name:        "brightness",
            standard:    false,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };
    }

    get(property, anyValue) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) { // if standard property then use common converter
                return (this.getStandard(property, anyValue));
            }
            else {
                if (property.name === "brightness") {
                    return anyValue;
                }
                else if (property.name === "state") {
                    if (anyValue === 1) {
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

    set(property, anyValue) {
        if (property.write === false) {
            return undefined;
        }
        else {
            let valueConverted = {};
            if (property.name === "brightness") {               
                valueConverted.command = "moveToLevel";
                valueConverted.anyValue   = {"level" : anyValue, "transtime" : 0 };
                return valueConverted;
            }
            else if (property.name === "state") {
                valueConverted.command = anyValue;
                valueConverted.anyValue   = {};
                return valueConverted;
            }
            else {
                return undefined;
            } 
        }
    }
}

module.exports = { Converter_IKEATRADFRIBULBE27WW806LM };