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

        this.powerType = "Mains (single phase)";

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

    get(property, anyValue, data) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) { // if standard property then use common converter
                return (this.getStandard(property, anyValue));
            }
            else {
                switch (property.name) {
                    case "brightness":
                        return {"value": anyValue, "valueAsNumeric": anyValue};
                    case "state":
                        return anyValue === 1 ? {"value": "on", "valueAsNumeric": 1} : {"value": "off", "valueAsNumeric": 0};
                    default:
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
            switch (property.name) {
                case "brightness":
                    valueConverted.command = "moveToLevel";
                    valueConverted.anyValue = { "level": anyValue, "transtime": 0 };
                    return valueConverted;
                case "state":
                    valueConverted.command = anyValue;
                    valueConverted.anyValue = {};
                    return valueConverted;
                default:
                    return undefined;
            }
        }
    }
}

module.exports = { Converter_IKEATRADFRIBULBE27WW806LM };