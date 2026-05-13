/**
 * =============================================================================================
 * bulp.sensai - Scheduler implementation
 * ======================================
 */

#include "scheduler.h"

/**
 * Updates the given task. Call this at a regular interval (e.g. in the main loop) to execute the task's callback if its interval has elapsed. Returns true if the task was executed, false otherwise.
 */
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
