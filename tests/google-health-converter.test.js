jest.mock("https", () => ({ request: jest.fn() }));
jest.mock("../common", () => ({ conLog: jest.fn() }));

const https = require("https");
const { EventEmitter } = require("events");
const { pullChanges } = require("../bridge-integrations/converters/ConverterGoogleHealth");

function mockApiResponses(responseForPath) {
  https.request.mockImplementation((options, callback) => {
    const request = new EventEmitter();
    request.write = jest.fn();
    request.end = jest.fn(() => {
      const response = new EventEmitter();
      const result = responseForPath(options.path);
      response.statusCode = result.statusCode;
      callback(response);
      response.emit("data", JSON.stringify(result.body));
      response.emit("end");
    });
    return request;
  });
}

describe("Google Health converter", () => {
  beforeEach(() => {
    https.request.mockReset();
  });

  test("returns provider failures alongside successful data points", async () => {
    mockApiResponses((path) => {
      if (path.includes("heart-rate")) {
        return {
          statusCode: 200,
          body: {
            dataPoints: [{
              heartRate: { beatsPerMinute: { value: 72 } },
              interval: { startTime: "2026-10-25T10:00:00Z" }
            }]
          }
        };
      }

      return { statusCode: 403, body: { error: "forbidden" } };
    });

    const result = await pullChanges({ accessToken: "token", accountID: "account-1" });

    expect(result.events).toEqual([
      expect.objectContaining({ property: "heartRate", value: 72 })
    ]);
    expect(result.errors).toHaveLength(4);
    expect(result.errors[0]).toContain("HTTP 403");
  });
});