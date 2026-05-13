#pragma once

#define PIN_I2C_SDA                             23      // I2C data pin (shared by AHT20 and VEML7700)
#define PIN_I2C_SCL                             22      // I2C clock pin (shared by AHT20 and VEML7700)

#define PIN_LED                                 4       // Onboard NeoPixel LED
#define PIN_BUTTON                              5       // Control button (active LOW, INPUT_PULLUP)
#define LED_BLINK_INTERVAL_MS                   500     // LED blink toggle interval (ms)

#define PIN_DPDT_SWITCH                         7       // Boot mode switch to GND with INPUT_PULLUP (open = WiFi, closed = Zigbee)

#define PIN_RADAR_RX                            11      // C1001 mmWave radar UART RX
#define PIN_RADAR_TX                            10      // C1001 mmWave radar UART TX
#define RADAR_BAUD_RATE                         115200  // C1001 UART baud rate
#define RADAR_ROOM_HEIGHT_CM                    210     // Room height for fall-detection calibration (cm)
#define RADAR_FALL_SENSITIVITY                  3       // Fall sensitivity (1 = low .. 3 = high)
#define RADAR_FALL_RESIDENCE_TIME_S             30      // Time on floor before fall is confirmed (s)
#define RADAR_FALL_TIME_MS                      3000    // Time window for a fall event to complete (ms)

#define SENSORS_ENABLED                         1       // Global debug switch: 0 disables all three sensors, 1 enables normal sensor operation

#define SENSOR_READ_INTERVAL_MS                 15000    // Sensor FreeRTOS task publish interval (ms)
#define SENSOR_STAGGER_MS                       500     // Delay between individual sensor reads in the task (ms)
#define SENSOR_VALUES_MAX_AGE_MS                22000   // Maximum accepted age of the published sensor snapshot before the main loop treats it as stale (ms)
#define SENSOR_TASK_STACK_SIZE                  4096    // FreeRTOS stack size for the sensor task (bytes)

#define SERIAL_BAUD_RATE                        115200  // Serial monitor baud rate
#define SERIAL_WAIT_TIMEOUT_MS                  3000    // Max wait for Serial monitor at boot (ms)

#define CONTROL_UPDATE_INTERVAL_MS              10      // Button state-machine scheduler interval (ms)

#define BUTTON_ACTIVE_LEVEL                     LOW     // digitalRead() level when button is pressed
#define BUTTON_DEBOUNCE_MS                      30      // Minimum stable time before state change is accepted (ms)
#define BUTTON_SHORT_PRESS_MS                   50      // Minimum duration for a short press (ms)
#define BUTTON_LONG_PRESS_MS                    2000    // Minimum duration for a long press (ms)

#define ZIGBEE_CHANNEL                          15      // ZigBee channel (11..26)
#define ZIGBEE_PAN_ID                           0x1234  // ZigBee PAN ID (hex)
#define ZIGBEE_MANUFACTURER                     "bulp.io" // ZigBee device manufacturer name
#define ZIGBEE_MODEL                            "Sensai 1" // ZigBee device model name
#define ZIGBEE_REPORTING_MIN_INTERVAL           30      // ZigBee reporting minimum interval (s)
#define ZIGBEE_REPORTING_MAX_INTERVAL           120     // ZigBee reporting maximum interval (s)
#define ZIGBEE_REPORTING_TEMP_TOLERANCE         0.5     // ZigBee reporting temperature change tolerance (°C)
#define ZIGBEE_REPORTING_HUMIDITY_TOLERANCE     2.0     // ZigBee reporting humidity change tolerance (%)
#define ZIGBEE_REPORTING_ILLUMINANCE_TOLERANCE  50      // ZigBee reporting illuminance change tolerance (ZB units, not lux)
#define ZIGBEE_OCCUPANCY_SENSOR_TYPE_ULTRASONIC 0x01    // ZigBee Occupancy Sensor Type: Ultrasonic
#define ZIGBEE_CONNECTION_TIMEOUT_MS            60000   // Time to wait for ZigBee coordinator connection at startup (ms)

#define CONNECTION_CHECK_INTERVAL_MS            5000    // How often the main loop checks network connection status and updates the LED (ms)