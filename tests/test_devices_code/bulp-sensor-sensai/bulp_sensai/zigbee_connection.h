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
 *
 * One-time Arduino IDE setup:
 *   Tools → Zigbee Mode      → Zigbee ED (end device)
 *   Tools → Partition Scheme → Zigbee 4MB with spiffs
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

void zigbeeInit();
bool zigbeeSendData(const SensorValues* v, bool isAlarm);
void zigbeeStartPairing();
void zigbeeFactoryReset();
bool zigbeeIsJoined();
