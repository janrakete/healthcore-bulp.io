/**
 * =============================================================================================
 * Converter for the Bulp Web-Robo 321 device
 * ==========================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_BulpWebRobo321 extends ConverterStandard {
    static productName = "Bulp Web-Robo 321";

    constructor() {
        super();

        this.properties[0] = {
            name:       "voltage",
            read:       true,
            anyValue:   0,
            valueType:  "Integer"
        };

        this.properties[1] = {
            name:       "switch",
            read:       true,
            anyValue:   ["tapped", "not_tapped", "long_tapped"],
            valueType:  "Options"
        };
    }

    /**
     * Converts a value for a specific property.
     * @param {string} propertyName - The name of the property to convert the value for.
     * @param {any} value - The value to convert.
     * @return {any} - The converted value based on the property's type and read status.
     * @description This method checks if the property is readable. If it is, it converts the value based on the property's name. For the "voltage" property, it multiplies the value by 100. For the "switch" property, it converts numeric values to string representations of their states. If the property is not readable or does not match any known properties, it returns undefined.
     */
    get(propertyName, value) {
        const property = this.getPropertyByName(propertyName);

        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.name === "voltage") {
                return (value * 100);
            }
            else if (property.name === "switch") {
                if (value === 1) {
                    return "tapped";
                }
                else if (value === 2) {
                    return "long_tapped";
                }
                else {
                    return "not_tapped";
                }   
            } 
            else {
                return undefined;
            }
        }
    }
}

module.exports = { Converter_BulpWebRobo321 };