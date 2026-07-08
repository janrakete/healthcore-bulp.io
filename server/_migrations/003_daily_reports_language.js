module.exports = {
    id: "003_daily_reports_language",

    /**
     * Adds reportLanguage to daily_reports for multi-language reporting metadata.
     * @param {Object} database
     */
    up(database) {
        const columns = database.prepare("PRAGMA table_info('daily_reports')").all();
        const hasReportLanguage = columns.some((column) => column.name === "reportLanguage");

        if (!hasReportLanguage) {
            database.exec("ALTER TABLE daily_reports ADD COLUMN reportLanguage TEXT NOT NULL DEFAULT 'de'");
        }
    }
};
