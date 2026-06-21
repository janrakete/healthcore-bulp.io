/**
 * =============================================================================================
 * DatabaseMigrationEngine
 * =======================
 */

const fs        = require("fs");
const path      = require("path");

/**
 * Reads all migration modules from a directory and returns them sorted by filename.
 * @param {string} migrationsDir
 * @returns {Array<{ id: string, up: Function, sourceFile: string }>}
 */
function loadMigrations(migrationsDir) {
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }

    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".js")).sort(); // Sort files alphabetically to ensure correct order

    const migrations = [];
    for (const file of files) {
        const migrationPath = path.join(migrationsDir, file);
        const migration     = require(migrationPath);

        if (!migration || typeof migration.id !== "string" || typeof migration.up !== "function") {
            throw new Error("Invalid migration module: " + file + " (expected { id, up })");
        }

        migrations.push({
            id: migration.id,
            up: migration.up,
            sourceFile: file,
        });
    }

    return migrations;
}

/**
 * Applies pending migrations in a transaction and stores progress in update_migrations.
 */
function runMigrations() {
    const migrationsDir = path.resolve(__dirname, "../_migrations");
    

    const appliedRows   = database.prepare("SELECT migrationID FROM update_migrations").all(); // get list of applied migrations
    const appliedSet    = new Set(appliedRows.map((row) => row.migrationID));

    const migrations        = loadMigrations(migrationsDir);
    const migrationIdSet    = new Set();

    for (const migration of migrations) { // check for duplicate migration IDs in the loaded migrations
        if (migrationIdSet.has(migration.id)) {
            throw new Error("Duplicate migration ID detected: " + migration.id);
        }
        migrationIdSet.add(migration.id);
    }

    for (const migration of migrations) { // apply pending migrations
        if (appliedSet.has(migration.id)) {
            continue;
        }

        common.conLog("Database migration: Applying " + migration.id + " (" + migration.sourceFile + ")", "yel");

        const transaction = database.transaction(() => {
            migration.up(database);// run the migration's up function to apply changes
            database.prepare("INSERT INTO update_migrations (migrationID) VALUES (?)").run(migration.id);
        });

        transaction();
        common.conLog("Database migration: Applied " + migration.id, "gre");
    }
}

module.exports =  { runMigrations };
