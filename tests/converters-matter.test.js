const { ConverterStandard } = require("../bridge-matter/converters/ConverterStandard");
const { ConverterExampleColorLamp } = require("../bridge-matter/converters/ConverterExampleColorLamp");
const { Converters } = require("../bridge-matter/converters");

test("converter manager returns the standard Matter converter", () => {
  const converters = new Converters();

  expect(converters.find(ConverterStandard.productName)).toBeInstanceOf(ConverterStandard);
  expect(converters.find("unknown product")).toBeUndefined();
});

test("converter manager detects the example lamp by its Matter clusters", () => {
  const converters = new Converters();
  const node = {
    endpoints: [{
      behaviors: {
        forCluster: clusterId => [6, 8, 768].includes(clusterId) ? {} : undefined,
        elementsOf: () => ({
          attributes: new Set(["currentHue", "currentSaturation", "colorTemperatureMireds"]),
          commands: new Set(["moveToHue", "moveToSaturation"])
        })
      }
    }]
  };

  expect(converters.findForNode(node)).toBeInstanceOf(ConverterExampleColorLamp);
  expect(converters.findForNode({ endpoints: [] })).toBeInstanceOf(ConverterStandard);
});

describe("Matter ConverterStandard", () => {
  const converter = new ConverterStandard();

  test("converts Matter temperature values from centidegrees", () => {
    expect(converter.getAttribute(1026, "measuredValue", 2345)).toEqual({
      property: "temperature",
      value: 23.45,
      valueAsNumeric: 23.45,
      valueType: "number",
      endpointId: 1
    });
  });

  test("converts humidity and pressure values to standard units", () => {
    expect(converter.getAttribute(1029, "measuredValue", 4567).value).toBe(45.67);
    expect(converter.getAttribute(1027, "measuredValue", 1003).value).toBe(100.3);
  });

  test("converts occupancy, power, and battery attributes", () => {
    expect(converter.getAttribute(1030, "occupancy", 1).value).toBe("occupied");
    expect(converter.getAttribute(6, "onOff", false).value).toBe("off");
    expect(converter.getAttribute(47, "batPercentRemaining", 150).value).toBe(75);
  });

  test("ignores unsupported Matter attributes", () => {
    expect(converter.getAttribute(1026, "unknownAttribute", 5)).toBeUndefined();
  });

  test("keeps attribute values distinct across Matter endpoints", () => {
    expect(converter.getAttribute(1026, "measuredValue", 2345, 2).property).toBe("temperature_endpoint_2");
    expect(converter.propertiesForEndpoints([1, 2]).temperature_endpoint_2.name).toBe("temperature_endpoint_2");
  });
});

describe("Matter example color lamp converter", () => {
  const converter = new ConverterExampleColorLamp();

  test("converts brightness, hue, saturation, and color temperature", () => {
    expect(converter.getAttribute(8, "currentLevel", 127).value).toBe(50);
    expect(converter.getAttribute(768, "currentHue", 127).value).toBe(180);
    expect(converter.getAttribute(768, "currentSaturation", 127).value).toBe(50);
    expect(converter.getAttribute(768, "colorTemperatureMireds", 250).value).toBe(4000);
  });

  test("declares brightness and color controls as readable and writable", () => {
    expect(converter.properties.brightness).toMatchObject({ read: true, write: true });
    expect(converter.properties.hue).toMatchObject({ read: true, write: true });
    expect(converter.properties.saturation).toMatchObject({ read: true, write: true });
    expect(converter.properties.colorTemperature).toMatchObject({ read: true });
  });

  test("rejects brightness values outside the supported range", () => {
    expect(() => converter.getWriteCommand("brightness", 101)).toThrow("between 0 and 100");
  });
});