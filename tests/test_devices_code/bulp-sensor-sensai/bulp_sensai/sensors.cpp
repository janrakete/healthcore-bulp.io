/**
 * =============================================================================================
 * bulp.top 1 - Sensors implementation
 * ====================================
 */

#include "sensors.h"
#include "Wire.h"
#include "DFRobot_AHT20.h"
#include "Adafruit_VEML7700.h"
#include "DFRobot_HumanDetection.h"
#include <math.h>

static DFRobot_AHT20          _sensorTempHum;               // AHT20 temp/humidity sensor.
static Adafruit_VEML7700      _sensorLux;                   // VEML7700 light sensor.
static HardwareSerial         _radarSerial(1);              // C1001 radar UART on Core 0.
static DFRobot_HumanDetection _sensorRadar(&_radarSerial);  // C1001 radar wrapper.

static bool _sensorTempHumReady = false;
static bool _sensorLuxReady     = false;
static bool _sensorRadarReady   = false;

Task taskSensorLog = TASK(SENSOR_READ_INTERVAL_MS); // Main-loop sensor log task.

static SemaphoreHandle_t _valuesMutex = NULL; // Guards _latestValues between cores.

static SensorValues      _latestValues = {}; // Shared sensor snapshot.

/**
 * Validates AHT20 temperature and humidity values.
 */
static bool sensorTempHumValuesAreValid(float temperature, float humidity) {
  return isfinite(temperature) && isfinite(humidity);
}

/**
 * Validates the VEML7700 illuminance value.
 */
static bool sensorLuxValueIsValid(float illuminance) {
  return isfinite(illuminance) && illuminance >= 0.0f;
}

/**
 * Initializes all sensors. Returns true if at least one is ready.
 */
bool sensorsInit() {
  Serial.println("[Sensors] Initializing ...");

  if (!SENSORS_ENABLED) {
    _sensorTempHumReady = false;
    _sensorLuxReady     = false;
    _sensorRadarReady   = false;
    Serial.println("[Sensors] All sensors disabled via SENSORS_ENABLED debug switch.");
    return false;
  }

  _radarSerial.begin(RADAR_BAUD_RATE, SERIAL_8N1, PIN_RADAR_RX, PIN_RADAR_TX);  // Init the C1001 UART.
  delay(1000); // Wait for the radar to boot.

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL); // Init I2C for AHT20 and VEML7700.
  Wire.setClock(100000); // Use a conservative I2C clock.

  if (_sensorTempHum.begin() == 0) {
    _sensorTempHumReady = true;
  }
  else {
    Serial.println("[Sensors] Failed to initialize AHT20 sensor!");
    _sensorTempHumReady = false;
  }

  if (_sensorLux.begin(&Wire)) {
    _sensorLuxReady = true;
  }
  else {
    Serial.println("[Sensors] Failed to initialize VEML7700 sensor!");
    _sensorLuxReady = false;
  }

  if (_sensorRadar.begin() == 0) {
    _sensorRadar.configWorkMode(_sensorRadar.eSleepMode);
    delay(100);
    _sensorRadar.configWorkMode(_sensorRadar.eFallingMode); // Use falling mode for presence.
    _sensorRadar.configLEDLight(_sensorRadar.eHPLed, 1);    // Enable the high-power LED.

    Serial.println("[Sensors] Performing C1001 Radar self-test ...");
    if (_sensorRadar.sensorRet() == 0) { // Run the radar self-test.
      Serial.println("[Sensors] C1001 Radar self-test passed.");

      Serial.println("[Sensors] Configuring C1001 Radar fall detection parameters ...");
      uint16_t height = _sensorRadar.dmAutoMeasureHeight(); // Measure the room height.
      if (height == 0) {
        _sensorRadar.dmInstallHeight(RADAR_ROOM_HEIGHT_CM);
        Serial.print("[Sensors] Radar height measure failed, using ");
        Serial.print(RADAR_ROOM_HEIGHT_CM);
        Serial.println(" cm.");
      }
      else {
        Serial.print("[Sensors] Radar measured height: ");
        Serial.print(height);
        Serial.println(" cm");
      }

      _sensorRadar.dmFallConfig(_sensorRadar.eFallSensitivityC, RADAR_FALL_SENSITIVITY); // Set fall sensitivity.
      _sensorRadar.dmFallConfig(_sensorRadar.eResidenceSwitchC, 1); // Enable residence checking.
      _sensorRadar.dmFallConfig(_sensorRadar.eResidenceTime, RADAR_FALL_RESIDENCE_TIME_S); // Set residence time.
      _sensorRadar.dmFallTime(RADAR_FALL_TIME_MS); // Set the fall time window.
      _sensorRadarReady = true;
    }
    else {
      Serial.println("[Sensors] C1001 Radar self-test failed!");
      _sensorRadarReady = false;
    }
  }
  else {
    Serial.println("[Sensors] Failed to initialize C1001 Radar!");
    _sensorRadarReady = false;
  }

  return _sensorTempHumReady || _sensorLuxReady || _sensorRadarReady;
}

/**
 * Background FreeRTOS task on Core 0.
 */
static void sensorsTask(void *param) { // Reads sensors in sequence and publishes a shared snapshot.
  TickType_t lastWakeTime = xTaskGetTickCount(); // Keep the task cycle aligned.

  while (true) {
    SensorValues temp = {};

    if (_sensorTempHumReady) {
      if (_sensorTempHum.startMeasurementReady(true)) {
        const float temperature = _sensorTempHum.getTemperature_C();
        const float humidity    = _sensorTempHum.getHumidity_RH();

        if (sensorTempHumValuesAreValid(temperature, humidity)) {
          temp.temperature        = temperature;
          temp.humidity           = humidity;
          temp.sensorTempHumValid = true;
        }
      }
    }

    vTaskDelay(pdMS_TO_TICKS(SENSOR_STAGGER_MS)); // Stagger sensor reads.

    if (_sensorLuxReady) {
      const float illuminance = _sensorLux.readLux(VEML_LUX_AUTO);

      if (sensorLuxValueIsValid(illuminance)) {
        temp.illuminance    = illuminance;
        temp.whiteLevel     = _sensorLux.readWhite();
        temp.sensorLuxValid = true;
      }
    }

    vTaskDelay(pdMS_TO_TICKS(SENSOR_STAGGER_MS)); // Stagger sensor reads.

    if (_sensorRadarReady) {
      temp.presenceDetected = _sensorRadar.dmHumanData(_sensorRadar.eExistence) > 0;
      temp.movementDetected = _sensorRadar.dmHumanData(_sensorRadar.eBodyMove)  > 0;
      temp.fallDetected     = _sensorRadar.getFallData(_sensorRadar.eFallState) > 0;
      temp.sensorRadarValid = true;
    }

    temp.lastUpdate = millis();

    
    if (xSemaphoreTake(_valuesMutex, portMAX_DELAY) == pdTRUE) { // Publish the snapshot atomically.
      _latestValues = temp;
      xSemaphoreGive(_valuesMutex); // Release the mutex quickly.
    }
    
    vTaskDelayUntil(&lastWakeTime, pdMS_TO_TICKS(SENSOR_READ_INTERVAL_MS)); // Wait for the next cycle.
  }
}

/**
 * Starts the sensor task. Returns true if the task was successfully created, false otherwise.
 */
bool sensorsStartTask() {
  _valuesMutex = xSemaphoreCreateMutex();

  if (_valuesMutex == NULL) {
    return false;
  }

  if (xTaskCreatePinnedToCore(sensorsTask, "sensors", SENSOR_TASK_STACK_SIZE, NULL, 1, NULL, 0) != pdPASS) { // Pin to Core 0.
    vSemaphoreDelete(_valuesMutex); // Clean up if task creation fails.
    _valuesMutex = NULL;
    return false;
  }

  return true;
}

/**
 * Retrieves the latest sensor values. Returns true if the values were successfully retrieved, false otherwise.
 */ 
bool sensorsGetValues(SensorValues *values) {
  if (values == NULL || _valuesMutex == NULL) {
    if (values != NULL) {
      *values = {};
    }
    return false;
  }

  if (xSemaphoreTake(_valuesMutex, portMAX_DELAY) != pdTRUE) { // Atomic copy.
    *values = {};
    return false;
  }

  *values = _latestValues;
  xSemaphoreGive(_valuesMutex); // Release the mutex quickly.
  return true;
}

/**
 * Checks if the sensor values are fresh. Returns true if the values are fresh, false otherwise.
 */
bool sensorsValuesAreFresh(const SensorValues *values) {
  if (values == NULL || values->lastUpdate == 0) {
    return false;
  }

  return (millis() - values->lastUpdate) <= SENSOR_VALUES_MAX_AGE_MS;
}
