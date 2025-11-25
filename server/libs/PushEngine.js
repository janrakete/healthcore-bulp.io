/**
 * =============================================================================================
 * Push Token Engine - Services for managing push notification tokens with Firebase
 * ================================================================================
 */

const appConfig = require("../../config");

const firebaseAdmin = require("firebase-admin");

class PushEngine {
  constructor() {
    var serviceAccount = require("../../push-firebase-admin.json");
    firebaseAdmin.initializeApp({credential: firebaseAdmin.credential.cert(serviceAccount)});    
  }

  /**
   * Send a push notification to all registered tokens 
   * @param {string} title 
   * @param {string} body 
   */
  async sendAll(pushTitle, pushBody = "") {
    common.conLog("Push Engine: Starting to send push notification with title '" + pushTitle + "'", "yel");
    const results   = database.prepare("SELECT token FROM push_tokens").all(); // get all registered push tokens
    const tokens    = results.map(result => result.token);
    
    if (tokens.length > 0) {
        const message               = {}; // build push message
        message.notification        = {};
        message.notification.title  = pushTitle;
        message.notification.body   = pushBody;
        message.tokens             = tokens;
    
        common.conLog("Push Engine: Trying to send push message:", "std", false);
        common.conLog(message, "std", false);

        try { 
            const call = await firebaseAdmin.messaging().sendEachForMulticast(message);
            common.conLog("Push Engine: Successfully sent push notification to " + call.successCount + " tokens", "gre");

            for (const response of call.responses) {
                if (response.error) {
                    common.conLog("Push Engine: Error sending to token '': " + response.error, "red");
                    // ===== 
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
}

module.exports = PushEngine;