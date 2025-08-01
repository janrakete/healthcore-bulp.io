/**
 * =============================================================================================
 * Converter for the bulp - Sensor BLE
 * ====================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_BulpSensorBLE extends ConverterStandard {
    static productName = "bulp - Sensor BLE";

    constructor() {
        super();

        this.powerType = "wire";

        this.properties["19b10000e8f2537e4f6cd104768a1217"] = {
            name:        "rotary_switch",
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        this.properties["19b10000e8f2537e4f6cd104768a1219"] = {
            name:        "button",
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    ["pressed", "not_pressed"],
            valueType:   "Options"
        };

        this.properties["19b10000e8f2537e4f6cd104768a1218"] = {
            name:        "speaker",
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    ["on", "off"],
            valueType:   "Options"
        };

        this.properties["19b10000e8f2537e4f6cd104768a1216"] = {
            name:        "led",
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    ["on", "off"],
            valueType:   "Options"
        };
    }

    /**
     * Converts a value for a specific property.
     * @param {Object} property - The property object containing metadata about the property.
     * @param {any} value - The value to convert.
     * @return {any|undefined} - The converted value if the property is readable, otherwise undefined.
     * @description This method checks if the property is readable. If it is, it converts the value based on the property's name.
     */
    get(property, value) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) { // if standard property then use common converter
                return this.getStandard(property, value);
            }
            else {
                if (property.name === "rotary_switch") {
                    const buf = Buffer.from(value);
                    return buf[0];
                }
                else if (property.name === "button") {
                    if (value[0] === 1) {
                        return "pressed";
                    }
                    else {
                        return "not_pressed";
                    }   
                }
                else if (property.name === "speaker") {
                    if (value[0] === 1) {
                        return "on";
                    }
                    else {
                        return "off";
                    }   
                }
                else if (property.name === "led") {
                    if (value[0] === 1) {
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

    /**
     * Converts a value for a specific property of the bulp - Sensor BLE device to a format suitable for writing.
     * @param {Object} property - The property object containing metadata about the property.
     * @param {any} value - The value to convert.
     * @return {Buffer|undefined} - The converted value as a Buffer if the property is writable, otherwise undefined.
     * @description This method checks if the property is writable. If it is, it converts the value based on the property's name. 
     */
    set(property, value) {
        if (property.write === false) {
            return undefined;
        }
        else {
            if (property.name === "speaker") {
                if (property.anyValue.includes(value)) {
                    if (value === "on") {
                        return Buffer.from([1]);
                    }
                    else {
                        return Buffer.from([0]);
                    }
                }
                else {
                    return undefined;                    
                }
            }
            else if (property.name === "led") {
                if (property.anyValue.includes(value)) {
                    if (value === "on") {
                        return Buffer.from([1]);
                    }
                    else {
                        return Buffer.from([0]);
                    }                
                }
                else {
                    return undefined;                    
                }
            }
            else {
                return undefined;
            }     
        }       
     }
}

module.exports = { Converter_BulpSensorBLE };