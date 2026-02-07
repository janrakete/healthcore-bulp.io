/**
 * =============================================================================================
 * Converter for the IKEA VALLHORN Wireless Motion Sensor
 * =============================================================================================
 */

const { ConverterStandard } = require("./ConverterStandard.js");

const MANU_CODE = 0x117C; // IKEA Manufacturer Code

class Converter_IKEAVALLHORNWirelessMotionSensor extends ConverterStandard {
    static productName = "VALLHORN Wireless Motion Sensor";

    constructor() {
        super();

        this.powerType = "BATTERY";

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
            valueType:   "Numeric"
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
            valueType:   "Numeric"
        };

        // Battery voltage
        this.properties["genPowerCfg"]["batteryVoltage"] = {
            name:        "voltage",
            standard:    false,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Numeric"
        };
    }

    /**
     *  Binding clusters and setting up reporting intervals
     *  CRITICAL: Device must be awake (press button) when this runs!
     */
    async setupReporting(device, coordinatorEndpoint) {
        try {
            const options = { manufacturerCode: MANU_CODE };
            
            // Defines cluster IDs
            const CLUSTER_POWER         = 1;       // genPowerCfg
            const CLUSTER_ILLUMINANCE   = 1024;    // msIlluminanceMeasurement
            const CLUSTER_OCCUPANCY     = 1030;    // msOccupancySensing

            // Helper to find the endpoint that has a specific input cluster
            const getEndpointFor = (clusterId) => {
                return device.endpoints.find(e => e.inputClusters.includes(clusterId));
            };

            // 1. Motion (Occupancy)
            const epMotion = getEndpointFor(CLUSTER_OCCUPANCY);
            if (epMotion) {
                await epMotion.bind("msOccupancySensing", coordinatorEndpoint);
                try {
                    await epMotion.configureReporting("msOccupancySensing", [{
                        attribute: "occupancy",
                        minimumReportInterval: 0,
                        maximumReportInterval: 3600,
                        reportableChange: 0
                    }], options);
                }
                catch (error) {}

                try {
                    await epMotion.read("msOccupancySensing", ["occupancy"], options); 
                }
                catch(error) {}
            }

            // 2. Illuminance
            const epIlluminance = getEndpointFor(CLUSTER_ILLUMINANCE);
            if (epIlluminance) {
                await epIlluminance.bind("msIlluminanceMeasurement", coordinatorEndpoint);
                try {
                    await epIlluminance.configureReporting("msIlluminanceMeasurement", [{
                        attribute: "measuredValue",
                        minimumReportInterval: 10,
                        maximumReportInterval: 3600,
                        reportableChange: 5
                    }], options);
                }
                catch (error) {}

                try {
                    await epIlluminance.read("msIlluminanceMeasurement", ["measuredValue"], options);
                }
                catch (error) {}
            }

            // 3. Battery
            const epPower = getEndpointFor(CLUSTER_POWER);
            if (epPower) {
                await epPower.bind("genPowerCfg", coordinatorEndpoint);
                try {
                    await epPower.configureReporting("genPowerCfg", [
                        { attribute: "batteryPercentageRemaining", minimumReportInterval: 3600, maximumReportInterval: 65000, reportableChange: 1 },
                        { attribute: "batteryVoltage", minimumReportInterval: 3600, maximumReportInterval: 65000, reportableChange: 1 }
                    ], options);
                }
                catch (error) {}
                try {
                    await epPower.read("genPowerCfg", ["batteryPercentageRemaining", "batteryVoltage"], options);
                }
                catch (error) {}
            }
        }
        catch (error) {
            return undefined;
        }
    }

    get(property, anyValue, data = {}) {
        const attributeInfo = this.getClusterAndAttributeByPropertyName(property.name);
        const attribute = attributeInfo ? attributeInfo.attribute : null;

        // In app.js, 'anyValue' argument is actually 'data.type' (e.g. "readResponse").
        // The real value is in 'data' object.
        // We only use data[attribute]. We DO NOT fallback to anyValue because that would use the event type string as value.

        let value = undefined;
        if (attribute && data && data[attribute] !== undefined) {
             value = data[attribute];
        }

        if (property.read === false) {
            return undefined;
        } else {
            if (property.standard === true) {
                return this.getStandard(property, value);
            }
            else {
                if (value === undefined) return undefined;

                switch (property.name) {
                    case "motion":
                         // If value is a string (e.g. "readResponse" - though we filtered that out), it might crash bitwise ops
                         if (typeof value !== "number")
                            return undefined;

                        const isMotion = (value & 1) === 1;
                        return isMotion ? 
                            {"value": "yes", "valueAsNumeric": 1} : 
                            {"value": "no", "valueAsNumeric": 0};

                    case "illuminance":
                        const lux = value === null ? 0 : Math.pow(10, (value - 1) / 10000);
                        const roundedLux = Math.round(lux);
                        return {"value": roundedLux + " lux", "valueAsNumeric": roundedLux};

                    case "battery":
                        const batteryPercent = Math.round(value / 2);
                        return {"value": batteryPercent + "%", "valueAsNumeric": batteryPercent};

                    case "voltage":
                        const voltage = value / 10;
                        return {"value": voltage.toFixed(1) + "V", "valueAsNumeric": voltage};

                    default:
                        return undefined;
                }
            }
        }
    }
}

module.exports = { Converter_IKEAVALLHORNWirelessMotionSensor };