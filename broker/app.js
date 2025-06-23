/*
 * =============================================================================================
 * MQTT Broker
 * ===========
 */
const appConfig = require("../config");
const common    = require("../common");

/**
 * Starts the MQTT broker and sets up the server to listen for incoming connections. Initializes the Aedes MQTT broker and sets up event handlers for client connections, disconnections, subscriptions, and message publications.
 * @async
 * @function startBroker
 * @description This function initializes the MQTT broker using the Aedes library and listens on the specified port defined in the appConfig.
 */
async function startBroker() {
    /**
     * Initialize the MQTT broker and the server
     */
    const aedes     = require("aedes")();
    const net       = require("net");
    const server    = net.createServer(aedes.handle);

    console.log(common);

    server.listen(appConfig.CONF_portBroker, function() {
        common.logoShow("MQTT Broker", appConfig.CONF_portBroker); // show bulp logo
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
            common.conLog("Broker: MQTT message from client '" + client.id + "':", "yel"); 
            common.conLog("Topic: " + packet.topic, "std", false);
            common.conLog("Message: " + packet.payload.toString(), "std", false);
        }
    });
}

startBroker();

/**
 * Handles the SIGINT signal (Ctrl+C) to gracefully shut down the server.
 * Logs a message indicating that the server is closed and exits the process.
 */
process.on("SIGINT", function () {
        common.conLog("Server closed.", "mag", true);
        process.exit(0);
});