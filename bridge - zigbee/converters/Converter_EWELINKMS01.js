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

    getConvertedValueForProperty(property, anyValue, data) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) { // if standard property then use common converter
                return (this.getConvertedValueForPropertyStandard(property, anyValue));
            }
            else {
                if (property.name === "motion") {
                    if (anyValue === "commandStatusChangeNotification") {
                        if (data.zonestatus === 1) {
                            return "yes"; 
                        }
                        else {
                            return "no";
                        }
                    }
                    else {
                        return "no";
                    }
                }
                else {
                    return undefined;
                }
            }
        }
    }
}

module.exports = { Converter_EWELINKMS01 };