/**
 * =============================================================================================
 * Converter for the SONOFF S26R2ZBTPF Zigbee Smart Plug
 * ======================================================
 */
const { any } = require("async");
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_SONOFFS26R2ZBTPF extends ConverterStandard {
    static productName = "S26R2ZB";

    constructor() {
        super();

        this.powerType = "mains"; 

        this.properties["genOnOff"] = {};
        this.properties["genOnOff"]["onOff"] = {
            name:        "power",
            standard:    false,
            notify:      true,
            read:        true,
            write:       true,
            anyValue:    ["on", "off"],
            valueType:   "Options"
        };

    }

    get(property, anyValue) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) {
                return this.getStandard(property, anyValue);
            }
            else {

                                            console.log(anyValue);
                switch (property.name) {
                    case "power":
                        switch (anyValue) {


                            case "commandOn":
                                return {"value": "on", "valueAsNumeric": 1};
                            case "commandOff":
                                return {"value": "off", "valueAsNumeric": 0};
                        }

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
                case "power":
                    if (anyValue === "on" || anyValue === 1 || anyValue === true) {
                        valueConverted.command = "on";
                    } else {
                        valueConverted.command = "off";
                    }
                    valueConverted.anyValue = {};
                    return valueConverted;

                default:
                    return undefined;
            }
        }
    }
}

module.exports = { Converter_SONOFFS26R2ZBTPF };