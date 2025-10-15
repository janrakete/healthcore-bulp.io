/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
 */

const appConfig       = require("../../config");
const common          = require("../../common");

/**
 * ConverterStandard class provides basic functionality for converting properties of Zigbee devices that follow the standard clusters and attributes.
 * It includes methods to retrieve properties by cluster or attribute name, and to convert values for standard properties.   
 * @class ConverterStandard
 * @description This class is designed to handle standard Zigbee properties, such as zclVersion, manufacturerName, and modelId, and provides a framework for extending functionality for specific devices by subclassing. 
 */
class ConverterStandard {
    constructor() { 
        this.properties = {};

        this.properties["genBasic"] = {};
        this.properties["genBasic"]["zclVersion"] = {
            name:        "zclVersion",
            standard:    true,
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "Integer"
        };

        this.properties["genBasic"]["manufacturerName"] = {
            name:        "manufacturerName",
            standard:    true,            
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };
        
        this.properties["genBasic"]["modelId"] = {
            name:        "productName",
            standard:    true,            
            notify:      false,
            read:        true,
            write:       false,
            anyValue:    0,
            valueType:   "String"
        };
    }

    /**
     *  Binding clusters and setting up reporting intervals
     * @param {Object} endpoint - The device endpoint to configure
     * @param {string} cluster - The cluster name to configure reporting for
     * @param {Array} attributes - An array of attribute configuration objects for reporting
     * @param {number} timeout - Optional timeout in milliseconds for the reporting configuration (default is 5000ms)
     * @returns {Promise<void>}
     * @description This method attempts to bind the specified cluster to the coordinator endpoint and configure reporting for the given attributes. It includes error handling to log any issues that occur during the process, including a timeout mechanism to avoid hanging if the device does not respond.
     */
    async safeConfigureReporting(endpoint, cluster, attributes, timeout = appConfig.CONF_zigBeeReportingTimeout) {
        try {
            await Promise.race([
                endpoint.configureReporting(cluster, attributes),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout configuring " + cluster)), timeout)
                )
            ]);
            common.conLog("Reporting for " + cluster + " configured.", "gre");
        } catch (error) {
            common.conLog("Reporting setup for " + cluster + " failed: " + error.message, "red");
        }
    }

    /**
     * Get property by its name.
     * @param {string} name - The name of the property to retrieve.
     * @returns {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns the property object; otherwise, it returns undefined
     */
    getPropertyByPropertyName(name) {
        for (const [clusterName, attributes] of Object.entries(this.properties)) {
            for (const [attributeName, property] of Object.entries(attributes)) {
                if (property.name === name) {
                    // Return a new object with cluster and attribute added, without mutating the original
                    return { ...property, cluster: clusterName, attribute: attributeName };
                }
            }
        }
        return undefined;
    }
   
    /**
     * Get property by cluster name.
     * @param {string} cluster - The name of the cluster to retrieve properties from.
     * @returns {Object|undefined} - The properties object for the cluster if found, otherwise undefined.
     * @description This method checks if the properties for the specified cluster exist in the `properties` object. If they do, it returns the properties; otherwise, it returns undefined.
     */
    getPropertyByClusterName(cluster) {   
        if (this.properties[cluster] === undefined) {
            return undefined;
        }   
        else {
            return this.properties[cluster];
        }
    }

    /**
     * Get property by attribute name.
     * @param {string} name - The name of the attribute to retrieve.
     * @returns {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any attribute's name matches the provided name. If found, it returns the property object; otherwise, it returns undefined.
     */
    getPropertyByAttributeName(name) {
        for (const [clusterName, attributes] of Object.entries(this.properties)) {
            for (const [attributeName, property] of Object.entries(attributes)) {
                if (attributeName === name) {
                    return property;
                }
            }
        }
        return undefined;
    }

    /**
     * Get cluster by property name.
     * @param {string} name - The name of the property to search for.
     * @returns {string|undefined} - The name of the cluster if the property is found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns the cluster name; otherwise, it returns undefined.
     */
    getClusterByPropertyName(name) {
        for (const [cluster, properties] of Object.entries(this.properties)) {
            for (const property of Object.values(properties)) {
                if (property.name === name) {
                    return cluster;
                }
            }
        }
        return undefined;
    }

    /**
     * Get cluster and attribute by property name.
     * @param {string} name - The name of the property to search for.
     * @returns {Object|undefined} - An object containing the cluster and attribute names if the property is found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns an object with the cluster and attribute names; otherwise, it returns undefined.
     */
    getClusterAndAttributeByPropertyName(name) {
        for (const [clusterName, properties] of Object.entries(this.properties)) {
            for (const [attribute, property] of Object.entries(properties)) {
                if (property.name === name) {
                    return { cluster: clusterName, attribute: attribute };
                }
            }
        }
        return undefined;
    }

    /**
     * Converts a value for a standard property.
     * @param {Object} property - The property object containing metadata about the property.
     * @param {any} anyValue - The value to convert.
     * @returns {any|undefined} - The converted value if the property is readable, otherwise undefined.
     * @description This method checks if the property is readable. If it is, it converts the value based on the property's name. For the "device_name" property, it converts the value from a Buffer to a string. If the property is not readable or does not match any known properties, it returns undefined.
     */
    getStandard(property, anyValue) {  
        if (property.read === false) {
            return undefined;
        }   
        else {
            if (property.valueType === "String") {
                return { "value": anyValue, "valueAsNumeric": undefined };
            }
            else {
                return { "value": anyValue, "valueAsNumeric": anyValue };
            }
        }
    }    
}

module.exports = { ConverterStandard };