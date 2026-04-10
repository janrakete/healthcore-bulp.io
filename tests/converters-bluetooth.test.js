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

// =====================================================================
// Converter_BangleJS2BLE
// =====================================================================
const { Converter_BangleJS2BLE } = require("../bridge - bluetooth/converters/Converter_BangleJS2BLE");

describe("Converter_BangleJS2BLE", () => {
  let converter;

  beforeEach(() => {
    converter = new Converter_BangleJS2BLE();
  });

  test("should have Nordic UART TX characteristic defined", () => {
    const prop = converter.getPropertyByUUID("6e400003b5a3f393e0a9e50e24dcca9e");
    expect(prop).toBeDefined();
    expect(prop.valueType).toBe("Subproperties");
    expect(prop.notify).toBe(true);
  });

  describe("getSubproperty - complete message", () => {
    let property;

    beforeEach(() => {
      property = converter.getPropertyByUUID("6e400003b5a3f393e0a9e50e24dcca9e");
    });

    test("should parse heartrate message", () => {
      const result = converter.getSubproperty(property, Buffer.from('{"t":"h","v":72}'));
      expect(result).toBeDefined();
      expect(result.name).toBe("heartrate");
      expect(result.value).toBe(72);
      expect(result.valueAsNumeric).toBe(72);
    });

    test("should parse light-on message", () => {
      const result = converter.getSubproperty(property, Buffer.from('{"t":"l","v":"1"}'));
      expect(result).toBeDefined();
      expect(result.name).toBe("light");
      expect(result.value).toBe("on");
      expect(result.valueAsNumeric).toBe(1);
    });

    test("should parse light-off message", () => {
      const result = converter.getSubproperty(property, Buffer.from('{"t":"l","v":"0"}'));
      expect(result.value).toBe("off");
      expect(result.valueAsNumeric).toBe(0);
    });

    test("should parse alarm-on message", () => {
      const result = converter.getSubproperty(property, Buffer.from('{"t":"a","v":"1"}'));
      expect(result.name).toBe("alarm");
      expect(result.value).toBe("on");
    });

    test("should return undefined for unknown type", () => {
      const result = converter.getSubproperty(property, Buffer.from('{"t":"x","v":"1"}'));
      expect(result).toBeUndefined();
    });

    test("should return undefined for invalid JSON", () => {
      const result = converter.getSubproperty(property, Buffer.from("not-json"));
      expect(result).toBeUndefined();
    });

    // Simulate macOS fragmentation: the JSON arrives split across two BLE notifications.
    // The bridge buffers the fragments and should only process the complete line.
    test("should handle fragmented message via manual buffer simulation", () => {
      let buffer = "";

      // First fragment: the first half of the JSON, no newline yet
      buffer += '{"t":"h","v"';
      let lines = buffer.split("\n");
      buffer = lines.pop(); // no newline yet, nothing to process
      expect(lines.filter(l => l.trim() !== "")).toHaveLength(0);

      // Second fragment: rest of the JSON plus newline (as Bangle.js Bluetooth.println adds)
      buffer += ':98}\n';
      lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete remainder

      const completedLines = lines.filter(l => l.trim() !== "");
      expect(completedLines).toHaveLength(1);

      const result = converter.getSubproperty(property, Buffer.from(completedLines[0].trim()));
      expect(result).toBeDefined();
      expect(result.name).toBe("heartrate");
      expect(result.value).toBe(98);
    });
  });
});