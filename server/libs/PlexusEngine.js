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
        this.connection       = null;
        this.clientID         = null;
        this.connected        = false;
        this.authenticated    = false;
        this.reconnectAttempt = 0;
        this.reconnectTimer   = null;
        this.heartbeatTimer   = null;
        this.heartbeatTimeout = null;
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
                    this.connection       = connection;
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
                             * Handle heartbeat response
                             */
                            if (payload.type === "pong") {
                                if (connection === this.connection && this.heartbeatTimeout !== null) {
                                    clearTimeout(this.heartbeatTimeout);
                                    this.heartbeatTimeout = null;
                                }
                                return;
                            }
                            /**
                             * Handle authentication request
                             */
                            else if (payload.type === "authenticate") {
                                if (payload.status === "ok") {
                                    common.conLog("Plexus Engine: Authorization successful.", "gre");
                                    this.authenticated  = true;
                                    this.clientID       = payload.clientID; 

                                    if (this.heartbeatTimer !== null) {
                                        clearInterval(this.heartbeatTimer);
                                    }
                                    if (this.heartbeatTimeout !== null) {
                                        clearTimeout(this.heartbeatTimeout);
                                        this.heartbeatTimeout = null;
                                    }

                                    this.heartbeatTimer = setInterval(() => { // Send heartbeat ping to server
                                        if (connection !== this.connection || this.authenticated !== true) {
                                            return;
                                        }

                                        try {
                                            if (this.heartbeatTimeout !== null) {
                                                clearTimeout(this.heartbeatTimeout);
                                            }
                                            
                                            connection.sendUTF(JSON.stringify({ type: "ping" }));
                                            this.heartbeatTimeout = setTimeout(() => {
                                                common.conLog("Plexus Engine: Heartbeat timed out.", "red");
                                                this.handleConnectionLoss(connection);
                                                connection.close();
                                            }, appConfig.CONF_plexusHeartbeatTimeoutSeconds * 1000);
                                        }
                                        catch (error) {
                                            common.conLog("Plexus Engine: Heartbeat failed: " + error.toString(), "red");
                                            this.handleConnectionLoss(connection);
                                        }
                                    }, appConfig.CONF_plexusHeartbeatIntervalSeconds * 1000);
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
                                            const payloadCall     = String(payload.call ?? "").trim();
                                            const payloadMethod   = String(payload.method ?? "").trim();
                                            const payloadContent  = payload.content ?? {};
                                            const payloadUUID     = String(payload.uuid ?? "").trim();

                                            if (payloadCall !== "") {
                                                if (payloadMethod !== "") {
                                                    common.conLog("Plexus Engine: Received API call: " + payloadCall + " (method: " + payloadMethod + "), trying to call internally ...", "yel");

                                                    let serverURL    = appConfig.CONF_baseURL;
                                                    const portServer = appConfig.CONF_portServer;
                                                    if ((portServer !== undefined) && (portServer !== null) && (String(portServer).trim() !== "")) {
                                                        serverURL = serverURL + ":" + String(portServer).trim();
                                                    }
                                                    
                                                    try {
                                                        const fetchParameters   = {};
                                                        fetchParameters.method  = payloadMethod;
                                                        fetchParameters.headers = { "Content-Type": "application/json" };
                                                        fetchParameters.body    = payloadMethod === "GET" ? undefined : JSON.stringify(payloadContent);

                                                        const response  = await fetch(serverURL + payloadCall, fetchParameters);
                                                        const content   = await response.json();

                                                        connection.sendUTF(JSON.stringify({
                                                            type:      "call",
                                                            status:    "ok",
                                                            content:   content,
                                                            uuid:      payloadUUID
                                                        }));
                                                    }
                                                    catch (error) {
                                                        connection.sendUTF(JSON.stringify({
                                                            type:   "call",
                                                            status: "error",
                                                            error:  "Internal server error: " + error.message,
                                                            uuid:   payloadUUID
                                                        }));
                                                    }
                                                }
                                                else {
                                                    connection.sendUTF(JSON.stringify({
                                                        type:   "call",
                                                        status: "error",
                                                        error:  "Missing 'method' parameter",
                                                        uuid:   payloadUUID
                                                    }));
                                                }
                                            }
                                            else {
                                                connection.sendUTF(JSON.stringify({
                                                    type:   "call",
                                                    status: "error",
                                                    error:  "Missing 'call' parameter",
                                                    uuid:   payloadUUID
                                                }));
                                            }
                                        }
                                        else if (payloadType === "login") {
                                            const payloadUsername   = String(payload.username ?? "").trim();
                                            const payloadPassword   = String(payload.password ?? "").trim();
                                            const payloadUUID       = String(payload.uuid ?? "").trim();

                                            if (payloadUsername !== "" && payloadPassword !== "") {
                                                common.conLog("Plexus Engine: Received login request for username: " + payloadUsername, "yel");

                                                try {
                                                    const result = database.prepare("SELECT * FROM users WHERE username = ? AND password = ? LIMIT 1").all(payloadUsername, payloadPassword);

                                                    if (result.length === 1) {
                                                        connection.sendUTF(JSON.stringify({
                                                            type:   "login",
                                                            status: "ok",
                                                            content: {
                                                                userID:   result[0].userID,
                                                                username: result[0].username
                                                            },
                                                            uuid: payloadUUID
                                                        }));
                                                    }
                                                    else {
                                                        connection.sendUTF(JSON.stringify({
                                                            type:   "login",
                                                            status: "error",
                                                            error:  "Invalid username or password",
                                                            uuid:   payloadUUID
                                                        }));
                                                    }
                                                }
                                                catch (error) {
                                                    connection.sendUTF(JSON.stringify({
                                                        type:   "login",
                                                        status: "error",
                                                        error:  "Internal server error: " + error.message,
                                                        uuid:   payloadUUID
                                                    }));
                                                }
                                            }
                                            else {
                                                connection.sendUTF(JSON.stringify({
                                                    type:   "login",
                                                    status: "error",
                                                    error:  "Missing username or password",
                                                    uuid:   payloadUUID
                                                }));
                                            }
                                        }
                                        else {
                                            connection.sendUTF(JSON.stringify({
                                                status: "error",
                                                error:  "Unknown 'type' parameter: " + payloadType,
                                                uuid:   payload.uuid
                                            }));
                                        }
                                    }
                                    else {
                                        connection.sendUTF(JSON.stringify({
                                            status: "error",
                                            error:  "Missing 'type' parameter",
                                            uuid:   payload.uuid
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
                        this.handleConnectionLoss(connection);
                    });

                    connection.on("close", () => {
                        common.conLog("Plexus Engine: Connection closed.", "yel");
                        this.handleConnectionLoss(connection);
                    });
                });

                this.webserviceClient.on("connectFailed", (error) => {
                    common.conLog("Plexus Engine: Connection failed: " + error.toString(), "red");
                    this.handleConnectionLoss();
                });

                this.webserviceClient.connect(serverPlexusURL);
            }
        }
        else {
            common.conLog("Plexus Engine: Not active (identifier not set in .env.local).", "yel");
        }
    }

    /**
     * Clears the current connection state and schedules one reconnect.
     */
    handleConnectionLoss(connection = null) {
        if (connection !== null && connection !== this.connection) {
            return;
        }

        clearInterval(this.heartbeatTimer);
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimer   = null;
        this.heartbeatTimeout = null;
        this.connection       = null;
        this.connected        = false;
        this.authenticated    = false;
        this.clientID         = null;
        this.scheduleReconnect();
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


