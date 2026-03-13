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