/*
    ======================================
    Standard converter with basic functions for all devices
    ======================================
*/
class ConverterStandard {
    constructor() { 
        this.Properties = new Object();
    
        this.Properties["genBasic"] = new Object();
        this.Properties["genBasic"]["zclVersion"] = {
            strName:        "zclVersion",
            blnStandard:    true,
            blnNotify:      false,
            blnRead:        true,
            blnWrite:       false,
            anyValue:       0,
            strValueType:   "Integer"
        };

        this.Properties["genBasic"]["manufacturerName"] = {
            strName:        "manufacturerName",
            blnStandard:    true,            
            blnNotify:      false,
            blnRead:        true,
            blnWrite:       false,
            anyValue:       0,
            strValueType:   "String"
        };
        
        this.Properties["genBasic"]["modelId"] = {
            strName:        "productName",
            blnStandard:    true,            
            blnNotify:      false,
            blnRead:        true,
            blnWrite:       false,
            anyValue:       0,
            strValueType:   "String"
        };
    }

    getPropertyByPropertyName(strName) {
        for (const [strClusterName, Attributes] of Object.entries(this.Properties)) {
            for (let [strAttributeName, Property] of Object.entries(Attributes)) {
                if (Property.strName === strName) {
                    Property.strCluster = strClusterName; // add cluster name to property
                    Property.strAttribute = strAttributeName; // add attribute name to property
                    return Property;
                }
            }
        }
        return undefined;
    }
   
    getPropertyByClusterName(strCluster) {   
        if (this.Properties[strCluster] === undefined) {
            return undefined;
        }   
        else {
            return this.Properties[strCluster];
        }
    }

    getPropertyByAttributeName(strName) {
        for (const [strClusterName, Attributes] of Object.entries(this.Properties)) {
            for (const [strAttributeName, Property] of Object.entries(Attributes)) {
                if (strAttributeName === strName) {
                    return Property;
                }
            }
        }
        return undefined;
    }

    getClusterByPropertyName(strName) {
        for (const [strCluster, Properties] of Object.entries(this.Properties)) {
            for (const Property of Object.values(Properties)) {
                if (Property.strName === strName) {
                    return strCluster;
                }
            }
        }
        return undefined;
    }

    getClusterAndAttributeByPropertyName(strName) {
        for (const [strClusterName, Properties] of Object.entries(this.Properties)) {
            for (const [strAttribute, Property] of Object.entries(Properties)) {
                if (Property.strName === strName) {
                    return { strCluster: strClusterName, strAttribute: strAttribute };
                }
            }
        }
        return undefined;
    }

    getConvertedValueForPropertyStandard(Property, anyValue) {  
        if (Property.blnRead === false) {
            return undefined;
        }   
        else {
            return anyValue;
        }
    }    
}

/*
    Converter for the SONOFF SNZB-01P
*/
class Converter_SONOFFSNZB01P extends ConverterStandard{
    constructor() {
        super();

        this.strPowerType = "battery";

        this.Properties["genOnOff"] = {
            strName:        "button",
            blnStandard:    false,
            blnNotify:      true,
            blnRead:        true,
            blnWrite:       false,
            anyValue:       ["pressed", "not_pressed", "long_pressed", "double_pressed"],
            strValueType:   "Options"
        };
    }

    getConvertedValueForProperty(Property, anyValue, Data) {
        if (Property.blnRead === false) {
            return undefined;
        }   
        else {
            if (Property.blnStandard === true) { // if standard property then use common converter
                return (this.getConvertedValueForPropertyStandard(Property, anyValue));
            }
            else {
                if (Property.strName === "button") {
                    if (anyValue === "commandToggle") {
                        return "pressed";
                    }
                    if (anyValue === "commandOff") {
                        return "long_pressed";
                    }
                    if (anyValue === "commandOn") {
                        return "double_pressed";
                    }
                    else {
                        return "not_pressed";
                    }   
                }
                else {
                    return undefined;
                }
            }
        }
    }
}

/*
    Converter for the IKEA TRADFRI bulb E27 WW 806lm
*/
class Converter_IKEATRADFRIBULBE27WW806LM extends ConverterStandard{
    constructor() {
        super();

        this.strPowerType = "mains";

        this.Properties["genOnOff"] = new Object();
        this.Properties["genOnOff"]["onOff"] = {
            strName:        "state",
            blnStandard:    false,
            blnNotify:      false,
            blnRead:        true,
            blnWrite:       true,
            anyValue:       ["on", "off"],
            strValueType:   "Options"
        };

        this.Properties["genLevelCtrl"] = new Object();
        this.Properties["genLevelCtrl"]["currentLevel"] = {
            strName:        "brightness",
            blnStandard:    false,
            blnNotify:      false,
            blnRead:        true,
            blnWrite:       true,
            anyValue:       0,
            strValueType:   "Integer"
        };
    }

    getConvertedValueForProperty(Property, anyValue) {
        if (Property.blnRead === false) {
            return undefined;
        }   
        else {
            if (Property.blnStandard === true) { // if standard property then use common converter
                return (this.getConvertedValueForPropertyStandard(Property, anyValue));
            }
            else {
                if (Property.strName === "brightness") {
                    return anyValue;
                }
                else if (Property.strName === "state") {
                    if (anyValue === 1) {
                        return "on";
                    }
                    else {
                        return "off";
                    }
                }
                else {
                    return undefined;
                }
            }
        }
    }

    setConvertedValueForProperty(Property, anyValue) {
        if (Property.blnWrite === false) {
            return undefined;
        }
        else {
            let ValueConverted = {};
            if (Property.strName === "brightness") {               
                ValueConverted.strCommand = "moveToLevel";
                ValueConverted.anyValue   = {"level" : anyValue, "transtime" : 0 };
                return ValueConverted;
            }
            else if (Property.strName === "state") {
                ValueConverted.strCommand = anyValue;
                ValueConverted.anyValue   = {};
                return ValueConverted;
            }
            else {
                return undefined;
            } 
        }
    }
}

/*
    Converter for the eWeLink MS01
*/
class Converter_EWELINKMS01 extends ConverterStandard{
    constructor() {
        super();

        this.strPowerType = "battery";

        this.Properties["ssIasZone"] = {
            strName:        "motion",
            blnStandard:    false,
            blnNotify:      true,
            blnRead:        true,
            blnWrite:       false,
            anyValue:       ["yes", "no"],
            strValueType:   "Options"
        };
    }

    getConvertedValueForProperty(Property, anyValue, Data) {
        if (Property.blnRead === false) {
            return undefined;
        }   
        else {
            if (Property.blnStandard === true) { // if standard property then use common converter
                return (this.getConvertedValueForPropertyStandard(Property, anyValue));
            }
            else {
                if (Property.strName === "motion") {
                    if (anyValue === "commandStatusChangeNotification") {
                        if (Data.zonestatus === 1) {
                            return "yes"; 
                        }
                        else {
                            return "no";
                        }
                    }
                    else {
                        return "no";
                    }
                }
                else {
                    return undefined;
                }
            }
        }
    }
}

/* -> add more converters here */ 

/*
  ======================================
  Converters list class
  ======================================
*/
class Converters {
    constructor() {
        this.mapConvertersList = new Map();
        this.mapConvertersList.set("SNZB-01P", Converter_SONOFFSNZB01P);
        this.mapConvertersList.set("TRADFRI bulb E27 WW 806lm", Converter_IKEATRADFRIBULBE27WW806LM);
        this.mapConvertersList.set("MS01", Converter_EWELINKMS01);
        /* -> add more converters here */ 
    } 
    
    find(strProductName) {
        const ConverterClass = this.mapConvertersList.get(strProductName);
        if (!ConverterClass) {
            return undefined;
        } else {
            return new ConverterClass();
        }
    }
}

module.exports = { Converters };
