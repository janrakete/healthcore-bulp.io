/**
 * =============================================================================================
 * Standard converter with basic functions for all devices
 * =======================================================
 */

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
     * Get property by its name.
     * @param {string} name - The name of the property to retrieve.
     * @returns {Object|undefined} - The property object if found, otherwise undefined.
     * @description This method iterates through the `properties` object and checks if any property's name matches the provided name. If found, it returns the property object; otherwise, it returns undefined
     */
    getPropertyByPropertyName(name) {
        for (const [clusterName, attributes] of Object.entries(this.properties)) {
            for (let [attributeName, property] of Object.entries(attributes)) {
                if (property.name === name) {
                    property.cluster    = clusterName; // add cluster name to property
                    property.attribute  = attributeName; // add attribute name to property
                    return property;
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
    getConvertedValueForPropertyStandard(property, anyValue) {  
        if (property.read === false) {
            return undefined;
        }   
        else {
            return anyValue;
        }
    }    
}

module.exports = { ConverterStandard };