#pragma once

#include <Arduino.h>
#include "config.h"
#include "scheduler.h"

// Events emitted by controlsUpdate() on each scheduler tick.
enum ControlEvent {
  CONTROL_EVENT_NONE,               // No event this tick
  CONTROL_EVENT_BUTTON_SHORT_PRESS, // Button released after BUTTON_SHORT_PRESS_MS .. BUTTON_LONG_PRESS_MS
  CONTROL_EVENT_BUTTON_LONG_PRESS   // Button held for >= BUTTON_LONG_PRESS_MS (fires once per press)
};

extern Task taskControls; // Scheduler task — drives the debounce state machine at CONTROL_UPDATE_INTERVAL_MS.

void controlsInit(); // Configures PIN_BUTTON and seeds the debounce state from the current pin level.

ControlEvent controlsUpdate(); // Advances the debounce state machine and returns any event that occurred this tick. Must be called only when taskUpdate(&taskControls) returns true.
