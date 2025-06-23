/*
    ======================================
    Standard converter with basic functions for all devices
    ======================================
*/
class ConverterStandard {
    constructor() { 
        this.Properties = new Object();            
    }

    getPropertyByName(strName) {
        for (const Property of Object.values(this.Properties)) {
            if (Property.strName === strName) {
                return Property;
            }
        }
        return undefined;
    }
}

/*
    Converter for the Bulp Web-Robo 321 device
*/
class Converter_bulpWebRobo321 extends ConverterStandard{
    constructor() {
        super();

        this.Properties[0] = {
            strName:        "voltage",
            blnRead:        true,
            anyValue:       0,
            strValueType:   "Integer"
        };

        this.Properties[1] = {
            strName:        "switch",
            blnRead:        true,
            anyValue:       ["tapped", "not_tapped", "long_tapped"],
            strValueType:   "Options"
        };
    }

    getConvertedValueForProperty(strProperty, anyValue) {
        const Property = this.getPropertyByName(strProperty);

        if (Property.blnRead === false) {
            return undefined;
        }   
        else {
            if (Property.strName === "voltage") {
                return (anyValue * 100);
            }
            else if (Property.strName === "switch") {
                if (anyValue === 1) {
                    return "tapped";
                }
                else if (anyValue === 2) {
                    return "long_tapped";
                }
                else {
                    return "not_tapped";
                }   
            } 
            else {
                return undefined;
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
        this.mapConvertersList.set("Bulp Web-Robo 321", Converter_bulpWebRobo321);
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