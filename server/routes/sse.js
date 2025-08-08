/*
    ==============================
    MQTT - Routes
    ==============================
*/

const AppConfig = require("../../config");
const Router    = require("express").Router();

/*
   Route for SSE, which informs about a new event 
*/
Router.get("/events_listener", async function (Request, Response) {
	const SSESession = await SSE.createSession(Request, Response);
	SSEChannel.register(SSESession);
});

/*
   Returns a list of events about a single event type and in a given time range
*/
Router.get("/events_to_clients", async function (Request, Response) {
    const strCommand            = Request.query.strCommand;
    const strDateTimeFromLatest = Request.query.strDateTimeFromLatest;
    const strDateTimeToOldest   = Request.query.strDateTimeToOldest;
    const intLimit              = Request.query.intLimit != null ? Request.query.intLimit : 100;
    
    let Data = new Object();

    if (strCommand != null) {  // check if command is given
        try {
            Data.strStatus = "ok";

            let strCondition = ""; // if dates are set, then build a condition
            if  ((strDateTimeFromLatest != null) && (strDateTimeToOldest != null)) {
                strCondition = " AND (strDateTime <= '" + strDateTimeFromLatest + "' AND strDateTime >= '" +  strDateTimeToOldest + "')"; 
            }

            let strStatement = "SELECT * FROM mqtt_events WHERE strCommand='" + strCommand + "' " + strCondition + " ORDER BY strDateTime DESC LIMIT " + intLimit;
            common.conLog("GET request from client: access table 'mqtt_events'", "gre");
            common.conLog("Execute statement: " + strStatement, "std", false);

            const [arrResults]   = await MySQLConnection.query(strStatement);
            Data.arrResults      = arrResults;
        }
        catch (Error) {
            Data.strStatus = "error";
            Data.strError  = "Fatal error: " + (Error.stack).slice(0, 128);
        }
    }
    else {
       Data.strStatus = "error";
       Data.strError  = "No command given";
    }
 
    if (Data.strStatus == "error") {
       common.conLog("Request from client for table 'mqtt_to_clients': an error occured", "red");
    }
 
    common.conLog("HTTP response: " + JSON.stringify(Data), "std", false);
    Response.json(Data);
});

 module.exports = Router;