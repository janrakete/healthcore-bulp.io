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
 * Show Logo Function
 * @param {string} bridge - The type of connection (e.g., "Bridge" or "Server").
 * @param {number} port - The port number for the connection.
 * @description This function displays the application logo along with the connection type and port number in the console.
 * 
 */
function logoShow(bridge, port) {
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
    return crypto.randomBytes(length).toString("hex").slice(0, length);
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

/**
 * Converts device properties object to an array including subproperties.
 * @param {Array} properties 
 * @returns {Array} A clean array of device properties including subproperties.
 * @description This function takes a device properties object and converts it into a clean array format. It includes both the base properties and any subproperties defined within them.
 */
function devicePropertiesToArray(properties) {
    const result = [];

    const Translations = require("./i18n.json");

    for (const key of Object.keys(properties)) {
        const rootProperty = properties[key];
        let propertiesToProcess = [];

        if (rootProperty.name) { // single property
            propertiesToProcess.push(rootProperty);
        }
        else if (typeof rootProperty === "object" && rootProperty !== null) { // multiple properties
            propertiesToProcess = Object.values(rootProperty);
        }

        for (const property of propertiesToProcess) {
            if (!property || typeof property !== "object") {
                continue;
            }

            const { subproperties, ...base } = property; // extract subproperties and base properties
            
            base.notify         = base.notify || false; // ... ensure notify, read, write are defined
            base.read           = base.read || false;
            base.write          = base.write || false;

            result.push({ ...base });

            if (subproperties && typeof subproperties === "object") { // add subproperties if exist
                for (const subKey of Object.keys(subproperties)) {
                    subproperties[subKey].notify = subproperties[subKey].notify || false;  // ... ensure notify, read, write are defined
                    subproperties[subKey].read   = subproperties[subKey].read || false;
                    subproperties[subKey].write  = subproperties[subKey].write || false;
                    result.push({ ...subproperties[subKey] });
                }
            }
        }
    }

    for (let i = 0; i < result.length; i++) { // loop through result array to add translated names
        const property = result[i];
        if (Translations[property.name]) {
            property.translation = Translations[property.name];
        } else {
            property.translation = null;
        }

        if (property.valueType === "Options" && property.anyValue && Array.isArray(property.anyValue)) {
            let anyValueTranslated = [];
            for (const value of property.anyValue) {
                const translatedValue = {};
                if (Translations[value]) {
                    translatedValue.value = value;
                    translatedValue.translation = Translations[value];
                    anyValueTranslated.push(translatedValue);
                } else {
                    anyValueTranslated.push({ value: value, translation: null });
     
                }
            }
            property.anyValue = anyValueTranslated;
        }
    }

    return result;
}

module.exports = { conLog, logoShow, pause, randomHash, createHashFromString, devicePropertiesToArray };
