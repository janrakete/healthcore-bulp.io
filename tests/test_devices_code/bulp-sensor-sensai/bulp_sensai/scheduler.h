/**
 * =============================================================================================
 * bulp.top 1 - Scheduler header
 * ==============================
 */

#pragma once
#include <Arduino.h>

struct Task {
    unsigned long interval;
    unsigned long lastRun;
    void (*callback)();
};

#define TASK(interval_ms)        { (interval_ms), 0, NULL } // Helper macro to define a Task with an interval and callback function, e.g. TASK(1000, myFunction) for a task that runs myFunction every 1000 ms.
#define TASK_CB(interval_ms, fn) { (interval_ms), 0, (fn) } // Helper macro to define a Task with an interval and callback function in one line, e.g. TASK_CB(1000, myFunction) for a task that runs myFunction every 1000 ms.

bool taskUpdate(Task *task);
