/**
 * =============================================================================================
 * bulp.sensai - ZigBee connection
 * ===============================
 */
#include "zigbee_connection.h"

static ZigbeeTempSensor        zbTempHum    (EP_TEMP_HUM);
static ZigbeeOccupancySensor   zbOccupancy  (EP_OCCUPANCY);
static ZigbeeIlluminanceSensor zbIlluminance(EP_ILLUMINANCE);
static ZigbeeAnalog            zbFall       (EP_FALL);
    
/**
 * Initialise ZigBee and add endpoints
 */
void zigbeeInit() {
    Serial.println("[ZigBee] Initialising endpoints ...");

    // EP 1: Temperature + Humidity
    zbTempHum.setManufacturerAndModel(ZIGBEE_MANUFACTURER, ZIGBEE_MODEL);
    zbTempHum.setMinMaxValue(-20, 80);
    zbTempHum.setDefaultValue(20.0f);
    zbTempHum.setTolerance(ZIGBEE_REPORTING_TEMP_TOLERANCE);
    zbTempHum.addHumiditySensor(0, 100, ZIGBEE_REPORTING_HUMIDITY_TOLERANCE, 50.0f);
    Zigbee.addEndpoint(&zbTempHum);
    Serial.println("[ZigBee] EP1 Temp+Humidity OK");

    // EP 2: Presence - event-based, no reporting interval or tolerance
    zbOccupancy.setManufacturerAndModel(ZIGBEE_MANUFACTURER, ZIGBEE_MODEL);
    zbOccupancy.setSensorType(ZIGBEE_OCCUPANCY_SENSOR_TYPE_ULTRASONIC);
    Zigbee.addEndpoint(&zbOccupancy);
    Serial.println("[ZigBee] EP2 Presence OK (event-based)");

    // EP 3: Illuminance
    zbIlluminance.setManufacturerAndModel(ZIGBEE_MANUFACTURER, ZIGBEE_MODEL);
    Zigbee.addEndpoint(&zbIlluminance);
    Serial.println("[ZigBee] EP3 Illuminance OK");

    // EP 4: Fall alarm via analog input value (1.0 = alarm, 0.0 = normal)
    zbFall.setManufacturerAndModel(ZIGBEE_MANUFACTURER, ZIGBEE_MODEL);
    zbFall.addAnalogInput();
    zbFall.setAnalogInputMinMax(0.0f, 1.0f);
    Zigbee.addEndpoint(&zbFall);
    Serial.println("[ZigBee] EP4 Fall alarm OK (analog)");

    Serial.println("[ZigBee] Starting End Device ..."); // Start ZigBee as End Device
    if (!Zigbee.begin()) {
        Serial.println("[ZigBee] ERROR: begin() failed");
        Serial.println("[ZigBee] Rebooting ...");
        ESP.restart();
        return;
    }

    zbTempHum.setReporting(ZIGBEE_REPORTING_MIN_INTERVAL, ZIGBEE_REPORTING_MAX_INTERVAL, ZIGBEE_REPORTING_TEMP_TOLERANCE);
    zbTempHum.setHumidityReporting(ZIGBEE_REPORTING_MIN_INTERVAL, ZIGBEE_REPORTING_MAX_INTERVAL, ZIGBEE_REPORTING_HUMIDITY_TOLERANCE);
    zbIlluminance.setReporting(ZIGBEE_REPORTING_MIN_INTERVAL, ZIGBEE_REPORTING_MAX_INTERVAL, ZIGBEE_REPORTING_ILLUMINANCE_TOLERANCE);

    unsigned long start = millis();
    while (!Zigbee.connected() && millis() - start < ZIGBEE_CONNECTION_TIMEOUT_MS) { // Wait for coordinator connection with timeout
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (Zigbee.connected()) {
        Serial.println("[ZigBee] Connected to coordinator");
    } else {
        Serial.println("[ZigBee] No coordinator found - press button to start pairing");
    }
}

/*
 * Send sensor data over ZigBee, returns true if data was sent successfully, false if not connected
*/
bool zigbeeSendData(const SensorValues* values, bool isAlarm) {
    if (!Zigbee.connected()) {
        return false;
    }

    bool ok = true;

    if (values->sensorTempHumValid) {
        ok &= zbTempHum.setTemperature(values->temperature);
        ok &= zbTempHum.setHumidity(values->humidity);
        Serial.printf("[ZigBee] T=%.1f C  H=%.0f%%\n", values->temperature, values->humidity);
    }

    if (values->sensorRadarValid) {
        bool occupied = values->presenceDetected || values->movementDetected;
        zbOccupancy.setOccupancy(occupied);
        Serial.printf("[ZigBee] Presence/Movement: %s\n", occupied ? "YES" : "NO");
    }

    if (values->sensorLuxValid) {
        uint16_t luxZb = (values->illuminance > 0) ? (uint16_t)(10000.0 * log10(values->illuminance) + 1) : 0;
        zbIlluminance.setIlluminance(luxZb);
        Serial.printf("[ZigBee] Lux=%.0f (ZB=%d)\n", values->illuminance, luxZb);
    }

    if (values->sensorRadarValid) {
        bool alarm = values->fallDetected || isAlarm;
        ok &= zbFall.setAnalogInput(alarm ? 1.0f : 0.0f);
        Serial.printf("[ZigBee] Fall: %s\n", alarm ? "ALARM" : "no");
    }

    return ok;
}

/*
 * Start ZigBee pairing: Factory reset to clear credentials, then rejoin on next boot    
 */
void zigbeeStartPairing() {
    if (Zigbee.connected()) {
        Serial.println("[ZigBee] Already connected");
        return;
    }
    Serial.println("[ZigBee] Searching for network ...");
    
    Zigbee.factoryReset();
}

/**
 * Factory reset: Clear ZigBee credentials and restart
 */
void zigbeeFactoryReset() {
    Serial.println("[ZigBee] Factory Reset");
    Zigbee.factoryReset();
}

/**
 * Check if ZigBee is connected to a coordinator
 */
bool zigbeeIsJoined() {
    return Zigbee.connected();
}
