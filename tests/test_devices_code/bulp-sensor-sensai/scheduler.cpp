/**
 * =============================================================================================
 * bulp.sensai - Scheduler implementation
 * ======================================
 */

#include "scheduler.h"

bool taskUpdate(Task *task) {
    unsigned long now = millis();

    if (now - task->lastRun >= task->interval) {
        task->lastRun = now;

        if (task->callback != NULL) {
            task->callback();
        }
        return true;
    }

    return false;
}
