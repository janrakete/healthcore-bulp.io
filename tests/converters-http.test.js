/**
 * Unit Tests: HTTP Converters
 * ============================
 * Tests for HTTP ConverterStandard (with validate)
 */

const { ConverterStandard } = require("../bridge - http/converters/ConverterStandard");

// =====================================================================
// HTTP ConverterStandard
// =====================================================================
describe("HTTP ConverterStandard", () => {
  let converter;

  beforeEach(() => {
    converter = new ConverterStandard();
    converter.properties[0] = { name: "temperature", read: true, anyValue: 0, valueType: "Numeric" };
    converter.properties[1] = { name: "mode", read: true, anyValue: ["auto", "manual"], valueType: "Options" };
    converter.properties[2] = { name: "internal", read: false, anyValue: 0, valueType: "Numeric" };
  });

  test("getPropertyByName should find a property", () => {
    const result = converter.getPropertyByName("temperature");
    expect(result).toBeDefined();
    expect(result.name).toBe("temperature");
  });

  test("getPropertyByName should return undefined for unknown", () => {
    expect(converter.getPropertyByName("nonexistent")).toBeUndefined();
  });

  describe("validate()", () => {
    test("should pass for valid numeric value", () => {
      const result = converter.validate("temperature", 42);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    test("should fail for unknown property", () => {
      const result = converter.validate("unknown_prop", 42);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown property");
    });

    test("should fail for non-readable property", () => {
      const result = converter.validate("internal", 42);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not readable");
    });

    test("should fail for null value", () => {
      const result = converter.validate("temperature", null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must not be empty");
    });

    test("should fail for undefined value", () => {
      const result = converter.validate("temperature", undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must not be empty");
    });

    test("should fail for non-numeric value on Numeric property", () => {
      const result = converter.validate("temperature", "not_a_number");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expects a numeric value");
    });

    test("should fail for NaN on Numeric property", () => {
      const result = converter.validate("temperature", NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expects a numeric value");
    });

    test("should pass for string value on Options property", () => {
      const result = converter.validate("mode", "auto");
      expect(result.valid).toBe(true);
    });

    test("should pass for numeric value on Options property", () => {
      const result = converter.validate("mode", 1);
      expect(result.valid).toBe(true);
    });

    test("should fail for object value on Options property", () => {
      const result = converter.validate("mode", { key: "val" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expects a numeric or string value");
    });
  });
});
