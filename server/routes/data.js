/**
 * =============================================================================================
 * Routes for Data (= tables)
 * ==========================
 */
const appConfig       = require("../../config");
const router          = require("express").Router();
const sqlStringEscape = require("sqlstring");

const tablesAllowed   = appConfig.CONF_tablesAllowedForAPI; // defines, which tables are allowed

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

   const results = await database.pragma("table_info('" + table + "')"); // get all columns for the table
   const columnsList = results.map(result => result.name);

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
               values = values + sqlStringEscape.escape(data[Object.keys(data)[0]]) + ", ";
            }

            fields = fields.substring(0, fields.length - 2);  // remove the last ", "
            values = values.substring(0, values.length - 2);  // remove the last ", "
            response.statement = " (" + fields + ") VALUES (" + values + ")";
         }
         else { // build UPDATE statement
            for (let data of dataList) {
               response.statement = response.statement + " " + Object.keys(data)[0] + "=" + sqlStringEscape.escape(data[Object.keys(data)[0]]) + ", ";
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

   const results = await database.pragma("table_info('" + table + "')"); // get all columns for the table
   const columnsList = results.map(result => result.name);

   response.condition = "";   
   if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
      for (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
         if (columnsList.includes(key)) { // if key is an existing table column ...
            response.status = "ok"; // ... return ok and ...                
            if (response.condition === undefined) {
               response.condition = "";
            }
            response.condition = response.condition + " " + key + "=" + sqlStringEscape.escape(value) + " AND"; // ... build WHERE condition
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
 * @swagger
 *   /data/{table}:
 *     post:
 *       summary: Inserting data into a table
 *       description: This endpoint allows you to insert data into a specified table. Allowed tables are defined in the .env file (CONF_tablesAllowedForAPI). 
 *       tags:
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings")
 *       parameters:
 *         - in: path
 *           name: table
 *           required: true
 *           description: The name of the table to insert data into.
 *           schema:
 *             type: string
 *             example: sos
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: The data to insert into the table. Keys must match the column names of the specified table. You can find out the column names by using the GET method on the same table.
 *               example: { "name": "New SOS contact", "number": 12345678 }
 *       responses:
 *         "200":
 *           description: Successfully inserted data into the table. Returns the ID of the newly inserted entry.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *                   ID:
 *                     type: integer
 *                     example: 78
 *         "400":
 *           description: Bad request. The request was invalid or cannot be served.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "error"
 *                   error:
 *                     type: string
 *                     example: "Error message"
 */
router.post("/:table", async function (request, response) {
   const table    = request.params.table;
   const payload  = request.body;
   let data       = {};

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         const statement = await statementBuild(table, payload, "INSERT");
         if (statement.status === "ok") {
            statement.statement = "INSERT INTO " + table + statement.statement;
            common.conLog("POST Request: access table '" + table + "'", "gre");
            common.conLog("Execute statement: " + statement.statement, "std", false);

            const result = await database.prepare(statement.statement).run();
            data.ID = result.lastInsertRowid; // return last insert id
         }
         else {
            data.status = statement.status;
            data.error  = statement.error;
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
      common.conLog("POST Request: an error occured", "red");
   }

   common.conLog("Server route 'Data' HTTP response: " + JSON.stringify(data), "std", false);

   if (data.status === "ok") {
      return response.status(200).json(data);
   } else {
      return response.status(400).json(data);
   }
});

/**
 * @swagger
 *   /data/{table}:
 *     get:
 *       summary: Retrieving data from a table
 *       description: This endpoint allows you to retrieve data from a specified table. Allowed tables are defined in the .env file (CONF_tablesAllowedForAPI).
 *       tags:
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings")
 *       parameters:
 *         - in: path
 *           name: table
 *           required: true
 *           description: The name of the table to retrieve data from.
 *           schema:
 *             type: string
 *             example: sos
 *         - in: query
 *           name: Query parameters
 *           required: false
 *           description: Optional query parameters to filter the results. Keys must match the column names of the specified table. You can find out the column names by using the GET method on the same table without any query parameters. Only exact matches are supported (e.g., ?ID=2). 
 *           schema:
 *             type: object
 *             example: { "sosID": 2 }
 *             additionalProperties:
 *               type: string
 *           style: form
 *           explode: true
 *       responses:
 *         "200":
 *           description: Successfully retrieved data from the table. Returns an array of entries matching the query parameters.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *                   results:
 *                     type: array
 *                     items:
 *                       type: object
 *                       description: An entry from the table.
 *         "400":
 *           description: Bad request. The request was invalid or cannot be served.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "error"
 *                   error:
 *                     type: string
 *                     example: "Error message"
 */
router.get("/:table", async function (request, response) {
   const table    = request.params.table;
   const payload  = request.query; // GET values are for condition
   let data       = {};

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         const condition = await conditionBuild(table, payload);
         if (condition.status === "ok") {
            const statement = "SELECT * FROM " + table + condition.condition + " LIMIT " + appConfig.CONF_tablesMaxEntriesReturned;
            common.conLog("GET Request: access table '" + table + "'", "gre");
            common.conLog("Execute statement: " + statement, "std", false);

            const results = await database.prepare(statement).all();
            data.results = results;

         }
         else {
            data.status = condition.status;
            data.error  = condition.error;
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
      common.conLog("GET Request: an error occured", "red");
   }

   common.conLog("Server route 'Data' HTTP response: " + JSON.stringify(data), "std", false);

   if (data.status === "ok") {
      return response.status(200).json(data);
   } else {
      return response.status(400).json(data);
   }
});

/**
 * @swagger
 *   /data/{table}:
 *     delete:
 *       summary: Deleting data from a table
 *       description: This endpoint allows you to delete data from a specified table. Allowed tables are defined in the .env file (CONF_tablesAllowedForAPI).
 *       tags:
 *         - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings")
 *       parameters:
 *         - in: path
 *           name: table
 *           required: true
 *           description: The name of the table to delete data from.
 *           schema:
 *             type: string
 *             example: sos
 *         - in: query
 *           name: Query parameters
 *           required: true
 *           description: Query parameters to filter the entries. Keys must match the column names of the specified table. You can find out the column names by using the GET method on the same table without any query parameters. Only exact matches are supported (e.g., ?ID=2). 
 *           schema:
 *             type: object
 *             example: { "sosID": 2 }
 *             additionalProperties:
 *               type: string
 *           style: form
 *           explode: true
 *       responses:
 *         "200":
 *           description: Successfully deleted data from the table.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object 
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *         "400":
 *           description: Bad request. The request was invalid or cannot be served.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "error"
 *                   error:
 *                     type: string
 *                     example: "Error message"
 */
router.delete("/:table", async function (request, response) {
   const table    = request.params.table;
   const payload  = request.query;
   let data       = {};

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         const condition = await conditionBuild(table, payload);
         if (condition.status === "ok") {
            if (condition.condition.trim() !== "") {
               const statement = "DELETE FROM " + table + condition.condition + " LIMIT 1";
               common.conLog("DELETE Request: access table '" + table + "'", "gre");
               common.conLog("Execute statement: " + statement, "std", false);
      
               await database.prepare(statement).run();
            }
            else { // if no condition is given, return error
               data.status = "error";
               data.error  = "DELETE needs a condition";                  
            }
         }
         else {
            data.status = condition.status;
            data.error  = condition.error;
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
      common.conLog("DELETE Request: an error occured", "red");
   }

   common.conLog("Server route 'Data' HTTP response: " + JSON.stringify(data), "std", false);

   if (data.status === "ok") {
      return response.status(200).json(data);
   } else {
      return response.status(400).json(data);
   }
});

/**
 * @swagger
 *   /data/{table}:
 *     patch:
 *       summary: Update data in a table
 *       description: This endpoint allows you to update data in a specified table. Allowed tables are defined in the .env file (CONF_tablesAllowedForAPI).
 *       tags:
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings")
 *       parameters:
 *         - in: path
 *           name: table
 *           required: true
 *           description: The name of the table to update data in.
 *           schema:
 *             type: string
 *             example: sos
 *         - in: query
 *           name: Query parameters
 *           required: true
 *           description: Query parameters to filter the entries. Keys must match the column names of the specified table. You can find out the column names by using the GET method on the same table without any query parameters. Only exact matches are supported (e.g., ?ID=2). 
 *           schema:
 *             type: object
 *             example: { "sosID": 2 }
 *             additionalProperties:
 *               type: string
 *           style: form
 *           explode: true
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: { "name": "New name", "number": 9876543210 }
 *               additionalProperties:
 *                 type: string
 *       responses:
 *         "200":
 *           description: Successfully updated data in the table.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "ok"
 *         "400":
 *           description: Bad request. The request was invalid or cannot be served.
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                     example: "error"
 *                   error:
 *                     type: string
 *                     example: "Error message"
 */
router.patch("/:table", async function (request, response) {
   const table    = request.params.table;
   const payload  = request.body; // POST values are for data
   const query    = request.query; // GET values are for condition
   let data       = {};

   if (tablesAllowed.includes(table)) {  // check, if table name is in allowed list
      try {
         data.status = "ok";

         const condition = await conditionBuild(table, query);
         if (condition.status === "ok") {
            if (condition.condition.trim() !== "") {

               const statement = await statementBuild(table, payload, "UPDATE");
               if (statement.status === "ok") {
                  statement.statement = "UPDATE " + table + " SET " + statement.statement + condition.condition + " LIMIT 1";
                  common.conLog("PATCH Request: access table '" + table + "'", "gre");
                  common.conLog("Execute statement: " + statement.statement, "std", false);

                  await database.prepare(statement.statement).run();
               }
               else {
                  data.status = statement.status;
                  data.error  = statement.error;
               }
            }
            else {
               data.status = "error";
               data.error  = "PATCH needs a condition";                  
            }
         }
         else {
            data.status = condition.status;
            data.error  = condition.error;
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
      common.conLog("PATCH Request: an error occured", "red");
   }

   common.conLog("Server route 'Data' HTTP response: " + JSON.stringify(data), "std", false);
   
   if (data.status === "ok") {
      return response.status(200).json(data);
   } else {
      return response.status(400).json(data);
   }
});

 module.exports = router;