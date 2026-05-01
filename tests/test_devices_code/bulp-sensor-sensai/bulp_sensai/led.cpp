#include "led.h"
#include "Adafruit_NeoPixel.h"

static Adafruit_NeoPixel _led(1, PIN_LED, NEO_GRB + NEO_KHZ800);

static LedState  _ledStateCurrent = LED_OFF;
static uint8_t   _ledBlinkR       = 0;
static uint8_t   _ledBlinkG       = 0;
static uint8_t   _ledBlinkB       = 0;
static bool      _ledBlinkActive  = false;
static bool      _ledBlinkOn      = false;

Task taskLedBlink = TASK(LED_BLINK_INTERVAL_MS);

void ledInit() {
  _led.begin();
  _led.setBrightness(40);
  _led.clear();
  _led.show();
}

void ledSetColor(uint8_t R, uint8_t G, uint8_t B, bool blink) {
  _ledBlinkR = R;
  _ledBlinkG = G;
  _ledBlinkB = B;

  _ledBlinkActive = blink;
  _ledBlinkOn = true;

  _led.setPixelColor(0, _led.Color(R, G, B));
  _led.show();
}

void ledSetState(LedState state) {
  _ledStateCurrent = state;

  switch (state) {
    case LED_OFF:               ledSetColor(  0,   0,   0, false);  break;  // Off
    case LED_BOOT:              ledSetColor(  0,   0, 255, false);  break;  // Blue
    case LED_ZIGBEE_CONNECTED:  ledSetColor(  0, 255,   0, false);  break;  // Green
    case LED_WIFI_CONNECTED:    ledSetColor(  0, 255,   0, false);  break;  // Green
    case LED_NO_CONNECTION:     ledSetColor(255, 180,   0, true);   break;  // Orange blinking
    case LED_PAIRING:           ledSetColor(255, 255,   0, true);   break;  // Yellow blinking
    case LED_RESET:             ledSetColor(255,   0,   0, false);  break;  // Red
    case LED_ERROR:             ledSetColor(255,   0,   0, true);   break;  // Red blinking
  }
}

LedState ledGetState() {
  return _ledStateCurrent;
}

void ledUpdate() {
  if (taskUpdate(&taskLedBlink) && _ledBlinkActive) {
    _ledBlinkOn = !_ledBlinkOn;
    
    if (_ledBlinkOn) {
        _led.setPixelColor(0, _led.Color(_ledBlinkR, _ledBlinkG, _ledBlinkB));
    }
    else {
        _led.setPixelColor(0, _led.Color(0, 0, 0));
    }
    
    _led.show();
  }
}
