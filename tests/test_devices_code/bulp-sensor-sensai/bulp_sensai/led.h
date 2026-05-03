#pragma once
#include <Arduino.h>
#include "config.h"
#include "scheduler.h"

// High-level LED states. Each state maps to a fixed colour and optional blink pattern.
enum LedState {
  LED_OFF,               // Off
  LED_BOOT,              // Blue solid      — booting / initialising
  LED_ZIGBEE_CONNECTED,  // Green solid     — Zigbee link up
  LED_WIFI_CONNECTED,    // Green solid     — Wi-Fi link up
  LED_NO_CONNECTION,     // Orange blinking — no network connection
  LED_PAIRING,           // Yellow blinking — pairing mode active
  LED_RESET,             // Red solid       — factory reset triggered
  LED_ERROR              // Red blinking    — hardware error
};

extern Task taskLedBlink; // Scheduler task — drives the blink toggle at LED_BLINK_INTERVAL_MS. Must be ticked by the main loop via taskUpdate(&taskLedBlink).

void ledInit(); // Initialises the NeoPixel hardware.

void ledSetColor(uint8_t R, uint8_t G, uint8_t B, bool blink = false); // Sets the LED to an arbitrary RGB colour with optional blink.

void ledSetState(LedState state); // Applies the colour and blink pattern for a named state.

LedState ledGetState(); // Returns the currently active LED state.

void ledUpdate(); // Advances the blink state machine by one tick. Must be called only when taskUpdate(&taskLedBlink) returns true.
