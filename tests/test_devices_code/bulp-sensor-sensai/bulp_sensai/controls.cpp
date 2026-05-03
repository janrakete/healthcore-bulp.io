/**
 * =============================================================================================
 * bulp.sensai - Controls implementation
 * ======================================
 */

#include "controls.h"

static bool          _buttonRawPressed      = false; // Raw (un-debounced) pin state from the last tick.
static bool          _buttonStablePressed   = false; // Debounced stable state — changes only after BUTTON_DEBOUNCE_MS of stable raw input.
static bool          _buttonLongPressFired  = false; // Prevents the long-press event from firing more than once per press.
static unsigned long _buttonPressStartMs    = 0; // millis() timestamp of the last stable press-down edge.
static unsigned long _buttonLastDebounceMs  = 0; // millis() timestamp of the last raw state change — used for debouncing.

Task taskControls = TASK(CONTROL_UPDATE_INTERVAL_MS);

static bool controlsButtonIsPressed() {
  return digitalRead(PIN_BUTTON) == BUTTON_ACTIVE_LEVEL;
}

void controlsInit() {
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  
  const bool initialPressed = controlsButtonIsPressed(); // Seed the debounce state from the actual pin level at boot so we don't misinterpret the initial state as a press event.
  const unsigned long nowMs = millis();

  _buttonRawPressed     = initialPressed;
  _buttonStablePressed  = initialPressed;
  _buttonLongPressFired = false;
  _buttonPressStartMs   = initialPressed ? nowMs : 0;
  _buttonLastDebounceMs = nowMs;
}

ControlEvent controlsUpdate() {
  const unsigned long nowMs     = millis();
  const bool rawPressed         = controlsButtonIsPressed();
  ControlEvent event            = CONTROL_EVENT_NONE;
  
  if (rawPressed != _buttonRawPressed) { // Track any raw state change and restart the debounce timer.
    _buttonRawPressed       = rawPressed;
    _buttonLastDebounceMs   = nowMs;
  }
  
  if ((nowMs - _buttonLastDebounceMs) >= BUTTON_DEBOUNCE_MS && // Accept the raw state as stable only after it has been unchanged for BUTTON_DEBOUNCE_MS.
      _buttonStablePressed != _buttonRawPressed) {
    _buttonStablePressed = _buttonRawPressed;

    if (_buttonStablePressed) {
      _buttonPressStartMs   = nowMs; // Rising edge: record press start time.
      _buttonLongPressFired = false;
    }
    else {
      const unsigned long pressDurationMs = nowMs - _buttonPressStartMs; // Falling edge: classify the completed press by its duration.

      if (!_buttonLongPressFired && pressDurationMs >= BUTTON_SHORT_PRESS_MS && pressDurationMs < BUTTON_LONG_PRESS_MS) {
        event = CONTROL_EVENT_BUTTON_SHORT_PRESS;
      }

      _buttonPressStartMs   = 0;
      _buttonLongPressFired = false;
    }
  }
  
  if (_buttonStablePressed && !_buttonLongPressFired && (nowMs - _buttonPressStartMs) >= BUTTON_LONG_PRESS_MS) { // Long-press fires once while the button is still held, after BUTTON_LONG_PRESS_MS.
    _buttonLongPressFired = true;
    event                 = CONTROL_EVENT_BUTTON_LONG_PRESS;
  }

  return event;
}
