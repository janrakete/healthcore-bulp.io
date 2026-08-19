/**
 * =============================================================================================
 * Converter for the eWeLink MS01 device
 * =====================================
 */
const { ConverterStandard } = require("./ConverterStandard.js");

class Converter_EWELINKMS01 extends ConverterStandard {
    static productName = "MS01";

    constructor() {
        super();

        this.powerType  = "BATTERY";
        this.vendorName = "eWeLink";

        this.properties["ssIasZone"] = {};
        this.properties["ssIasZone"]["motion"] = {
            name:               "motion",
            reportingInclude:   true,
            reportingRole:      "activity",
            standard:           false,
            notify:             true,
            read:               true,
            write:              false,
            anyValue:           ["yes", "no"],
            valueType:          "Options"
        };

        // Battery reporting also serves as a periodic heartbeat, since this IAS Zone device otherwise only reports on motion changes.
        this.properties["genPowerCfg"] = {};
        this.properties["genPowerCfg"]["batteryPercentageRemaining"] = {
            name:               "battery",
            reportingInclude:   false,
            reportingRole:      "actuator",
            standard:           false,
            notify:             true,
            read:               true,
            write:              false,
            anyValue:           0,
            valueType:          "Numeric"
        };

        this.properties["genPowerCfg"]["batteryVoltage"] = {
            name:               "voltage",
            reportingInclude:   false,
            reportingRole:      "actuator",
            standard:           false,
            notify:             true,
            read:               true,
            write:              false,
            anyValue:           0,
            valueType:          "Numeric"
        };
    }

    async setupReporting(device, coordinatorEndpoint) {
        try {
            const endpoint = this.getEndpointByInputCluster(device, 1280); // 1280 = ssIasZone
            if (!endpoint) {
                return;
            }

            await this.safeBind(endpoint, "ssIasZone", coordinatorEndpoint);

            const coordinatorAddress = coordinatorEndpoint.deviceIeeeAddress || (coordinatorEndpoint.device && coordinatorEndpoint.device.ieeeAddr);
            if (coordinatorAddress) {
                await this.safeWrite(endpoint, "ssIasZone", {
                    iasCieAddr: coordinatorAddress
                });
            }

            // Not all firmware variants need this command.
            await this.safeCommand(endpoint, "ssIasZone", "enrollResponse", {
                enrollrspcode: 0,
                zoneid: 1
            });

            // Battery reporting (~1h to ~18h) gives the watchdog periodic traffic to see, independent of motion activity.
            const endpointPower = this.getEndpointByInputCluster(device, 1); // 1 = genPowerCfg
            if (endpointPower) {
                await this.safeBind(endpointPower, "genPowerCfg", coordinatorEndpoint);
                await this.safeConfigureReporting(endpointPower, "genPowerCfg", [
                    { attribute: "batteryPercentageRemaining", minimumReportInterval: 3600, maximumReportInterval: 65000, reportableChange: 1 },
                    { attribute: "batteryVoltage", minimumReportInterval: 3600, maximumReportInterval: 65000, reportableChange: 1 }
                ]);
                await this.safeRead(endpointPower, "genPowerCfg", ["batteryPercentageRemaining", "batteryVoltage"]);
            }
        }
        catch (error) {
            return undefined;
        }
    }

    get(property, anyValue, data) {
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.standard === true) { // if standard property then use common converter
                return (this.getStandard(property, anyValue));
            }
            else {
                switch (property.name) {
                    case "motion":
                        switch (anyValue) {
                            case "commandStatusChangeNotification":
                                return data.zonestatus === 1 ? {"value": "yes", "valueAsNumeric": 1} : {"value": "no", "valueAsNumeric": 0};
                            default:
                                return {"value" : "no", "valueAsNumeric": 0};
                        }
                    case "battery":
                        if (data.batteryPercentageRemaining === undefined) {
                            return undefined;
                        }
                        const batteryPercent = Math.round(data.batteryPercentageRemaining / 2); // ZigBee reports battery in half-percent units
                        return {"value": batteryPercent + "%", "valueAsNumeric": batteryPercent};
                    case "voltage":
                        if (data.batteryVoltage === undefined) {
                            return undefined;
                        }
                        const voltage = data.batteryVoltage / 10; // ZigBee reports voltage in 100mV units
                        return {"value": voltage.toFixed(1) + "V", "valueAsNumeric": voltage};
                    default:
                        return undefined;
                }
            }
        }
    }
}

module.exports = { Converter_EWELINKMS01 };