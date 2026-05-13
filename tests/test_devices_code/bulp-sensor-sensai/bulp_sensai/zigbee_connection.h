/**
 * =============================================================================================
 * bulp.sensai - ZigBee header
 * ===========================
 *
 * Endpoints:
 *   EP 1 – ZigbeeTempSensor        (Temperature + Humidity)
 *   EP 2 – ZigbeeOccupancySensor   (Presence + Movement via occupancy)
 *   EP 3 – ZigbeeIlluminanceSensor (Illuminance)
 *   EP 4 – ZigbeeAnalog            (Fall alarm: 1.0 = fall, 0.0 = normal)
 *   EP 5 – ZigbeeAnalog            (Sensor health: 1.0 = sensor error, 0.0 = ok)
 */
#pragma once

#ifndef ZIGBEE_MODE_ED
    #error "Arduino IDE: Tools → Zigbee Mode → Zigbee ED (end device) required!"
#endif

#include <Zigbee.h>
#include "sensors.h"

#define EP_TEMP_HUM     1
#define EP_OCCUPANCY    2
#define EP_ILLUMINANCE  3
#define EP_FALL         4  // ZigbeeAnalog: 1.0 = fall detected, 0.0 = normal
#define EP_SENSOR_HEALTH 5 // ZigbeeAnalog: 1.0 = at least one sensor error, 0.0 = all sensors healthy

void zigbeeInit();
bool zigbeeSendData(const SensorValues* v, bool isAlarm, bool hasSensorError);
void zigbeeStartPairing();
bool zigbeeIsJoined();
