/**
 * =============================================================================================
 * Standard converter for Matter attributes
 * =========================================
 */

class ConverterStandard {
    constructor() {
        this.powerType = "?";

        this.properties = {};
        this.clusterNamesById = {
            6: "onOff",
            8: "levelControl",
            47: "powerSource",
            768: "colorControl",
            1026: "temperatureMeasurement",
            1027: "pressureMeasurement",
            1029: "relativeHumidityMeasurement",
            1030: "occupancySensing"
        };

        // =============================================================================================
        // Define the standard properties for Matter devices
        // =============================================================================================

        // Temperature property
        // EP 1: Temperature (temperatureMeasurement, Matter cluster 1026, measuredValue)
        this.properties["temperatureMeasurement"] = {};
        this.properties["temperatureMeasurement"]["measuredValue"] = {
            name:               "temperature",
            reportingInclude:   true,
            reportingRole:      "sensor",
            standard:           false,
            notify:             false,
            read:               true,
            write:              false,
            anyValue:           0,
            valueType:          "Numeric"
        };

        // EP 1: Humidity (relativeHumidityMeasurement, Matter cluster 1029, measuredValue)
        this.properties["relativeHumidityMeasurement"] = {};
        this.properties["relativeHumidityMeasurement"]["measuredValue"] = {
            name:               "humidity",
            reportingInclude:   true,
            reportingRole:      "sensor",
            standard:           false,
            notify:             false,
            read:               true,
            write:              false,
            anyValue:           0,
            valueType:          "Numeric"
        };

        // EP 1: Pressure (pressureMeasurement, Matter cluster 1027, measuredValue)
        this.properties["pressureMeasurement"] = {};
        this.properties["pressureMeasurement"]["measuredValue"] = {
            name:               "pressure",
            reportingInclude:   true,
            reportingRole:      "sensor",
            standard:           false,
            notify:             false,
            read:               true,
            write:              false,
            anyValue:           0,
            valueType:          "Numeric"
        };

        // EP 1: Occupancy (occupancySensing, Matter cluster 1030, occupancy)
        this.properties["occupancySensing"] = {};
        this.properties["occupancySensing"]["occupancy"] = {
            name:               "occupancy",
            reportingInclude:   true,
            reportingRole:      "sensor",
            standard:           false,
            notify:             false,
            read:               true,
            write:              false,
            anyValue:           ["occupied", "unoccupied"],
            valueType:          "Options"
        };

        // EP 1: Power (onOff, Matter cluster 6, onOff)
        this.properties["onOff"] = {};
        this.properties["onOff"]["onOff"] = {
            name:               "power",
            reportingInclude:   true,
            reportingRole:      "actuator",
            standard:           false,
            notify:             false,
            read:               true,
            write:              true,
            anyValue:           ["on", "off"],
            valueType:          "Options"
        };

        // EP 1: Battery (powerSource, Matter cluster 47, batPercentRemaining)
        this.properties["powerSource"] = {};
        this.properties["powerSource"]["batPercentRemaining"] = {
            name:               "battery",
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

    /**
     * Generates the properties for the specified endpoints, including secondary endpoints if provided.
     * @param {*[]} endpointIds - An array of endpoint IDs for which to generate properties.
     * @returns {object} An object containing the properties for the specified endpoints.
     */
    propertiesForEndpoints(endpointIds) {
        const properties = {};
        const secondaryEndpointIds = [...new Set(endpointIds)].filter(endpointId => endpointId > 1); // Filter out the primary endpoint (1) to get only secondary endpoints

        for (const [cluster, attributes] of Object.entries(this.properties)) {
            properties[cluster] = {};
            for (const [attribute, property] of Object.entries(attributes)) {
                properties[cluster][attribute] = { ...property };
            }
        }

        for (const endpointId of secondaryEndpointIds) { // Generate properties for secondary endpoints
            for (const [cluster, attributes] of Object.entries(this.properties)) {
                for (const [attribute, property] of Object.entries(attributes)) {
                    const name = property.name + "_endpoint_" + endpointId;
                    properties[cluster][attribute + "_endpoint_" + endpointId] = { ...property, name };
                }
            }
        }

        return properties;
    }

    getPropertyByAttribute(clusterId, attributeName) {
        const clusterName = this.clusterNamesById[clusterId];
        const attributes = this.properties[clusterName];
        if (!attributes) {
            return undefined;
        }

        const normalizedAttributeName = String(attributeName).toLowerCase();
        const attribute = Object.keys(attributes).find(name => name.toLowerCase() === normalizedAttributeName);
        return attribute ? attributes[attribute] : undefined;
    }

    getPropertyByName(name) {
        const baseName = String(name).replace(/_endpoint_\d+$/, "");
        for (const attributes of Object.values(this.properties)) {
            for (const property of Object.values(attributes)) {
                if (property.name === baseName) {
                    return property;
                }
            }
        }
        return undefined;
    }

    get(property, anyValue, data = {}) {
        if (!property || property.read === false) {
            return undefined;
        }

        const propertyName = property.name.replace(/_endpoint_\d+$/, "");
        let value = anyValue;
        if (propertyName === "temperature" || propertyName === "humidity") {
            value = Number(anyValue) / 100;
        }
        else if (propertyName === "pressure") {
            value = Number(anyValue) / 10;
        }
        else if (propertyName === "occupancy") {
            value = Number(anyValue) !== 0 ? "occupied" : "unoccupied";
        }
        else if (propertyName === "power") {
            value = Boolean(anyValue) ? "on" : "off";
        }
        else if (propertyName === "battery") {
            value = Number(anyValue) / 2;
        }
        else {
            return undefined;
        }

        const valueAsNumeric = propertyName === "occupancy" ? Number(value === "occupied") :
            propertyName === "power" ? Number(value === "on") : value;
        return {
            value,
            valueAsNumeric,
            valueType: typeof value === "number" ? "number" : "string",
            endpointId: data.endpointId || 1
        };
    }

    set(property, anyValue) {
        if (!property || property.write !== true || property.name.replace(/_endpoint_\d+$/, "") !== "power") {
            return undefined;
        }

        const commandName = anyValue === "on" || anyValue === true || anyValue === 1 ? "on" :
            anyValue === "off" || anyValue === false || anyValue === 0 ? "off" : undefined;
        if (!commandName) {
            throw new Error("Expected power 'on' or 'off'");
        }

        return {
            client: "onOff",
            commandName,
            args: [],
            clusterId: 6,
            attributeName: "onOff",
            attributeValue: commandName === "on"
        };
    }

}

module.exports = { ConverterStandard };