/**
 * =============================================================================================
 * bulp.sensai - Scheduler header
 * ==============================
 */

#pragma once
#include <Arduino.h>

struct Task {
    unsigned long interval;
    unsigned long lastRun;
    void (*callback)();
};

#define TASK(interval_ms)        { (interval_ms), 0, NULL }
#define TASK_CB(interval_ms, fn) { (interval_ms), 0, (fn) }

bool taskUpdate(Task *task);
