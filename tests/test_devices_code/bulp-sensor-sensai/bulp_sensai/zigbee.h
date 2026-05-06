/**
 * =============================================================================================
 * bulp.sensai - ZigBee header
 * ===========================
 *
 * Endpoints:
 *   EP 1 – ZigbeeTempSensor        (Temperature + Humidity, AHT20)
 *   EP 2 – ZigbeeOccupancySensor   (Presence, C1001 IO2)
 *   EP 3 – ZigbeeIlluminanceSensor (Illuminance, VEML7700)
 *   EP 4 – ZigbeeContactSwitch     (Fall alarm, C1001 IO1)
 *
 * One-time Arduino IDE setup:
 *   Tools → Zigbee Mode      → Zigbee ED (end device)
 *   Tools → Partition Scheme → Zigbee 4MB with spiffs
 */
#pragma once

#ifndef ZIGBEE_MODE_ED
    #error "Arduino IDE: Tools → Zigbee Mode → Zigbee ED (end device) required!"
#endif

#include "Zigbee.h"
#include "sensors.h"

#define EP_TEMP_HUM     1
#define EP_OCCUPANCY    2
#define EP_ILLUMINANCE  3
#define EP_FALL         4

void zigbeeInit();
bool zigbeeSendData(const SensorValues* v, bool isAlarm);
void zigbeeStartPairing();
void zigbeeFactoryReset();
bool zigbeeIsJoined();
