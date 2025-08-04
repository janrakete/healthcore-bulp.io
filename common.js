/**
 * =============================================================================================
 * Common functions
 * ================
 */

const util      = require("util");
const colors    = require("colors");
const moment    = require("moment");
const sleep     = require("sleep-promise");
const crypto    = require('crypto');

/**
 * Console Log Function
 * @param {any} anyValue - The value to log, can be a string or an object.
 * @param {string} color - The color to use for the log output. Default is "std" (standard).
 * @param {boolean} showSeparators - Whether to show separators before and after the log output. Default is true.
 * @param {boolean} cutString - Whether to cut the string output to 512 characters. Default is true.
 * @returns {void} 
 * @description This function logs the provided value to the console with optional formatting and color.  
 */
function conLog(anyValue, color = "std", showSeparators = true, cutString = true) {
    const colorMap = {
        red: "red",
        yel: "yellow",
        gre: "green",
        mag: "magenta",
        high: "bgRed",
        std: "reset",
    };

    const separator = "---------------------------------------------";
    const dateTime = "[" + moment().format("HH:mm:ss") +  "]";

    if (typeof anyValue === "object" && anyValue !== null) { // if given value is an object
        if (showSeparators === true) {
            let separatorString = separator;
            if (color === "high") {
                separatorString = separatorString[colorMap.high];
            }
            console.log(separatorString);    
        }
        console.log(dateTime);
        console.log(util.inspect(anyValue, { showHidden: false, depth: null, colors: true }));
    }
    else {  // if given value is a string
        let output = anyValue;

        if (cutString === true) {
            output = output.slice(0, 512);
        }
    
        output = output[colorMap[color] || colorMap.std];
    
        if (color === "high")
        {
            console.log("");
        }
        
        if (showSeparators === true) {
            console.log(separator);    
        }
    
        console.log(dateTime + " " + output);    
    
        if (color === "high")
        {
            console.log(output);    
            console.log(output);    
            console.log("");
        }
    }
}

/**
 * Pause function
 * @param {number} milliseconds - The number of milliseconds to pause execution.
 * @returns {Promise<void>} - A promise that resolves after the specified time.
 * @description This function pauses execution for a specified number of milliseconds using sleep-promise.
 */
async function pause(milliseconds) {
    await sleep(milliseconds);    
}

/**
 * Translations Class
 * @description This class handles translations for the application. It fetches translations from a MySQL database and provides a method to retrieve them by their ID.
*/
class Translations {
    constructor() {
        this.translations = [];
    }

    /**
     * Builds the translations by fetching them from the MySQL database.
     * @returns {Promise<void>} - A promise that resolves when the translations are built.
     * @description This method queries the `translations` table in the MySQL database and stores the results in the `translations` array, indexed by the translation ID in lowercase.
     */
    async build() {
        const translations = [];
        const [results]  = await mysqlConnection.query("SELECT * FROM translations");

        for await (const result of results) { 
            translations[result.translationID.toLowerCase()] = result;
        }

        this.translations = translations;
    }

    /**
     *  Retrieves a translation by its ID.
     * @param {string} string - The translation ID to retrieve. It will be converted to lowercase.
     * @return {Object|null} - The translation object if found, or null if not found.
     * @description This method looks up a translation in the `translations` array by its ID
     */
    get (string) {
        if (string !== undefined) {
            string = string.toString().toLowerCase();
            let data = this.translations[string] || this.translations.not_translated;
            if (data) {
                delete data.translationID;
            }
            return data;
        }
        return null;
    }
}   

/**
 * Show Logo Function
 * @param {string} bridge - The type of connection (e.g., "Bridge" or "Server").
 * @param {number} port - The port number for the connection.
 * @description This function displays the application logo along with the connection type and port number in the console.
 * 
 */
function logoShow(bridge, port) {
    console.clear();
    conLog("================================================================     ", "mag", false);
    conLog("   _   _ _____    _    _   _____ _   _  ____ ___  ____  _____        ", "mag", false);
    conLog("  | | | | ____|  / \\  | | |_   _| | | |/ ___/ _ \\|  _ \\| ____|    ", "mag", false);
    conLog("  | |_| |  _|   / _ \\ | |   | | | |_| | |  | | | | |_) |  _|        ", "mag", false);
    conLog("  |  _  | |___ / ___ \\| |___| | |  _  | |__| |_| |  _ <| |___       ", "mag", false);
    conLog("  |_| |_|_____/_/   \\_\\_____|_| |_| |_|\\____\\___/|_| \\_\\_____| ", "mag", false);
    conLog("                                                                     ", "mag", false);
    conLog("  by bulp.io					                                     ", "mag", false);
    conLog("                                                                     ", "mag", false);
    conLog("  Bridge or Server: " + bridge                                        , "mag", false);
    conLog("  Port: " + port                                                      , "mag", false);
    conLog("================================================================     ", "mag", false);
}

/**
 * Generates a random hash string.
 * @param {number} length - The length of the hash string to generate.
 * @returns {string} - The generated hash string.
 * @description This function creates a random alphanumeric string of the specified length, which can be used for unique identifiers or tokens.
 */
function randomHash(length = 16) {
    const characters    = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result          = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * Creates a hash from a string using the specified algorithm and length.
 * @param {string} input - The input string to hash.
 * @param {string} algo - The hashing algorithm to use (default: "sha256").
 * @param {number} length - The length of the hash to return (default: 64).
 * @returns {string} The generated hash string.
 * @description This function uses the Node.js crypto module to create a hash from the input string using the specified algorithm and returns a substring of the specified length. If the length is not specified, the full hash is returned.
 */
function createHashFromString(input, algo = "sha256", length = 64) {
    const hash = crypto.createHash(algo).update(input).digest("hex");
    return length ? hash.slice(0, length) : hash;
}

module.exports = { conLog, Translations, logoShow, pause, randomHash, createHashFromString };
