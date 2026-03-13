/**
 * Unit Tests: LoRa Converters
 * ============================
 * Tests for LoRa ConverterStandard
 */

const { ConverterStandard }       = require("../bridge - lora/converters/ConverterStandard");

// =====================================================================
// LoRa ConverterStandard
// =====================================================================
describe("LoRa ConverterStandard", () => {
  let converter;

  beforeEach(() => {
    converter = new ConverterStandard();
  });

  test("should have empty properties by default", () => {
    expect(Object.keys(converter.properties).length).toBe(0);
  });

  test("getPropertyByName should return undefined when no properties", () => {
    expect(converter.getPropertyByName("test")).toBeUndefined();
  });

  test("getPropertyByName should find a property by name", () => {
    converter.properties[0] = { name: "test", read: true };
    const result = converter.getPropertyByName("test");
    expect(result).toBeDefined();
    expect(result.name).toBe("test");
  });
});
