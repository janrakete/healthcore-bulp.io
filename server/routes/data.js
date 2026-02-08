/**
 * =============================================================================================
 * Routes for Data (= tables)
 * ==========================
 */
const appConfig       = require("../../config");
const router          = require("express").Router();

const tablesAllowed   = appConfig.CONF_tablesAllowedForAPI; // defines, which tables are allowed

/**
 * Validates that a name (table or column) contains only safe characters.
 * @param {string} name - The name to validate.
 * @returns {boolean} - Returns true if the name is safe, false otherwise.
 * @description Only allows alphanumeric characters and underscores. Prevents SQL injection through table or column names.
 */
function sqlCheckValidName(name) {
   return typeof name === "string" && /^[a-zA-Z0-9_]+$/.test(name);
}

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

   if (!sqlCheckValidName(table)) {
      response.status = "error";
      response.error  = "Invalid table name";
      return response;
   }

   const results     = await database.pragma("table_info('" + table + "')"); // get all columns for the table
   const columnsList = results.map(result => result.name);

   let parameters = {};
   let fields     = [];
   let values     = [];
   let updates    = [];
   
   if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
      for (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
         if (columnsList.includes(key)) { // if key is an existing table column ... 
            response.status = "ok"; // ... return ok
            
            parameters[key] = value; // add to parameters
            
            if (type === "INSERT") {
               fields.push(key);
               values.push("@" + key);
            } else {
               updates.push(key + "=@" + key);
            }
         }
         else { // if key is not an existing table column ...
            response.status = "error"; // ... return error
            response.error  = "Given column '" + key + "' does not exists in table";
            parameters = {}; // reset
            break;
         }
      }

      if (response.status === "ok") {
         response.parameters = parameters;
         if (type === "INSERT") { // build INSERT statement
             response.statement = " (" + fields.join(", ") + ") VALUES (" + values.join(", ") + ")";
         }
         else { // build UPDATE statement
             response.statement = updates.join(", ");
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

   if (!sqlCheckValidName(table)) {
      response.status = "error";
      response.error  = "Invalid table name";
      return response;
   }

   const results     = await database.pragma("table_info('" + table + "')"); // get all columns for the table
   const columnsList = results.map(result => result.name);
   
   let orderByString = ""; // if payload contains orderBy block, remove it from payload and save it for later processing
   if (payload.orderBy !== undefined) {
      orderByString = payload.orderBy;
      delete payload.orderBy;
   }

   let limitString = ""; // if payload contains limit block, remove it from payload and save it for later processing
   if (payload.limit !== undefined) {
      limitString = payload.limit;
      delete payload.limit;
   }

   response.condition  = "";   
   response.parameters = {};

   let conditions = [];

   if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
      for (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
         if (columnsList.includes(key)) { // if key is an existing table column ...
            response.status = "ok"; // ... return ok
            
            const paramKey = "cond_" + key; // unique param name for condition
            conditions.push(key + "=@" + paramKey);
            response.parameters[paramKey] = value;
         }
         else { // if key is not an existing table column
            response.status    = "error"; // ... return error
            response.error     = "Given column '" + key + "' in condition block does not exists in table";
            response.parameters = {}; // reset
            break;
         }
      }
      
      if (response.status === "ok" && conditions.length > 0) {
         response.condition = " WHERE " + conditions.join(" AND ");
      } else if (response.status === "error") {
         // error already set
      } else {
          // empty loop but keys present? Should be ok.
          response.status = "ok";
      }
   }  
   else {
      response.status  = "ok"; // if payload is empty it's also ok, no WHERE condition returned
   }

   if (response.status === "ok") { // if status is ok ...
      if (orderByString !== "") { // ... process orderBy block
         const orderByResponse = await orderByBuild(orderByString, table);
         if (orderByResponse.status === "ok") { 
            response.condition = response.condition + orderByResponse.statement;
         }
         else {
            response.status = "error";
            response.error  = orderByResponse.error;
         }
      }

      if (limitString !== "") { // ... process limit block
         const limitResponse = await limitBuild(limitString);
         if (limitResponse.status === "ok") { 
            response.condition = response.condition + limitResponse.statement;
         }
         else {
            response.status = "error";
            response.error  = limitResponse.error;
         }
      }
   }

   return (response);
}

/**
 * This function builds a LIMIT clause for SQL queries based on the provided limit value.
 * @async
 * @function limitBuild
 * @param {string|number} limitValue - The limit value for the SQL query.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed LIMIT clause.
 * @description This function checks if the provided limit value is a valid positive integer. If it is, it constructs a LIMIT clause for SQL queries. If not, it returns an error.
 */
async function limitBuild(limitValue) {
   let response = {};
   const limitNumber = parseInt(limitValue, 10);

   if (!isNaN(limitNumber) && limitNumber > 0) { // if limit is a valid positive integer ...
      response.status    = "ok"; // ... return ok and ...
      response.statement = " LIMIT " + limitNumber;
   }  
   else { // if limit is not a valid positive integer
      response.statement   = "";
      response.status      = "error"; // ... return error
      response.error       = "Given limit value '" + limitValue + "' is not a valid positive integer";
   }  
   return (response);
}

/**
 * This function builds an ORDER BY clause for SQL queries based on the provided orderBy string.
 * @async
 * @function orderByBuild
 * @param {string} orderByString - The orderBy string in the format "column,direction" (e.g., "dateTime,DESC").
 * @param {string} table - The name of the table to validate the column against.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed ORDER BY clause.
 * @description This function checks if the specified column exists in the table. If it does, it constructs an ORDER BY clause with the specified direction (ASC or DESC). If the column does not exist, it returns an error.
 */
async function orderByBuild(orderByString, table) {
   const column   = orderByString.split(",")[0]; // first part column name
   let direction  = orderByString.split(",")[1]; // second part direction (ASC or DESC)

   direction = (direction && direction.toUpperCase() === "DESC") ? "DESC" : "ASC"; // default direction

   let response      = {};

   if (!sqlCheckValidName(column)) {
      response.status = "error";
      response.error  = "Invalid column name in orderBy";
      return response;
   }

   const results     = await database.pragma("table_info('" + table + "')"); // get all columns for the table
   const columnsList = results.map(result => result.name);

   if (columnsList.includes(column)) { // if key is an existing table column ...
      response.status    = "ok"; // ... return ok and ...
      response.statement = " ORDER BY " + column + " " + direction;
   }
   else { // if key is not an existing table column
      response.statement   = "";
      response.status      = "error"; // ... return error
      response.error       = "Given column '" + column + "' in orderBy block does not exists in table";
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
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings", "push_tokens", "notifications")
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

         const statement = await statementBuild(table, payload, "INSERT");
         if (statement.status === "ok") {
            const sql = "INSERT INTO " + table + statement.statement;
            common.conLog("POST Request: access table '" + table + "'", "gre");
            common.conLog("Execute statement: " + sql, "std", false);

            data.status = "ok";

            const result = await database.prepare(sql).run(statement.parameters);
            data.ID = result.lastInsertRowid; // return last insert id
         }
         else {
            data.status = statement.status;
            data.error  = statement.error;
         }
      }
      catch (error) {
         data.status = "error";
         data.error  = "Fatal error: " + (error.stack).slice(0, 128);
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
   }
   else {
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
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings", "push_tokens", "notifications")
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

   if (tablesAllowed.includes(table)) { // check, if table name is in allowed list
      try {
         data.status = "ok";

         const condition = await conditionBuild(table, payload);
         if (condition.status === "ok") {
            let sql = "SELECT * FROM " + table + condition.condition;

            if (!sql.toUpperCase().includes(" LIMIT ")) { // if statement contains no LIMIT clause, add a default one to avoid overload
               sql = sql + " LIMIT " + appConfig.CONF_tablesMaxEntriesReturned;
            }

            common.conLog("GET Request: access table '" + table + "'", "gre");
            common.conLog("Execute statement: " + sql, "std", false);

            const results = await database.prepare(sql).all(condition.parameters);
            data.results = results;

         }
         else {
            data.status = condition.status;
            data.error  = condition.error;
         }
      }
      catch (error) {
         data.status = "error";
         data.error  = "Fatal error: " + (error.stack).slice(0, 128);
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
   }
   else {
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
 *         - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings", "push_tokens", "notifications")
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
         const condition = await conditionBuild(table, payload);
         if (condition.status === "ok") {
            if (condition.condition && condition.condition.trim() !== "") {
               const sql = "DELETE FROM " + table + condition.condition + " LIMIT 1";
               common.conLog("DELETE Request: access table '" + table + "'", "gre");
               common.conLog("Execute statement: " + sql, "std", false);
      
               const result = await database.prepare(sql).run(condition.parameters);

               if (result.changes === 0) {
                  data.status = "error";
                  data.error  ="Entry not found";
               }
               else {
                  data.status = "ok";
                  common.conLog("DELETE Request: entry deleted successfully", "gre");
               }
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
      catch (error) {
         data.status = "error";
         data.error  = "Fatal error: " + (error.stack).slice(0, 128);
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
   }
   else {
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
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings", "push_tokens", "notifications")
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

         const condition = await conditionBuild(table, query);
         if (condition.status === "ok") {
            if (condition.condition && condition.condition.trim() !== "") {

               const statement = await statementBuild(table, payload, "UPDATE");
               if (statement.status === "ok") {
                  const sql = "UPDATE " + table + " SET " + statement.statement + condition.condition + " LIMIT 1";
                  common.conLog("PATCH Request: access table '" + table + "'", "gre");
                  common.conLog("Execute statement: " + sql, "std", false);

                  const params = { ...statement.parameters, ...condition.parameters };
                  const result = await database.prepare(sql).run(params);

                  if (result.changes === 0) {
                     data.status = "error";
                     data.error  ="Entry not found";
                  }
                  else {
                     data.status = "ok";
                     common.conLog("PATCH Request: entry updated successfully", "gre");
                  }                  
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
      catch (error) {
         data.status = "error";
         data.error  = "Fatal error: " + (error.stack).slice(0, 128);
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
   }
   else {
      return response.status(400).json(data);
   }
});

 module.exports = router;