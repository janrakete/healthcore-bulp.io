/**
 * =============================================================================================
 * Standard converter for Matter attributes
 * =========================================
 */

class ConverterStandard {
    static productName = "Matter device";

    constructor() {
        this.powerType = "?";
        this.properties = {
            temperature: { name: "temperature", reportingInclude: true, reportingRole: "sensor", read: true, anyValue: 0, valueType: "Numeric" },
            humidity:    { name: "humidity", reportingInclude: true, reportingRole: "sensor", read: true, anyValue: 0, valueType: "Numeric" },
            pressure:    { name: "pressure", reportingInclude: true, reportingRole: "sensor", read: true, anyValue: 0, valueType: "Numeric" },
            occupancy:   { name: "occupancy", reportingInclude: true, reportingRole: "sensor", read: true, anyValue: ["occupied", "unoccupied"], valueType: "Options" },
            power:       { name: "power", reportingInclude: true, reportingRole: "actuator", read: true, write: true, anyValue: ["on", "off"], valueType: "Options" },
            battery:     { name: "battery", reportingInclude: true, reportingRole: "sensor", read: true, anyValue: 0, valueType: "Numeric" }
        };
    }

    propertiesForEndpoints(endpointIds) {
        const properties = Object.fromEntries(Object.entries(this.properties).map(([key, property]) => [key, { ...property }]));
        const secondaryEndpointIds = [...new Set(endpointIds)].filter(endpointId => endpointId > 1);

        for (const endpointId of secondaryEndpointIds) {
            for (const property of Object.values(this.properties)) {
                const name = property.name + "_endpoint_" + endpointId;
                properties[name] = { ...property, name };
            }
        }

        return properties;
    }

    getWriteCommand(property, value) {
        if (property !== "power") {
            return undefined;
        }

        const commandName = value === "on" || value === true || value === 1 ? "on" :
            value === "off" || value === false || value === 0 ? "off" : undefined;
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

    getAttribute(clusterId, attributeName, value, endpointId = 1) {
        const key = String(attributeName).toLowerCase();
        let property;
        let convertedValue = value;

        if (clusterId === 1026 && key === "measuredvalue") {
            property = "temperature";
            convertedValue = Number(value) / 100;
        }
        else if (clusterId === 1029 && key === "measuredvalue") {
            property = "humidity";
            convertedValue = Number(value) / 100;
        }
        else if (clusterId === 1027 && key === "measuredvalue") {
            property = "pressure";
            convertedValue = Number(value) / 10;
        }
        else if (clusterId === 1030 && key === "occupancy") {
            property = "occupancy";
            convertedValue = Number(value) !== 0 ? "occupied" : "unoccupied";
        }
        else if (clusterId === 6 && key === "onoff") {
            property = "power";
            convertedValue = Boolean(value) ? "on" : "off";
        }
        else if (clusterId === 47 && key === "batpercentremaining") {
            property = "battery";
            convertedValue = Number(value) / 2;
        }
        else {
            return undefined;
        }

        return {
            property: endpointId > 1 ? property + "_endpoint_" + endpointId : property,
            value: convertedValue,
            valueAsNumeric: property === "occupancy" ? Number(convertedValue === "occupied") :
                property === "power" ? Number(convertedValue === "on") : convertedValue,
            valueType: typeof convertedValue === "number" ? "number" : "string",
            endpointId
        };
    }
}

module.exports = { ConverterStandard };