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
                    default:
                        return undefined;
                }
            }
        }
    }
}

module.exports = { Converter_EWELINKMS01 };