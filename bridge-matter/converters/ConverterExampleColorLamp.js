/**
 * =============================================================================================
 * Converter for an example Matter dimmable color lamp
 * ====================================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class ConverterExampleColorLamp extends ConverterStandard {
    static productName = "Matter example color lamp";

    static supportsNode(node) {
        return node.endpoints.some(endpoint => {
            const behaviors = endpoint.behaviors;
            const hasOnOff = behaviors.forCluster(6);
            const levelControl = behaviors.forCluster(8);
            const colorControl = behaviors.forCluster(768);
            if (!hasOnOff || !levelControl || !colorControl) {
                return false;
            }

            const colorElements = behaviors.elementsOf(colorControl);
            return ["currentHue", "currentSaturation", "colorTemperatureMireds"].every(attribute =>
                colorElements.attributes.has(attribute)
            ) && ["moveToHue", "moveToSaturation"].every(command => colorElements.commands.has(command));
        });
    }

    constructor() {
        super();

        this.powerType = "MAINS";
        this.properties = {
            ...this.properties,
            brightness: {
                name: "brightness",
                reportingInclude: true,
                reportingRole: "actuator",
                read: true,
                write: true,
                anyValue: 0,
                valueType: "Numeric"
            },
            hue: {
                name: "hue",
                reportingInclude: true,
                reportingRole: "actuator",
                read: true,
                write: true,
                anyValue: 0,
                valueType: "Numeric"
            },
            saturation: {
                name: "saturation",
                reportingInclude: true,
                reportingRole: "actuator",
                read: true,
                write: true,
                anyValue: 0,
                valueType: "Numeric"
            },
            colorTemperature: {
                name: "colorTemperature",
                reportingInclude: true,
                reportingRole: "sensor",
                read: true,
                anyValue: 0,
                valueType: "Numeric"
            }
        };
    }

    getAttribute(clusterId, attributeName, value, endpointId = 1) {
        const key = String(attributeName).toLowerCase();
        let property;
        let convertedValue;

        // Matter level, hue, and saturation values use a raw range of 0-254.
        if (clusterId === 8 && key === "currentlevel") {
            property = "brightness";
            convertedValue = Math.round(Number(value) * 1000 / 254) / 10;
        }
        else if (clusterId === 768 && key === "currenthue") {
            property = "hue";
            convertedValue = Math.round(Number(value) * 3600 / 254) / 10;
        }
        else if (clusterId === 768 && key === "currentsaturation") {
            property = "saturation";
            convertedValue = Math.round(Number(value) * 1000 / 254) / 10;
        }
        else if (clusterId === 768 && key === "colortemperaturemireds" && Number(value) > 0) {
            property = "colorTemperature";
            // Convert reciprocal megakelvin (mireds) to kelvin.
            convertedValue = Math.round(1000000 / Number(value));
        }
        else {
            return super.getAttribute(clusterId, attributeName, value, endpointId);
        }

        return {
            property: endpointId > 1 ? property + "_endpoint_" + endpointId : property,
            value: convertedValue,
            valueAsNumeric: convertedValue,
            valueType: "number",
            endpointId
        };
    }

    getWriteCommand(property, value) {
        if (property === "brightness") {
            const brightness = this.numericValue(value, property, 0, 100);
            const level = Math.round(brightness * 254 / 100);
            return {
                client: "levelControl",
                commandName: "moveToLevelWithOnOff",
                args: [{ level, transitionTime: 0, optionsMask: 0, optionsOverride: 0 }],
                clusterId: 8,
                attributeName: "currentLevel",
                attributeValue: level
            };
        }

        if (property === "hue") {
            const hue = this.numericValue(value, property, 0, 360);
            const rawHue = Math.round(hue * 254 / 360);
            return {
                client: "colorControl",
                commandName: "moveToHue",
                args: [{ hue: rawHue, direction: 0, transitionTime: 0, optionsMask: 0, optionsOverride: 0 }],
                clusterId: 768,
                attributeName: "currentHue",
                attributeValue: rawHue
            };
        }

        if (property === "saturation") {
            const saturation = this.numericValue(value, property, 0, 100);
            const rawSaturation = Math.round(saturation * 254 / 100);
            return {
                client: "colorControl",
                commandName: "moveToSaturation",
                args: [{ saturation: rawSaturation, transitionTime: 0, optionsMask: 0, optionsOverride: 0 }],
                clusterId: 768,
                attributeName: "currentSaturation",
                attributeValue: rawSaturation
            };
        }

        return super.getWriteCommand(property, value);
    }

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

module.exports = { ConverterExampleColorLamp };