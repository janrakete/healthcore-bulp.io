/**
 * =============================================================================================
 * Converter for the eWeLink MS01 device
 * =====================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_EWELINKMS01 extends ConverterStandard {
    static productName = "MS01";

    constructor() {
        super();

        this.powerType = "battery";

        this.properties["ssIasZone"] = {
            name:        "motion",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    ["yes", "no"],
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
                switch (property.name) {
                    case "motion":
                        switch (anyValue) {
                            case "commandStatusChangeNotification":
                                return data.zonestatus === 1 ? {"value": "yes", "valueAsNumeric": 1} : {"value": "no", "valueAsNumeric": 0};
                            default:
                                return {"value" : "no", "valueAsNumeric": 0};
                        }
                    default:
                        return undefined;
                }
            }
        }
    }
}

module.exports = { Converter_EWELINKMS01 };