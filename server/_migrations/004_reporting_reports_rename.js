module.exports = {
    id: "004_reporting_reports_rename",

    /**
     * Renames daily_reports to reporting_reports for timeline-agnostic naming.
     * @param {Object} database
     */
    up(database) {
        const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
        const tableNames = new Set(tables.map((entry) => entry.name));

        if (tableNames.has("reporting_reports")) {
            return;
        }

        if (tableNames.has("daily_reports")) {
            database.exec("ALTER TABLE daily_reports RENAME TO reporting_reports");
            return;
        }

        database.exec(`
            CREATE TABLE IF NOT EXISTS reporting_reports (
                reportID INTEGER PRIMARY KEY AUTOINCREMENT,
                individualID INTEGER NOT NULL,
                reportDate TEXT NOT NULL,
                factsJson TEXT NOT NULL,
                summaryText TEXT NOT NULL,
                modelName TEXT,
                reportLanguage TEXT NOT NULL DEFAULT 'en',
                status TEXT NOT NULL DEFAULT 'generated',
                dateTimeAdded TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                UNIQUE(individualID, reportDate)
            );
        `);
    }
};
