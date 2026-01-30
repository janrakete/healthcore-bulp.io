/**
 * =============================================================================================
 * Converter for the Paulmann 291.50 Bulb   
 * ======================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_Paulmann29150 extends ConverterStandard {
    static productName = "RGBWW";

    constructor() {
        super();

        this.powerType = "MAINS";

        // On/Off Cluster
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

        // Level Control (Dimming) Cluster
        this.properties["genLevelCtrl"] = {};
        this.properties["genLevelCtrl"]["currentLevel"] = {
            name:        "brightness",
            standard:    false,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Numeric"
        };

        // Color Control Cluster (Hue)
        this.properties["lightingColorCtrl"] = {};
        this.properties["lightingColorCtrl"]["currentHue"] = {
            name:        "hue",
            standard:    false,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0, // 0-254
            valueType:   "Numeric"
        };

        // Color Control Cluster (Saturation)
        this.properties["lightingColorCtrl"]["currentSaturation"] = {
            name:        "saturation",
            standard:    false,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0, // 0-254
            valueType:   "Numeric"
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
                    case "state":
                        // Standard conversion for On/Off
                         if (anyValue === 1 || anyValue === "on") {
                            return {"value": "on", "valueAsNumeric": 1};
                        } else {
                            return {"value": "off", "valueAsNumeric": 0};
                        }

                    case "brightness":
                        return {"value": anyValue, "valueAsNumeric": anyValue};

                    case "hue":
                        return {"value": anyValue, "valueAsNumeric": anyValue};

                    case "saturation":
                        return {"value": anyValue, "valueAsNumeric": anyValue};

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
                case "state":
                    valueConverted.command = anyValue;
                    valueConverted.anyValue = {};
                    return valueConverted;
                case "brightness":
                    valueConverted.command = "moveToLevel";
                    valueConverted.anyValue = { "level": anyValue, "transtime": 0 };
                    return valueConverted;
                case "hue":
                    valueConverted.command = "moveToHue";
                    valueConverted.anyValue = { "hue": anyValue, "direction": 0, "transtime": 0 };
                    return valueConverted;
                case "saturation":
                    valueConverted.command = "moveToSaturation";
                    valueConverted.anyValue = { "saturation": anyValue, "transtime": 0 };
                    return valueConverted;
                default:
                    return undefined;
            }
        }
    }
}

module.exports = { Converter_Paulmann29150 };
