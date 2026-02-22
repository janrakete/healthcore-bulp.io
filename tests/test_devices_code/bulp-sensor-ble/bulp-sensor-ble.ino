#include "ArduinoBLE.h"
#include "TM1637TinyDisplay.h"

BLEService outputThingsService("19B10000-E8F2-537E-4F6C-D104768A1214");
BLEService inputThingsService("19B10000-E8F2-537E-4F6C-D104768A1215");

// MEHRER CHARSSTIAS PRO SERVICE

BLEByteCharacteristic ledSwitchCharacteristic("19B10000-E8F2-537E-4F6C-D104768A1216", BLERead | BLEWrite);

BLEByteCharacteristic angleTurnCharacteristic("19B10000-E8F2-537E-4F6C-D104768A1217", BLERead | BLENotify);

BLEByteCharacteristic buzzerPlayCharacteristic("19B10000-E8F2-537E-4F6C-D104768A1218", BLERead | BLEWrite);

BLEByteCharacteristic buttonPushCharacteristic("19B10000-E8F2-537E-4F6C-D104768A1219", BLERead | BLENotify);

const int         LED = LED_BUILTIN;
#define           ROTARY_ANGLE_SENSOR A0
#define           BUZZER 4
#define           BUTTON 6
TM1637TinyDisplay LCD(2, 3);

void setup() {
  Serial.begin(9600);
  while (!Serial);

  pinMode(LED,                 OUTPUT);
  pinMode(ROTARY_ANGLE_SENSOR, INPUT);
  pinMode(BUZZER,              OUTPUT);
  pinMode(BUTTON,              INPUT);

  LCD.setBrightness(4); 
  LCD.clear();

  LCD.showString("LOAD");
  Serial.println("Loading ...");

  if (!BLE.begin()) {
    Serial.println("Starting Bluetooth® Low Energy module failed");
    while (1);
  }

  BLE.setLocalName("bulp - Sensor BLE");

  BLE.setAdvertisedService(outputThingsService);
  BLE.setAdvertisedService(inputThingsService);

  // add the characteristics to the service
  outputThingsService.addCharacteristic(ledSwitchCharacteristic);
  inputThingsService.addCharacteristic(angleTurnCharacteristic);
  outputThingsService.addCharacteristic(buzzerPlayCharacteristic);
  inputThingsService.addCharacteristic(buttonPushCharacteristic);

  // add services
  BLE.addService(outputThingsService);
  BLE.addService(inputThingsService);

  // set the initial value for the characteristic:
  ledSwitchCharacteristic.writeValue(0);
  angleTurnCharacteristic.writeValue(analogRead(ROTARY_ANGLE_SENSOR) / 100);
  buzzerPlayCharacteristic.writeValue(0);
  buttonPushCharacteristic.writeValue(0);


  Serial.println("Initial LED: off");  
  Serial.println("Initial Angle: " + String(analogRead(ROTARY_ANGLE_SENSOR) / 100));
  Serial.println("Initial Buzzer: off");  
  Serial.println("Initial Button: not pushed");  

  BLE.advertise();
  Serial.println("bulp - Sensor BLE started");
  LCD.showString("WAIT");
}

void loop() {
  BLEDevice central       = BLE.central();
  int angleValueLast      = analogRead(ROTARY_ANGLE_SENSOR) / 100;
  int angleValueCurrent   = 0;

  // if a central is connected to peripheral:
  if (central) {
    LCD.showString("CONN");
    Serial.print("Connected to bulp - station: ");
    Serial.println(central.address());

    // while the central is still connected to peripheral:
    while (central.connected()) {

       // ANGLE ========
      angleValueCurrent = analogRead(ROTARY_ANGLE_SENSOR) / 100;
      if (angleValueLast != angleValueCurrent) {
        angleValueLast = angleValueCurrent;
        angleTurnCharacteristic.writeValue(angleValueLast);
        Serial.println("Angle: " + String(angleValueLast));
        String text = "A " + String(angleValueLast);
        LCD.showString(text.c_str());        
      }

      // LED ========
      if (ledSwitchCharacteristic.written()) {
        if (ledSwitchCharacteristic.value()) { // any value other than 0
          Serial.println("LED: on");
          digitalWrite(LED, HIGH);         
        }
        else {                            
          Serial.println("LED: off");
          digitalWrite(LED, LOW);     
        }
      }
      // BUZZER =========
      if (buzzerPlayCharacteristic.written()) {
        if (buzzerPlayCharacteristic.value()) { // any value other than 0
          Serial.println("Buzzer: on");
          digitalWrite(BUZZER, HIGH);         
        }
        else {                            
          Serial.println("Buzzer: off");
          digitalWrite(BUZZER, LOW);     
        }
      }
      // BUTTON ===========
      if (digitalRead(BUTTON) == HIGH) {
        buttonPushCharacteristic.writeValue(1);
        Serial.println("Button: pushed");
        LCD.showString("B 1");
        delay(1000);
        LCD.showString("B 0");
        buttonPushCharacteristic.writeValue(0);  
        Serial.println("Button: not pushed");       
      }
    }

    // when the central disconnects, print it out:
    Serial.print("Disconnected from central: ");
    LCD.showString("DISC");
    Serial.println(central.address());
  }
}
