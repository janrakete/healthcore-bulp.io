#pragma once
#include <Arduino.h>
#include "config.h"
#include "scheduler.h"

enum LedState {
  LED_OFF,
  LED_BOOT,
  LED_ZIGBEE_CONNECTED,
  LED_WIFI_CONNECTED,
  LED_NO_CONNECTION,
  LED_PAIRING,
  LED_RESET,
  LED_ERROR
};

extern Task taskLedBlink;

void ledInit();
void ledSetColor(uint8_t R, uint8_t G, uint8_t B, bool blink = false);
void ledSetState(LedState state);
LedState ledGetState();
void ledUpdate();
