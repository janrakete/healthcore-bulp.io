/**
 * =============================================================================================
 * Push Token Engine - Services for managing push notification tokens with Firebase
 * ================================================================================
 */

const appConfig = require("../../config");
const path = require("path");

const firebaseAdmin = require("firebase-admin");

class PushEngine {
  constructor() {
    this.initialized = false;
    const keyPath = path.resolve(__dirname, appConfig.CONF_pushFirebaseKeyPath + "push-firebase-admin.json");
    if (!require("fs").existsSync(keyPath)) {
        common.conLog("Push Engine: Firebase key file not found at " + keyPath + ". Sending push notifications will not work.", "red");
    }
    else {
        const serviceAccount = require(keyPath);
        firebaseAdmin.initializeApp({credential: firebaseAdmin.credential.cert(serviceAccount)});  
        
        this.permanentInvalidTokenErrors = [ // list of error codes that indicate a token is permanently invalid and should be deleted
            "messaging/invalid-registration-token",
            "messaging/registration-token-not-registered",
            "messaging/invalid-recipient",
            "messaging/invalid-argument"
        ];
        this.initialized = true;
    }
  }

  /**
   * Send a push notification to all registered tokens 
   * @param {string} title 
   * @param {string} body 
   */
    async sendAll(pushTitle, pushBody = "") {
        if (this.initialized === true) {
            common.conLog("Push Engine: Starting to send push notification with title '" + pushTitle + "'", "yel");
            
            const results   = database.prepare("SELECT token FROM push_tokens").all(); // get all registered push tokens
            const tokens    = results.map(result => result.token);
            
            if (tokens.length > 0) {
                const message               = {}; // build push message
                message.notification        = {};
                message.notification.title  = pushTitle;
                message.notification.body   = pushBody;

                try { 
                    const batchSize = 500; // send in batches of 500 tokens each
                    
                    for (let batchIndex = 0; batchIndex < tokens.length; batchIndex += batchSize) {
                        const batchTokens = tokens.slice(batchIndex, batchIndex + batchSize);
                        const batchMessage = {
                            notification: message.notification,
                            tokens: batchTokens
                        };
                        
                        common.conLog("Push Engine: Trying to send push message in batch " + (batchIndex / batchSize + 1) + ":", "std", false);
                        common.conLog(batchMessage, "std", false);

                        const call = await firebaseAdmin.messaging().sendEachForMulticast(batchMessage);
                        common.conLog("Push Engine: Successfully sent push notification to " + call.successCount + " tokens", "gre");

                        let tokenIndex = 0;
                        for (const response of call.responses) {
                            if (response.success === false) { // delete invalid token
                                common.conLog("Push Engine: Error sending to token:", "red");
                                common.conLog(response.error, "std", false);

                                if (this.permanentInvalidTokenErrors.includes(response.error.errorInfo.code)) {
                                    database.prepare("DELETE FROM push_tokens WHERE token = ? LIMIT 1").run(tokens[tokenIndex]);
                                    common.conLog("Push Engine: Removed invalid push token '" + tokens[tokenIndex] + "' from database", "std", false);
                                }
                            }
                            tokenIndex++;
                        }
                    }
                }
                catch (error) {
                    common.conLog("Push Engine: Error sending push notification:", "red", false);
                    common.conLog(error, "std", false);
                }
            }
            else {
                common.conLog("Push Engine: No push tokens registered, skipping push notification", "red");
            }
        }
        else 
        {
            common.conLog("Push Engine: Cannot send push notification, Firebase not initialized", "red");
        }
    }
}

module.exports = PushEngine;