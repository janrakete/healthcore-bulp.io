/**
 * =============================================================================================
 * bulp.sensai - Smart sensor
 * ==========================
 */

#include "config.h"
#include "Wire.h"

#include "scheduler.h"
#include "led.h"
#include "sensors.h"

static SensorValues currentValues = {};

/**
 * Main setup 
 */
void setup() {
  Serial.begin(SERIAL_BAUD_RATE);

  while (!Serial) { // Wait for Serial to be ready
    delay(10);
  }

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
}

/**
 * Main loop
 */
void loop() {
  ledUpdate();

  if (taskUpdate(&taskSensors)) {
    sensorsRead(&currentValues);

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