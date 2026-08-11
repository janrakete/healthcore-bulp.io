/**
 * =============================================================================================
 * Plexus Engine
 * =============
 */

const appConfig = require("../../config");
const common    = require("../../common");

const websocketClient = require("websocket").client;    

class PlexusEngine {
    constructor() {
        this.active           = (appConfig.CONF_plexusIdentifier !== undefined && appConfig.CONF_plexusIdentifier !== "") ? true : false;
        this.webserviceClient = null;
        this.clientID         = null;
        this.connected        = false;
        this.authenticated    = false;
        this.reconnectAttempt = 0;
        this.reconnectTimer   = null;
    }

    /**
     * Connects to the Plexus server via WebSocket.
     */
    connect() {
        if (this.active === true) {
            if (this.connected) {
                common.conLog("Plexus Engine: Already connected to the server.", "yel");
            }
            else {
                common.conLog("Plexus Engine: Connecting to the server ...", "yel");

                let serverPlexusURL    = appConfig.CONF_plexusURL;
                const plexusPort       = appConfig.CONF_plexusPort;
                if ((plexusPort !== undefined) && (plexusPort !== null) && (String(plexusPort).trim() !== "")) {
                    serverPlexusURL = serverPlexusURL + ":" + String(plexusPort).trim();
                }

                if (this.webserviceClient != null) { // Remove all listeners to avoid duplicate event handling
                    this.webserviceClient.removeAllListeners();
                }
                
                this.webserviceClient = new websocketClient();

                this.webserviceClient.on("connect", (connection) => {
                    common.conLog("Plexus Engine: Connected to the server " + serverPlexusURL, "gre");
                    this.connected        = true;
                    this.reconnectAttempt = 0; // reset reconnection backoff on successful connect

                    common.conLog("Plexus Engine: Trying authorization ...", "yel");

                    const payload       = {};
                    payload.type        = "authenticate";
                    payload.identifier  = appConfig.CONF_plexusIdentifier;
                    payload.apiKey      = appConfig.CONF_plexusApiKey;
                    connection.sendUTF(JSON.stringify(payload)); // Send authentication request

                    connection.on("message", async(message) => {
                        if (message.type === "utf8") {

                            let payload = {};

                            try { // parse JSON payload and handle errors
                                payload = JSON.parse(message.utf8Data);
                            }
                            catch (error) {
                                connection.sendUTF(JSON.stringify({
                                    type: "format",
                                    status: "error",
                                    error: "JSON in request is invalid"
                                }));
                                return;
                            }

                            /**
                             * Handle authentication request
                             */
                            if (payload.type === "authenticate") {
                                if (payload.status === "ok") {
                                    common.conLog("Plexus Engine: Authorization successful.", "gre");
                                    this.authenticated  = true;
                                    this.clientID       = payload.clientID; 
                                }
                                else {
                                    common.conLog("Plexus Engine: Authorization failed (" + payload.error + ")", "red");
                                    this.authenticated = false;
                                }
                            }
                            else {
                                if ((this.connected === true) && (this.authenticated === true)) {
                                    const payloadType = String(payload.type ?? "").trim();
                                    if (payloadType !== "") {

                                        /**
                                         * Handle "call" request
                                         */
                                        if (payloadType === "call") {
                                            const payloadCall   = String(payload.call ?? "").trim();
                                            const payloadMethod = String(payload.method ?? "").trim();

                                            if (payloadCall !== "") {
                                                if (payloadMethod !== "") {
                                                    common.conLog("Plexus Engine: Received API call: " + payloadCall + " (method: " + payloadMethod + "), trying to call internally ...", "yel");

                                                    let serverURL    = appConfig.CONF_baseURL;
                                                    const portServer = appConfig.CONF_portServer;
                                                    if ((portServer !== undefined) && (portServer !== null) && (String(portServer).trim() !== "")) {
                                                        serverURL = serverURL + ":" + String(portServer).trim();
                                                    }
                                                    const response  = await fetch(serverURL + payloadCall, { method: payloadMethod });
                                                    const data      = await response.json();

                                                    



                                                    // Handle the API call here
                                                }
                                                else {
                                                    connection.sendUTF(JSON.stringify({
                                                        type:   "call",
                                                        status: "error",
                                                        error:  "Missing 'method' parameter"
                                                    }));
                                                }
                                            }
                                            else {
                                                connection.sendUTF(JSON.stringify({
                                                    type:   "call",
                                                    status: "error",
                                                    error:  "Missing 'call' parameter"
                                                }));
                                            }
                                        }
                                    }
                                    else {
                                        connection.sendUTF(JSON.stringify({
                                            type:   "call",
                                            status: "error",
                                            error:  "Missing 'type' parameter"
                                        }));
                                    }
                                }
                                else {
                                    common.conLog("Plexus Engine: Received message without authentication.", "red");
                                }                            
                            }
                        }
                    });            

                    connection.on("error", (error) => {
                        common.conLog("Plexus Engine: Connection error: " + error.toString(), "red");
                    });

                    connection.on("close", () => {
                        common.conLog("Plexus Engine: Connection closed.", "yel");
                        this.connected     = false;
                        this.authenticated = false;
                        this.clientID      = null;
                        this.scheduleReconnect();
                    });
                });

                this.webserviceClient.on("connectFailed", (error) => {
                    common.conLog("Plexus Engine: Connection failed: " + error.toString(), "red");
                    this.connected     = false;
                    this.authenticated = false;
                    this.clientID      = null;
                    this.scheduleReconnect();
                });

                this.webserviceClient.connect(serverPlexusURL);
            }
        }
        else {
            common.conLog("Plexus Engine: Not active (identifier not set in .env.local).", "yel");
        }
    }

    /**
     * Schedules a reconnect attempt with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectTimer !== null) { // already scheduled
            return; 
        }

        this.reconnectAttempt++;
        const jitter = Math.random() * 1000; // Add some jitter to avoid thundering herd problem
        const delay  = Math.min(appConfig.CONF_plexusReconnectDelaySecondsBase * 1000 * Math.pow(2, this.reconnectAttempt - 1), appConfig.CONF_plexusReconnectDelaySecondsMax * 1000) + jitter;
        common.conLog("Plexus Engine: Reconnecting in " + (delay / 1000).toFixed(2) + "s (attempt " + this.reconnectAttempt + ") ...", "yel");

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }
}

module.exports = PlexusEngine;


