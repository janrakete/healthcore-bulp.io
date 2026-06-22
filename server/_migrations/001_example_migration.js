/**
 * Example migration file. This file is a template for creating new migrations. It adds a new column to the settings table if it doesn't already exist.
 * To create a new migration, copy this file and update the id and the up function with the necessary changes.
 * Migrations are run in order based on their id, so make sure to use a unique and sequential id for each migration.
 * The up function should contain the code to apply the migration, such as altering tables or updating data.
 * You can also add a down function to revert the migration if needed, but it's optional.
 */

module.exports = {
    id: "001_example_migration",

    /**
     * Adds settings.exampleColumn for update/version tracking when missing.
     * @param {Object} database
     */
    async up(database) {
        const columns = database.prepare("PRAGMA table_info('settings')").all();
        const hasExampleColumn = columns.some((column) => column.name === "exampleColumn");

        if (!hasExampleColumn) {
            await database.exec("ALTER TABLE settings ADD COLUMN exampleColumn TEXT");
        }

        database.prepare("UPDATE settings SET exampleColumn = COALESCE(exampleColumn, '')").run();
    },
};