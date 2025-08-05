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
            const topic = packet.topic.toString();
            const message = packet.payload.toString();

            common.conLog("Broker: MQTT message from client '" + client.id + "':", "yel"); 
            common.conLog("Topic: " + topic, "std", false);
            common.conLog("Message: " + message, "std", false);

            try {
                database.prepare("INSERT INTO mqtt_history (topic, message) VALUES (?, ?)").run(topic, message);
            }
            catch (error) {
                common.conLog("Server: Error while inserting topic and message into history:", "red");
                common.conLog(error, "std", false);
            }
        }
    });
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