/**
 * =============================================================================================
 * Routes for Data (= tables)
 * ==========================
 */

const appConfig     = require("../../config");
const router        = require("express").Router();

const tablesAllowed = appConfig.CONF_tablesAllowedForAPI; // defines, which tables are allowed

/**
 * This function builds an SQL statement for INSERT or UPDATE operations based on the provided payload.
 * @async
 * @function statementBuild
 * @param {string} table - The name of the table to build the statement for.
 * @param {object} payload - The JSON payload containing the data to be inserted or updated.
 * @param {string} [type="INSERT"] - The type of SQL statement to build, either "INSERT" or "UPDATE".
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed SQL statement.
 * @description This function checks if the keys in the payload match the columns of the specified table. If the keys are valid, it constructs an SQL statement for either inserting or updating data in the table.
 */
async function statementBuild(table, payload, type="INSERT") {
   let response = {};

   const [results]   = await MySQLConnection.query("SHOW COLUMNS FROM " + mysqlConnection.escape(table)); // build an array with all fields of the table
   const columnsList = results.map(result => result.Field);

   let dataList = [];
   
   if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
      for (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
         if (columnsList.includes(key)) { // if key is an existing table column ... 
            response.status = "ok"; // ... return ok       
            let data   = {};
            data[key]  = value;
            dataList.push(data);
         }
         else { // if key is not an existing table column ...
            response.status = "error"; // ... return error
            response.error  = "Given column '" + key + "' does not exists in table";
            break;
         }
      }

      if (response.status === "ok") {
         response.statement = "";
         if (type === "INSERT") { // build INSERT statement
            let fields = "";
            let values = "";
            for (let data of dataList) {
               fields = fields + Object.keys(data)[0] + ", "
               values = values + mysqlConnection.escape(data[Object.keys(data)[0]]) + ", ";
            }

            fields = fields.substring(0, fields.length - 2);  // remove the last ", "
            values = values.substring(0, values.length - 2);  // remove the last ", "
            response.statement = " (" + fields + ") VALUES (" + values + ")";
         }
         else { // build UPDATE statement
            for (let data of dataList) {
               response.statement = response.statement + " " + Object.keys(data)[0] + "=" + mysqlConnection.escape(data[Object.keys(data)[0]]) + ", ";
            }
            response.statement = response.statement.substring(0, response.statement.length - 2);  // remove the last ", "
         }
      }
   }
   else {
      response.status = "error";
      response.error  = "Payload is empty";                  
   }
   return (response);  
}

/**
 * This function builds a WHERE condition for SQL queries based on the provided payload.
 * @async
 * @function conditionBuild
 * @param {string} table - The name of the table to build the condition for.
 * @param {object} payload - The JSON payload containing the conditions to be applied.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed WHERE condition.
 * @description This function checks if the keys in the payload match the columns of the specified table. If they do, it constructs a WHERE condition string for use in SQL queries. If any key does not match, it returns an error.
 */
async function conditionBuild(table, payload) {
   let response = {};

   const [results]  = await MySQLConnection.query("SHOW COLUMNS FROM " + mysqlConnection.escape(table)); // build an array with all fields of the table
   const columnsList = results.map(result => result.Field);

   response.condition = "";   
   if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
      for (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
         if (columnsList.includes(key)) { // if key is an existing table column ...
            response.status = "ok"; // ... return ok and ...                
            if (response.condition === undefined) {
               response.condition = "";
            }
            response.condition = response.condition + " " + key + "=" + mysqlConnection.escape(value) + " AND"; // ... build WHERE condition
         }
         else { // if key is not an existing table column
            response.condition = "";
            response.status    = "error"; // ... return error
            response.error     = "Given column '" + key + "' in condition block does not exists in table";
            break;
         }
      }
      
      if (response.condition !== "") { // remove the last " AND"
         response.condition = " WHERE " + response.condition.substring(0, response.condition.length - 4); 
      }
   }  
   else {
      response.status  = "ok"; // if payload is empty it's also ok, no WHERE condition returned
   }

   return (response);
}

/**
 * Insert a new database entry or entries. If successful, it returns the last inserted ID.
 * @route POST /:table*
 * @param {string} table - The name of the table to insert data into.
 * @param {object} payload - The JSON payload containing the data to be inserted.
 * @returns {object} - An object containing the status of the operation, any error messages, and the last inserted ID if successful.
 * @description This route allows clients to insert new entries into a specified table. It checks if the table name is allowed, builds an SQL INSERT statement based on the provided payload, and executes it. If successful, it returns the last inserted ID.
 */
router.post("/:table", async function (request, response) {
   const table    = request.params.table;
   const payload  = request.body;
   let data       = {};

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         const statementBuild = await statementBuild(table, payload, "INSERT");
         if (statementBuild.status === "ok") {
            const statement = "INSERT INTO " + table + statementBuild.statement;
            Common.conLog("POST Request: access table '" + table + "'", "gre");
            Common.conLog("Execute statement: " + statement, "std", false);

            const result = await MySQLConnection.query(statement);
            data.ID      = result[0].insertId; // return last insert id
         }
         else {
            data.status = statementBuild.status;
            data.error  = statementBuild.error;
         }
      }
      catch (Error) {
         data.status = "error";
         data.error  = "Fatal error: " + (Error.stack).slice(0, 128);
      }
   }
   else {
      data.status = "error";
      data.error  = "Access to table '" + table + "' not allowed";
   }

   if (data.status === "error") {
      Common.conLog("POST Request: an error occured", "red");
   }

   Common.conLog("Server route 'Data' HTTP response: " + JSON.stringify(data), "std", false);
   return response.json(data);
});

/**
 * Retrieve database entries based on conditions.
 * @route GET /:table*
 * @param {string} table - The name of the table to retrieve data from.
 * @param {object} query - The query parameters containing conditions for the retrieval.
 * @returns {object} - An object containing the status of the operation, any error messages, and the retrieved results if successful.
 * @description This route allows clients to retrieve entries from a specified table based on conditions provided in the query parameters. It checks if the table name is allowed, builds a WHERE condition based on the query parameters, and executes a SELECT statement. If successful, it returns the retrieved results.
 */
router.get("/:table", async function (request, response) {
   const table    = request.params.table;
   const payload  = request.body;
   let data       = {};

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         const conditionBuild = await conditionBuild(table, payload);
         if (conditionBuild.status === "ok") {
            const statement = "SELECT * FROM " + table + conditionBuild.condition + " LIMIT " + appConfig.CONF_tablesMaxEntriesReturned;
            Common.conLog("GET Request: access table '" + table + "'", "gre");
            Common.conLog("Execute statement: " + statement, "std", false);

            const [results]   = await MySQLConnection.query(statement);
            data.results      = results;
         }
         else {
            data.status = conditionBuild.status;
            data.error  = conditionBuild.error;
         }
      }
      catch (Error) {
         data.status = "error";
         data.error  = "Fatal error: " + (Error.stack).slice(0, 128);
      }
   }
   else {
      data.status = "error";
      data.error  = "Access to table '" + table + "' not allowed";
   }

   if (data.status === "error") {
      Common.conLog("GET Request: an error occured", "red");
   }

   Common.conLog("Server route 'Data' HTTP response: " + JSON.stringify(data), "std", false);
   return response.json(data);
});


/**
 * Delete database entry or entries
 * @route DELETE /:table*
 * @param {string} table - The name of the table to delete data from.
 * @param {object} query - The query parameters containing conditions for the deletion.
 * @returns {object} - An object containing the status of the operation, any error messages and a confirmation message if successful.
 * @description This route allows clients to delete entries from a specified table based on conditions provided in the query parameters. It checks if the table name is allowed, builds a WHERE condition based on the query parameters, and executes a DELETE statement. If successful, it returns a confirmation message.
 */
router.delete("/:table", async function (request, response) {
   const table    = request.params.table;
   const payload  = request.body;
   let data       = {};

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         const conditionBuild = await conditionBuild(table, payload);
         if (conditionBuild.status === "ok") {
            if (conditionBuild.condition.trim() !== "") {
               const statement = "DELETE FROM " + table + conditionBuild.condition + " LIMIT 1";
               Common.conLog("DELETE Request: access table '" + table + "'", "gre");
               Common.conLog("Execute statement: " + statement, "std", false);
      
               await MySQLConnection.query(statement);
            }
            else { // if no condition is given, return error
               data.status = "error";
               data.error  = "DELETE needs a condition";                  
            }
         }
         else {
            data.status = conditionBuild.status;
            data.error  = conditionBuild.error;
         }
      }
      catch (Error) {
         data.status = "error";
         data.error  = "Fatal error: " + (Error.stack).slice(0, 128);
      }
   }
   else {
      data.status = "error";
      data.error  = "Access to table '" + table + "' not allowed";
   }

   if (data.status === "error") {
      Common.conLog("DELETE Request: an error occured", "red");
   }

   Common.conLog("Server route 'Data' HTTP response: " + JSON.stringify(data), "std", false);
   return response.json(data);
});

/**
 * Update database entry or entries
 * @route PATCH /:table*
 * @param {string} table - The name of the table to update data in.
 * @param {object} body - The JSON payload containing the data to be updated. 
 * @param {object} query - The query parameters containing conditions for the update.
 * @returns {object} - An object containing the status of the operation, any error messages and a confirmation message if successful.
 * @description This route allows clients to update entries in a specified table based on conditions provided in the query parameters. It checks if the table name is allowed, builds a WHERE condition based on the query parameters, constructs an SQL UPDATE statement from the provided body, and executes it. If successful, it returns a confirmation message.
 */
router.patch("/:table", async function (request, response) {
   const table    = request.params.table;
   const payload  = request.body; // POST values are for data
   const query    = request.query; // GET values are for condition
   let data       = {};

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         const conditionBuild = await conditionBuild(table, query);
         if (conditionBuild.status === "ok") {
            if (conditionBuild.condition.trim() !== "") {

               const statementBuild = await statementBuild(table, payload, "UPDATE");
               if (statementBuild.status === "ok") {
                  const statement = "UPDATE " + table + " SET " + statementBuild.statement + conditionBuild.condition + " LIMIT 1";
                  Common.conLog("PATCH Request: access table '" + table + "'", "gre");
                  Common.conLog("Execute statement: " + statement, "std", false);
      
                  await MySQLConnection.query(statement);
               }
               else {
                  data.status = statementBuild.status;
                  data.error  = statementBuild.error;
               }
            }
            else {
               data.status = "error";
               data.error  = "PATCH needs a condition";                  
            }
         }
         else {
            data.status = conditionBuild.status;
            data.error  = conditionBuild.error;
         }
      }
      catch (Error) {
         data.status = "error";
         data.error  = "Fatal error: " + (Error.stack).slice(0, 128);
      }
   }
   else {
      data.status = "error";
      data.error  = "Access to table '" + table + "' not allowed";
   }

   if (data.status === "error") {
      Common.conLog("PATCH Request: an error occured", "red");
   }

   Common.conLog("Server route 'Data' HTTP response: " + JSON.stringify(data), "std", false);
   return response.json(data);
});

 module.exports = router;