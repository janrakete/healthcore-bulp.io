/**
 * Unit Tests: ZigBee Converters
 * ==============================
 * Tests for ZigBee ConverterStandard
 */

// Mock config and common so that ConverterStandard can be required without .env
jest.mock("../config", () => ({ CONF_zigBeeReportingTimeout: 5000 }), { virtual: true });
jest.mock("../common", () => ({ conLog: jest.fn() }), { virtual: true });

const { ConverterStandard } = require("../bridge - zigbee/converters/ConverterStandard");

// =====================================================================
// ZigBee ConverterStandard
// =====================================================================
describe("ZigBee ConverterStandard", () => {
  let converter;

  beforeEach(() => {
    converter = new ConverterStandard();
  });

  test("should have empty properties by default", () => {
    expect(Object.keys(converter.properties).length).toBe(0);
  });

  describe("getStandard()", () => {
    test("should convert String type", () => {
      const prop = { read: true, valueType: "String" };
      const result = converter.getStandard(prop, "TestValue");
      expect(result.value).toBe("TestValue");
      expect(result.valueAsNumeric).toBeUndefined();
    });

    test("should convert Boolean true", () => {
      const prop = { read: true, valueType: "Boolean" };
      const result = converter.getStandard(prop, 1);
      expect(result.value).toBe(true);
      expect(result.valueAsNumeric).toBe(1);
    });

    test("should convert Boolean false", () => {
      const prop = { read: true, valueType: "Boolean" };
      const result = converter.getStandard(prop, 0);
      expect(result.value).toBe(false);
      expect(result.valueAsNumeric).toBe(0);
    });

    test("should convert Numeric type", () => {
      const prop = { read: true, valueType: "Numeric" };
      const result = converter.getStandard(prop, 42);
      expect(result.value).toBe(42);
      expect(result.valueAsNumeric).toBe(42);
    });

    test("should return undefined for non-readable property", () => {
      const prop = { read: false, valueType: "Numeric" };
      expect(converter.getStandard(prop, 42)).toBeUndefined();
    });
  });

  describe("property lookup methods", () => {
    beforeEach(() => {
      // Simulate a ZigBee converter with nested cluster/attribute structure
      converter.properties["genOnOff"] = {};
      converter.properties["genOnOff"]["onOff"] = {
        name: "state", standard: false, read: true, write: true, anyValue: ["on", "off"], valueType: "Options"
      };
      converter.properties["genLevelCtrl"] = {};
      converter.properties["genLevelCtrl"]["currentLevel"] = {
        name: "brightness", standard: false, read: true, write: true, anyValue: 0, valueType: "Numeric"
      };
    });

    test("getPropertyByPropertyName should find property by name", () => {
      const result = converter.getPropertyByPropertyName("state");
      expect(result).toBeDefined();
      expect(result.name).toBe("state");
      expect(result.cluster).toBe("genOnOff");
      expect(result.attribute).toBe("onOff");
    });

    test("getPropertyByPropertyName should return undefined for unknown", () => {
      expect(converter.getPropertyByPropertyName("nonexistent")).toBeUndefined();
    });

    test("getPropertyByClusterName should return cluster properties", () => {
      const result = converter.getPropertyByClusterName("genOnOff");
      expect(result).toBeDefined();
      expect(result["onOff"]).toBeDefined();
    });

    test("getPropertyByClusterName should return undefined for unknown cluster", () => {
      expect(converter.getPropertyByClusterName("unknown")).toBeUndefined();
    });

    test("getPropertyByAttributeName should find by attribute name", () => {
      const result = converter.getPropertyByAttributeName("currentLevel");
      expect(result).toBeDefined();
      expect(result.name).toBe("brightness");
    });

    test("getPropertyByAttributeName should return undefined for unknown", () => {
      expect(converter.getPropertyByAttributeName("unknown")).toBeUndefined();
    });

    test("getClusterByPropertyName should return cluster name", () => {
      expect(converter.getClusterByPropertyName("state")).toBe("genOnOff");
      expect(converter.getClusterByPropertyName("brightness")).toBe("genLevelCtrl");
    });

    test("getClusterByPropertyName should return undefined for unknown", () => {
      expect(converter.getClusterByPropertyName("nonexistent")).toBeUndefined();
    });

    test("getClusterAndAttributeByPropertyName should return both", () => {
      const result = converter.getClusterAndAttributeByPropertyName("state");
      expect(result.cluster).toBe("genOnOff");
      expect(result.attribute).toBe("onOff");
    });

    test("getClusterAndAttributeByPropertyName should return undefined for unknown", () => {
      expect(converter.getClusterAndAttributeByPropertyName("nonexistent")).toBeUndefined();
    });
  });
});

// =====================================================================
// Converter_BULPIOBULPTOP1
// =====================================================================
const { Converter_BULPIOBULPTOP1 } = require("../bridge - zigbee/converters/Converter_BULPIOBULPTOP1");

describe("Converter_BULPIOBULPTOP1", () => {
  let converter;

  beforeEach(() => {
    converter = new Converter_BULPIOBULPTOP1();
  });

  test("productName matches firmware ZIGBEE_MODEL", () => {
    expect(Converter_BULPIOBULPTOP1.productName).toBe("bulp.top 1");
  });

  test("powerType is MAINS", () => {
    expect(converter.powerType).toBe("MAINS");
  });

  test("all five property clusters are registered", () => {
    expect(converter.properties["msTemperatureMeasurement"]).toBeDefined();
    expect(converter.properties["msRelativeHumidity"]).toBeDefined();
    expect(converter.properties["msOccupancySensing"]).toBeDefined();
    expect(converter.properties["msIlluminanceMeasurement"]).toBeDefined();
    expect(converter.properties["genAnalogInput"]).toBeDefined();
  });

  describe("get() — temperature", () => {
    let prop;
    beforeEach(() => {
      prop = converter.getPropertyByPropertyName("temperature");
    });

    test("converts 2150 (ZigBee units) to 21.5 °C", () => {
      const result = converter.get(prop, "attributeReport", { measuredValue: 2150 });
      expect(result.value).toBe("21.5 °C");
      expect(result.valueAsNumeric).toBeCloseTo(21.5, 2);
    });

    test("converts 0 (ZigBee units) to 0.0 °C", () => {
      const result = converter.get(prop, "attributeReport", { measuredValue: 0 });
      expect(result.value).toBe("0.0 °C");
      expect(result.valueAsNumeric).toBe(0);
    });

    test("converts negative temperature (-500 = -5°C)", () => {
      const result = converter.get(prop, "attributeReport", { measuredValue: -500 });
      expect(result.valueAsNumeric).toBeCloseTo(-5.0, 2);
    });
  });

  describe("get() — humidity", () => {
    let prop;
    beforeEach(() => {
      prop = converter.getPropertyByPropertyName("humidity");
    });

    test("converts 5000 (ZigBee units) to 50.0 %", () => {
      const result = converter.get(prop, "attributeReport", { measuredValue: 5000 });
      expect(result.value).toBe("50.0 %");
      expect(result.valueAsNumeric).toBeCloseTo(50.0, 2);
    });

    test("converts 10000 (ZigBee units) to 100.0 %", () => {
      const result = converter.get(prop, "attributeReport", { measuredValue: 10000 });
      expect(result.valueAsNumeric).toBeCloseTo(100.0, 2);
    });
  });

  describe("get() — presence", () => {
    let prop;
    beforeEach(() => {
      prop = converter.getPropertyByPropertyName("presence");
    });

    test("returns yes when occupancy bitmap bit 0 is set", () => {
      const result = converter.get(prop, "attributeReport", { occupancy: 1 });
      expect(result.value).toBe("yes");
      expect(result.valueAsNumeric).toBe(1);
    });

    test("returns no when occupancy bitmap is 0", () => {
      const result = converter.get(prop, "attributeReport", { occupancy: 0 });
      expect(result.value).toBe("no");
      expect(result.valueAsNumeric).toBe(0);
    });
  });

  describe("get() — illuminance", () => {
    let prop;
    beforeEach(() => {
      prop = converter.getPropertyByPropertyName("illuminance");
    });

    test("converts ZigBee value 1 to 1 lux", () => {
      // ZigBee illuminance 1 = 10000*log10(lux)+1=1 → log10(lux)=0 → lux=1
      const result = converter.get(prop, "attributeReport", { measuredValue: 1 });
      expect(result.valueAsNumeric).toBe(1);
    });

    test("converts ZigBee value 0 to 0 lux (darkness)", () => {
      const result = converter.get(prop, "attributeReport", { measuredValue: 0 });
      expect(result.valueAsNumeric).toBe(0);
      expect(result.value).toBe("0 lux");
    });

    test("converts ZigBee value 30001 (~1000 lux)", () => {
      // 10000 * log10(1000) + 1 = 30001
      const result = converter.get(prop, "attributeReport", { measuredValue: 30001 });
      expect(result.valueAsNumeric).toBeCloseTo(1000, 0);
    });
  });

  describe("get() — fall alarm", () => {
    let prop;
    beforeEach(() => {
      prop = converter.getPropertyByPropertyName("fall");
    });

    test("returns yes when presentValue is 1.0", () => {
      const result = converter.get(prop, "attributeReport", { presentValue: 1.0 });
      expect(result.value).toBe("yes");
      expect(result.valueAsNumeric).toBe(1);
    });

    test("returns no when presentValue is 0.0", () => {
      const result = converter.get(prop, "attributeReport", { presentValue: 0.0 });
      expect(result.value).toBe("no");
      expect(result.valueAsNumeric).toBe(0);
    });
  });

  describe("get() — edge cases", () => {
    test("returns undefined for non-readable property", () => {
      const prop = { name: "temperature", read: false };
      expect(converter.get(prop, "attributeReport", { measuredValue: 2100 })).toBeUndefined();
    });

    test("returns undefined when attribute value is missing from data", () => {
      const prop = converter.getPropertyByPropertyName("temperature");
      expect(converter.get(prop, "attributeReport", {})).toBeUndefined();
    });

    test("returns undefined for unknown property name", () => {
      const prop = { name: "unknown", read: true, standard: false };
      expect(converter.get(prop, "attributeReport", { measuredValue: 0 })).toBeUndefined();
    });
  });
});