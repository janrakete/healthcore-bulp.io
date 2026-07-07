/**
 * =============================================================================================
 * Reporting Service - generates and stores reports for individuals based on device readings
 * =========================================================================================
 */

const appConfig     = require("../../config");
const common        = require("../../common");

const { reportLanguageNormalize, reportNoDataSummaryGet } = require("./ReportingEngineLanguage");

class ReportingService {
    /**
     * @param {Object} reportingEngine - Engine with generateReport(facts) method.
     */
    constructor(reportingEngine) {
        this.reportingEngine = reportingEngine;
    }

    /**
     * Generates and stores reports for all individuals for a specific date (default: yesterday).
     * @param {string} [reportDate]
     * @returns {Promise<Array<Object>>}
     */
    async generateAndStoreReports(reportDate, options = {}) {
        const targetDate        = reportDate || this.getYesterdayDateString();
        const requestedLanguage = options.language || appConfig.CONF_reportingLanguage;
        const reportLanguage    = reportLanguageNormalize(requestedLanguage);
        const individuals       = database.prepare("SELECT individualID, firstname, lastname, roomID FROM individuals ORDER BY individualID ASC").all();

        const reports = [];

        for (const individual of individuals) {
            const facts = this.buildFactsForIndividual(individual, targetDate);

            let summaryText     = reportNoDataSummaryGet(reportLanguage);
            let modelName       = "fallback";

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
     * Creates deterministic facts from device readings for one individual and one day.
     * @param {Object} individual
     * @param {string} reportDate
     * @returns {Object}
     */
    buildFactsForIndividual(individual, reportDate) {
        const range     = this.getDayRange(reportDate);
        const devices   = this.getAssignedDevices(individual);
        const deviceIDs = devices.map((device) => Number(device.deviceID)).filter((id) => Number.isFinite(id) && id > 0);

        if (deviceIDs.length === 0) {
            return {
                individual,
                reportDate,
                totalReadings: 0,
                firstActivity: null,
                lastActivity: null,
                nightActivityCount: 0,
                unusualTimeSignals: [],
                roomActivity: [],
                topProperties: [],
                nightAssignedRoomActivityCount: 0,
                devices: []
            };
        }

        const placeholders  = deviceIDs.map(() => "?").join(",");
        const readings      = database.prepare(
            "SELECT mdv.*, d.name AS deviceName, d.productName, d.roomID FROM mqtt_devices_values AS mdv JOIN devices AS d ON d.deviceID = mdv.deviceID WHERE mdv.deviceID IN (" + placeholders + ") AND mdv.dateTimeAsNumeric >= ? AND mdv.dateTimeAsNumeric < ? ORDER BY mdv.dateTimeAsNumeric ASC"
        ).all(...deviceIDs, range.startUnix, range.endUnix);

        const firstReading  = readings[0] || null;
        const lastReading   = readings.length > 0 ? readings[readings.length - 1] : null;

        const nightReadings = readings.filter((entry) => {
            const hour = Number(entry.hour);
            return this.isNightHour(hour);
        });

        const unusualTimeSignals = [];
        if (firstReading && this.isVeryEarlyHour(Number(firstReading.hour))) { // Check if the first reading is in the very early hours (before night window)
            unusualTimeSignals.push({
                type: "very_early_activity",
                dateTime: this.toIso(firstReading.dateTimeAsNumeric)
            });
        }
        if (lastReading && this.isVeryLateHour(Number(lastReading.hour))) { // Check if the last reading is in the very late hours (after night window)
            unusualTimeSignals.push({
                type: "very_late_activity",
                dateTime: this.toIso(lastReading.dateTimeAsNumeric)
            });
        }

        const roomNamesById        = this.getRoomNamesById(devices);
        const roomActivityCounter  = new Map();
        const propertyCounter      = new Map();

        for (const entry of readings) { // Count room activity and property occurrences
            const roomName = roomNamesById.get(Number(entry.roomID)) || "Unassigned";
            roomActivityCounter.set(roomName, (roomActivityCounter.get(roomName) || 0) + 1);
            propertyCounter.set(entry.property, (propertyCounter.get(entry.property) || 0) + 1);
        }

        const nightAssignedRoomActivityCount = nightReadings.filter((entry) => {
            const roomName = roomNamesById.get(Number(entry.roomID));
            return typeof roomName === "string" && roomName.trim() !== "";
        }).length;

        return {
            individual,
            reportDate,
            totalReadings: readings.length,
            firstActivity: firstReading ? this.toIso(firstReading.dateTimeAsNumeric) : null,
            lastActivity: lastReading ? this.toIso(lastReading.dateTimeAsNumeric) : null,
            nightActivityCount: nightReadings.length,
            unusualTimeSignals,
            roomActivity: this.mapToSortedArray(roomActivityCounter),
            topProperties: this.mapToSortedArray(propertyCounter).slice(0, 10),
            nightAssignedRoomActivityCount,
            devices: devices.map((device) => ({
                deviceID: device.deviceID,
                name: device.name,
                productName: device.productName,
                roomID: device.roomID
            }))
        };
    }

    /**
     * @param {number} hour
     * @returns {boolean}
     */
    isNightHour(hour) {
        if (!Number.isFinite(hour)) {
            return false;
        }

        const { startHour, endHour } = this.getNightWindowHours();

        if (startHour === endHour) {
            return true; // 24h window
        }

        if (startHour > endHour) {
            return hour >= startHour || hour <= endHour; // Overnight window (e.g. 22-5)
        }

        return hour >= startHour && hour <= endHour; // Same-day window (e.g. 1-6)
    }

    /**
     * @param {number} hour
     * @returns {boolean}
     */
    isVeryEarlyHour(hour) {
        if (!Number.isFinite(hour)) {
            return false;
        }

        const { startHour, endHour } = this.getNightWindowHours();

        if (startHour === endHour) {
            return false;
        }

        if (startHour > endHour) {
            return hour <= endHour;
        }

        return hour <= startHour;
    }

    /**
     * @param {number} hour
     * @returns {boolean}
     */
    isVeryLateHour(hour) {
        if (!Number.isFinite(hour)) {
            return false;
        }

        const { startHour, endHour } = this.getNightWindowHours();

        if (startHour === endHour) {
            return false;
        }

        if (startHour > endHour) {
            return hour >= startHour;
        }

        return hour >= endHour;
    }

    /**
     * @returns {{startHour:number,endHour:number}}
     */
    getNightWindowHours() {
        const configuredStartHour = Number.isFinite(appConfig.CONF_reportingNightStartHour) ? appConfig.CONF_reportingNightStartHour : 22;
        const configuredEndHour = Number.isFinite(appConfig.CONF_reportingNightEndHour) ? appConfig.CONF_reportingNightEndHour : 5;

        const startHour = ((configuredStartHour % 24) + 24) % 24;
        const endHour = ((configuredEndHour % 24) + 24) % 24;

        return { startHour, endHour };
    }

    /**
     * @param {Object} individual
     * @returns {Array<Object>}
     */
    getAssignedDevices(individual) {
        return database.prepare(
            "SELECT deviceID, name, productName, roomID FROM devices WHERE individualID = ? OR (roomID = ? AND COALESCE(individualID, 0) = 0) ORDER BY deviceID ASC"
        ).all(individual.individualID, individual.roomID || 0);
    }

    /**
     * @param {Array<Object>} devices
     * @returns {Map<number,string>}
     */
    getRoomNamesById(devices) {
        const roomIDs = [...new Set(devices.map((device) => Number(device.roomID)).filter((roomID) => Number.isFinite(roomID) && roomID > 0))];
        const map = new Map();

        if (roomIDs.length === 0) {
            return map;
        }

        const placeholders = roomIDs.map(() => "?").join(",");
        const rooms = database.prepare("SELECT roomID, name FROM rooms WHERE roomID IN (" + placeholders + ")").all(...roomIDs);

        for (const room of rooms) {
            map.set(Number(room.roomID), room.name || "Room " + room.roomID);
        }

        return map;
    }

    /**
     * @param {number} individualID
     * @param {string} reportDate
     * @param {Object} facts
     * @param {string} summaryText
     * @param {string} modelName
     * @param {string} reportLanguage
     */
    upsertReport(individualID, reportDate, facts, summaryText, modelName, reportLanguage) {
        database.prepare(
            "INSERT INTO reporting_reports (individualID, reportDate, factsJson, summaryText, modelName, reportLanguage, status, dateTimeAdded) VALUES (?, ?, ?, ?, ?, ?, 'generated', datetime('now', 'localtime')) ON CONFLICT(individualID, reportDate) DO UPDATE SET factsJson = excluded.factsJson, summaryText = excluded.summaryText, modelName = excluded.modelName, reportLanguage = excluded.reportLanguage, status = 'generated', dateTimeAdded = datetime('now', 'localtime')"
        ).run(individualID, reportDate, JSON.stringify(facts), summaryText, modelName || null, reportLanguage || "de");
    }

    /**
     * @returns {string}
     */
    getYesterdayDateString() {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        return date.toISOString().slice(0, 10);
    }

    /**
     * @param {string} dateString
     * @returns {{startUnix:number,endUnix:number}}
     */
    getDayRange(dateString) {
        const start = new Date(dateString + "T00:00:00");
        const end = new Date(dateString + "T00:00:00");
        end.setDate(end.getDate() + 1);
        return {
            startUnix: Math.floor(start.getTime() / 1000),
            endUnix: Math.floor(end.getTime() / 1000)
        };
    }

    /**
     * @param {Map<string, number>} counter
     * @returns {Array<{name:string,count:number}>}
     */
    mapToSortedArray(counter) {
        return [...counter.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * @param {number|string} unixSeconds
     * @returns {string}
     */
    toIso(unixSeconds) {
        const unixNumeric = Number(unixSeconds);
        if (!Number.isFinite(unixNumeric)) {
            return "";
        }
        return new Date(unixNumeric * 1000).toISOString();
    }
}

module.exports = ReportingService;
