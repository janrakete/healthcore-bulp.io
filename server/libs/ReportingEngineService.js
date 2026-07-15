/**
 * =============================================================================================
 * Reporting Service - generates and stores reports for individuals based on device readings
 * =========================================================================================
 */

const appConfig     = require("../../config");
const common        = require("../../common");

const reportingEngineLanguage = require("./ReportingEngineLanguage");

const EVENT_VALUES_INACTIVE = new Set(["0", "false", "off", "no", "inactive", "undetected"]);

class ReportingService {
    /**
     * @param {Object} reportingEngine - Engine with generateReport(facts) method.
     */
    constructor(reportingEngine) {
        this.reportingEngine = reportingEngine;
    }

    /**
     * Generates and stores reports for all individuals for an explicit time window.
     * @param {string} [reportDate] - Optional storage label (YYYY-MM-DD).
     * @returns {Promise<Array<Object>>}
     */
    async generateAndStoreReports(reportDate, options = {}) {
        const range             = this.resolveRange(options.startDateTime, options.endDateTime);
        const targetDate        = reportDate || this.toDateString(range.startUnix);
        const requestedLanguage = options.language || appConfig.CONF_reportingLanguage;
        const reportLanguage    = reportingEngineLanguage.reportLanguageNormalize(requestedLanguage);
        const individuals       = database.prepare("SELECT individualID, firstname, lastname, roomID FROM individuals ORDER BY individualID ASC").all();

        const reports = [];

        for (const individual of individuals) {
            const facts = this.buildFactsForIndividual(individual, targetDate, range);

            let summaryText     = reportingEngineLanguage.reportNoDataSummaryGet(reportLanguage);
            let modelName       = null;

            if (facts.totalReadings > 0 && this.reportingEngine && typeof this.reportingEngine.generateReport === "function") { // Only generate report if there are readings and the reporting engine is available
                try {
                    summaryText = await this.reportingEngine.generateReport(facts, { language: reportLanguage });
                    modelName   = this.reportingEngine.getModelPath();
                }
                catch (error) {
                    common.conLog("Reporting Service: LLM generation failed for individual " + individual.individualID + ": " + error.message, "red");
                }
            }

            this.upsertReport(individual.individualID, targetDate, facts, summaryText, modelName, reportLanguage);

            reports.push({
                individualID: individual.individualID,
                reportDate: targetDate,
                windowStart: this.toIso(range.startUnix),
                windowEnd: this.toIso(range.endUnix),
                reportLanguage,
                totalReadings: facts.totalReadings,
                summaryText,
                modelName
            });
        }

        common.conLog("Reporting Service: Generated " + reports.length + " reports for " + targetDate, "gre");
        return reports;
    }

    /**
     * Creates deterministic facts from device readings for one individual and one explicit time window.
     * @param {Object} individual
     * @param {string} reportDate
     * @param {{startUnix:number,endUnix:number}} range
     * @returns {Object}
     */
    buildFactsForIndividual(individual, reportDate, range) {
        const devices   = this.getAssignedDevices(individual); // Get all devices assigned to the individual, either directly or via room assignment
        const deviceIDs = devices.map((device) => Number(device.deviceID)).filter((id) => Number.isFinite(id) && id > 0);

        if (deviceIDs.length === 0) {
            return {
                individual,
                reportDate,
                windowStart: this.toIso(range.startUnix),
                windowEnd: this.toIso(range.endUnix),
                totalReadings: 0,
                firstActivity: null,
                lastActivity: null,
                roomActivity: [],
                topProperties: [],
                numericPropertyStats: {},
                propertyDailySummaries: {},
                propertySpikeFindings: [],
                alerts: this.getAlerts(individual.individualID),
                devices: []
            };
        }

        const placeholders  = deviceIDs.map(() => "?").join(",");
        const readings      = database.prepare(
            "SELECT mdv.*, d.name AS deviceName, d.productName, d.roomID FROM mqtt_devices_values AS mdv JOIN devices AS d ON d.deviceID = mdv.deviceID WHERE mdv.deviceID IN (" + placeholders + ") AND mdv.dateTimeAsNumeric >= ? AND mdv.dateTimeAsNumeric < ? ORDER BY mdv.dateTimeAsNumeric ASC"
        ).all(...deviceIDs, range.startUnix, range.endUnix);

        const firstReading  = readings[0] || null; // First reading in the time window, or null if no readings
        const lastReading   = readings.length > 0 ? readings[readings.length - 1] : null; // Last reading in the time window, or null if no readings

        const roomNamesById        = this.getRoomNamesById(devices);
        const reportingDefinitions = this.buildReportingPropertyDefinitionsByDevice(devices);
        const roomActivityCounter  = new Map();
        const propertyCounter      = new Map();

        for (const reading of readings) { // Count room activity and property occurrences
            const roomName = roomNamesById.get(Number(reading.roomID));
            roomActivityCounter.set(roomName, (roomActivityCounter.get(roomName) || 0) + 1);

            const reportablePropertyName = this.getReportablePropertyName(reading, reportingDefinitions); // Only count properties that are report-relevant
            if (reportablePropertyName) {
                propertyCounter.set(reportablePropertyName, (propertyCounter.get(reportablePropertyName) || 0) + 1);
            }
        }

        const propertyDailySummaries = this.buildPropertyDailySummaries(readings, reportingDefinitions);
        const propertySpikeFindings  = this.buildSpikeFindingsFromDailySummaries(propertyDailySummaries);

        return {
            individual,                                                                                                 // Include individual info for context, e.g., name, roomID. Needed for LLM context.
            reportDate,                                                                                                 // The report date label (YYYY-MM-DD).
            windowStart: this.toIso(range.startUnix),                                                                   // ISO 8601 string for the start of the time window.
            windowEnd: this.toIso(range.endUnix),                                                                       // ISO 8601 string for the end of the time window
            totalReadings: readings.length,                                                                             // Total number of readings in the time window. This is used to determine if there is enough data to generate a report.
            firstActivity: firstReading ? this.toIso(firstReading.dateTimeAsNumeric) : null,                            // ISO 8601 string for the first reading's timestamp. 
            lastActivity: lastReading ? this.toIso(lastReading.dateTimeAsNumeric) : null,                               // ISO 8601 string for the last reading's timestamp
            roomActivity: this.mapToSortedArray(roomActivityCounter),                                                   // Array of {name: roomName, count: number} sorted by count descending. This is used to determine which rooms had the most activity during the time window.
            topProperties: this.mapToSortedArray(propertyCounter).slice(0, appConfig.CONF_reportingTopPropertiesCount), // Array of top properties with counts, sorted by count descending. This is used to determine which properties had the most readings during the time window.
            numericPropertyStats: this.buildNumericPropertyStats(readings, reportingDefinitions),                       // Object with min/max/avg/count for report-relevant numeric properties.
            propertyDailySummaries,                                                                                     // Daily active event summaries for report-relevant properties.
            propertySpikeFindings,                                                                                      // Flattened spike findings across all report-relevant properties.
            alerts: this.getAlerts(individual.individualID),                                                            // Array of alerts for the individual. Needed for LLM context to provide relevant information about the individual's health status.
            devices: devices.map((device) => ({                                                                         // Include device info for context, e.g., deviceID, name, productName, roomID. This is used to provide context for the report generation.
                deviceID: device.deviceID,
                name: device.name,
                productName: device.productName,
                roomID: device.roomID
            }))
        };
    }

    /**
    * Resolves a usable [start,end) unix range in milliseconds from optional ISO date-time strings.
     * If both values are omitted, defaults to yesterday 00:00:00 - today 00:00:00.
     * @param {string|undefined} startDateTime
     * @param {string|undefined} endDateTime
    * @returns {{startUnix:number, endUnix:number}}
     */
    resolveRange(startDateTime, endDateTime) {
        if (startDateTime === undefined && endDateTime === undefined) {
            return this.getDefaultDailyRange();
        }

        if (startDateTime === undefined || endDateTime === undefined) {
            throw new Error("startDateTime and endDateTime must be provided together");
        }

        const startUnix = this.toUnixMilliseconds(startDateTime);
        const endUnix   = this.toUnixMilliseconds(endDateTime);

        if (!Number.isFinite(startUnix) || !Number.isFinite(endUnix)) {
            throw new Error("startDateTime and endDateTime must be valid ISO date-time strings");
        }

        if (startUnix >= endUnix) {
            throw new Error("startDateTime must be before endDateTime");
        }

        return { startUnix, endUnix };
    }

    /**
     * Returns a default daily range from yesterday 00:00:00 to today 00:00:00
     * @returns {{startUnix:number,endUnix:number}}
     */
    getDefaultDailyRange() {
        const endDate = new Date();
        endDate.setHours(0, 0, 0, 0);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 1);

        return {
            startUnix: startDate.getTime(),
            endUnix: endDate.getTime()
        };
    }

    /**
     * Computes min/max/avg/count for every property that has numeric readings.
     * Completely sensor-agnostic: works for heartrate, temperature, SpO2, etc.
     * @param {Array<Object>} readings
     * @returns {Object} - keys are property names, values are {min, max, avg, count}
     */
    buildNumericPropertyStats(readings, reportingDefinitions) {
        const buckets = new Map();

        for (const reading of readings) {
            const reportablePropertyName = this.getReportablePropertyName(reading, reportingDefinitions); // Only include properties that are report-relevant (reportingInclude = true)
            if (!reportablePropertyName) {
                continue;
            }

            const value = Number(reading.valueAsNumeric);
            if (!Number.isFinite(value)) {
                continue; // Skip non-numeric properties (e.g. boolean state, strings)
            }

            if (!buckets.has(reportablePropertyName)) {
                buckets.set(reportablePropertyName, { min: value, max: value, sum: value, count: 1 });
            }
            else {
                const bucket  = buckets.get(reportablePropertyName);
                bucket.min    = Math.min(bucket.min, value);
                bucket.max    = Math.max(bucket.max, value);
                bucket.sum   += value;
                bucket.count += 1;
            }
        }

        const stats = {};
        for (const [propertyName, bucket] of buckets.entries()) {
            stats[propertyName] = {
                min:   bucket.min,
                max:   bucket.max,
                avg:   Math.round((bucket.sum / bucket.count) * 100) / 100,
                count: bucket.count
            };
        }

        return stats;
    }

    /**
     * Builds reporting property definitions by device from persisted converter metadata.
     * Requires property.reportingInclude to be explicitly set, otherwise the property is excluded.
     * @param {Array<Object>} devices
     * @returns {Map<number, Map<string, {reportingInclude:boolean,reportingRole:string|null}>>}
     */
    buildReportingPropertyDefinitionsByDevice(devices) {
        const definitionsByDevice = new Map();

        for (const device of devices) {
            const deviceID = Number(device.deviceID);
            const definitions = new Map();

            if (!Number.isFinite(deviceID)) {
                continue;
            }

            let properties = [];
            try {
                properties = JSON.parse(String(device.properties || "[]"));
            }
            catch (error) {
                common.conLog("Reporting Service: Invalid device properties JSON for deviceID " + deviceID + ": " + error.message, "red");
                definitionsByDevice.set(deviceID, definitions);
                continue;
            }

            if (!Array.isArray(properties)) {
                common.conLog("Reporting Service: Expected properties array for deviceID " + deviceID, "red");
                definitionsByDevice.set(deviceID, definitions);
                continue;
            }

            for (const property of properties) {
                const propertyName = String(property && property.name || "").trim();
                if (propertyName.length === 0) {
                    continue;
                }

                if (typeof property.reportingInclude !== "boolean") {
                    common.conLog("Reporting Service: Missing reportingInclude for property '" + propertyName + "' on deviceID " + deviceID, "red");
                    continue;
                }

                definitions.set(propertyName.toLowerCase(), {
                    reportingInclude: property.reportingInclude,
                    reportingRole: typeof property.reportingRole === "string" ? property.reportingRole : null
                });
            }

            definitionsByDevice.set(deviceID, definitions);
        }

        return definitionsByDevice;
    }

    /**
     * Resolves the reporting definition for a reading entry (deviceID + property) from the reportingDefinitions map. Returns null if not found or if reportingInclude is not true.
     * @param {Object} entry
     * @param {Map<number, Map<string, {reportingInclude:boolean,reportingRole:string|null}>>} reportingDefinitions
     * @returns {{reportingInclude:boolean,reportingRole:string|null}|null}
     */
    getReportingPropertyDefinition(entry, reportingDefinitions) {
        const deviceID = Number(entry && entry.deviceID);
        const propertyName = String(entry && entry.property || "").trim().toLowerCase();

        if (!Number.isFinite(deviceID) || propertyName.length === 0) {
            return null;
        }

        const byDevice = reportingDefinitions.get(deviceID);
        if (!byDevice) {
            return null;
        }

        const definition = byDevice.get(propertyName);
        if (!definition || definition.reportingInclude !== true) {
            return null;
        }

        return definition;
    }

    /**
     * Returns the canonical property name when a reading is report-relevant, i.e. reportingInclude is true. Returns null otherwise.
     * @param {Object} entry
     * @param {Map<number, Map<string, {reportingInclude:boolean,reportingRole:string|null}>>} reportingDefinitions
     * @returns {string|null}
     */
    getReportablePropertyName(entry, reportingDefinitions) {
        const definition = this.getReportingPropertyDefinition(entry, reportingDefinitions);
        if (!definition) {
            return null;
        }

        const propertyName = String(entry && entry.property || "").trim();
        if (propertyName.length === 0) {
            return null;
        }

        return propertyName;
    }

    /**
     * Builds daily active-event summaries per report-relevant property, i.e. properties with reportingInclude = true. Each property has a total count, an array of daily counts, and an array of spike days.
     * @param {Array<Object>} readings
     * @param {Map<number, Map<string, {reportingInclude:boolean,reportingRole:string|null}>>} reportingDefinitions
     * @returns {Object}
     */
    buildPropertyDailySummaries(readings, reportingDefinitions) {
        const countersByProperty = new Map();

        for (const reading of readings) {
            const reportablePropertyName = this.getReportablePropertyName(reading, reportingDefinitions);
            if (!reportablePropertyName || !this.isPropertyEventActive(reading)) {
                continue;
            }

            if (!countersByProperty.has(reportablePropertyName)) {
                countersByProperty.set(reportablePropertyName, new Map());
            }

            const dayCounter = countersByProperty.get(reportablePropertyName);
            const day = this.toDateString(reading.dateTimeAsNumeric);
            dayCounter.set(day, (dayCounter.get(day) || 0) + 1);
        }

        const summaries = {};
        const propertyNames = [...countersByProperty.keys()].sort((a, b) => a.localeCompare(b));

        for (const propertyName of propertyNames) {
            const dayCounter = countersByProperty.get(propertyName);
            const dailyCounts = [...dayCounter.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
            const spikeDays = this.buildSpikeDaysFromDailyCounts(dailyCounts);

            summaries[propertyName] = {
                totalCount: dailyCounts.reduce((sum, dayEntry) => sum + dayEntry.count, 0),
                dailyCounts,
                spikeDays
            };
        }

        return summaries;
    }

    /**
     * Builds spike-day records for one property from sorted daily counts, where a spike day is defined as a day with a count greater than any previous day.
     * Each spike day includes the date, count, previous max, and delta to previous max. i.e. the difference between the current count and the previous max.
     * @param {Array<{date:string,count:number}>} dailyCounts
     * @returns {Array<{date:string,count:number,previousMax:number,deltaToPreviousMax:number}>}
     */
    buildSpikeDaysFromDailyCounts(dailyCounts) {
        const spikeDays = [];
        let previousMax = -1;

        for (const dayEntry of dailyCounts) {
            if (previousMax >= 0 && dayEntry.count > previousMax) {
                spikeDays.push({
                    date: dayEntry.date,
                    count: dayEntry.count,
                    previousMax,
                    deltaToPreviousMax: dayEntry.count - previousMax
                });
            }

            if (dayEntry.count > previousMax) {
                previousMax = dayEntry.count;
            }
        }

        return spikeDays;
    }

    /**
     * Flattens spike findings across all properties. Each finding includes the property name, date, count, previous max, and delta to previous max.
     * The findings are sorted by date ascending, then by property name ascending.
     * @param {Object} propertyDailySummaries
     * @returns {Array<{property:string,date:string,count:number,previousMax:number,deltaToPreviousMax:number}>}
     */
    buildSpikeFindingsFromDailySummaries(propertyDailySummaries) {
        const findings = [];

        for (const [property, summary] of Object.entries(propertyDailySummaries)) {
            if (!summary || !Array.isArray(summary.spikeDays)) {
                continue;
            }

            for (const spike of summary.spikeDays) {
                findings.push({
                    property,
                    date: spike.date,
                    count: spike.count,
                    previousMax: spike.previousMax,
                    deltaToPreviousMax: spike.deltaToPreviousMax
                });
            }
        }

        return findings.sort((a, b) => {
            const byDate = a.date.localeCompare(b.date);
            if (byDate !== 0) {
                return byDate;
            }
            return a.property.localeCompare(b.property);
        });
    }

    /**
     * Returns true when a reading represents an active event for reporting.
     * A reading is considered active if its numeric value is greater than 0, or if its text value is not in the set of inactive values.
     * @param {Object} entry
     * @returns {boolean}
     */
    isPropertyEventActive(entry) {
        if (!entry) {
            return false;
        }

        const numeric = Number(entry.valueAsNumeric);
        if (Number.isFinite(numeric)) {
            return numeric > 0;
        }

        const textValue = String(entry.value || "").trim().toLowerCase();
        if (textValue.length === 0) {
            return false;
        }

        return !EVENT_VALUES_INACTIVE.has(textValue);
    }

    /**
     * Returns alerts for an individual, for LLM context.
     * @param {number} individualID
     * @returns {Array<Object>}
     */
    getAlerts(individualID) {
        return database.prepare(
            "SELECT type, score, title, property, source, dateTimeAdded FROM alerts WHERE individualID = ? AND status IN ('open', 'acknowledged', 'resolved') ORDER BY score DESC, dateTimeAdded DESC"
        ).all(individualID).map((alert) => ({
            type:          alert.type,
            score:         alert.score,
            title:         alert.title,
            property:      alert.property,
            source:        alert.source,
            dateTimeAdded: alert.dateTimeAdded
        }));
    }

    /**
     * Returns all devices assigned to an individual, either directly or via room assignment
     * @param {Object} individual
     * @returns {Array<Object>}
     */
    getAssignedDevices(individual) {
        return database.prepare(
            "SELECT deviceID, name, productName, roomID, properties FROM devices WHERE individualID = ? OR (roomID = ? AND COALESCE(individualID, 0) = 0) ORDER BY deviceID ASC"
        ).all(individual.individualID, individual.roomID || 0);
    }

    /**
     * Returns a map of roomID to room name for the given devices
     * @param {Array<Object>} devices
     * @returns {Map<number,string>}
     */
    getRoomNamesById(devices) {
        const map = new Map();
        const roomIDs = [...new Set(devices.map((device) => Number(device.roomID)).filter((roomID) => Number.isFinite(roomID) && roomID > 0))]; // Unique, valid room IDs

        if (roomIDs.length === 0) {
            return map;
        }
        else {
            const placeholders = roomIDs.map(() => "?").join(",");
            const rooms        = database.prepare("SELECT roomID, name FROM rooms WHERE roomID IN (" + placeholders + ")").all(...roomIDs);

            for (const room of rooms) {
                map.set(Number(room.roomID), room.name);
            }

            return map;
        }
    }

    /**
     * Inserts or updates a report for an individual and date
     * @param {number} individualID
     * @param {string} reportDate
     * @param {Object} facts
     * @param {string} summaryText
     * @param {string} modelName
     * @param {string} reportLanguage
     */
    upsertReport(individualID, reportDate, facts, summaryText, modelName, reportLanguage) {

        const factsJson = JSON.stringify(facts);
        const resolvedModelName = modelName || null;
        const resolvedReportLanguage = reportLanguage || appConfig.CONF_reportingLanguage;

        const existing = database.prepare( // Check if a report already exists for this individual and date
            "SELECT reportID FROM reporting_reports WHERE individualID = ? AND reportDate = ? LIMIT 1"
        ).get(individualID, reportDate);

        if (existing) {
            database.prepare(  // Update existing report
                "UPDATE reporting_reports SET factsJson = ?, summaryText = ?, modelName = ?, reportLanguage = ?, status = 'generated', dateTimeAdded = datetime('now', 'localtime') WHERE individualID = ? AND reportDate = ?"
            ).run(factsJson, summaryText, resolvedModelName, resolvedReportLanguage, individualID, reportDate);
        }
        else {
            database.prepare( // Insert new report
                "INSERT INTO reporting_reports (individualID, reportDate, factsJson, summaryText, modelName, reportLanguage, status, dateTimeAdded) VALUES (?, ?, ?, ?, ?, ?, 'generated', datetime('now', 'localtime'))"
            ).run(individualID, reportDate, factsJson, summaryText, resolvedModelName, resolvedReportLanguage);
        }
    }

    /**
     * Converts Unix milliseconds to YYYY-MM-DD string
     * @param {number|string} unixMs
     * @returns {string}
     */
    toDateString(unixTime) {
        const unixNumeric = Number(unixTime);
        if (!Number.isFinite(unixNumeric)) {
            return new Date().toISOString().slice(0, 10);
        }
        return new Date(unixNumeric).toISOString().slice(0, 10);
    }

    /**
     * Converts an ISO 8601 string to Unix milliseconds
     * @param {string} isoDateTime
     * @returns {number}
     */
    toUnixMilliseconds(isoDateTime) {
        const unixMs = Date.parse(String(isoDateTime || "")); // Returns NaN for invalid dates
        if (!Number.isFinite(unixMs)) {
            return NaN;
        }
        return unixMs;
    }

    /**
     * Converts a map of counters to a sorted array of objects
     * @param {Map<string, number>} counter
     * @returns {Array<{name:string,count:number}>}
     */
    mapToSortedArray(counter) {
        return [...counter.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    }

    /**
     * Converts Unix milliseconds to ISO 8601 string
     * @param {number|string} unixMs
     * @returns {string}
     */
    toIso(unixTime) {
        const unixNumeric = Number(unixTime);
        if (!Number.isFinite(unixNumeric)) {
            return "";
        }
        return new Date(unixNumeric).toISOString();
    }
}

module.exports = ReportingService;
