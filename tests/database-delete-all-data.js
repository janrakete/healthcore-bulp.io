/**
 * Delete all data from database except "settings" table
 * Usage: node tests/database-delete-all-data.js <database-file>
 */

const Database = require("better-sqlite3");

const databaseFilename = process.argv[2];

if (!databaseFilename) {
  console.log("Usage: node tests/database-delete-all-data.js <database-file>");
  process.exit(1);
}

const database   = new Database(databaseFilename);
const keepTables = ["settings"];

const allTables = database.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
).all().map((row) => row.name);

console.log("All tables in database: " + (allTables.join(", ") || "none"));

const tablesToDelete = allTables.filter((tableName) => !keepTables.includes(tableName));

console.log("Deleting all data from database except 'settings' table...");
console.log("Tables to delete: " + (tablesToDelete.join(", ") || "none"));

database.exec("PRAGMA foreign_keys = OFF");
for (const tableName of tablesToDelete) {
  database.prepare("DELETE FROM " + tableName).run();
}
database.exec("PRAGMA foreign_keys = ON");

console.log("Done");
console.log("Deleted tables: " + (tablesToDelete.join(", ") || "none"));
console.log("Preserved tables: settings");

database.close();
