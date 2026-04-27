/**
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
database.pragma("foreign_keys = ON");

/**
 * Prepared SQLite statements (hoisted to avoid re-compilation on every publish)
 */
const statementInsertHistory = database.prepare(
    "INSERT INTO mqtt_history (topic, message, callID, dateTime) VALUES (?, ?, ?, datetime('now', 'localtime'))"
);

const statementInsertValue = database.prepare(
    "INSERT INTO mqtt_history_devices_values (deviceID, dateTime, dateTimeAsNumeric, property, value, valueAsNumeric, weekday, weekdaySin, weekdayCos, hour, hourSin, hourCos, month) VALUES (?, datetime('now', 'localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);

/**
 * Starts and initializes the MQTT broker server.
 * @function startServer
 * @description This function initializes the MQTT broker server.
 */
function startServer() {
    /**
     * Initialize the MQTT broker and the server
     */
    const aedes = require("aedes")();
    const net   = require("net");
    let server;

    if (appConfig.CONF_tlsPath) {
        const tls = require("tls");
        const fs  = require("fs");

        try {
            const options = {
              key:  fs.readFileSync(appConfig.CONF_tlsPath + "key.pem"),
              cert: fs.readFileSync(appConfig.CONF_tlsPath + "cert.pem")
            };
            server = tls.createServer(options, aedes.handle);
            common.conLog("Broker: TLS enabled", "gre");
        }
        catch (error) {
             common.conLog("Broker: Error loading TLS certs (" + error.message + "). Check CONF_tlsPath.", "red");
             common.conLog("Broker: Falling back to non-TLS (TCP)", "yel");
             server = net.createServer(aedes.handle);
        }
    }
    else {
        server = net.createServer(aedes.handle);
    }

    server.listen(appConfig.CONF_portBroker, function() {
        common.logoShow("MQTT Broker", appConfig.CONF_portBroker); // show logo
    });

    /**
     * Validates client credentials against configured username and password. If no credentials are configured, all clients are allowed (development mode).
     */
    aedes.authenticate = function (client, username, password, callback) {
        if (!appConfig.CONF_brokerUsername && !appConfig.CONF_brokerPassword) {
            return callback(null, true);
        }

        const passwordString = password ? password.toString() : "";
        if (username === appConfig.CONF_brokerUsername && passwordString === appConfig.CONF_brokerPassword) {
            common.conLog("Broker: Client '" + client.id + "' authenticated successfully", "gre");
            return callback(null, true);
        }

        common.conLog("Broker: Client '" + client.id + "' authentication failed", "red");
        const error      = new Error("Authentication failed");
        error.returnCode = 4; // CONNACK return code: bad username or password
        return callback(error, false);
    };

    /**
     * =============================================================================================
     * Helper functions
     * ================
     */

    /**
     * Extracts time-based features from a date for use in machine learning algorithms.
     * @param {Date|number} date - A Date object or a numeric timestamp (milliseconds since epoch).
     * @returns {Object} An object containing the extracted time features.
     * @description Returns both raw and sine/cosine-encoded versions of time values.
     * Raw values (weekday, hour) are included for human readability.
     * Sine/cosine encoding is used for cyclical features so that ML algorithms understand
     * that the values "wrap around" — e.g. Sunday (6) and Monday (0) are adjacent,
     * and 23:00 and 00:00 are adjacent. Without this encoding, a model would treat them
     * as far apart on a linear scale.
     */
    function timeFeaturesExtract(date) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }

        // Raw timestamp in milliseconds — used as a unique time identifier
        const dateTimeAsNumeric = date.getTime();

        // Weekday: 0 (Sunday) to 6 (Saturday)
        // Sine/cosine encoding maps this onto a circle of 7 steps
        const weekday    = date.getDay();
        const weekdaySin = Math.sin((2 * Math.PI * weekday) / 7);
        const weekdayCos = Math.cos((2 * Math.PI * weekday) / 7);

        // Hour: 0 to 23
        // Sine/cosine encoding maps this onto a circle of 24 steps
        const hour    = date.getHours();
        const hourSin = Math.sin((2 * Math.PI * hour) / 24);
        const hourCos = Math.cos((2 * Math.PI * hour) / 24);

        // Month: 1 (January) to 12 (December) — getMonth() returns 0–11, so +1
        const month = date.getMonth() + 1;

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

    aedes.authorizePublish = function (client, packet, callback) { // execute SQL statements before MQTT messages are published
        if (client) {
            const topic   = packet.topic.toString();
            const message = packet.payload.toString();

            let data;
            try {
                data = JSON.parse(message);
            }
            catch { // non-JSON message — allow it to pass through without DB insertion
                return callback(null, true);
            }

            const callID = data.callID ?? null;

            try {
                statementInsertHistory.run(topic, message, callID);

                if (topic === "server/devices/values/get") { // if topic is for device values, then insert values also into mqtt_history_devices_values to use for Care Insights and related analytics
                    const timeFeatures = timeFeaturesExtract(Date.now()); // extract time features from the current date and time

                    if (!data.values || typeof data.values !== "object" || Array.isArray(data.values)) { // validate that data.values exists and is an object (not an array)
                        common.conLog("Broker: data.values is missing or not an object, skipping value insertion", "red");
                        return callback(null, true);
                    }

                    const deviceID = common.deviceGetIDByUUID(data.uuid, data.bridge, database); // translate uuid and bridge to numeric deviceID once for this message
                    if (deviceID === null) {
                        common.conLog("Broker: Device uuid '" + data.uuid + "' not found in database, skipping value insertion", "red");
                        return callback(null, true);
                    }

                    for (const [property, value] of Object.entries(data.values)) { // iterate over each property
                        statementInsertValue.run(
                            deviceID, timeFeatures.dateTimeAsNumeric, property, value.value, value.valueAsNumeric, timeFeatures.weekday, timeFeatures.weekdaySin, timeFeatures.weekdayCos, timeFeatures.hour, timeFeatures.hourSin, timeFeatures.hourCos, timeFeatures.month);
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

    /**
     * Graceful shutdown: close aedes broker, server, and database on SIGINT.
     */
    process.on("SIGINT", function () {
        common.conLog("Broker: Shutting down ...", "mag", true);
        aedes.close(function () {
            server.close(function () {
                database.close();
                common.conLog("Server closed.", "mag", true);
                process.exit(0);
            });
        });
    });
}

/** 
 * Unhandled errors
 */
process.on("unhandledRejection", function (reason) {
    common.conLog("Broker: Unhandled promise rejection: " + reason, "red");
});

/** 
 * Uncaught exceptions
 */
process.on("uncaughtException", function (error) {
    common.conLog("Broker: Uncaught exception: " + error.message, "red");
    common.conLog(error.stack, "std", false);
});

startServer();