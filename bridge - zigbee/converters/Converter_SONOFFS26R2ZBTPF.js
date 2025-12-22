/**
 * =============================================================================================
 * Converter for the SONOFF S26R2ZBTPF Zigbee Smart Plug
 * ======================================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_SONOFFS26R2ZBTPF extends ConverterStandard {
    static productName = "S26R2ZB";

    constructor() {
        super();

        this.powerType = "Mains (single phase)"; 

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

    get(property, anyValue, data = {}) {
        if (Object.keys(data).length === 0) { // if data is empty, get the value from anyValue, use orignal attribute name to store it in data for later use
            data[this.getClusterAndAttributeByPropertyName(property.name).attribute] = anyValue;
        }
        else { // if data is not empty, get the value from data
            anyValue = data[this.getClusterAndAttributeByPropertyName(property.name).attribute];
        }

        if (property.read === false) {
            return undefined;
        }
        else {
            if (property.standard === true) {
                return this.getStandard(property, anyValue);
            }
            else {
                switch (property.name) {
                    case "power":
                        switch (data["onOff"]) {
                            case 1:
                                return {"value": "on", "valueAsNumeric": 1};
                            default:
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
                    if (anyValue === "on") {
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