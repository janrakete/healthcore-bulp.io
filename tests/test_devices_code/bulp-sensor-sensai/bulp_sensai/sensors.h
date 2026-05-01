#pragma once
#include <Arduino.h>
#include "config.h"
#include "scheduler.h"

struct SensorValues {
    float    temperature;
    float    humidity;
    bool     sensorTempHumValid;

    float    illuminance;
    uint16_t whiteLevel;
    bool     sensorLuxValid;

    bool     presenceDetected;
    bool     movementDetected;
    bool     fallDetected;
    bool     sensorRadarValid;

    unsigned long lastUpdate;
};

extern Task taskSensors;

bool sensorsInit();
void sensorsRead(SensorValues *values);
