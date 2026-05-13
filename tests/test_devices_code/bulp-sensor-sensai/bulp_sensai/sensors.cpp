/**
 * =============================================================================================
 * bulp.sensai - Sensors implementation
 * ====================================
 */

#include "sensors.h"
#include "Wire.h"
#include "DFRobot_AHT20.h"
#include "Adafruit_VEML7700.h"
#include "DFRobot_HumanDetection.h"
#include <math.h>

static DFRobot_AHT20          _sensorTempHum;
static Adafruit_VEML7700      _sensorLux;
static HardwareSerial         _radarSerial(1);
static DFRobot_HumanDetection _sensorRadar(&_radarSerial);

static bool _sensorTempHumReady = false;
static bool _sensorLuxReady     = false;
static bool _sensorRadarReady   = false;

Task taskSensorLog = TASK(SENSOR_READ_INTERVAL_MS); // Scheduler task used by the main loop (Core 1) to log sensor values. The interval matches SENSOR_READ_INTERVAL_MS so the log stays in sync with the background task cycle, but the actual reads are decoupled.

static SemaphoreHandle_t _valuesMutex = NULL; // Mutex that guards _latestValues between the sensor task (Core 0) and the main loop (Core 1).

static SensorValues      _latestValues = {}; // Shared value buffer; written by sensorsTask, read by sensorsGetValues.

/**
 * Validates the temperature and humidity values from the AHT20 sensor.
 */
static bool sensorTempHumValuesAreValid(float temperature, float humidity) {
  return isfinite(temperature) && isfinite(humidity);
}

/**
 * Validates the illuminance value from the VEML7700 sensor.
 */
static bool sensorLuxValueIsValid(float illuminance) {
  return isfinite(illuminance) && illuminance >= 0.0f;
}

/**
 * Initializes all sensors. Returns true if at least one sensor was successfully initialized, false otherwise.
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

  _radarSerial.begin(RADAR_BAUD_RATE, SERIAL_8N1, PIN_RADAR_RX, PIN_RADAR_TX);
  delay(1000); // Wait for C1001 to power up

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);

  if (_sensorTempHum.begin() == 0) {
    _sensorTempHumReady = true;
  }
  else {
    Serial.println("[Sensors] Failed to initialize AHT20 sensor!");
    _sensorTempHumReady = false;
  }

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
  delay(50);

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
    _sensorRadar.configWorkMode(_sensorRadar.eFallingMode);
    _sensorRadar.configLEDLight(_sensorRadar.eHPLed, 1);

    Serial.println("[Sensors] Performing C1001 Radar self-test ...");
    if (_sensorRadar.sensorRet() == 0) {
      Serial.println("[Sensors] C1001 Radar self-test passed.");

      Serial.println("[Sensors] Configuring C1001 Radar fall detection parameters ...");
      uint16_t height = _sensorRadar.dmAutoMeasureHeight();
      if (height == 0) {
        _sensorRadar.dmInstallHeight(RADAR_ROOM_HEIGHT_CM);
        Serial.print("[Sensors] C1001 height auto-measure failed, using ");
        Serial.print(RADAR_ROOM_HEIGHT_CM);
        Serial.println(" cm.");
      }
      else {
        Serial.print("[Sensors] C1001 measured height: ");
        Serial.print(height);
        Serial.println(" cm");
      }

      _sensorRadar.dmFallConfig(_sensorRadar.eFallSensitivityC, RADAR_FALL_SENSITIVITY);
      _sensorRadar.dmFallConfig(_sensorRadar.eResidenceSwitchC, 1);
      _sensorRadar.dmFallConfig(_sensorRadar.eResidenceTime, RADAR_FALL_RESIDENCE_TIME_S);
      _sensorRadar.dmFallTime(RADAR_FALL_TIME_MS);
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
 * Reads the button state. Returns true if the button is currently pressed, false otherwise.
 */
static void sensorsTask(void *param) { // Background task running on Core 0. Reads all sensors sequentially, staggered by SENSOR_STAGGER_MS to avoid back-to-back blocking I2C/Serial calls. vTaskDelayUntil keeps the start of each cycle aligned to SENSOR_READ_INTERVAL_MS.
  TickType_t lastWakeTime = xTaskGetTickCount();

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

    vTaskDelay(pdMS_TO_TICKS(SENSOR_STAGGER_MS));

    if (_sensorLuxReady) {
      const float illuminance = _sensorLux.readLux(VEML_LUX_AUTO);

      if (sensorLuxValueIsValid(illuminance)) {
        temp.illuminance    = illuminance;
        temp.whiteLevel     = _sensorLux.readWhite();
        temp.sensorLuxValid = true;
      }
    }

    vTaskDelay(pdMS_TO_TICKS(SENSOR_STAGGER_MS));

    if (_sensorRadarReady) {
      if (_sensorRadar.sensorRet() == 0) {
        temp.presenceDetected = _sensorRadar.dmHumanData(_sensorRadar.eExistence) > 0;
        temp.movementDetected = _sensorRadar.dmHumanData(_sensorRadar.eBodyMove)  > 0;
        temp.fallDetected     = _sensorRadar.getFallData(_sensorRadar.eFallState) > 0;
        temp.sensorRadarValid = true;
      }
    }

    temp.lastUpdate = millis();

    
    if (xSemaphoreTake(_valuesMutex, portMAX_DELAY) == pdTRUE) { // Publish the completed snapshot atomically.
      _latestValues = temp;
      xSemaphoreGive(_valuesMutex);
    }
    
    vTaskDelayUntil(&lastWakeTime, pdMS_TO_TICKS(SENSOR_READ_INTERVAL_MS)); // Wait until the next cycle start to avoid timing drift.
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

  if (xTaskCreatePinnedToCore(sensorsTask, "sensors", SENSOR_TASK_STACK_SIZE, NULL, 1, NULL, 0) != pdPASS) { // Pin to Core 0 so blocking sensor reads never stall the main loop on Core 1.
    vSemaphoreDelete(_valuesMutex);
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

  if (xSemaphoreTake(_valuesMutex, portMAX_DELAY) != pdTRUE) { // Atomic copy — holds the mutex for only a few microseconds.
    *values = {};
    return false;
  }

  *values = _latestValues;
  xSemaphoreGive(_valuesMutex);
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
