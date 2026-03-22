/**
 * Unit Tests: Bluetooth Converters
 * =================================
 * Tests for BLE ConverterStandard
 */

const { ConverterStandard } = require("../bridge - bluetooth/converters/ConverterStandard");

// =====================================================================
// ConverterStandard (BLE base)
// =====================================================================
describe("BLE ConverterStandard", () => {
  let converter;

  beforeEach(() => {
    converter = new ConverterStandard();
  });

  test("should have standard BLE properties defined", () => {
    expect(converter.properties["2a00"]).toBeDefined(); // deviceName
    expect(converter.properties["2a19"]).toBeDefined(); // batteryLevel
    expect(converter.properties["2a37"]).toBeDefined(); // heartRateMeasurement
    expect(converter.properties["2a6e"]).toBeDefined(); // temperature
    expect(converter.properties["2a6f"]).toBeDefined(); // humidity
  });

  test("getPropertyByUUID should return property for valid UUID", () => {
    const prop = converter.getPropertyByUUID("2a00");
    expect(prop).toBeDefined();
    expect(prop.name).toBe("deviceName");
  });

  test("getPropertyByUUID should return undefined for unknown UUID", () => {
    expect(converter.getPropertyByUUID("ffff")).toBeUndefined();
  });

  test("getPropertyByName should return property for valid name", () => {
    const prop = converter.getPropertyByName("battery");
    expect(prop).toBeDefined();
    expect(prop.standard).toBe(true);
    expect(prop.dataFormat).toBe("UInt8");
  });

  test("getPropertyByName should return undefined for unknown name", () => {
    expect(converter.getPropertyByName("nonexistent")).toBeUndefined();
  });

  // getStandard data format tests
  describe("getStandard", () => {
    test("should convert String format", () => {
      const prop = converter.properties["2a00"]; // deviceName
      const result = converter.getStandard(prop, Buffer.from("TestDevice"));
      expect(result.value).toBe("TestDevice");
      expect(result.valueAsNumeric).toBeUndefined();
    });

    test("should convert UInt8 format", () => {
      const prop = converter.properties["2a19"]; // batteryLevel
      const buf = Buffer.from([75]);
      const result = converter.getStandard(prop, buf);
      expect(result.value).toBe(75);
      expect(result.valueAsNumeric).toBe(75);
    });

    test("should convert UInt16 format (little-endian)", () => {
      const prop = converter.properties["2a6f"]; // humidity
      const buf = Buffer.alloc(2);
      buf.writeUInt16LE(5000, 0);
      const result = converter.getStandard(prop, buf);
      expect(result.value).toBe(5000);
      expect(result.valueAsNumeric).toBe(5000);
    });

    test("should convert UInt32 format (little-endian)", () => {
      const prop = converter.properties["2a6d"]; // pressure
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(101325, 0);
      const result = converter.getStandard(prop, buf);
      expect(result.value).toBe(101325);
      expect(result.valueAsNumeric).toBe(101325);
    });

    test("should convert SInt8 format (negative)", () => {
      const prop = converter.properties["2a7b"]; // dewPoint
      const buf = Buffer.alloc(1);
      buf.writeInt8(-5, 0);
      const result = converter.getStandard(prop, buf);
      expect(result.value).toBe(-5);
      expect(result.valueAsNumeric).toBe(-5);
    });

    test("should convert SInt16 format (negative)", () => {
      const prop = converter.properties["2a6e"]; // temperature
      const buf = Buffer.alloc(2);
      buf.writeInt16LE(-1234, 0);
      const result = converter.getStandard(prop, buf);
      expect(result.value).toBe(-1234);
      expect(result.valueAsNumeric).toBe(-1234);
    });

    test("should convert SInt24 format", () => {
      const prop = converter.properties["2a6c"]; // elevation
      const buf = Buffer.alloc(3);
      buf.writeUIntLE(500, 0, 3);
      const result = converter.getStandard(prop, buf);
      expect(result.value).toBe(500);
      expect(result.valueAsNumeric).toBe(500);
    });

    test("should convert SInt24 format (negative)", () => {
      const prop = converter.properties["2a6c"]; // elevation
      // -100 in 24-bit two's complement = 0xFFFF9C
      const val24 = 0x1000000 - 100;
      const buf = Buffer.alloc(3);
      buf.writeUIntLE(val24, 0, 3);
      const result = converter.getStandard(prop, buf);
      expect(result.value).toBe(-100);
      expect(result.valueAsNumeric).toBe(-100);
    });

    test("should convert Bytes format to hex string", () => {
      const prop = converter.properties["2a23"]; // systemId
      const buf = Buffer.from([0xAB, 0xCD, 0xEF]);
      const result = converter.getStandard(prop, buf);
      expect(result.value).toBe("abcdef");
      expect(result.valueAsNumeric).toBeUndefined();
    });

    test("should return undefined for non-readable property", () => {
      const prop = { ...converter.properties["2a19"], read: false };
      const result = converter.getStandard(prop, Buffer.from([50]));
      expect(result).toBeUndefined();
    });
  });
});