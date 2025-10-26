/**
 * =============================================================================================
 * Converter for the Bangle.js 2 BLE Watch
 * =============================================================================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_BangleJS2BLE extends ConverterStandard {
    static productName = "Bangle.js 5f2c";

    constructor() {
        super();

        this.powerType = "Battery";

        // Definiert die Properties entsprechend der App
        this.properties["6e400002b5a3f393e0a9e50e24dcca9e"] = {
            name:        "pulse",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };
    }

    /**
     * Converts a value from the BLE device to a standard format.
     * @param {Object} property - Property metadata
     * @param {Buffer|any} value - Raw value from the device
     * @return {Object|undefined}
     */
    get(property, value) {
        if (property.read === false) return undefined;

        if (property.standard === true) {
            return this.getStandard(property, value);
        } else {
            switch (property.name) {
                case "pulse":
                    if (Buffer.isBuffer(value)) {
                        return {
                            value: value.readUInt8(0),
                            valueAsNumeric: value.readUInt8(0)
                        };
                    } else if (typeof value === "number") {
                        return { value: value, valueAsNumeric: value };
                    } else {
                        return undefined;
                    }
                default:
                    return undefined;
            }
        }
    }
}

module.exports = { Converter_BangleJS2BLE };
