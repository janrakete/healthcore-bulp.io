const { ConverterStandard } = require("../bridge-matter/converters/ConverterStandard");
const { ConverterBulpColorLamp } = require("../bridge-matter/converters/ConverterBulpColorLamp");
const { Converters } = require("../bridge-matter/converters");

test("converter manager returns the standard Matter converter", () => {
  const converters = new Converters();

  expect(converters.find(ConverterStandard.productName)).toBeInstanceOf(ConverterStandard);
  expect(converters.find("unknown product")).toBeUndefined();
});

test("converter manager detects the Bulp lamp by its Matter clusters", () => {
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

  expect(converters.findForNode(node)).toBeInstanceOf(ConverterBulpColorLamp);
  expect(converters.findForNode({ endpoints: [] })).toBeInstanceOf(ConverterStandard);
});

describe("Matter ConverterStandard", () => {
  const converter = new ConverterStandard();

  test("derives the readable attributes from its properties", () => {
    expect(converter.readableAttributes()).toEqual(expect.arrayContaining([
      [6, ["onOff"]],
      [47, ["batPercentRemaining"]],
      [1026, ["measuredValue"]],
      [1027, ["measuredValue"]],
      [1029, ["measuredValue"]],
      [1030, ["occupancy"]]
    ]));
    expect(converter.readableAttributes()).toHaveLength(6);
  });

  test("includes the attributes added by a specific converter and skips unreadable or unknown ones", () => {
    const lamp = new ConverterBulpColorLamp();
    expect(lamp.readableAttributes()).toEqual(expect.arrayContaining([
      [8, ["currentLevel"]],
      [768, ["currentHue", "currentSaturation", "colorTemperatureMireds"]]
    ]));

    const custom = new ConverterStandard();
    custom.properties["onOff"]["onOff"].read = false;
    custom.properties["unknownCluster"] = { someAttribute: { name: "some", read: true } };
    const clusterIds = custom.readableAttributes().map(([clusterId]) => clusterId);
    expect(clusterIds).not.toContain(6);
    expect(clusterIds).toHaveLength(5);
  });

  test("converts Matter temperature values from centidegrees", () => {
    const property = converter.getPropertyByAttribute(1026, "measuredValue");
    expect(converter.get(property, 2345)).toEqual({
      value: 23.45,
      valueAsNumeric: 23.45,
      valueType: "number",
      endpointId: 1
    });
  });

  test("converts humidity and pressure values to standard units", () => {
    expect(converter.get(converter.getPropertyByAttribute(1029, "measuredValue"), 4567).value).toBe(45.67);
    expect(converter.get(converter.getPropertyByAttribute(1027, "measuredValue"), 1003).value).toBe(100.3);
  });

  test("converts occupancy, power, and battery attributes", () => {
    expect(converter.get(converter.getPropertyByAttribute(1030, "occupancy"), 1).value).toBe("occupied");
    expect(converter.get(converter.getPropertyByAttribute(6, "onOff"), false).value).toBe("off");
    expect(converter.get(converter.getPropertyByAttribute(47, "batPercentRemaining"), 150).value).toBe(75);
  });

  test("ignores unsupported Matter attributes", () => {
    expect(converter.getPropertyByAttribute(1026, "unknownAttribute")).toBeUndefined();
  });

  test("keeps attribute values distinct across Matter endpoints", () => {
    const property = converter.getPropertyByAttribute(1026, "measuredValue");
    expect(converter.get(property, 2345, { endpointId: 2 }).endpointId).toBe(2);
    expect(
      converter.propertiesForEndpoints([1, 2]).temperatureMeasurement.measuredValue_endpoint_2.name
    ).toBe("temperature_endpoint_2");
  });
});

describe("Matter Bulp color lamp converter", () => {
  const converter = new ConverterBulpColorLamp();

  test("converts brightness, hue, saturation, and color temperature", () => {
    expect(converter.get(converter.getPropertyByAttribute(8, "currentLevel"), 127).value).toBe(50);
    expect(converter.get(converter.getPropertyByAttribute(768, "currentHue"), 127).value).toBe(180);
    expect(converter.get(converter.getPropertyByAttribute(768, "currentSaturation"), 127).value).toBe(50);
    expect(converter.get(converter.getPropertyByAttribute(768, "colorTemperatureMireds"), 250).value).toBe(4000);
  });

  test("declares brightness and color controls as readable and writable", () => {
    expect(converter.properties.levelControl.currentLevel).toMatchObject({ read: true, write: true });
    expect(converter.properties.colorControl.currentHue).toMatchObject({ read: true, write: true });
    expect(converter.properties.colorControl.currentSaturation).toMatchObject({ read: true, write: true });
    expect(converter.properties.colorControl.colorTemperatureMireds).toMatchObject({ read: true, write: false });
  });

  test("rejects brightness values outside the supported range", () => {
    expect(() => converter.set(converter.getPropertyByName("brightness"), 101)).toThrow("between 0 and 100");
  });

  test.each([
    ["brightness", 50, 8, "currentLevel", 127],
    ["hue", 180, 768, "currentHue", 127],
    ["saturation", 50, 768, "currentSaturation", 127]
  ])("uses matching Matter read and write scales for %s", (property, value, clusterId, attributeName, rawValue) => {
    const metadata = converter.getPropertyByName(property);
    const command = converter.set(metadata, value);
    expect(command.attributeValue).toBe(rawValue);
    expect(
      converter.get(converter.getPropertyByAttribute(clusterId, attributeName), command.attributeValue).value
    ).toBe(value);
  });
});