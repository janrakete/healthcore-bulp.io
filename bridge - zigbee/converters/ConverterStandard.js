/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
 */

const appConfig       = require("../../config");
const common          = require("../../common");

/**
 * ConverterStandard class provides basic functionality for converting properties of Zigbee devices that follow the standard clusters and attributes.
 * It includes methods to retrieve properties by cluster or attribute name, and to convert values for standard properties.   
 * @class ConverterStandard
 * @description This class is designed to handle standard Zigbee properties, such as zclVersion, manufacturerName, and modelId, and provides a framework for extending functionality for specific devices by subclassing. 
 */
class ConverterStandard {
    constructor() { 
        this.properties = {};

        // =============================================================================================
        // General Basic Cluster (0x0000) - Device Information
        // =============================================================================================
        this.properties["genBasic"] = {};
        
        // Version of the Zigbee Cluster Library (ZCL) specification used by the device
        this.properties["genBasic"]["zclVersion"] = {
            name:        "zclVersion",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Human-readable manufacturer name string (e.g., "Philips", "IKEA")
        this.properties["genBasic"]["manufacturerName"] = {
            name:        "manufacturerName",
            standard:    true,            
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };
        
        // Model identifier string that uniquely identifies the product (e.g., "RWL021")
        this.properties["genBasic"]["modelId"] = {
            name:        "modelNumber",
            standard:    true,            
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };

        // Human-readable device name (e.g., "Living Room Light")
        this.properties["genBasic"]["deviceName"] = {
            name:        "deviceName",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "String"
        };

        // Application software version number running on the device
        this.properties["genBasic"]["appVersion"] = {
            name:        "appVersion",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Version of the Zigbee protocol stack implementation
        this.properties["genBasic"]["stackVersion"] = {
            name:        "stackVersion",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Hardware version number of the device
        this.properties["genBasic"]["hwVersion"] = {
            name:        "hardwareRevision",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };

        // Manufacturing date code string (format varies by manufacturer)
        this.properties["genBasic"]["dateCode"] = {
            name:        "dateCode",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };

        // Software build identifier string for the firmware version
        this.properties["genBasic"]["swBuildId"] = {
            name:        "firmwareRevision",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };

        // Software revision string
        this.properties["genBasic"]["softwareRevision"] = {
            name:        "softwareRevision",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };

        // Serial number for this particular device instance
        this.properties["genBasic"]["serialNumber"] = {
            name:        "serialNumber",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };

        // Power source type (0x00=Unknown, 0x01=Mains single phase, 0x03=Battery, etc.)
        this.properties["genBasic"]["powerSource"] = {
            name:        "powerSource",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // User-settable description of the device's physical location (e.g., "Living Room")
        this.properties["genBasic"]["locationDescription"] = {
            name:        "locationDescription",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "String"
        };

        // Physical environment type where device is installed (0x00=Unknown, 0x01=Indoor, etc.)
        this.properties["genBasic"]["physicalEnvironment"] = {
            name:        "physicalEnvironment",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Whether the device is enabled (true) or disabled (false) for operation
        this.properties["genBasic"]["deviceEnabled"] = {
            name:        "deviceEnabled",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Boolean"
        };

        // Bitmask indicating which alarm conditions are enabled on the device
        this.properties["genBasic"]["alarmMask"] = {
            name:        "alarmMask",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Bitmask to disable local configuration options (e.g., physical buttons)
        this.properties["genBasic"]["disableLocalConfig"] = {
            name:        "disableLocalConfig",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Manufacturer's product code or SKU identifier
        this.properties["genBasic"]["productCode"] = {
            name:        "productCode",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };

        // URL pointing to product information or support page
        this.properties["genBasic"]["productUrl"] = {
            name:        "productUrl",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };

        // Generic device class identifier (e.g., 0x00=Lighting)
        this.properties["genBasic"]["genericDeviceClass"] = {
            name:        "genericDeviceClass",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Generic device type identifier within the device class
        this.properties["genBasic"]["genericDeviceType"] = {
            name:        "genericDeviceType",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Revision number of the cluster specification implemented
        this.properties["genBasic"]["clusterRevision"] = {
            name:        "clusterRevision",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Status of attribute reporting configuration (0x00=Pending, 0x01=Complete, etc.)
        this.properties["genBasic"]["attributeReportingStatus"] = {
            name:        "attributeReportingStatus",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Power Configuration Cluster (0x0001) - Battery and Power Information
        // =============================================================================================
        this.properties["genPowerCfg"] = {};
        
        // Current battery voltage in 100mV units (e.g., 30 = 3.0V)
        this.properties["genPowerCfg"]["batteryVoltage"] = {
            name:        "batteryVoltage",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Remaining battery percentage (0-200, where 200 = 100%, 0 = 0%)
        this.properties["genPowerCfg"]["batteryPercentageRemaining"] = {
            name:        "batteryLevel",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Physical size of battery (0x00=No battery, 0x01=Built-in, 0x02=Other, 0x03=AA, 0x04=AAA, etc.)
        this.properties["genPowerCfg"]["batterySize"] = {
            name:        "batterySize",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Number of batteries installed in the device
        this.properties["genPowerCfg"]["batteryQuantity"] = {
            name:        "batteryQuantity",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Rated voltage of the battery in 100mV units (e.g., 15 = 1.5V for AA battery)
        this.properties["genPowerCfg"]["batteryRatedVoltage"] = {
            name:        "batteryRatedVoltage",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Bitmask indicating which battery alarm conditions are enabled
        this.properties["genPowerCfg"]["batteryAlarmMask"] = {
            name:        "batteryAlarmMask",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Minimum voltage threshold in 100mV units that triggers a low battery alarm
        this.properties["genPowerCfg"]["batteryVoltageMinThreshold"] = {
            name:        "batteryVoltageMinThreshold",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Temperature Measurement Cluster (0x0402) - Temperature Sensor Data
        // =============================================================================================
        this.properties["msTemperatureMeasurement"] = {};
        
        // Current measured temperature in hundredths of degrees Celsius (e.g., 2350 = 23.50°C)
        this.properties["msTemperatureMeasurement"]["measuredValue"] = {
            name:        "temperature",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Minimum temperature value the sensor can measure (same units as measuredValue)
        this.properties["msTemperatureMeasurement"]["minMeasuredValue"] = {
            name:        "temperatureMin",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Maximum temperature value the sensor can measure (same units as measuredValue)
        this.properties["msTemperatureMeasurement"]["maxMeasuredValue"] = {
            name:        "temperatureMax",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Relative Humidity Measurement Cluster (0x0405) - Humidity Sensor Data
        // =============================================================================================
        this.properties["msRelativeHumidity"] = {};
        
        // Current measured relative humidity in hundredths of percent (e.g., 4500 = 45.00%)
        this.properties["msRelativeHumidity"]["measuredValue"] = {
            name:        "humidity",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Minimum humidity value the sensor can measure (same units as measuredValue)
        this.properties["msRelativeHumidity"]["minMeasuredValue"] = {
            name:        "humidityMin",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Maximum humidity value the sensor can measure (same units as measuredValue)
        this.properties["msRelativeHumidity"]["maxMeasuredValue"] = {
            name:        "humidityMax",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Pressure Measurement Cluster (0x0403) - Pressure Sensor Data
        // =============================================================================================
        this.properties["msPressureMeasurement"] = {};
        
        // Current measured pressure in kilopascals (kPa)
        this.properties["msPressureMeasurement"]["measuredValue"] = {
            name:        "pressure",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Minimum pressure value the sensor can measure
        this.properties["msPressureMeasurement"]["minMeasuredValue"] = {
            name:        "pressureMin",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Maximum pressure value the sensor can measure
        this.properties["msPressureMeasurement"]["maxMeasuredValue"] = {
            name:        "pressureMax",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // On/Off Cluster (0x0006) - Binary Switch Control
        // =============================================================================================
        this.properties["genOnOff"] = {};
        
        // Current on/off state of the device (false=OFF, true=ON)
        this.properties["genOnOff"]["onOff"] = {
            name:        "onOff",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Boolean"
        };

        // Global scene control enabled/disabled (affects scene recall behavior)
        this.properties["genOnOff"]["globalSceneCtrl"] = {
            name:        "globalSceneCtrl",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Boolean"
        };

        // Time in 1/10ths of a second that the device remains on when commanded (0=disabled)
        this.properties["genOnOff"]["onTime"] = {
            name:        "onTime",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Time in 1/10ths of a second to wait before turning off after onTime expires (0xFFFF=don't turn off)
        this.properties["genOnOff"]["offWaitTime"] = {
            name:        "offWaitTime",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Level Control Cluster (0x0008) - Dimming and Level Control
        // =============================================================================================
        this.properties["genLevelCtrl"] = {};
        
        // Current level/brightness value (0=minimum, 254=maximum, 255=invalid)
        this.properties["genLevelCtrl"]["currentLevel"] = {
            name:        "currentLevel",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Time in 1/10ths of a second for a level change to complete (0=instant, 0xFFFF=use default)
        this.properties["genLevelCtrl"]["onOffTransitionTime"] = {
            name:        "onOffTransitionTime",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Default level to move to when device is turned on (0x00=use previous, 0xFF=use onLevel)
        this.properties["genLevelCtrl"]["onLevel"] = {
            name:        "onLevel",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Color Control Cluster (0x0300) - Color Temperature and RGB Control
        // =============================================================================================
        this.properties["lightingColorCtrl"] = {};
        
        // Current color temperature in mireds (1,000,000/Kelvin, e.g., 250 = 4000K)
        this.properties["lightingColorCtrl"]["colorTemperature"] = {
            name:        "colorTemperature",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current color mode (0x00=Hue/Sat, 0x01=XY, 0x02=Color Temperature)
        this.properties["lightingColorCtrl"]["colorMode"] = {
            name:        "colorMode",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current hue value (0-254 representing 0-360 degrees on color wheel)
        this.properties["lightingColorCtrl"]["currentHue"] = {
            name:        "currentHue",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current saturation value (0=white, 254=fully saturated color)
        this.properties["lightingColorCtrl"]["currentSaturation"] = {
            name:        "currentSaturation",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current X coordinate in CIE 1931 color space (0-65535, 0x0000=0.0, 0xFEFF=1.0)
        this.properties["lightingColorCtrl"]["currentX"] = {
            name:        "currentX",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current Y coordinate in CIE 1931 color space (0-65535, 0x0000=0.0, 0xFEFF=1.0)
        this.properties["lightingColorCtrl"]["currentY"] = {
            name:        "currentY",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Illuminance Measurement Cluster (0x0400) - Light Sensor Data
        // =============================================================================================
        this.properties["msIlluminanceMeasurement"] = {};
        
        // Current measured illuminance in lux (0-65535, 0xFFFF=invalid/too high)
        this.properties["msIlluminanceMeasurement"]["measuredValue"] = {
            name:        "illuminance",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Minimum illuminance value the sensor can measure
        this.properties["msIlluminanceMeasurement"]["minMeasuredValue"] = {
            name:        "illuminanceMin",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Maximum illuminance value the sensor can measure
        this.properties["msIlluminanceMeasurement"]["maxMeasuredValue"] = {
            name:        "illuminanceMax",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Occupancy Sensing Cluster (0x0406) - Motion/Presence Detection
        // =============================================================================================
        this.properties["msOccupancySensing"] = {};
        
        // Occupancy state bitmask (bit 0: occupied=1/unoccupied=0)
        this.properties["msOccupancySensing"]["occupancy"] = {
            name:        "occupancy",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Type of occupancy sensor (0x00=PIR, 0x01=Ultrasonic, 0x02=PIR+Ultrasonic, 0x03=Physical contact)
        this.properties["msOccupancySensing"]["occupancySensorType"] = {
            name:        "occupancySensorType",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Delay time in seconds before reporting unoccupied state after no detection
        this.properties["msOccupancySensing"]["pirOToUDelay"] = {
            name:        "pirOToUDelay",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // IAS Zone Cluster (0x0500) - Security Sensors (Motion, Contact, Water, Smoke, etc.)
        // =============================================================================================
        this.properties["ssIasZone"] = {};
        
        // Zone state bitmask (bit 0: alarm1, bit 1: alarm2, bit 2: tamper, bit 3: battery low, etc.)
        this.properties["ssIasZone"]["zoneState"] = {
            name:        "zoneState",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Type of IAS zone (0x000D=Motion, 0x0015=Contact, 0x0028=Fire, 0x002A=Water, 0x002B=CO, 0x002C=Personal emergency, etc.)
        this.properties["ssIasZone"]["zoneType"] = {
            name:        "zoneType",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current zone status bitmask (bit 0: alarm1, bit 1: alarm2, bit 2: tamper, bit 3: battery, bit 4: supervision reports, bit 5: restore reports, bit 6: trouble, bit 7: AC mains)
        this.properties["ssIasZone"]["zoneStatus"] = {
            name:        "zoneStatus",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // IEEE address of the CIE (Control and Indicating Equipment) device that manages this zone
        this.properties["ssIasZone"]["iasCieAddr"] = {
            name:        "iasCieAddr",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "String"
        };

        // Zone ID assigned by the CIE to this zone (0-255)
        this.properties["ssIasZone"]["zoneId"] = {
            name:        "zoneId",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Number of zone enrollment methods supported by the device
        this.properties["ssIasZone"]["numberOfZoneSensitivityLevelsSupported"] = {
            name:        "numberOfZoneSensitivityLevelsSupported",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current sensitivity level of the zone sensor (0=low sensitivity, higher numbers=more sensitive)
        this.properties["ssIasZone"]["currentZoneSensitivityLevel"] = {
            name:        "currentZoneSensitivityLevel",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Door Lock Cluster (0x0101) - Smart Lock Control
        // =============================================================================================
        this.properties["closuresDoorLock"] = {};
        
        // Current lock state (0x00=Not fully locked, 0x01=Locked, 0x02=Unlocked, 0xFF=Undefined)
        this.properties["closuresDoorLock"]["lockState"] = {
            name:        "lockState",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Type of lock (0x00=Dead bolt, 0x01=Magnetic, 0x02=Other, etc.)
        this.properties["closuresDoorLock"]["lockType"] = {
            name:        "lockType",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Whether the lock is actuator enabled (can be controlled electronically)
        this.properties["closuresDoorLock"]["actuatorEnabled"] = {
            name:        "actuatorEnabled",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Boolean"
        };

        // Current door state (0x00=Open, 0x01=Closed, 0x02=Error jammed, 0x03=Forced open, 0xFF=Undefined)
        this.properties["closuresDoorLock"]["doorState"] = {
            name:        "doorState",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Number of times the door has been locked since last reset
        this.properties["closuresDoorLock"]["lockStateEvts"] = {
            name:        "lockStateEvts",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Auto relock time in seconds (0=disabled, 1-65534=seconds before auto-lock)
        this.properties["closuresDoorLock"]["autoRelockTime"] = {
            name:        "autoRelockTime",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Thermostat Cluster (0x0201) - HVAC Temperature Control
        // =============================================================================================
        this.properties["hvacThermostat"] = {};
        
        // Current local temperature in hundredths of degrees Celsius (e.g., 2150 = 21.50°C)
        this.properties["hvacThermostat"]["localTemp"] = {
            name:        "localTemp",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Occupied cooling setpoint temperature in hundredths of degrees Celsius
        this.properties["hvacThermostat"]["occupiedCoolingSetpoint"] = {
            name:        "occupiedCoolingSetpoint",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Occupied heating setpoint temperature in hundredths of degrees Celsius
        this.properties["hvacThermostat"]["occupiedHeatingSetpoint"] = {
            name:        "occupiedHeatingSetpoint",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current system mode (0x00=Off, 0x01=Auto, 0x03=Cool, 0x04=Heat, 0x05=Emergency heating, 0x06=Precooling, 0x07=Fan only, 0x08=Dry, 0x09=Sleep)
        this.properties["hvacThermostat"]["systemMode"] = {
            name:        "systemMode",
            standard:    true,
            notify:      false,
            read:        true,
            write:       true,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current thermostat running mode (0x00=Off, 0x03=Cool, 0x04=Heat)
        this.properties["hvacThermostat"]["runningMode"] = {
            name:        "runningMode",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current thermostat running state bitmap (bit 0=Heat on, bit 1=Cool on, bit 2=Fan on, bit 3=Heat 2nd stage on, bit 4=Cool 2nd stage on, bit 5=Fan 2nd stage on, bit 6=Fan 3rd stage on)
        this.properties["hvacThermostat"]["runningState"] = {
            name:        "runningState",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Electrical Measurement Cluster (0x0B04) - Power Monitoring
        // =============================================================================================
        this.properties["haElectricalMeasurement"] = {};
        
        // Active power being consumed in watts (signed, can be negative for power generation)
        this.properties["haElectricalMeasurement"]["activePower"] = {
            name:        "activePower",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // RMS voltage in volts (AC voltage measurement)
        this.properties["haElectricalMeasurement"]["rmsVoltage"] = {
            name:        "rmsVoltage",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // RMS current in amperes
        this.properties["haElectricalMeasurement"]["rmsCurrent"] = {
            name:        "rmsCurrent",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Apparent power in volt-amperes (VA)
        this.properties["haElectricalMeasurement"]["apparentPower"] = {
            name:        "apparentPower",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Power factor as a percentage (0-100, where 100 = 1.0 power factor, signed)
        this.properties["haElectricalMeasurement"]["powerFactor"] = {
            name:        "powerFactor",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // =============================================================================================
        // Window Covering Cluster (0x0102) - Blinds, Shades, Shutters Control
        // =============================================================================================
        this.properties["closuresWindowCovering"] = {};
        
        // Type of window covering (0x00=Rollershade, 0x01=Rollershade 2 motor, 0x02=Rollershade exterior, 0x03=Rollershade exterior 2 motor, 0x04=Drapery, 0x05=Awning, 0x06=Shutter, 0x07=Tilt blind lift only, 0x08=Tilt blind tilt only, 0x09=Tilt blind lift and tilt)
        this.properties["closuresWindowCovering"]["windowCoveringType"] = {
            name:        "windowCoveringType",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current lift position as percentage (0=fully open, 100=fully closed)
        this.properties["closuresWindowCovering"]["currentPositionLiftPercentage"] = {
            name:        "currentPositionLiftPercentage",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Current tilt position as percentage (0=fully open, 100=fully closed)
        this.properties["closuresWindowCovering"]["currentPositionTiltPercentage"] = {
            name:        "currentPositionTiltPercentage",
            standard:    true,
            notify:      true,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        // Configuration/status bitmap (bit 0=Operational, bit 1=Online, bit 2=Commands reversed, bit 3=Lift control closed loop, bit 4=Tilt control closed loop, bit 5=Lift encoder controlled, bit 6=Tilt encoder controlled)
        this.properties["closuresWindowCovering"]["configStatus"] = {
            name:        "configStatus",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };
    }

    /**
     *  Binding clusters and setting up reporting intervals
     * @param {Object} endpoint - The device endpoint to configure
     * @param {string} cluster - The cluster name to configure reporting for
     * @param {Array} attributes - An array of attribute configuration objects for reporting
     * @param {number} timeout - Optional timeout in milliseconds for the reporting configuration (default is 5000ms)
     * @returns {Promise<void>}
     * @description This method attempts to bind the specified cluster to the coordinator endpoint and configure reporting for the given attributes. It includes error handling to log any issues that occur during the process, including a timeout mechanism to avoid hanging if the device does not respond.
     */
    async safeConfigureReporting(endpoint, cluster, attributes, timeout = appConfig.CONF_zigBeeReportingTimeout) {
        try {
            await Promise.race([
                endpoint.configureReporting(cluster, attributes),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout configuring " + cluster)), timeout)
                )
            ]);
            common.conLog("Reporting for " + cluster + " configured.", "gre");
        } catch (error) {
            common.conLog("Reporting setup for " + cluster + " failed: " + error.message, "red");
        }
    }

    /**
     * Get property by its name.
     * @param {string} name - The name of the property to retrieve.
     * @returns {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns the property object; otherwise, it returns undefined
     */
    getPropertyByPropertyName(name) {
        for (const [clusterName, attributes] of Object.entries(this.properties)) {
            for (const [attributeName, property] of Object.entries(attributes)) {
                if (property.name === name) {
                    // Return a new object with cluster and attribute added, without mutating the original
                    return { ...property, cluster: clusterName, attribute: attributeName };
                }
            }
        }
        return undefined;
    }
   
    /**
     * Get property by cluster name.
     * @param {string} cluster - The name of the cluster to retrieve properties from.
     * @returns {Object|undefined} - The properties object for the cluster if found, otherwise undefined.
     * @description This method checks if the properties for the specified cluster exist in the `properties` object. If they do, it returns the properties; otherwise, it returns undefined.
     */
    getPropertyByClusterName(cluster) {   
        if (this.properties[cluster] === undefined) {
            return undefined;
        }   
        else {
            return this.properties[cluster];
        }
    }

    /**
     * Get property by attribute name.
     * @param {string} name - The name of the attribute to retrieve.
     * @returns {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any attribute's name matches the provided name. If found, it returns the property object; otherwise, it returns undefined.
     */
    getPropertyByAttributeName(name) {
        for (const [clusterName, attributes] of Object.entries(this.properties)) {
            for (const [attributeName, property] of Object.entries(attributes)) {
                if (attributeName === name) {
                    return property;
                }
            }
        }
        return undefined;
    }

    /**
     * Get cluster by property name.
     * @param {string} name - The name of the property to search for.
     * @returns {string|undefined} - The name of the cluster if the property is found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns the cluster name; otherwise, it returns undefined.
     */
    getClusterByPropertyName(name) {
        for (const [cluster, properties] of Object.entries(this.properties)) {
            for (const property of Object.values(properties)) {
                if (property.name === name) {
                    return cluster;
                }
            }
        }
        return undefined;
    }

    /**
     * Get cluster and attribute by property name.
     * @param {string} name - The name of the property to search for.
     * @returns {Object|undefined} - An object containing the cluster and attribute names if the property is found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns an object with the cluster and attribute names; otherwise, it returns undefined.
     */
    getClusterAndAttributeByPropertyName(name) {
        for (const [clusterName, properties] of Object.entries(this.properties)) {
            for (const [attribute, property] of Object.entries(properties)) {
                if (property.name === name) {
                    return { cluster: clusterName, attribute: attribute };
                }
            }
        }
        return undefined;
    }

    /**
     * Converts a value for a standard property.
     * @param {Object} property - The property object containing metadata about the property.
     * @param {any} anyValue - The value to convert.
     * @returns {any|undefined} - The converted value if the property is readable, otherwise undefined.
     * @description This method checks if the property is readable. If it is, it converts the value based on the property's valueType. Handles String, Integer, and Boolean types appropriately.
     */
    getStandard(property, anyValue) {  
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.valueType === "String") {
                return { "value": anyValue, "valueAsNumeric": undefined };
            }
            else if (property.valueType === "Boolean") {
                return { "value": anyValue ? true : false, "valueAsNumeric": anyValue ? 1 : 0 };
            }
            else {
                // Integer or other numeric types
                return { "value": anyValue, "valueAsNumeric": anyValue };
            }
        }
    }    
}

module.exports = { ConverterStandard };