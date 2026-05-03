/**
 * =============================================================================================
 * bulp.sensai - Smart sensor
 * ==========================
 */

#include "config.h"
#include "Wire.h"

#include "scheduler.h"
#include "controls.h"
#include "led.h"
#include "sensors.h"

static SensorValues currentValues = {};

/**
 * Main setup 
 */
void setup() {
  Serial.begin(SERIAL_BAUD_RATE);

  const unsigned long serialWaitStartMs   = millis();
  const unsigned long serialWaitTimeoutMs = SERIAL_WAIT_TIMEOUT_MS;

  Serial.println("Starting...");

  while (!Serial && (millis() - serialWaitStartMs) < serialWaitTimeoutMs) {
    delay(10);
  }

  controlsInit();

  ledInit();
  ledSetState(LED_BOOT);

  if (sensorsInit()) {
    Serial.println("Sensors initialized successfully.");
    ledSetState(LED_OFF);
  }
  else {
    Serial.println("Failed to initialize sensors.");
    ledSetState(LED_ERROR);
  }

  sensorsStartTask();
}

/**
 * Main loop
 */
void loop() {
  if (taskUpdate(&taskLedBlink)) { // Advance the LED blink state machine at LED_BLINK_INTERVAL_MS.
    ledUpdate();
  }
  
  if (taskUpdate(&taskControls)) { // Run the debounced button state machine at CONTROL_UPDATE_INTERVAL_MS.
    const ControlEvent controlEvent = controlsUpdate();

    if (controlEvent == CONTROL_EVENT_BUTTON_LONG_PRESS) {
      Serial.println("Button long-pressed, pairing...");
      ledSetState(LED_PAIRING);
    }
  }
 
  if (taskUpdate(&taskSensorLog)) { // Print the latest sensor snapshot at SENSOR_READ_INTERVAL_MS. sensorsGetValues() is non-blocking; the actual reads happen on Core 0.
    sensorsGetValues(&currentValues);

    Serial.print("Temperature: ");
    if (currentValues.sensorTempHumValid) {
      Serial.print(currentValues.temperature);
      Serial.print(" °C, Humidity: ");
      Serial.print(currentValues.humidity);
      Serial.println(" %");
    }
    else {
      Serial.println("N/A");
    }

    Serial.print("Lux: ");
    if (currentValues.sensorLuxValid) {
      Serial.print(currentValues.illuminance);
      Serial.print(" lx, White: ");
      Serial.println(currentValues.whiteLevel);
    }
    else {
      Serial.println("N/A");
    }

    Serial.print("Presence: ");
    if (currentValues.sensorRadarValid) {
      Serial.print(currentValues.presenceDetected ? "Yes" : "No");
      Serial.print(", Movement: ");
      Serial.print(currentValues.movementDetected ? "Yes" : "No");
      Serial.print(", Fall: ");
      Serial.println(currentValues.fallDetected ? "Yes" : "No");
    }
    else {
      Serial.println("N/A");
    }
  }
}