/*
    ==============================
    Data - Routes
    ==============================
*/

const AppConfig         = require("../../config");
const Router            = require("express").Router();

const arrTablesAllowed  = AppConfig.CONF_arrTablesAllowedForAPI; // defines, which tables are allowed

/*
   Build insert or update statement out of payload
*/
async function statementBuild(strTable, Payload, strType="INSERT") {
   let Return              = new Object();

   const [arrResults]   = await MySQLConnection.query("SHOW COLUMNS FROM " + strTable); // build an array with all fields of the table
   let arrColumnsList = new Array();
   for await (Result of arrResults) { 
      arrColumnsList.push(Result.Field);
   }

   let arrData = new Array();
   
   if ((Payload !== undefined) && (Object.keys(Payload).length > 0)) {
      for await (const [anyKey, anyValue] of Object.entries(Payload)) { // loop through all keys of the JSON payload
         if (arrColumnsList.includes(anyKey)) { // if key is an existing table column ... 
            Return.strStatus     = "ok"; // ... return ok       
            Data                 = new Object();
            Data[anyKey]         = anyValue;
            arrData.push(Data);
         }
         else { // if key is not an existing table column ...
            Return.strStatus  = "error"; // ... return error
            Return.strError   = "Given key '" + anyKey + "' does not exists in table";
            break;
         }
      }

      if (Return.strStatus == "ok") {
         Return.strStatement = "";
         if (strType == "INSERT") { // build INSERT statement
            let strFields = "";
            let strValues = "";
            for await (let Data of arrData) {
               strFields = strFields + Object.keys(Data)[0] + ", "
               strValues = strValues + "'" + Data[Object.keys(Data)[0]] + "', ";
            }

            strFields = strFields.substring(0, strFields.length - 2);  // remove the last ", "
            strValues = strValues.substring(0, strValues.length - 2);  // remove the last ", "
            Return.strStatement = " (" + strFields + ") VALUES (" + strValues + ")";
         }
         else { // build UPDATE statement
            for await (let Data of arrData) {
               Return.strStatement = Return.strStatement + " " + Object.keys(Data)[0] + "='" + Data[Object.keys(Data)[0]] + "', ";
            }
            Return.strStatement = Return.strStatement.substring(0, Return.strStatement.length - 2);  // remove the last ", "
         }
      }
   }
   else {
      Return.strStatus = "error";
      Return.strError  = "Data is empty";                  
   }
   return (Return);  
}

/*
   Build WHERE condition out of payload
*/
async function conditionBuild(strTable, Payload) {
   let Return              = new Object();

   const [arrResults]   = await MySQLConnection.query("SHOW COLUMNS FROM " + strTable); // build an array with all fields of the table
   let arrColumnsList = new Array();
   for await (Result of arrResults) { 
      arrColumnsList.push(Result.Field);
   }

   Return.strCondition = "";   
   if ((Payload !== undefined) && (Object.keys(Payload).length > 0)) {
      for await (const [anyKey, anyValue] of Object.entries(Payload)) { // loop through all keys of the JSON payload
         if (arrColumnsList.includes(anyKey)) { // if key is an existing table column ...
            Return.strStatus         = "ok"; // ... return ok and ...                
            if (Return.strCondition === undefined) {
               Return.strCondition = "";
            }
            Return.strCondition = Return.strCondition + " " + anyKey + "='" + anyValue + "' AND"; // ... build WHERE condition
         }
         else { // if key is not an existing table column
            Return.strCondition = "";
            Return.strStatus  = "error"; // ... return error
            Return.strError   = "Given key '" + anyKey + "' in condition block does not exists in table";
            break;
         }
      }
      
      if (Return.strCondition != "") { // remove the last " AND"
         Return.strCondition = " WHERE " + Return.strCondition.substring(0, Return.strCondition.length - 4); 
      }
   }  
   else {
      Return.strStatus  = "ok"; // if payload is empty it's also ok, no WHERE condition returned
   }

   return (Return);
}

/*
   Create database entry
*/
Router.post("/:strTable*", async function (Request, Response) {
   const strTable    = Request.params.strTable;
   let Data          = new Object();

   Request = Request.body;

   if (arrTablesAllowed.includes(strTable)) {  // check, if table name is in allowed list
      try {
         Data.strStatus = "ok";

         let Statement = await statementBuild(strTable, Request, "INSERT");
         if (Statement.strStatus == "ok") {
            let strStatement = "INSERT INTO " + strTable + Statement.strStatement;
            Common.conLog("POST request from client: access table '" + strTable + "'", "gre");
            Common.conLog("Execute statement: " + strStatement, "std", false);

            const Result = await MySQLConnection.query(strStatement);
            Data.intID = Result[0].insertId; // return last insert id
         }
         else {
            Data.strStatus = Statement.strStatus;
            Data.strError  = Statement.strError;
         }
      }
      catch (Error) {
         Data.strStatus = "error";
         Data.strError  = "Fatal error: " + (Error.stack).slice(0, 128);
      }
   }
   else {
      Data.strStatus = "error";
      Data.strError  = "Access to table '" + strTable + "' not allowed";
   }

   if (Data.strStatus == "error") {
      Common.conLog("Request from client: an error occured", "red");
   }

   Common.conLog("HTTP response: " + JSON.stringify(Data), "std", false);
   Response.json(Data);
});

/*
   Get database entry or entries
*/
Router.get("/:strTable*", async function (Request, Response) {
   const strTable    = Request.params.strTable;
   let Data          = new Object();

   Request = Request.query;

   if (arrTablesAllowed.includes(strTable)) {  // check, if table name is in allowed list
      try {
         Data.strStatus = "ok";

         let Condition = await conditionBuild(strTable, Request);
         if (Condition.strStatus == "ok") {
            let strStatement     = "SELECT * FROM " + strTable + Condition.strCondition + " LIMIT 500";
            Common.conLog("GET request client: access table '" + strTable + "'", "gre");
            Common.conLog("Execute statement: " + strStatement, "std", false);

            const [arrResults]   = await MySQLConnection.query(strStatement);
            Data.arrResults      = arrResults;
         }
         else {
            Data.strStatus = Condition.strStatus;
            Data.strError  = Condition.strError;
         }
      }
      catch (Error) {
         Data.strStatus = "error";
         Data.strError  = "Fatal error: " + (Error.stack).slice(0, 128);
      }
   }
   else {
      Data.strStatus = "error";
      Data.strError  = "Access to table '" + strTable + "' not allowed";
   }

   if (Data.strStatus == "error") {
      Common.conLog("Request from client: an error occured", "red");
   }

   Common.conLog("HTTP response: " + JSON.stringify(Data), "std", false);
   Response.json(Data);
});


/*
   Delete database entry or entries
*/
Router.delete("/:strTable*", async function (Request, Response) {
   const strTable    = Request.params.strTable;
   let Data          = new Object();

   Request = Request.query;

   if (arrTablesAllowed.includes(strTable)) {  // check, if table name is in allowed list
      try {
         Data.strStatus = "ok";

         let Condition = await conditionBuild(strTable, Request);
         if (Condition.strStatus == "ok") {
            if (Condition.strCondition.trim() != "") {
               let strStatement     = "DELETE FROM " + strTable + Condition.strCondition + " LIMIT 1";
               Common.conLog("DELETE request from client: access table '" + strTable + "'", "gre");
               Common.conLog("Execute statement: " + strStatement, "std", false);
      
               await MySQLConnection.query(strStatement);
            }
            else { // if no condition is given, return error
               Data.strStatus = "error";
               Data.strError  = "DELETE needs a condition";                  
            }
         }
         else {
            Data.strStatus = Condition.strStatus;
            Data.strError  = Condition.strError;
         }
      }
      catch (Error) {
         Data.strStatus = "error";
         Data.strError  = "Fatal error: " + (Error.stack).slice(0, 128);
      }
   }
   else {
      Data.strStatus = "error";
      Data.strError  = "Access to table '" + strTable + "' not allowed";
   }

   if (Data.strStatus == "error") {
      Common.conLog("Request from client: an error occured", "red");
   }

   Common.conLog("HTTP response: " + JSON.stringify(Data), "std", false);
   Response.json(Data);
});

/*
   Replace database entry or entries
*/
Router.patch("/:strTable*", async function (Request, Response) {
   const strTable    = Request.params.strTable;
   let Data          = new Object();

   let RequestBody   = Request.body; // POST values are for data
   let RequestQuery  = Request.query; // GET values are for condition

   if (arrTablesAllowed.includes(strTable)) {  // check, if table name is in allowed list
      try {
         Data.strStatus = "ok";

         let Condition = await conditionBuild(strTable, RequestQuery);
         if (Condition.strStatus == "ok") {
            if (Condition.strCondition.trim() != "") {

               let Statement = await statementBuild(strTable, RequestBody, "UPDATE");
               if (Statement.strStatus == "ok") {
                  let strStatement = "UPDATE " + strTable + " SET " + Statement.strStatement + Condition.strCondition + " LIMIT 1";
                  Common.conLog("PATCH request from client: access table '" + strTable + "'", "gre");
                  Common.conLog("Execute statement: " + strStatement, "std", false);
      
                  await MySQLConnection.query(strStatement);
               }
               else {
                  Data.strStatus = Statement.strStatus;
                  Data.strError  = Statement.strError;
               }
            }
            else {
               Data.strStatus = "error";
               Data.strError  = "PATCH needs a condition";                  
            }
         }
         else {
            Data.strStatus = Condition.strStatus;
            Data.strError  = Condition.strError;
         }
      }
      catch (Error) {
         Data.strStatus = "error";
         Data.strError  = "Fatal error: " + (Error.stack).slice(0, 128);
      }
   }
   else {
      Data.strStatus = "error";
      Data.strError  = "Access to table '" + strTable + "' not allowed";
   }

   if (Data.strStatus == "error") {
      Common.conLog("Request from client: an error occured", "red");
   }

   Common.conLog("HTTP response: " + JSON.stringify(Data), "std", false);
   Response.json(Data);
});

 module.exports = Router;