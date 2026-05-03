#pragma once

#define PIN_I2C_SDA                 23      // I2C data pin (shared by AHT20 and VEML7700)
#define PIN_I2C_SCL                 22      // I2C clock pin (shared by AHT20 and VEML7700)

#define PIN_LED                     4       // Onboard NeoPixel LED
#define PIN_BUTTON                  5       // Control button (active LOW, INPUT_PULLUP)
#define LED_BLINK_INTERVAL_MS       500     // LED blink toggle interval (ms)

#define PIN_RADAR_RX                11      // C1001 mmWave radar UART RX
#define PIN_RADAR_TX                10      // C1001 mmWave radar UART TX
#define RADAR_BAUD_RATE             115200  // C1001 UART baud rate
#define RADAR_ROOM_HEIGHT_CM        210     // Room height for fall-detection calibration (cm)
#define RADAR_FALL_SENSITIVITY      3       // Fall sensitivity (1 = low .. 3 = high)
#define RADAR_FALL_RESIDENCE_TIME_S 30      // Time on floor before fall is confirmed (s)
#define RADAR_FALL_TIME_MS          3000    // Time window for a fall event to complete (ms)

#define SENSOR_READ_INTERVAL_MS     5000    // Sensor FreeRTOS task publish interval (ms)
#define SENSOR_STAGGER_MS           500     // Delay between individual sensor reads in the task (ms)
#define SENSOR_TASK_STACK_SIZE      4096    // FreeRTOS stack size for the sensor task (bytes)

#define SERIAL_BAUD_RATE            115200  // Serial monitor baud rate
#define SERIAL_WAIT_TIMEOUT_MS      3000    // Max wait for Serial monitor at boot (ms)

#define CONTROL_UPDATE_INTERVAL_MS  10      // Button state-machine scheduler interval (ms)

#define BUTTON_ACTIVE_LEVEL         LOW     // digitalRead() level when button is pressed
#define BUTTON_DEBOUNCE_MS          30      // Minimum stable time before state change is accepted (ms)
#define BUTTON_SHORT_PRESS_MS       50      // Minimum duration for a short press (ms)
#define BUTTON_LONG_PRESS_MS        2000    // Minimum duration for a long press (ms)