/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
 */

/**
 * ConverterStandard class provides basic functionality for converting properties of Bluetooth devices that follow the standard UUIDs.
 * It includes methods to retrieve properties by UUID or name, and to convert values for standard properties.   
 * @class ConverterStandard
 * @description This class is designed to handle standard Bluetooth properties, such as device name, and provides a framework for extending functionality for specific devices by subclassing.
 */
class ConverterStandard {
    constructor() { 
        this.properties = {};

        // =============================================================================================
        // Generic Access Profile (GAP) - Device Information
        // =============================================================================================

        // Human-readable name of the device (e.g., "Heart Rate Monitor")
        this.properties["2a00"] = {
            name:       "deviceName",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // External appearance of device (16-bit value indicating device type/icon)
        this.properties["2a01"] = {
            name:       "appearance",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Preferred connection settings
        this.properties["2a04"] = {
            name:       "peripheralPreferredConnectionParameters",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Whether device supports address resolution
        this.properties["2aa6"] = {
            name:       "centralAddressResolution",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // =============================================================================================
        // Device Information Service - Manufacturer and Hardware Details
        // =============================================================================================

        // Name of the manufacturer (e.g., "Apple Inc.")
        this.properties["2a29"] = {
            name:       "manufacturerName",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // Model number string assigned by manufacturer
        this.properties["2a24"] = {
            name:       "modelNumber",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // Serial number for this particular device instance
        this.properties["2a25"] = {
            name:       "serialNumber",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // Hardware revision string
        this.properties["2a27"] = {
            name:       "hardwareRevision",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // Firmware revision string
        this.properties["2a26"] = {
            name:       "firmwareRevision",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // Software revision string
        this.properties["2a28"] = {
            name:       "softwareRevision",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // IEEE 11073-20601 Regulatory Certification Data List structure
        this.properties["2a23"] = {
            name:       "systemId",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Vendor ID, Product ID, and Product Version
        this.properties["2a50"] = {
            name:       "pnpId",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // =============================================================================================
        // Battery Service - Battery Level and Status
        // =============================================================================================

        // Current battery charge level in percentage (0-100)
        this.properties["2a19"] = {
            name:       "batteryLevel",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Battery power state and level status
        this.properties["2a1a"] = {
            name:       "batteryPowerState",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Battery level state (e.g., good, low, critical)
        this.properties["2a1b"] = {
            name:       "batteryLevelState",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // =============================================================================================
        // Heart Rate Service - Heart Rate Monitoring
        // =============================================================================================

        // Heart rate in beats per minute (BPM) with additional data
        this.properties["2a37"] = {
            name:       "heartRateMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Location of the heart rate sensor (e.g., chest, wrist, finger)
        this.properties["2a38"] = {
            name:       "bodySensorLocation",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Control point for heart rate service operations
        this.properties["2a39"] = {
            name:       "heartRateControlPoint",
            standard:   true,
            notify:     false,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // =============================================================================================
        // Environmental Sensing Service - Temperature, Humidity, Pressure
        // =============================================================================================

        // Temperature value in degrees Celsius (sint16, multiply by 0.01)
        this.properties["2a6e"] = {
            name:       "temperature",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "SInt16"
        };

        // Relative humidity percentage (uint16, multiply by 0.01)
        this.properties["2a6f"] = {
            name:       "humidity",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Pressure in pascals (uint32, multiply by 0.1)
        this.properties["2a6d"] = {
            name:       "pressure",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt32"
        };

        // Ultraviolet index measurement (0-11+)
        this.properties["2a76"] = {
            name:       "uvIndex",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Pollen concentration measurement
        this.properties["2a75"] = {
            name:       "pollenConcentration",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Wind direction in degrees
        this.properties["2a73"] = {
            name:       "apparentWindDirection",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Wind speed measurement
        this.properties["2a72"] = {
            name:       "apparentWindSpeed",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Dew point temperature
        this.properties["2a7b"] = {
            name:       "dewPoint",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "SInt8"
        };

        // Elevation/altitude measurement
        this.properties["2a6c"] = {
            name:       "elevation",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "SInt24"
        };

        // Wind gust factor
        this.properties["2a74"] = {
            name:       "gustFactor",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Heat index measurement
        this.properties["2a7a"] = {
            name:       "heatIndex",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "SInt8"
        };

        // Solar irradiance measurement
        this.properties["2a77"] = {
            name:       "irradiance",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Rainfall measurement
        this.properties["2a78"] = {
            name:       "rainfall",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // =============================================================================================
        // Health Thermometer Service - Medical Temperature Measurement
        // =============================================================================================

        // Temperature reading with timestamp and type
        this.properties["2a1c"] = {
            name:       "temperatureMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Location of temperature measurement (e.g., oral, armpit, ear)
        this.properties["2a1d"] = {
            name:       "temperatureType",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Intermediate temperature during measurement
        this.properties["2a1e"] = {
            name:       "intermediateTemperature",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Time between temperature measurements
        this.properties["2a21"] = {
            name:       "measurementInterval",
            standard:   true,
            notify:     true,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // =============================================================================================
        // Blood Pressure Service - Blood Pressure Monitoring
        // =============================================================================================

        // Systolic, diastolic, and mean arterial pressure
        this.properties["2a35"] = {
            name:       "bloodPressureMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of blood pressure device
        this.properties["2a49"] = {
            name:       "bloodPressureFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Intermediate cuff pressure during inflation
        this.properties["2a36"] = {
            name:       "intermediateCuffPressure",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // =============================================================================================
        // Glucose Service - Blood Glucose Monitoring
        // =============================================================================================

        // Glucose concentration measurement
        this.properties["2a18"] = {
            name:       "glucoseMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Additional context for glucose measurement
        this.properties["2a34"] = {
            name:       "glucoseMeasurementContext",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of glucose meter
        this.properties["2a51"] = {
            name:       "glucoseFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Control point for accessing stored records
        this.properties["2a52"] = {
            name:       "recordAccessControlPoint",
            standard:   true,
            notify:     true,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // =============================================================================================
        // Pulse Oximeter Service - SpO2 and Pulse Rate
        // =============================================================================================

        // Spot-check SpO2 and pulse rate measurement
        this.properties["2a5e"] = {
            name:       "plxSpotCheckMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Continuous SpO2 and pulse rate measurement
        this.properties["2a5f"] = {
            name:       "plxContinuousMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of pulse oximeter
        this.properties["2a60"] = {
            name:       "plxFeatures",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // =============================================================================================
        // Weight Scale Service - Body Weight and Composition
        // =============================================================================================

        // Body weight measurement
        this.properties["2a9d"] = {
            name:       "weightMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of weight scale
        this.properties["2a9e"] = {
            name:       "weightScaleFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt32"
        };

        // Body composition data (fat %, muscle mass, etc.)
        this.properties["2a9c"] = {
            name:       "bodyCompositionMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of body composition analyzer
        this.properties["2a9b"] = {
            name:       "bodyCompositionFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt32"
        };

        // =============================================================================================
        // Cycling Power Service - Cycling Power and Cadence
        // =============================================================================================

        // Instantaneous power and cadence
        this.properties["2a63"] = {
            name:       "cyclingPowerMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of power meter
        this.properties["2a65"] = {
            name:       "cyclingPowerFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt32"
        };

        // Control point for power meter operations
        this.properties["2a66"] = {
            name:       "cyclingPowerControlPoint",
            standard:   true,
            notify:     true,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Power vector data (force angle, magnitude)
        this.properties["2a64"] = {
            name:       "cyclingPowerVector",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Location of cycling sensor (e.g., left crank, right crank, wheel)
        this.properties["2a5d"] = {
            name:       "sensorLocation",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // =============================================================================================
        // Running Speed and Cadence Service - Running Metrics
        // =============================================================================================

        // Running speed and cadence measurement
        this.properties["2a53"] = {
            name:       "rscMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of running speed and cadence sensor
        this.properties["2a54"] = {
            name:       "rscFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Control point for speed and cadence sensor
        this.properties["2a55"] = {
            name:       "scControlPoint",
            standard:   true,
            notify:     true,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // =============================================================================================
        // Cycling Speed and Cadence Service - Cycling Metrics
        // =============================================================================================

        // Cycling speed and cadence measurement
        this.properties["2a5b"] = {
            name:       "cscMeasurement",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of cycling speed and cadence sensor
        this.properties["2a5c"] = {
            name:       "cscFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // =============================================================================================
        // Location and Navigation Service - GPS and Navigation
        // =============================================================================================

        // Current location (latitude/longitude) and speed
        this.properties["2a67"] = {
            name:       "locationAndSpeed",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Navigation information (bearing, remaining distance, ETA)
        this.properties["2a68"] = {
            name:       "navigation",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Quality of position data (HDOP, VDOP, satellite count)
        this.properties["2a69"] = {
            name:       "positionQuality",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported features of location and navigation service
        this.properties["2a6a"] = {
            name:       "lnFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt32"
        };

        // Control point for location and navigation operations
        this.properties["2a6b"] = {
            name:       "lnControlPoint",
            standard:   true,
            notify:     true,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // =============================================================================================
        // Current Time Service - Date and Time Information
        // =============================================================================================

        // Current date and time with timezone and DST offset
        this.properties["2a2b"] = {
            name:       "currentTime",
            standard:   true,
            notify:     true,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Time zone and DST offset
        this.properties["2a0f"] = {
            name:       "localTimeInformation",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Source and accuracy of time information
        this.properties["2a14"] = {
            name:       "referenceTimeInformation",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Time with daylight saving time offset
        this.properties["2a11"] = {
            name:       "timeWithDst",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Time zone offset from UTC
        this.properties["2a0e"] = {
            name:       "timeZone",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "SInt8"
        };

        // Daylight saving time offset
        this.properties["2a0d"] = {
            name:       "dstOffset",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Accuracy of time information
        this.properties["2a12"] = {
            name:       "timeAccuracy",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Source of time information (e.g., manual, GPS, cellular)
        this.properties["2a13"] = {
            name:       "timeSource",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // =============================================================================================
        // Automation IO Service - Digital and Analog I/O
        // =============================================================================================

        // State of digital input
        this.properties["2a56"] = {
            name:       "digitalInput",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // State of digital output
        this.properties["2a57"] = {
            name:       "digitalOutput",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Value of analog input
        this.properties["2a58"] = {
            name:       "analogInput",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Value of analog output
        this.properties["2a59"] = {
            name:       "analogOutput",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // =============================================================================================
        // Alert Notification Service - Phone Notifications
        // =============================================================================================

        // Type of alert (email, SMS, call, etc.)
        this.properties["2a43"] = {
            name:       "alertCategoryId",
            standard:   true,
            notify:     false,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Supported alert categories
        this.properties["2a42"] = {
            name:       "alertCategoryIdBitMask",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // New alert notification
        this.properties["2a46"] = {
            name:       "newAlert",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Number of unread alerts
        this.properties["2a45"] = {
            name:       "unreadAlertStatus",
            standard:   true,
            notify:     true,
            read:       false,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Control point for alert notifications
        this.properties["2a44"] = {
            name:       "alertNotificationControlPoint",
            standard:   true,
            notify:     false,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Categories supported for new alerts
        this.properties["2a47"] = {
            name:       "supportedNewAlertCategory",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Categories supported for unread alerts
        this.properties["2a48"] = {
            name:       "supportedUnreadAlertCategory",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // =============================================================================================
        // Phone Alert Status Service - Incoming Call Alerts
        // =============================================================================================

        // Current alert status (ringer, vibrate, display)
        this.properties["2a3f"] = {
            name:       "alertStatus",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Current ringer setting (silent, normal)
        this.properties["2a41"] = {
            name:       "ringerSetting",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Control point for ringer operations
        this.properties["2a40"] = {
            name:       "ringerControlPoint",
            standard:   true,
            notify:     false,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // =============================================================================================
        // User Data Service - User Profile Information
        // =============================================================================================

        // User's first name
        this.properties["2a8a"] = {
            name:       "firstName",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // User's last name
        this.properties["2a90"] = {
            name:       "lastName",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // User's email address
        this.properties["2a87"] = {
            name:       "emailAddress",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // User's age in years
        this.properties["2a80"] = {
            name:       "age",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // User's date of birth
        this.properties["2a85"] = {
            name:       "dateOfBirth",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // User's gender (0=Male, 1=Female, 2=Unspecified)
        this.properties["2a8c"] = {
            name:       "gender",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // User's weight in kilograms (uint16, multiply by 0.005)
        this.properties["2a98"] = {
            name:       "weight",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // User's height in meters (uint16, multiply by 0.01)
        this.properties["2a8e"] = {
            name:       "height",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // Maximum oxygen uptake
        this.properties["2a96"] = {
            name:       "vo2Max",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Maximum heart rate
        this.properties["2a8d"] = {
            name:       "maxHeartRate",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Resting heart rate
        this.properties["2a92"] = {
            name:       "restingHeartRate",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Maximum recommended heart rate for exercise
        this.properties["2a91"] = {
            name:       "maximumRecommendedHeartRate",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Aerobic threshold heart rate
        this.properties["2a7f"] = {
            name:       "aerobicThreshold",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Anaerobic threshold heart rate
        this.properties["2a83"] = {
            name:       "anaerobicThreshold",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Lower limit for fat burning zone
        this.properties["2a88"] = {
            name:       "fatBurnHeartRateLowerLimit",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // Upper limit for fat burning zone
        this.properties["2a89"] = {
            name:       "fatBurnHeartRateUpperLimit",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };

        // User's preferred language
        this.properties["2aa2"] = {
            name:       "language",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // =============================================================================================
        // Bond Management Service - Bonding and Pairing
        // =============================================================================================

        // Control point for bond management operations
        this.properties["2aa4"] = {
            name:       "bondManagementControlPoint",
            standard:   true,
            notify:     false,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Supported bond management features
        this.properties["2aa5"] = {
            name:       "bondManagementFeature",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // =============================================================================================
        // HTTP Proxy Service - HTTP Operations over BLE
        // =============================================================================================

        // Uniform Resource Identifier
        this.properties["2ab6"] = {
            name:       "uri",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // HTTP request/response headers
        this.properties["2ab7"] = {
            name:       "httpHeaders",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "String",
            dataFormat: "String"
        };

        // HTTP response status code
        this.properties["2ab8"] = {
            name:       "httpStatusCode",
            standard:   true,
            notify:     true,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt16"
        };

        // HTTP request/response body
        this.properties["2ab9"] = {
            name:       "httpEntityBody",
            standard:   true,
            notify:     false,
            read:       true,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // Control point for HTTP operations
        this.properties["2aba"] = {
            name:       "httpControlPoint",
            standard:   true,
            notify:     true,
            read:       false,
            write:      true,
            anyValue:   0,
            valueType:  "Bytes",
            dataFormat: "Bytes"
        };

        // HTTPS security level
        this.properties["2abb"] = {
            name:       "httpsSecurity",
            standard:   true,
            notify:     false,
            read:       true,
            write:      false,
            anyValue:   0,
            valueType:  "Numeric",
            dataFormat: "UInt8"
        };
    }

    /**
     * Retrieves a property by its UUID.
     * @param {string} uuid - The UUID of the property to retrieve.
     * @return {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method checks if the property exists in the `properties` object and returns it. If the property does not exist, it returns undefined.
     */
    getPropertyByUUID(uuid) {   
        if (this.properties[uuid] === undefined) {
            return undefined;
        }   
        else {
            return this.properties[uuid];
        }
    }

    /**
     * Retrieves a property by its name.
     * @param {string} name - The name of the property to retrieve.
     * @return {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns the property object; otherwise, it returns undefined.
     */
    getPropertyByName(name) {
        for (const property of Object.values(this.properties)) {
            if (property.name === name) {
                return property;
            }
        }
        return undefined;
    }

    /**
     * Converts a value for a standard property.
     * @param {Object} property - The property object containing metadata about the property.
     * @param {any} value - The value to convert.
     * @return {any|undefined} - The converted value if the property is readable, otherwise undefined.
     * @description This method checks if the property is readable. If it is, it converts the value based on the property's dataFormat (low-level encoding). Handles String, UInt8, UInt16, UInt32, SInt8, SInt16, SInt24, and Bytes types.
     */  
    getStandard(property, value) {  
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (!value) {
                return { "value": undefined, "valueAsNumeric": undefined };
            }
            
            const buffer = Buffer.from(value);
            
            switch(property.dataFormat) {
                case "String":
                    return { "value": buffer.toString(), "valueAsNumeric": undefined };
                case "UInt8":
                    if (buffer.length < 1) {
                        return { "value": undefined, "valueAsNumeric": undefined };
                    }
                    return { "value": buffer.readUInt8(0), "valueAsNumeric": buffer.readUInt8(0) };
                case "UInt16":
                    if (buffer.length < 2) {
                        return { "value": undefined, "valueAsNumeric": undefined };
                    }
                    return { "value": buffer.readUInt16LE(0), "valueAsNumeric": buffer.readUInt16LE(0) };
                case "UInt32":
                    if (buffer.length < 4) {
                        return { "value": undefined, "valueAsNumeric": undefined };
                    }
                    return { "value": buffer.readUInt32LE(0), "valueAsNumeric": buffer.readUInt32LE(0) };
                case "SInt8":
                    if (buffer.length < 1) {
                        return { "value": undefined, "valueAsNumeric": undefined };
                    }
                    return { "value": buffer.readInt8(0), "valueAsNumeric": buffer.readInt8(0) };
                case "SInt16":
                    if (buffer.length < 2) {
                        return { "value": undefined, "valueAsNumeric": undefined };
                    }
                    return { "value": buffer.readInt16LE(0), "valueAsNumeric": buffer.readInt16LE(0) };
                case "SInt24":
                    // Read 24-bit signed integer (3 bytes)
                    if (buffer.length < 3) {
                        return { "value": undefined, "valueAsNumeric": undefined };
                    }
                    const val24 = buffer.readUIntLE(0, 3);
                    const signed24 = val24 > 0x7FFFFF ? val24 - 0x1000000 : val24;
                    return { "value": signed24, "valueAsNumeric": signed24 };
                case "Bytes":
                    return { "value": buffer.toString('hex'), "valueAsNumeric": undefined };
                default:
                    return { "value": buffer.toString('hex'), "valueAsNumeric": undefined };
            }
        }
    }

    /**
     * Converts a subproperty value from the BLE device to a standard format.
     * This is a base implementation that returns undefined.
     * Subclasses should override this method if they need to handle subproperties.
     * @param {Object} property - Subproperty metadata
     * @param {Buffer|any} value - Raw value from the device
     * @return {Object|undefined}
     */
    getSubproperty(property, value) {
        return undefined;
    }
}

module.exports = { ConverterStandard };