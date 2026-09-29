/**
 * =============================================================================================
 * Routes for Data (= tables)
 * ==========================
 */
const appConfig         = require("../../config");
const router            = require("express").Router();
const SQLQueryBuilders  = require("./_sqlQueryBuilders");

const tablesAllowed   = appConfig.CONF_tablesAllowedForAPI; // defines, which tables are allowed

/**
 * @swagger
 *   /data/{table}:
 *     post:
 *       summary: Inserting data into a table
 *       description: This endpoint allows you to insert data into a specified table. Allowed tables are defined in the .env file (CONF_tablesAllowedForAPI). 
 *       tags:
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings", "push_tokens", "alert_rules")
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

         const statement = await SQLQueryBuilders.buildSqlMutationFragment(table, payload, "INSERT");
         if (statement.status === "ok") {
            const sql = "INSERT INTO " + table + statement.statement;
            common.conLog("Server route 'Data': POST Request: access table '" + table + "'", "gre");
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
         data.error  = error.message;
      }
   }
   else {
      data.status = "error";
      data.error  = "Access to table '" + table + "' not allowed";
   }

   return common.sendResponse(response, data, "Server route 'Data'", "POST Request");
});

/**
 * @swagger
 *   /data/{table}:
 *     get:
 *       summary: Retrieving data from a table
 *       description: This endpoint allows you to retrieve data from a specified table. Allowed tables are defined in the .env file (CONF_tablesAllowedForAPI).
 *       tags:
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings", "push_tokens", "alert_rules")
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
 *         - in: query
 *           name: orderBy
 *           required: false
 *           description: Order results by a column in the format "column,direction" (e.g., "dateTime,DESC"). Direction defaults to ASC if omitted.
 *           schema:
 *             type: string
 *             example: "dateTime,DESC"
 *         - in: query
 *           name: limit
 *           required: false
 *           description: Maximum number of entries to return. If omitted, a server-side default limit is applied.
 *           schema:
 *             type: integer
 *             example: 50
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

         const condition = await SQLQueryBuilders.buildWhereClause(table, payload);
         if (condition.status === "ok") {
            let sql = "SELECT * FROM " + table + condition.condition;

            if (!sql.toUpperCase().includes(" LIMIT ")) { // if statement contains no LIMIT clause, add a default one to avoid overload
               sql = sql + " LIMIT " + appConfig.CONF_tablesMaxEntriesReturned;
            }

            common.conLog("Server route 'Data': GET Request: access table '" + table + "'", "gre");
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
         data.error  = error.message;
      }
   }
   else {
      data.status = "error";
      data.error  = "Access to table '" + table + "' not allowed";
   }

   return common.sendResponse(response, data, "Server route 'Data'", "GET Request");
});

/**
 * @swagger
 *   /data/{table}:
 *     delete:
 *       summary: Deleting data from a table
 *       description: This endpoint allows you to delete data from a specified table. Allowed tables are defined in the .env file (CONF_tablesAllowedForAPI).
 *       tags:
 *         - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings", "push_tokens", "alert_rules")
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
         const condition = await SQLQueryBuilders.buildWhereClause(table, payload);
         if (condition.status === "ok") {
            if (condition.condition && condition.condition.trim() !== "") {
               const sql = "DELETE FROM " + table + " WHERE rowid IN (SELECT rowid FROM " + table + condition.condition + " LIMIT 1)";
               common.conLog("Server route 'Data': DELETE Request: access table '" + table + "'", "gre");
               common.conLog("Execute statement: " + sql, "std", false);
      
               const result = await database.prepare(sql).run(condition.parameters);

               if (result.changes === 0) {
                  data.status = "error";
                  data.error  ="Entry not found";
               }
               else {                
                  data.status = "ok";  
                  common.conLog("Server route 'Data': DELETE Request: entry deleted successfully", "gre");
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
         data.error  = error.message;
      }
   }
   else {
      data.status = "error";
      data.error  = "Access to table '" + table + "' not allowed";
   }

   return common.sendResponse(response, data, "Server route 'Data'", "DELETE Request");
});

/**
 * @swagger
 *   /data/{table}:
 *     patch:
 *       summary: Update data in a table
 *       description: This endpoint allows you to update data in a specified table. Allowed tables are defined in the .env file (CONF_tablesAllowedForAPI).
 *       tags:
 *        - Data manipulation (standard allowed tables are "individuals","rooms","users","sos","settings", "push_tokens", "alert_rules")
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

         const condition = await SQLQueryBuilders.buildWhereClause(table, query);
         if (condition.status === "ok") {
            if (condition.condition && condition.condition.trim() !== "") {

               const statement = await SQLQueryBuilders.buildSqlMutationFragment(table, payload, "UPDATE");
               if (statement.status === "ok") {
                  const sql = "UPDATE " + table + " SET " + statement.statement + " WHERE rowid IN (SELECT rowid FROM " + table + condition.condition + " LIMIT 1)";
                  common.conLog("Server route 'Data': PATCH Request: access table '" + table + "'", "gre");
                  common.conLog("Execute statement: " + sql, "std", false);

                  const params = { ...statement.parameters, ...condition.parameters };
                  const result = await database.prepare(sql).run(params);

                  if (result.changes === 0) {
                     data.status = "error";
                     data.error  ="Entry not found";
                  }
                  else {
                     data.status = "ok";
                     common.conLog("Server route 'Data': PATCH Request: entry updated successfully", "gre");
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
         data.error  = error.message;
      }
   }
   else {
      data.status = "error";
      data.error  = "Access to table '" + table + "' not allowed";
   }

   return common.sendResponse(response, data, "Server route 'Data'", "PATCH Request");
});

 module.exports = router;