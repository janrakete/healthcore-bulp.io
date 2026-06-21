module.exports = {
    id: "001_add_settings_codeLastCommit",

    /**
     * Adds settings.codeLastCommit for update/version tracking when missing.
     * @param {Object} database - better-sqlite3 instance
     */
    up(database) {
        const columns = database.prepare("PRAGMA table_info('settings')").all();
        const hasCodeLastCommit = columns.some((column) => column.name === "codeLastCommit");

        if (!hasCodeLastCommit) {
            database.exec("ALTER TABLE settings ADD COLUMN codeLastCommit TEXT");
        }

        database.prepare("UPDATE settings SET codeLastCommit = COALESCE(codeLastCommit, '')").run();
    },
};
