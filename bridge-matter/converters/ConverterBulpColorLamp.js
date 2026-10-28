/**
 * =============================================================================================
 * Converter for an example Matter dimmable color lamp
 * ===================================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class ConverterBulpColorLamp extends ConverterStandard {
    static productName = "bulp - Color Lamp";

    /**
     * Checks if the given node is supported by this converter.
     * @param {object} node - The node to check.
     * @returns {boolean} - True if the node is supported, false otherwise.
     */
    static supportsNode(node) {
        return [...node.endpoints].some(endpoint => { // matter.js node.endpoints is an iterable collection without .some(), so convert it to an array first
            const behaviors     = endpoint.behaviors;
            const hasOnOff      = behaviors.forCluster(6);
            const levelControl  = behaviors.forCluster(8);
            const colorControl  = behaviors.forCluster(768);

            if (!hasOnOff || !levelControl || !colorControl) {
                return false;
            }

            const colorElements = behaviors.elementsOf(colorControl);
            return ["currentHue", "currentSaturation", "colorTemperatureMireds"].every(attribute => colorElements.attributes.has(attribute)) && ["moveToHue", "moveToSaturation"].every(command => colorElements.commands.has(command)); // Ensure required attributes and commands are present
        });
    }

    constructor() {
        super();

        this.powerType  = "MAINS";
        this.vendorName = "bulp";

        this.attributeConversions = [
            {
                clusterId: 8,
                attributeName: "currentLevel",
                property: "brightness",
                fromMatter: value => Math.round(Number(value) * 1000 / 254) / 10,
                toMatter: value => Math.round(value * 254 / 100),
                minimum: 0,
                maximum: 100,
                write: {
                    client: "levelControl",
                    commandName: "moveToLevelWithOnOff",
                    createArgs: level => [{ level, transitionTime: 0, optionsMask: 0, optionsOverride: 0 }]
                }
            },
            {
                clusterId: 768,
                attributeName: "currentHue",
                property: "hue",
                fromMatter: value => Math.round(Number(value) * 3600 / 254) / 10,
                toMatter: value => Math.round(value * 254 / 360),
                minimum: 0,
                maximum: 360,
                write: {
                    client: "colorControl",
                    commandName: "moveToHue",
                    createArgs: hue => [{ hue, direction: 0, transitionTime: 0, optionsMask: 0, optionsOverride: 0 }]
                }
            },
            {
                clusterId: 768,
                attributeName: "currentSaturation",
                property: "saturation",
                fromMatter: value => Math.round(Number(value) * 1000 / 254) / 10,
                toMatter: value => Math.round(value * 254 / 100),
                minimum: 0,
                maximum: 100,
                write: {
                    client: "colorControl",
                    commandName: "moveToSaturation",
                    createArgs: saturation => [{ saturation, transitionTime: 0, optionsMask: 0, optionsOverride: 0 }]
                }
            },
            {
                clusterId: 768,
                attributeName: "colorTemperatureMireds",
                property: "colorTemperature",
                fromMatter: value => Number(value) > 0 ? Math.round(1000000 / Number(value)) : undefined
            }
        ];

        // EP 1: Brightness (levelControl, Matter cluster 8, currentLevel)
        this.properties["levelControl"] = {};
        this.properties["levelControl"]["currentLevel"] = {
            name:               "brightness",
            reportingInclude:   true,
            reportingRole:      "actuator",
            standard:           false,
            notify:             false,
            read:               true,
            write:              true,
            anyValue:           0,
            valueType:          "Numeric"
        };

        // EP 1: Hue (colorControl, Matter cluster 768, currentHue)
        this.properties["colorControl"] = {};
        this.properties["colorControl"]["currentHue"] = {
            name:               "hue",
            reportingInclude:   true,
            reportingRole:      "actuator",
            standard:           false,
            notify:             false,
            read:               true,
            write:              true,
            anyValue:           0,
            valueType:          "Numeric"
        };

        // EP 1: Saturation (colorControl, Matter cluster 768, currentSaturation)
        this.properties["colorControl"]["currentSaturation"] = {
            name:               "saturation",
            reportingInclude:   true,
            reportingRole:      "actuator",
            standard:           false,
            notify:             false,
            read:               true,
            write:              true,
            anyValue:           0,
            valueType:          "Numeric"
        };

        // EP 1: Color temperature (colorControl, Matter cluster 768, colorTemperatureMireds)
        this.properties["colorControl"]["colorTemperatureMireds"] = {
            name:               "colorTemperature",
            reportingInclude:   true,
            reportingRole:      "sensor",
            standard:           false,
            notify:             false,
            read:               true,
            write:              false,
            anyValue:           0,
            valueType:          "Numeric"
        };
    }

    get(property, anyValue, data = {}) {
        const propertyName = property.name.replace(/_endpoint_\d+$/, "");
        const attribute = this.attributeConversions.find(candidate => candidate.property === propertyName);
        if (attribute) {
            const value = attribute.fromMatter(anyValue);
            if (value === undefined) {
                return undefined;
            }
            return {
                value,
                valueAsNumeric: value,
                valueType: "number",
                endpointId: data.endpointId || 1
            };
        }

        return super.get(property, anyValue, data);
    }

    set(property, anyValue) {
        const propertyName = property.name.replace(/_endpoint_\d+$/, "");
        const attribute = this.attributeConversions.find(candidate =>
            candidate.property === propertyName && candidate.write
        );
        if (attribute) {
            const numericValue = this.numericValue(anyValue, propertyName, attribute.minimum, attribute.maximum);
            const rawValue = attribute.toMatter(numericValue);
            return {
                client:         attribute.write.client,
                commandName:    attribute.write.commandName,
                args:           attribute.write.createArgs(rawValue),
                clusterId:      attribute.clusterId,
                attributeName:  attribute.attributeName,
                attributeValue: rawValue
            };
        }

        return super.set(property, anyValue);
    }


    /**
     * Converts a value to a numeric value and validates it against the specified range.
     * @param {number|string} value - The value to convert.
     * @param {string} property - The property name for error messages.
     * @param {number} minimum - The minimum allowed value.
     * @param {number} maximum - The maximum allowed value.
     * @returns {number} - The numeric value.
     * @throws {Error} - If the value is not a number or is out of range.
     */
    numericValue(value, property, minimum, maximum) {
        if (typeof value !== "number" && typeof value !== "string") {
            throw new Error("Matter " + property + " must be a number between " + minimum + " and " + maximum);
        }

        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue < minimum || numericValue > maximum) {
            throw new Error("Matter " + property + " must be a number between " + minimum + " and " + maximum);
        }
        return numericValue;
    }
}

module.exports = { ConverterBulpColorLamp };