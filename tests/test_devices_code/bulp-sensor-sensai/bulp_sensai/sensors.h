#pragma once
#include <Arduino.h>
#include "config.h"
#include "scheduler.h"

// Latest snapshot of all sensor readings. Written exclusively by the sensor FreeRTOS task (Core 0). Read from the main loop via sensorsGetValues() using a mutex.
struct SensorValues {
    float    temperature;         // °C  (AHT20)
    float    humidity;            // %RH (AHT20)
    bool     sensorTempHumValid;  // false if the AHT20 read failed

    float    illuminance;         // lux (VEML7700)
    uint16_t whiteLevel;          // raw white channel (VEML7700)
    bool     sensorLuxValid;      // false if the VEML7700 read failed

    bool     presenceDetected;    // human present in the room (C1001)
    bool     movementDetected;    // body movement detected (C1001)
    bool     fallDetected;        // fall event detected (C1001)
    bool     sensorRadarValid;    // false if the C1001 read failed

    unsigned long lastUpdate;     // millis() timestamp of the last write
};

extern Task taskSensorLog; // Scheduler task used by the main loop to print sensor values at SENSOR_READ_INTERVAL_MS. The actual sensor reads happen on Core 0 and are independent of this task.

bool sensorsInit(); // Initialises all sensor hardware. Returns true if at least one sensor is ready.

void sensorsStartTask(); // Creates the FreeRTOS background task that reads all sensors on Core 0. Must be called after sensorsInit().

void sensorsGetValues(SensorValues *values); // Copies the latest sensor snapshot into *values under mutex protection. Non-blocking from the caller's perspective (<1 µs).
