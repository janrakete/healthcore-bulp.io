#include "sensors.h"
#include "Wire.h"
#include "DFRobot_AHT20.h"
#include "Adafruit_VEML7700.h"
#include "DFRobot_HumanDetection.h"

static DFRobot_AHT20          _sensorTempHum;
static Adafruit_VEML7700      _sensorLux;
static HardwareSerial         _radarSerial(1);
static DFRobot_HumanDetection _sensorRadar(&_radarSerial);

static bool _sensorTempHumReady = false;
static bool _sensorLuxReady     = false;
static bool _sensorRadarReady   = false;

Task taskSensors = TASK(SENSOR_READ_INTERVAL_MS);

bool sensorsInit() {
  _radarSerial.begin(RADAR_BAUD_RATE, SERIAL_8N1, PIN_RADAR_RX, PIN_RADAR_TX);
  delay(1000); // Wait for C1001 to power up

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

  if (_sensorTempHum.begin() == 0) {
    _sensorTempHumReady = true;
  }
  else {
    Serial.println("Failed to initialize AHT20 sensor!");
    _sensorTempHumReady = false;
  }

  if (_sensorLux.begin()) {
    _sensorLuxReady = true;
  }
  else {
    Serial.println("Failed to initialize VEML7700 sensor!");
    _sensorLuxReady = false;
  }

  if (_sensorRadar.begin() == 0) {
    _sensorRadar.configWorkMode(_sensorRadar.eSleepMode);
    delay(100);
    _sensorRadar.configWorkMode(_sensorRadar.eFallingMode);
    _sensorRadar.configLEDLight(_sensorRadar.eHPLed, 1);

    Serial.println("Performing C1001 Radar self-test...");
    if (_sensorRadar.sensorRet() == 0) {
      Serial.println("C1001 Radar self-test passed.");

      Serial.println("Configuring C1001 Radar fall detection parameters...");
      uint16_t height = _sensorRadar.dmAutoMeasureHeight();
      if (height == 0) {
        _sensorRadar.dmInstallHeight(RADAR_ROOM_HEIGHT_CM);
        Serial.print("C1001 height auto-measure failed, using ");
        Serial.print(RADAR_ROOM_HEIGHT_CM);
        Serial.println(" cm.");
      }
      else {
        Serial.print("C1001 measured height: ");
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
      Serial.println("C1001 Radar self-test failed!");
      _sensorRadarReady = false;
    }
  }
  else {
    Serial.println("Failed to initialize C1001 Radar!");
    _sensorRadarReady = false;
  }

  return _sensorTempHumReady || _sensorLuxReady || _sensorRadarReady;
}

void sensorsRead(SensorValues *values) {
  if (_sensorTempHumReady) {
    if (_sensorTempHum.startMeasurementReady(true)) {
      values->temperature        = _sensorTempHum.getTemperature_C();
      values->humidity           = _sensorTempHum.getHumidity_RH();
      values->sensorTempHumValid = true;
    }
    else {
      values->sensorTempHumValid = false;
    }
  }
  else {
    values->sensorTempHumValid = false;
  }

  if (_sensorLuxReady) {
    values->illuminance    = _sensorLux.readLux(VEML_LUX_AUTO);
    values->whiteLevel     = _sensorLux.readWhite();
    values->sensorLuxValid = true;
  }
  else {
    values->sensorLuxValid = false;
  }

  if (_sensorRadarReady) {
    values->presenceDetected = _sensorRadar.dmHumanData(_sensorRadar.eExistence) > 0;
    values->movementDetected = _sensorRadar.dmHumanData(_sensorRadar.eBodyMove)  > 0;
    values->fallDetected     = _sensorRadar.getFallData(_sensorRadar.eFallState) > 0;
    values->sensorRadarValid = true;
  }
  else {
    values->sensorRadarValid = false;
  }

  values->lastUpdate = millis();
}
