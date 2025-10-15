/**
 * =============================================================================================
 * Converter for the IKEA VALLHORN Wireless Motion Sensor Wireless Motion Sensor
 * =============================================================================
 */

const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_IKEAVALLHORNWirelessMotionSensor extends ConverterStandard {
    static productName = "VALLHORN Wireless Motion Sensor";

    constructor() {
        super();

        this.powerType = "Battery";

        // Occupancy sensing cluster (motion detection)
        this.properties["msOccupancySensing"] = {};
        this.properties["msOccupancySensing"]["occupancy"] = {
            name:        "motion",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    ["yes", "no"],
            valueType:   "Options"
        };

        // Illuminance measurement cluster
        this.properties["msIlluminanceMeasurement"] = {};
        this.properties["msIlluminanceMeasurement"]["measuredValue"] = {
            name:        "illuminance",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Battery level cluster
        this.properties["genPowerCfg"] = {};
        this.properties["genPowerCfg"]["batteryPercentageRemaining"] = {
            name:        "battery",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Battery voltage
        this.properties["genPowerCfg"]["batteryVoltage"] = {
            name:        "voltage",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };
    }

    /**
     *  Binding clusters and setting up reporting intervals
     *  @param {Object} device - The Zigbee device object
     *  @param {Object} coordinatorEndpoint - The coordinator endpoint for binding
     */
    async setupReporting(device, coordinatorEndpoint) {
        try {
            const endpoint = device.getEndpoint(1);
            if (endpoint === undefined) {
                return undefined;
            }

            await endpoint.bind("msOccupancySensing", coordinatorEndpoint);
            await endpoint.bind("msIlluminanceMeasurement", coordinatorEndpoint);
            await endpoint.bind("genPowerCfg", coordinatorEndpoint);

            await this.safeConfigureReporting(endpoint, "msOccupancySensing", [{
                attribute: "occupancy",
                minimumReportInterval: 0,
                maximumReportInterval: 300,
                reportableChange: 1
            }]);

            await this.safeConfigureReporting(endpoint, "msIlluminanceMeasurement", [{
                attribute: "measuredValue",
                minimumReportInterval: 10,
                maximumReportInterval: 600,
                reportableChange: 10
            }]);

            await this.safeConfigureReporting(endpoint, "genPowerCfg", [
                {
                    attribute: "batteryPercentageRemaining",
                    minimumReportInterval: 3600,
                    maximumReportInterval: 7200,
                    reportableChange: 1
                },
                {
                    attribute: "batteryVoltage",
                    minimumReportInterval: 3600,
                    maximumReportInterval: 7200,
                    reportableChange: 1
                }
            ]);            
        }
        catch (error) {
            return undefined
        }
    }

    get(property, anyValue, data = {}) {
        if (Object.keys(data).length === 0) {
            data[this.getClusterAndAttributeByPropertyName(property.name).attribute] = anyValue;
        }
        else {
            anyValue = data[this.getClusterAndAttributeByPropertyName(property.name).attribute];
        }

        if (property.read === false) {
            return undefined;
        } else {
            if (property.standard === true) {
                return this.getStandard(property, anyValue);
            }
            else {
                switch (property.name) {
                    case "motion":
                        return anyValue === 1 ? 
                            {"value": "yes", "valueAsNumeric": 1} : 
                            {"value": "no", "valueAsNumeric": 0};

                    case "illuminance":
                        // Handle illuminance with saturation at 1364 lx
                        const lux = anyValue === null ? 0 : Math.pow(10, (anyValue - 1) / 10000);
                        const cappedLux = Math.min(Math.round(lux), 1364);
                        return {"value": cappedLux + " lux", "valueAsNumeric": cappedLux};

                    case "battery":
                        // Convert battery percentage (0-200 scale to 0-100%)
                        const batteryPercent = Math.round(anyValue / 2);
                        return {"value": batteryPercent + "%", "valueAsNumeric": batteryPercent};

                    case "voltage":
                        // Convert voltage from raw value (typically in 0.1V units)
                        const voltage = anyValue / 10;
                        return {"value": voltage.toFixed(1) + "V", "valueAsNumeric": voltage};

                    default:
                        return undefined;
                }
            }
        }
    }
}

module.exports = { Converter_IKEAVALLHORNWirelessMotionSensor };