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

        this.properties["6e400003b5a3f393e0a9e50e24dcca9e"] = {
            name:        "several",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Subproperties",
            subproperties: {
                l: {
                    name: "light",
                    standard:    false,
                    notify:      true,
                    read:        true,
                    write:       false,
                    anyValue: ["on", "off"],
                    valueType: "Options"
                },
                a: {
                    name: "alarm",
                    standard:    false,
                    notify:      true,
                    read:        true,
                    write:       false,
                    anyValue: ["on", "off"],
                    valueType: "Options"
                },
                h: {
                    name: "heartrate",
                    standard:    false,
                    notify:      true,
                    read:        true,
                    write:       false,
                    anyValue: 0,
                    valueType: "Integer"
                }
            }
        };
    }

    /**
     * Converts a value from the BLE device to a standard format.
     * @param {Object} property - Property metadata
     * @param {Buffer|any} value - Raw value from the device
     * @return {Object|undefined}
     */
    get(property, value) {
        if (property.read === false) {
            return undefined;   
        }

        if (property.standard === true) {
            return this.getStandard(property, value);
        }
        else {
            return undefined;
        }
    }

    /**
     * Converts a subproperty value from the BLE device to a standard format.
     * @param {Object} property - Subproperty metadata
     * @param {Buffer|any} value - Raw value from the device
     * @return {Object|undefined}
     */
    getSubproperty(property, value) {
        const valueConverted = (Buffer.isBuffer(value) ? value.toString("utf8") : String(value)).trim();
        try {
            const valueParsed = JSON.parse(valueConverted);

            if (property.name === "several") {
                switch (valueParsed.t) {
                    case "l":
                        return {"name": "light", "value": valueParsed.v === "1" ? "on" : "off", "valueAsNumeric": Number(valueParsed.v)};
                    case "a":
                        return {"name": "alarm", "value": valueParsed.v === "1" ? "on" : "off", "valueAsNumeric": Number(valueParsed.v)};
                    case "h":
                        return {"name": "heartrate", "value": Number(valueParsed.v), "valueAsNumeric": Number(valueParsed.v)};
                    default:
                        return undefined;                        
                }
            }

        }
        catch (error) { 
            return undefined;      
        }        
    }
}

module.exports = { Converter_BangleJS2BLE };
