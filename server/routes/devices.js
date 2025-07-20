/**
 * =============================================================================================
 * Routes for devices
 * ==================
 */

const appConfig         = require("../../config");
const router            = require("express").Router();

const tablesAllowed  = appConfig.CONF_tablesAllowedForAPI; // defines, which tables are allowed

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
   let columnsList   = [];
   for await (result of results) { 
      columnsList.push(result.Field);
   }

   let data = [];
   
   if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
      for await (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
         if (columnsList.includes(key)) { // if key is an existing table column ... 
            response.status = "ok"; // ... return ok       
            dataField       = {};
            dataField[key]  = value;
            data.push(dataField);
         }
         else { // if key is not an existing table column ...
            response.status = "error"; // ... return error
            response.error  = "Given key '" + key + "' does not exists in table";
            break;
         }
      }

      if (response.status === "ok") {
         response.statement = "";
         if (type === "INSERT") { // build INSERT statement
            let fields = "";
            let values = "";
            for await (let data of data) {
               fields = fields + Object.keys(data)[0] + ", "
               values = values + "'" + data[Object.keys(data)[0]] + "', ";
            }

            fields = fields.substring(0, fields.length - 2);  // remove the last ", "
            values = values.substring(0, values.length - 2);  // remove the last ", "
            response.statement = " (" + fields + ") VALUES (" + values + ")";
         }
         else { // build UPDATE statement
            for await (let data of data) {
               response.statement = response.statement + " " + Object.keys(data)[0] + "='" + data[Object.keys(data)[0]] + "', ";
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

/*
   Build WHERE condition out of payload
*/
async function conditionBuild(table, payload) {
   let response              = {};

   const [results]   = await MySQLConnection.query("SHOW COLUMNS FROM " + table); // build an array with all fields of the table
   let columnsList = [];
   for await (result of results) { 
      columnsList.push(result.Field);
   }

   response.strCondition = "";   
   if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
      for await (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
         if (columnsList.includes(key)) { // if key is an existing table column ...
            response.status         = "ok"; // ... return ok and ...                
            if (response.strCondition === undefined) {
               response.strCondition = "";
            }
            response.strCondition = response.strCondition + " " + key + "='" + value + "' AND"; // ... build WHERE condition
         }
         else { // if key is not an existing table column
            response.strCondition = "";
            response.status  = "error"; // ... return error
            response.error   = "Given key '" + key + "' in condition block does not exists in table";
            break;
         }
      }
      
      if (response.strCondition != "") { // remove the last " AND"
         response.strCondition = " WHERE " + response.strCondition.substring(0, response.strCondition.length - 4); 
      }
   }  
   else {
      response.status  = "ok"; // if payload is empty it's also ok, no WHERE condition returned
   }

   return (response);
}

/*
   Create database entry
*/
router.post("/:table*", async function (Request, Response) {
   const table    = Request.params.table;
   let data          = {};

   Request = Request.body;

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         let Statement = await statementBuild(table, Request, "INSERT");
         if (Statement.status === "ok") {
            let statement = "INSERT INTO " + table + Statement.statement;
            Common.conLog("POST request from client: access table '" + table + "'", "gre");
            Common.conLog("Execute statement: " + statement, "std", false);

            const result = await MySQLConnection.query(statement);
            data.intID = result[0].insertId; // return last insert id
         }
         else {
            data.status = Statement.status;
            data.error  = Statement.error;
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
      Common.conLog("Request from client: an error occured", "red");
   }

   Common.conLog("HTTP response: " + JSON.stringify(data), "std", false);
   Response.json(data);
});

/*
   Get database entry or entries
*/
router.get("/:table*", async function (Request, Response) {
   const table    = Request.params.table;
   let data          = {};

   Request = Request.query;

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         let Condition = await conditionBuild(table, Request);
         if (Condition.status === "ok") {
            let statement     = "SELECT * FROM " + table + Condition.strCondition + " LIMIT 500";
            Common.conLog("GET request client: access table '" + table + "'", "gre");
            Common.conLog("Execute statement: " + statement, "std", false);

            const [results]   = await MySQLConnection.query(statement);
            data.results      = results;
         }
         else {
            data.status = Condition.status;
            data.error  = Condition.error;
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
      Common.conLog("Request from client: an error occured", "red");
   }

   Common.conLog("HTTP response: " + JSON.stringify(data), "std", false);
   Response.json(data);
});


/*
   Delete database entry or entries
*/
router.delete("/:table*", async function (Request, Response) {
   const table    = Request.params.table;
   let data          = {};

   Request = Request.query;

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         let Condition = await conditionBuild(table, Request);
         if (Condition.status === "ok") {
            if (Condition.strCondition.trim() != "") {
               let statement     = "DELETE FROM " + table + Condition.strCondition + " LIMIT 1";
               Common.conLog("DELETE request from client: access table '" + table + "'", "gre");
               Common.conLog("Execute statement: " + statement, "std", false);
      
               await MySQLConnection.query(statement);
            }
            else { // if no condition is given, return error
               data.status = "error";
               data.error  = "DELETE needs a condition";                  
            }
         }
         else {
            data.status = Condition.status;
            data.error  = Condition.error;
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
      Common.conLog("Request from client: an error occured", "red");
   }

   Common.conLog("HTTP response: " + JSON.stringify(data), "std", false);
   Response.json(data);
});

/*
   Replace database entry or entries
*/
router.patch("/:table*", async function (Request, Response) {
   const table    = Request.params.table;
   let data          = {};

   let RequestBody   = Request.body; // POST values are for data
   let RequestQuery  = Request.query; // GET values are for condition

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         let Condition = await conditionBuild(table, RequestQuery);
         if (Condition.status === "ok") {
            if (Condition.strCondition.trim() != "") {

               let Statement = await statementBuild(table, RequestBody, "UPDATE");
               if (Statement.status === "ok") {
                  let statement = "UPDATE " + table + " SET " + Statement.statement + Condition.strCondition + " LIMIT 1";
                  Common.conLog("PATCH request from client: access table '" + table + "'", "gre");
                  Common.conLog("Execute statement: " + statement, "std", false);
      
                  await MySQLConnection.query(statement);
               }
               else {
                  data.status = Statement.status;
                  data.error  = Statement.error;
               }
            }
            else {
               data.status = "error";
               data.error  = "PATCH needs a condition";                  
            }
         }
         else {
            data.status = Condition.status;
            data.error  = Condition.error;
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
      Common.conLog("Request from client: an error occured", "red");
   }

   Common.conLog("HTTP response: " + JSON.stringify(data), "std", false);
   Response.json(data);
});

 module.exports = router;