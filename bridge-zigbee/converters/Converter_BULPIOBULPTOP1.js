/**
 * =============================================================================================
 * Converter for the bulp.io bulp.top 1 smart sensor
 * ==================================================
 *
 * Endpoints (as defined in the bulp.top 1 firmware):
 *   EP 1 – msTemperatureMeasurement + msRelativeHumidity  (Temperature + Humidity, AHT20)
 *   EP 2 – msOccupancySensing                             (Presence + Movement, C1001 mmWave radar)
 *   EP 3 – msIlluminanceMeasurement                       (Illuminance in lux, VEML7700)
 *   EP 4 – genAnalogInput / presentValue                  (Fall alarm: 1.0 = fall, 0.0 = normal)
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_BULPIOBULPTOP1 extends ConverterStandard {
    static productName = "bulp.top 1"; // must match ZIGBEE_MODEL in the firmware config.h

    constructor() {
        super();

        this.powerType = "MAINS"; // bulp.top 1 is mains-powered (no battery)

        // EP 1: Temperature (msTemperatureMeasurement, ZigBee unit: 1/100 °C)
        this.properties["msTemperatureMeasurement"] = {};
        this.properties["msTemperatureMeasurement"]["measuredValue"] = {
            name:      "temperature",
            standard:  false,
            notify:    true,
            read:      true,
            write:     false,
            anyValue:  0,
            valueType: "Numeric"
        };

        // EP 1: Humidity (msRelativeHumidity, ZigBee unit: 1/100 %)
        this.properties["msRelativeHumidity"] = {};
        this.properties["msRelativeHumidity"]["measuredValue"] = {
            name:      "humidity",
            standard:  false,
            notify:    true,
            read:      true,
            write:     false,
            anyValue:  0,
            valueType: "Numeric"
        };

        // EP 2: Presence / movement detection (msOccupancySensing, bit 0 = occupied)
        this.properties["msOccupancySensing"] = {};
        this.properties["msOccupancySensing"]["occupancy"] = {
            name:      "presence",
            standard:  false,
            notify:    true,
            read:      true,
            write:     false,
            anyValue:  ["yes", "no"],
            valueType: "Options"
        };

        // EP 3: Illuminance (msIlluminanceMeasurement, ZigBee unit: 10000 * log10(lux) + 1)
        this.properties["msIlluminanceMeasurement"] = {};
        this.properties["msIlluminanceMeasurement"]["measuredValue"] = {
            name:      "illuminance",
            standard:  false,
            notify:    true,
            read:      true,
            write:     false,
            anyValue:  0,
            valueType: "Numeric"
        };

        // EP 4: Fall alarm (genAnalogInput, presentValue: 1.0 = fall detected, 0.0 = normal)
        this.properties["genAnalogInput"] = {};
        this.properties["genAnalogInput"]["presentValue"] = {
            name:      "fall",
            standard:  false,
            notify:    true,
            read:      true,
            write:     false,
            anyValue:  ["yes", "no"],
            valueType: "Options"
        };
    }

    /**
     * Bind clusters to the coordinator endpoint and configure ZigBee attribute reporting.
     * Called automatically by the bridge when the device connects.
     * Reporting intervals and tolerances mirror the values in firmware config.h.
     * @param {Object} device              - The zigbee-herdsman device object.
     * @param {Object} coordinatorEndpoint - Coordinator endpoint to bind to.
     */
    async setupReporting(device, coordinatorEndpoint) {
        // Find endpoints by their firmware-defined IDs (see EP_* defines in zigbee_connection.h)
        const epTempHum     = device.endpoints.find(ep => ep.ID === 1); // temperature + humidity
        const epOccupancy   = device.endpoints.find(ep => ep.ID === 2); // presence/movement
        const epIlluminance = device.endpoints.find(ep => ep.ID === 3); // illuminance
        const epFall        = device.endpoints.find(ep => ep.ID === 4); // fall alarm

        // EP 1: Temperature — firmware tolerance: 0.5°C → 50 ZigBee units (1/100 °C)
        if (epTempHum) {
            await epTempHum.bind("msTemperatureMeasurement", coordinatorEndpoint);
            await this.safeConfigureReporting(epTempHum, "msTemperatureMeasurement", [{
                attribute:               "measuredValue",
                minimumReportInterval:   30,
                maximumReportInterval:   120,
                reportableChange:        50
            }]);

            // EP 1: Humidity — firmware tolerance: 2.0% → 200 ZigBee units (1/100 %)
            await epTempHum.bind("msRelativeHumidity", coordinatorEndpoint);
            await this.safeConfigureReporting(epTempHum, "msRelativeHumidity", [{
                attribute:               "measuredValue",
                minimumReportInterval:   30,
                maximumReportInterval:   120,
                reportableChange:        200
            }]);
        }

        // EP 2: Presence — event-based (report on every state change)
        if (epOccupancy) {
            await epOccupancy.bind("msOccupancySensing", coordinatorEndpoint);
            await this.safeConfigureReporting(epOccupancy, "msOccupancySensing", [{
                attribute:               "occupancy",
                minimumReportInterval:   0,
                maximumReportInterval:   120,
                reportableChange:        0
            }]);
        }

        // EP 3: Illuminance — firmware tolerance: 50 ZigBee illuminance units
        if (epIlluminance) {
            await epIlluminance.bind("msIlluminanceMeasurement", coordinatorEndpoint);
            await this.safeConfigureReporting(epIlluminance, "msIlluminanceMeasurement", [{
                attribute:               "measuredValue",
                minimumReportInterval:   30,
                maximumReportInterval:   120,
                reportableChange:        50
            }]);
        }

        // EP 4: Fall alarm — event-based (report on change between 0.0 and 1.0)
        if (epFall) {
            await epFall.bind("genAnalogInput", coordinatorEndpoint);
            await this.safeConfigureReporting(epFall, "genAnalogInput", [{
                attribute:               "presentValue",
                minimumReportInterval:   0,
                maximumReportInterval:   120,
                reportableChange:        0.5
            }]);
        }
    }

    /**
     * Convert a raw ZigBee attribute value to a normalised property value.
     * @param {Object} property  - Property definition from the constructor.
     * @param {string} anyValue  - data.type from the bridge (e.g. "attributeReport"). NOT the sensor value.
     * @param {Object} data      - data.data from the bridge (the ZigBee attribute payload, e.g. { measuredValue: 2150 }).
     * @returns {Object|undefined} { value, valueAsNumeric } or undefined when the property is not readable.
     */
    get(property, anyValue, data = {}) {
        // Look up the ZigBee attribute name for this property (e.g. "measuredValue", "occupancy")
        const attributeInfo = this.getClusterAndAttributeByPropertyName(property.name);
        const attribute     = attributeInfo ? attributeInfo.attribute : null;

        // Extract the raw sensor value from the attribute payload
        let value = undefined;
        if (attribute && data && data[attribute] !== undefined) {
            value = data[attribute];
        }

        if (property.read === false) {
            return undefined;
        }

        if (property.standard === true) {
            return this.getStandard(property, value);
        }

        if (value === undefined) {
            return undefined;
        }

        switch (property.name) {
            case "temperature": {
                // ZigBee unit: 1/100 °C — divide by 100 to get degrees Celsius
                const celsius = value / 100;
                return { "value": celsius.toFixed(1) + " °C", "valueAsNumeric": celsius };
            }
            case "humidity": {
                // ZigBee unit: 1/100 % — divide by 100 to get percent
                const percent = value / 100;
                return { "value": percent.toFixed(1) + " %", "valueAsNumeric": percent };
            }
            case "presence": {
                // ZigBee occupancy bitmap: bit 0 = 1 means occupied (presence or movement detected)
                const occupied = typeof value === "number" ? (value & 1) === 1 : false;
                return occupied
                    ? { "value": "yes", "valueAsNumeric": 1 }
                    : { "value": "no",  "valueAsNumeric": 0 };
            }
            case "illuminance": {
                // ZigBee illuminance = 10000 * log10(lux) + 1 — reverse formula to recover lux
                const lux = value > 0 ? Math.round(Math.pow(10, (value - 1) / 10000)) : 0;
                return { "value": lux + " lux", "valueAsNumeric": lux };
            }
            case "fall": {
                // genAnalogInput presentValue: 1.0 = fall alarm, 0.0 = normal
                const alarm = value >= 1.0;
                return alarm
                    ? { "value": "yes", "valueAsNumeric": 1 }
                    : { "value": "no",  "valueAsNumeric": 0 };
            }
            default:
                return undefined;
        }
    }
}

module.exports = { Converter_BULPIOBULPTOP1 };
