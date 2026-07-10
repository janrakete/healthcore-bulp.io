module.exports = {
    id: "002_daily_reports",

    /**
     * Creates daily_reports table for person-level nursing summaries.
     * @param {Object} database
     */
    up(database) {
        database.exec(`
            CREATE TABLE IF NOT EXISTS daily_reports (
                reportID INTEGER PRIMARY KEY AUTOINCREMENT,
                individualID INTEGER NOT NULL,
                reportDate TEXT NOT NULL,
                factsJson TEXT NOT NULL,
                summaryText TEXT NOT NULL,
                modelName TEXT,
                status TEXT NOT NULL DEFAULT 'generated',
                dateTimeAdded TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                UNIQUE(individualID, reportDate)
            );

            CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(reportDate);
            CREATE INDEX IF NOT EXISTS idx_daily_reports_individual ON daily_reports(individualID);
        `);
    }
};
