/**
 * Copy healthcore_database.db to healthcore_database.db-schema and delete all data from healthcore_database.db-schema
 * Usage: node tests/database-delete-all-data-schema.js
 */

const Database  = require("better-sqlite3");
const fs        = require("fs");
const path      = require("path");

const databaseSchemaFilename = path.resolve(__dirname, "../healthcore_database.db-schema");

if (fs.existsSync(databaseSchemaFilename)) { // Delete the existing database file if it exists
  fs.unlinkSync(databaseSchemaFilename);
}

fs.copyFileSync(path.resolve(__dirname, "../healthcore_database.db"), databaseSchemaFilename);

const database = new Database(databaseSchemaFilename);
const keepTables = [];

const allTables = database.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
).all().map((row) => row.name);

console.log("All tables in database: " + (allTables.join(", ") || "none"));

const tablesToDelete = allTables.filter((tableName) => !keepTables.includes(tableName));

console.log("Deleting all data from database tables except: " + (keepTables.join(", ") || "none"));
console.log("Tables to delete: " + (tablesToDelete.join(", ") || "none"));

database.exec("PRAGMA foreign_keys = OFF");
for (const tableName of tablesToDelete) {
  database.prepare("DELETE FROM " + tableName).run();
}
database.exec("PRAGMA foreign_keys = ON");

database.exec("VACUUM");

console.log("Done");
console.log("Deleted tables: " + (tablesToDelete.join(", ") || "none"));
console.log("Preserved tables: " + (keepTables.join(", ") || "none"));

database.close();