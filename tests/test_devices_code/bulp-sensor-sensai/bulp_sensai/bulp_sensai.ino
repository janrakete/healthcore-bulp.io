/**
 * =============================================================================================
 * bulp.top 1 - Smart sensor
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

static SensorValues currentValues     = {};                                   // Latest sensor snapshot for logging in the main loop, updated at SENSOR_READ_INTERVAL_MS when taskSensorLog fires. The actual sensor reads happen on Core 0 and are independent of this.
static ConnectionMode connectionMode  = CONNECTION_MODE_ZIGBEE;               // Selected connection mode, determined at boot by the state of the DPDT switch. WiFi is the default if the switch is not present or fails to read.
static Task taskConnectionCheck       = TASK(CONNECTION_CHECK_INTERVAL_MS);   // Scheduler task that periodically checks the network connection status and updates the LED accordingly. Also handles ZigBee rejoin logic if the connection is lost after being established.
static bool zigbeeHadConnection       = false;                                // Tracks whether a ZigBee connection was ever established since boot to differentiate between "never connected" and "connection lost after being established" states for more informative logging.
static unsigned long zigbeeDisconnectStartMs = 0;                             // Timestamp of when the ZigBee connection was first detected as lost, used to trigger a restart if the connection is not restored within ZIGBEE_REJOIN_RESTART_DELAY_MS. Set to 0 when connected.

/**
 * Main setup 
 */
void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  const unsigned long serialWaitStartMs   = millis();
  const unsigned long serialWaitTimeoutMs = SERIAL_WAIT_TIMEOUT_MS;

  while (!Serial && (millis() - serialWaitStartMs) < serialWaitTimeoutMs) { // Wait for Serial with timeout.
    delay(10);
  }

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
  Serial.println(" Manufacturer: " ZIGBEE_MANUFACTURER);
  Serial.println(" Model:        " ZIGBEE_MODEL);
  Serial.println("===========================================");
  Serial.println("[Main] Starting ...");

  pinMode(PIN_DPDT_SWITCH, INPUT_PULLUP);
  connectionMode = (digitalRead(PIN_DPDT_SWITCH) == HIGH) ? CONNECTION_MODE_WIFI : CONNECTION_MODE_ZIGBEE;
  Serial.print("[Main] Connection mode: ");
  Serial.println(connectionMode == CONNECTION_MODE_WIFI ? "WiFi" : "ZigBee");

  controlsInit(); // Init controls early for pairing.

  ledInit();  // Init the LED early for boot feedback.
  ledSetState(LED_BOOT); 

  const bool sensorsReady = sensorsInit();
  if (sensorsReady) {
    Serial.println("[Sensors] Initialized successfully.");
  }
  else if (!SENSORS_ENABLED) {
    Serial.println("[Sensors] Disabled for debugging.");
  }
  else {
    Serial.println("[Sensors] Failed to initialize.");
  }

  if (sensorsReady && !sensorsStartTask()) {
    Serial.println("[Sensors] Failed to start sensor task, continuing with network connectivity only.");
  }

  #if defined(ZIGBEE_MODE_ED) && SENSORS_ENABLED
    if (connectionMode == CONNECTION_MODE_ZIGBEE) {
      zigbeeInit();
      ledSetState(LED_BOOT);
    }
  #endif
  
  taskConnectionCheck.lastRun = millis() - CONNECTION_CHECK_INTERVAL_MS; // Fire once on the first loop.
}

/**
 * Main loop
 */
void loop() {
  if (taskUpdate(&taskLedBlink)) { // Advance LED blink state.
    ledUpdate();
  }

  if (taskUpdate(&taskConnectionCheck)) { // Check connection status and update the LED.
    const LedState currentLedState = ledGetState();
    if (currentLedState != LED_PAIRING && currentLedState != LED_RESET) {
      bool isConnected = false;
      if (connectionMode == CONNECTION_MODE_ZIGBEE) {
        isConnected = zigbeeIsJoined();

        if (isConnected) {
          if (zigbeeDisconnectStartMs != 0) {
            Serial.println(zigbeeHadConnection ? "[ZigBee] Connection to coordinator restored" : "[ZigBee] Connection to coordinator established");
            zigbeeDisconnectStartMs = 0;
          }
          zigbeeHadConnection = true;
        }
        else {
          if (zigbeeDisconnectStartMs == 0) {
            zigbeeDisconnectStartMs = millis();
            Serial.println(zigbeeHadConnection ? "[ZigBee] Connection to coordinator lost, waiting before restart ..." : "[ZigBee] Coordinator still unreachable since boot, waiting before restart ...");
          }
          else if (millis() - zigbeeDisconnectStartMs >= ZIGBEE_REJOIN_RESTART_DELAY_MS) {
            Serial.println("[ZigBee] Coordinator still unreachable, rebooting to trigger rejoin ...");
            ESP.restart();
          }
        }
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
  
  if (taskUpdate(&taskControls)) { // Run the button state machine.
    const ControlEvent controlEvent = controlsUpdate();

    if (controlEvent == CONTROL_EVENT_BUTTON_LONG_PRESS) {
      Serial.println("[Controls] Button long-pressed, pairing ...");
      if (connectionMode == CONNECTION_MODE_ZIGBEE) {
        zigbeeStartPairing();
      }
    }
  }
 
  if (taskUpdate(&taskSensorLog)) { // Log the latest sensor snapshot.
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
      if (!zigbeeSendData(&currentValues, false) && zigbeeIsJoined()) {
        Serial.println("[ZigBee] Failed to publish one or more attribute updates.");
      }
    }
  }
}