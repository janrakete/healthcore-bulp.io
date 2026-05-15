/**
 * =============================================================================================
 * bulp.sensai - Smart sensor
 * ==========================
 * One-time Arduino IDE setup:
 *   Tools → Zigbee Mode      → Zigbee ED (end device)
 *   Tools → Partition Scheme → Zigbee 4MB with spiffs
 *   Tools → Upload Speed     → 115200 or higher
 *   Tools → Flash Frequency  → 80 MHz
 *   Tools → Flash Mode       → DIO
 */

#include "config.h"
#include "Wire.h"

#include "scheduler.h"
#include "controls.h"
#include "led.h"
#include "sensors.h"
#include "zigbee_connection.h"
#include <WiFi.h>

enum ConnectionMode {
  CONNECTION_MODE_ZIGBEE,
  CONNECTION_MODE_WIFI,
};

static SensorValues currentValues     = {};
static ConnectionMode connectionMode  = CONNECTION_MODE_WIFI;
static Task taskConnectionCheck       = TASK(CONNECTION_CHECK_INTERVAL_MS);

/**
 * Main setup 
 */
void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  Serial.println("\n\n");
  Serial.println("===========================================");
  Serial.println("  _           _       ");
  Serial.println(" | |         | |      ");
  Serial.println(" | |__  _   _| |_ __ ");
  Serial.println(" | '_ \\| | | | | '_ \\ ");
  Serial.println(" | |_) | |_| | | |_) |");
  Serial.println(" |_.__/ \\__,_|_| .__/ ");
  Serial.println("               | |    ");
  Serial.println("               |_|    ");
  Serial.println("");
  Serial.println("  Manufacturer: " ZIGBEE_MANUFACTURER);
  Serial.println("  Model:        " ZIGBEE_MODEL);
  Serial.println("===========================================");

  const unsigned long serialWaitStartMs   = millis();
  const unsigned long serialWaitTimeoutMs = SERIAL_WAIT_TIMEOUT_MS;

  Serial.println("[Main] Starting ...");

  while (!Serial && (millis() - serialWaitStartMs) < serialWaitTimeoutMs) {
    delay(10);
  }

  pinMode(PIN_DPDT_SWITCH, INPUT_PULLUP);
  connectionMode = (digitalRead(PIN_DPDT_SWITCH) == HIGH) ? CONNECTION_MODE_WIFI : CONNECTION_MODE_ZIGBEE;
  Serial.print("[Main] Connection mode: ");
  Serial.println(connectionMode == CONNECTION_MODE_WIFI ? "WiFi" : "ZigBee");

  controlsInit();

  ledInit(); 
  ledSetState(LED_BOOT);

  #if defined(ZIGBEE_MODE_ED) && SENSORS_ENABLED
    if (connectionMode == CONNECTION_MODE_ZIGBEE) {
      zigbeeInit();
    }
  #endif

  ledSetState(LED_BOOT);

  if (sensorsInit()) {
    Serial.println("[Sensors] Initialized successfully.");
  }
  else if (!SENSORS_ENABLED) {
    Serial.println("[Sensors] Disabled for debugging.");
  }
  else {
    Serial.println("[Sensors] Failed to initialize.");
  }
  
  taskConnectionCheck.lastRun = millis() - CONNECTION_CHECK_INTERVAL_MS; // Force the connection-check task to fire on the very first loop() iteration so the LED transitions from LED_BOOT to the correct connection state without delay.

  if (!sensorsStartTask()) {
    Serial.println("[Sensors] Failed to start sensor task, continuing with network connectivity only.");
  }
}

/**
 * Main loop
 */
void loop() {
  if (taskUpdate(&taskLedBlink)) { // Advance the LED blink state machine at LED_BLINK_INTERVAL_MS.
    ledUpdate();
  }

  if (taskUpdate(&taskConnectionCheck)) { // Check connection status and update LED at CONNECTION_CHECK_INTERVAL_MS.
    const LedState currentLedState = ledGetState();
    if (currentLedState != LED_PAIRING && currentLedState != LED_RESET) {
      bool isConnected = false;
      if (connectionMode == CONNECTION_MODE_ZIGBEE) {
        isConnected = zigbeeIsJoined();
      }
      if (connectionMode == CONNECTION_MODE_WIFI) {
        isConnected = (WiFi.status() == WL_CONNECTED);
      }

      const LedState nextLedState = isConnected ? (connectionMode == CONNECTION_MODE_ZIGBEE ? LED_ZIGBEE_CONNECTED : LED_WIFI_CONNECTED) : LED_NO_CONNECTION;
      if (currentLedState != nextLedState) {
        ledSetState(nextLedState);
      }
    }
  }
  
  if (taskUpdate(&taskControls)) { // Run the debounced button state machine at CONTROL_UPDATE_INTERVAL_MS.
    const ControlEvent controlEvent = controlsUpdate();

    if (controlEvent == CONTROL_EVENT_BUTTON_LONG_PRESS) {
      Serial.println("[Controls] Button long-pressed, pairing ...");
      if (connectionMode == CONNECTION_MODE_ZIGBEE) {
        zigbeeStartPairing();
      }
    }
  }
 
  if (taskUpdate(&taskSensorLog)) { // Print the latest sensor snapshot at SENSOR_READ_INTERVAL_MS. sensorsGetValues() is non-blocking; the actual reads happen on Core 0.
    const bool hasValues      = sensorsGetValues(&currentValues);
    const bool valuesFresh    = hasValues && sensorsValuesAreFresh(&currentValues);

    if (!hasValues) {
      Serial.println("[Sensors] Sensor values unavailable.");
    }
    else if (!valuesFresh) {
      Serial.println("[Sensors] Sensor snapshot is stale.");
      currentValues.sensorTempHumValid = false;
      currentValues.sensorLuxValid     = false;
      currentValues.sensorRadarValid   = false;
    }

    Serial.print("[Sensors] Temperature: ");
    if (currentValues.sensorTempHumValid) {
      Serial.print(currentValues.temperature);
      Serial.print(" °C, Humidity: ");
      Serial.print(currentValues.humidity);
      Serial.println(" %");
    }
    else {
      Serial.println("N/A");
    }

    Serial.print("[Sensors] Lux: ");
    if (currentValues.sensorLuxValid) {
      Serial.print(currentValues.illuminance);
      Serial.print(" lx, White: ");
      Serial.println(currentValues.whiteLevel);
    }
    else {
      Serial.println("N/A");
    }

    Serial.print("[Sensors] Presence: ");
    if (currentValues.sensorRadarValid) {
      Serial.print(currentValues.presenceDetected ? "YES" : "NO");
      Serial.print(", Movement: ");
      Serial.print(currentValues.movementDetected ? "YES" : "NO");
      Serial.print(", Fall: ");
      Serial.println(currentValues.fallDetected ? "YES" : "NO");
    }
    else {
      Serial.println("N/A");
    }

    if (connectionMode == CONNECTION_MODE_ZIGBEE) {
      zigbeeSendData(&currentValues, false);
    }
  }
}