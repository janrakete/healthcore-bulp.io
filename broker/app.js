/*
 * =============================================================================================
 * MQTT Broker
 * ===========
 */
const appConfig = require("../config");
const common    = require("../common");

/**
 * SQLite
 */
const database = require("better-sqlite3")(appConfig.CONF_databaseFilename);

/**
 * Starts the SQLite connection and initializes the MQTT broker server.
 * @async
 * @function startDatabaseAndServer
 * @description This function establishes a SQLite connection and initializes the MQTT broker server.
 */
async function startDatabaseAndServer() {
    /**
     * Initialize the MQTT broker and the server
     */
    const aedes     = require("aedes")();
    const net       = require("net");
    const server    = net.createServer(aedes.handle);

    server.listen(appConfig.CONF_portBroker, function() {
        common.logoShow("MQTT Broker", appConfig.CONF_portBroker); // show logo
    });

    /**
     * =============================================================================================
     * Helper functions
     * ================
     */

    /**
     * Extract time features from a date object.
     * @param {Date} date
     * @returns {Object} An object containing the extracted time features.
     * @description This function extracts various time-related features from a given date object.
     */
    function timeFeaturesExtract(date) {
    if (!(date instanceof Date))
        date = new Date(date);

        const dateTimeAsNumeric = date.getTime();
        const weekday           = date.getDay();
        const weekdaySin        = Math.sin((2 * Math.PI * weekday) / 7);
        const weekdayCos        = Math.cos((2 * Math.PI * weekday) / 7);
        const hour              = date.getHours();
        const hourSin           = Math.sin((2 * Math.PI * hour) / 24);
        const hourCos           = Math.cos((2 * Math.PI * hour) / 24);
        const month             = date.getMonth() + 1;

        return {
            dateTimeAsNumeric,
            weekday,
            weekdaySin,
            weekdayCos,
            hour,
            hourSin,
            hourCos,
            month
        };
    }

    /**
     * Event handlers for the MQTT broker. These handlers log various events such as client connections, disconnections, subscriptions, and message publications to the console.
     * @event client - Triggered when a new client connects to the broker.
     * @event clientDisconnect - Triggered when a client disconnects from the broker.
     * @event subscribe - Triggered when a client subscribes to a topic.
     * @event publish - Triggered when a client publishes a message to a topic.
     * @description These events are used to log the activity of clients interacting with the MQTT broker
     */
    aedes.on("client", function (client) {
        common.conLog("Broker: Client '" + client.id + "' connected", "gre"); 
    });     

    aedes.on("clientDisconnect", function (client) {
        common.conLog("Broker: Client '" + client.id + "' disconnected", "red");
    });    

    aedes.on("subscribe", function (subscriptions, client) {
        common.conLog("Broker: Client '" + client.id + "' subscribed to topics: " + subscriptions.map(sub => sub.topic).join(", "), "yel"); 
    });

    aedes.on("publish", function (packet, client) { 
        if (client) {        
            const topic     = packet.topic.toString();
            const message   = packet.payload.toString();

            common.conLog("Broker: MQTT message from client '" + client.id + "':", "yel"); 
            common.conLog("Topic: " + topic, "std", false);
            common.conLog("Message: " + message, "std", false);        
        }
    });

    aedes.authorizePublish = async function (client, packet, callback) { // execute SQL statements before MQTT messages are published
        if (client) {
            const topic     = packet.topic.toString();
            const message   = packet.payload.toString();

            try {
                await database.prepare("INSERT INTO mqtt_history (topic, message, messageID) VALUES (?, ?, ?)").run(topic, message, message.messageID !== undefined ? message.messageID : null);
                if (topic === "server/device/values") { // if topic is for device values, then insert values also into mqtt_history_devices_values to use for anomaly detection
                    const data          = JSON.parse(message);
                    const timeFeatures  = timeFeaturesExtract(Date.now()); // extract time features from the current date and time
                    for (const property of data.properties) { // iterate over each property
                        await database.prepare("INSERT INTO mqtt_history_devices_values (deviceID, dateTimeAsNumeric, bridge, property, value, valueAsNumeric, weekday, weekdaySin, weekdayCos, hour, hourSin, hourCos, month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
                            data.deviceID, timeFeatures.dateTimeAsNumeric, data.bridge, Object.keys(property)[0], property[Object.keys(property)[0]].value, property[Object.keys(property)[0]].valueAsNumeric, timeFeatures.weekday, timeFeatures.weekdaySin, timeFeatures.weekdayCos, timeFeatures.hour, timeFeatures.hourSin, timeFeatures.hourCos, timeFeatures.month);
                    }
                    common.conLog("Broker: MQTT device values inserted into database", "gre");
                }
            }
            catch (error) {
                common.conLog("Broker: Error while inserting topic and message into history or values:", "red");
                common.conLog(error, "std", false);
            }
        }
        callback(null, true);
    };
}

startDatabaseAndServer();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
        common.conLog("Server closed.", "mag", true);
        process.exit(0);
});