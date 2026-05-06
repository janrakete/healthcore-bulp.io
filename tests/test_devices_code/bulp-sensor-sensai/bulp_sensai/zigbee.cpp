/*
 * zigbee.cpp  –  ZigBee End Device implementation
 *
 * Always compiled. Whether ZigBee is started at boot is
 * determined by the slide switch in bulp_sensai.ino.
 */
#include "zigbee.h"

// ── Endpoint objects ──────────────────────────────────────────────────────────
static ZigbeeTempSensor        zbTempHum    (EP_TEMP_HUM);
static ZigbeeOccupancySensor   zbOccupancy  (EP_OCCUPANCY);
static ZigbeeIlluminanceSensor zbIlluminance(EP_ILLUMINANCE);
static ZigbeeContactSwitch     zbFall       (EP_FALL);

// ── Init ──────────────────────────────────────────────────────────────────────
void zigbeeInit() {
    Serial.println("[ZigBee] Initialising endpoints...");

    // EP 1: Temperature + Humidity (AHT20)
    zbTempHum.setManufacturerAndModel("bulp.io", "RoomSensor-v4");
    zbTempHum.setMinMaxValue(-10, 60);
    zbTempHum.setTolerance(0.5);
    zbTempHum.setReporting(30, 120, 0.5);
    zbTempHum.setHumidityReporting(30, 120, 2.0);
    Zigbee.addEndpoint(&zbTempHum);
    Serial.println("[ZigBee] EP1 Temp+Humidity OK");

    // EP 2: Presence (C1001 IO2)
    zbOccupancy.setManufacturerAndModel("bulp.io", "RoomSensor-v4");
    zbOccupancy.setSensorType(ZIGBEE_OCCUPANCY_SENSOR_TYPE_PIR);
    Zigbee.addEndpoint(&zbOccupancy);
    Serial.println("[ZigBee] EP2 Presence OK");

    // EP 3: Illuminance (VEML7700)
    zbIlluminance.setManufacturerAndModel("bulp.io", "RoomSensor-v4");
    zbIlluminance.setMinMaxValue(0, 100000);
    zbIlluminance.setReporting(30, 300, 50);
    Zigbee.addEndpoint(&zbIlluminance);
    Serial.println("[ZigBee] EP3 Illuminance OK");

    // EP 4: Fall alarm (C1001 IO1, as ContactSwitch)
    // open = no fall, closed = fall detected
    zbFall.setManufacturerAndModel("bulp.io", "RoomSensor-v4");
    Zigbee.addEndpoint(&zbFall);
    Serial.println("[ZigBee] EP4 Fall alarm OK");

    // Start ZigBee as End Device
    Serial.println("[ZigBee] Starting End Device...");
    if (!Zigbee.begin()) {
        Serial.println("[ZigBee] ERROR: begin() failed");
        Serial.println("[ZigBee] Tip: Erase All Flash and re-flash the firmware");
        return;
    }

    // Wait for coordinator (max. 30 s)
    unsigned long start = millis();
    while (!Zigbee.connected() && millis() - start < 30000) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (Zigbee.connected()) {
        Serial.println("[ZigBee] Connected to coordinator");
    } else {
        Serial.println("[ZigBee] No coordinator found – press button to start pairing");
    }
}

// ── Send data ─────────────────────────────────────────────────────────────────
bool zigbeeSendData(const SensorValues* v, bool isAlarm) {
    if (!Zigbee.connected()) return false;

    bool ok = true;

    // Temperature + Humidity
    if (v->sensorTempHumValid) {
        ok &= zbTempHum.setTemperature(v->temperature);
        ok &= zbTempHum.setHumidity(v->humidity);
        Serial.printf("[ZigBee] T=%.1f°C  H=%.0f%%\n",
                      v->temperature, v->humidity);
    }

    // Presence
    if (v->sensorRadarValid) {
        zbOccupancy.setOccupancy(v->presenceDetected);
    }

    // Illuminance: ZigBee formula: 10000 * log10(lux) + 1
    if (v->sensorLuxValid) {
        uint16_t luxZb = (v->illuminance > 0)
            ? (uint16_t)(10000.0 * log10(v->illuminance) + 1)
            : 0;
        zbIlluminance.setIlluminance(luxZb);
        Serial.printf("[ZigBee] Lux=%.0f (ZB=%d)\n", v->illuminance, luxZb);
    }

    // Fall alarm: ContactSwitch closed = alarm
    if (v->sensorRadarValid) {
        bool alarm = v->fallDetected || isAlarm;
        zbFall.setClosed(alarm);
        if (alarm) Serial.println("[ZigBee] FALL ALARM!");
    }

    return ok;
}

// ── Pairing ───────────────────────────────────────────────────────────────────
void zigbeeStartPairing() {
    if (Zigbee.connected()) {
        Serial.println("[ZigBee] Already connected");
        return;
    }
    Serial.println("[ZigBee] Searching for network...");
    // Clear saved network credentials → rejoin on next boot
    Zigbee.factoryReset();
}

// ── Factory Reset ─────────────────────────────────────────────────────────────
void zigbeeFactoryReset() {
    Serial.println("[ZigBee] Factory Reset");
    Zigbee.factoryReset();
    // ESP32 will restart automatically
}

// ── Connection status ─────────────────────────────────────────────────────────
bool zigbeeIsJoined() {
    return Zigbee.connected();
}
