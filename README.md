# Healthcore by bulp.io

![GitHub License](https://img.shields.io/github/license/janrakete/healthcore-bulp.io?labelColor=%23311b92&color=%23ff5722) ![GitHub last commit](https://img.shields.io/github/last-commit/janrakete/healthcore-bulp.io?labelColor=%23311b92&color=%23ff5722) ![GitHub commit activity](https://img.shields.io/github/commit-activity/t/janrakete/healthcore-bulp.io?labelColor=%23311b92&color=%23ff5722) ![GitHub top language](https://img.shields.io/github/languages/top/janrakete/healthcore-bulp.io?labelColor=%23311b92&color=%23ff5722)

Hi.

Welcome to Healthcore❗️

But wait: **what the hell is Healthcore**❓

Healthcore is an **open software and hardware architecture for healthcare devices**. With Healthcore, devices from any manufacturer can communicate with each other and any interface through a variety of protocols and APIs. In this way, Healthcore centrally captures a person's **condition in many different ways**, reacts automatically to changes in their environment, and optionally informs caregivers, nurses or family members. 

Healthcore **standardizes** the data from various devices, processes scenarios, and triggers actions. A simple API allows interfaces such as apps to visualize the device data.

Healthcore can **run on any hardware** — a Raspberry Pi, a PC, or any other device with a Linux system or Windows. The choice is yours.

Just imagine something like Home Assistant or OpenHAB, but specialized for healthcare. **That’s exactly what this is**.

> [!TIP]
> Healthcore can also be used to manage **smart home devices** such as motion detectors or window sensors. After all, that’s the only way to get the full picture.

Healthcore is used by [bulp.io](https://www.bulp.io/), which produces some really cool healthcare hardware around the Healthcore.

So let’s democratize and de-monopolize the healthcare sector. Make healthcare devices and infrastructure affordable for everyone!

🤘HEALTHCORE!!!🤘

## 👉 Read more about ...

- 🚀 [Quick start](#-quick-start)
- 🏗️ [Architecture](#%EF%B8%8F-architecture)
- 📁 [Folder structure](#-folder-structure)
- 🔧 [Installation (hardware)](#-installation-hardware)
- 💻 [Installation (software)](#-installation-software)
- 🔐 [Security](#-security)
- 🔌 [API communication](#-api-communication)
- 📈 [Healthcheck](#-healthcheck)
- 🧩 [Own converters](#-own-converters)
- 💓 [External data via APIs](#-external-data-via-apis)
- 🤖 [Using an LLM for reports](#-using-an-llm-for-reports)
- 🔎 [Testing](#-testing)

## 🚀 Quick start

This quick start walks you through a realistic first setup with:
- a ZigBee router (coordinator USB stick)
- a ZigBee motion sensor
- one-week data collection
- one generated weekly report

### 1. Prepare hardware
You need:
- Host: Raspberry Pi / Linux PC / Windows PC
- ZigBee router (coordinator), e.g. ConBee II or Sonoff Zigbee 3.0 USB dongle
- ZigBee motion sensor (any supported model, or your own converter)

Connect the ZigBee router to your host via USB.

### 2. Download repository
```bash
git clone https://github.com/janrakete/healthcore-bulp.io.git
cd healthcore-bulp.io
npm install
```

### 3. Define ZigBee router in `.env.local`
Create `.env.local` in the project root and set at least:
```dotenv
CONF_zigBeeAdapterPort=/dev/ttyUSB0
CONF_zigBeeAdapterName=zstack
```

Typical values:
- Linux: `/dev/ttyUSB0` or `/dev/serial/by-id/...`
- Windows: `COM3`, `COM4`, ...

Adapter type depends on your hardware/chipset (examples: `zstack`, `ezsp`, `deconz`).

### 4. Create converter for your ZigBee motion sensor
1. Use an LLM (for example GitHub Copilot, Claude Code, or Codex) to generate the converter.
2. Prompt example (adapt sensor model and bridge path):
   ```text
   Create a ZigBee converter for the Aqara RTCGQ11LM motion sensor.
   Use the examples in /bridge-zigbee as a guide.
   Extend ConverterStandard, set static productName exactly to the model name,
   and include occupancy, battery, and tamper properties where supported.
   ```
3. Save the generated file in `bridge-zigbee/converters/`, for example `Converter_MyMotionSensor.js`.
4. Verify `static productName` matches the model name reported by ZigBee exactly.
5. Restart the ZigBee bridge. Converters are auto-loaded from `bridge-zigbee/converters/`.

If your sensor is already supported, you can skip this step.

### 5. Download an LLM and configure it
1. Download a GGUF instruct model (filename should contain `Instruct`).
2. Put the model file in `server/libs/ReportingEngine-models/`.
3. Add model name to `.env.local`:
```dotenv
CONF_reportingEngineModel=YourModelName-Instruct.gguf
```

### 6. Start Healthcore services
Run each service in its own terminal:
```bash
node broker/app.js
node server/app.js
node bridge-zigbee/app.js
```

### 7. Add the ZigBee motion sensor via routes
1. Start ZigBee scan:
```bash
curl -X POST http://localhost:9998/devices/zigbee/scan \
   -H "Content-Type: application/json" \
   -d '{"duration":30}'
```
2. Get scan result and copy the discovered sensor UUID:
```bash
curl "http://localhost:9998/devices/zigbee/scan/info?callID=CALL_ID"
```

### 8. Collect data from the sensor for one week
- Keep broker, server, and ZigBee bridge running continuously for 7 days
- Keep the motion sensor paired and powered
- Trigger sensor events naturally (room usage) so occupancy data is written

Optional spot check:
```bash
curl "http://localhost:9998/data/mqtt_devices_values?deviceID=SENSOR_UUID&orderBy=dateTimeAsNumeric,DESC&limit=20"
```

### 9. Generate report for last week
After 7 days, call:
```bash
curl -X POST http://localhost:9998/reports/generate \
   -H "Content-Type: application/json" \
   -d '{
      "startDateTime":"2026-07-15T00:00:00Z",
      "endDateTime":"2026-07-22T00:00:00Z",
      "language":"en"
   }'
```

Then fetch stored reports:
```bash
curl http://localhost:9998/reports
```

## 🏗️ Architecture
Let’s take a look at the **architecture**:
![alt text](architecture.png "Healthcore architecture")

In the middle — that’s the Healthcore. The Healthcore consists of several Node.js servers with different tasks. The Node.js servers communicate with each other via MQTT. The most important thing is that there is a separate bridge for each protocol, which standardizes the incoming and outgoing data of the devices. Healthcore supports the following protocols:
- Bluetooth
- ZigBee
- LoRa P2P
- HTTP
- External APIs (Google Health, Garmin Health, …)
- Thread (planned)

And now the best part: you can **add your own devices to the Healthcore**! Each bridge includes a list of classes for devices. So you can handle the data transformation with simple JavaScript in a class for your device (= very cool). 

On the left, you can see how various interfaces communicate bi-directionally with the Healthcore via a standardized API and visualize the data, for example. Just **bring your own interface**.

## 📁 Folder structure
```plaintext
├── broker/                # MQTT broker
├── server/                # Server
│   ├── routes/            # Routes for communication Interface via SSE ↔ Server ↔ Interface via API 
│   ├── middleware/        # Middleware features 
│   └── libs/              # Additionally libraries
├── bridge-bluetooth/      # Bluetooth ↔ MQTT bridge
│   └── converters/        # Common and own converters
├── bridge-zigbee/         # ZigBee ↔ MQTT bridge
│   └── converters/        # Common and own converters
├── bridge-lora/           # LoRa ↔ MQTT bridge
│   └── converters/        # Common and own converters
├── bridge-http/           # HTTP ↔ MQTT bridge
│   └── converters/        # Common and own converters
├── bridge-integrations/   # External API providers ↔ MQTT bridge (Google Health, Garmin, …)
│   └── converters/        # Provider converters
├── tests/                 # Jest tests, manual tests and example device firmware
├── healthcheck/           # Healthcheck (see below)
```

> [!NOTE]  
> All variables are defined in `.env` in the root directory. They can be overridden using the `.env.local` file.

## 🔧 Installation (hardware)
- **Host platform**  
  - Raspberry Pi 4 or (or better) or any Linux/Windows PC with network access
- **Adapters**  
  - **Bluetooth**: Built-in BLE or USB dongle  
  - **ZigBee**: USB coordinator (e.g. CC2531, ConBee II, Sonoff Zigbee 3.0 USB stick - full list [here](https://www.zigbee2mqtt.io/guide/adapters/))
  - **LoRa**: USB or serial LoRa adapter (e.g. Dragino LA66 LoRaWAN USB Adapter)
- **Connections**  
  - Plug adapters into host; note device paths (e.g. `/dev/ttyUSB0` or `COMx`) and set in `.env.local` (`CONF_loRaAdapter*` and/or `CONF_zigBeeAdapter*`)

## 💻 Installation (software)

**Prerequisites**
- Node.js (v24 or higher) and npm

**Project setup**
1. Clone/download the repository and `cd` into its root.
2. Create `.env.local` to override defaults; fill in:
   - Adapter paths: `CONF_zigBeeAdapterPort`, `CONF_zigBeeAdapterName`, `CONF_loRaAdapterPath`, 
3. Install dependencies:
   ```bash
   npm install
   ```

**Start services** (each in its own terminal or managed via a process manager):
```bash
# MQTT broker
node broker/app.js

# Server
node server/app.js

# Bridges
node "bridge-bluetooth/app.js"
node "bridge-zigbee/app.js"
node "bridge-lora/app.js"
node "bridge-http/app.js"
node "bridge-integrations/app.js"
```

If you want to use it for production (only macOS / Linux), just run
```bash
chmod +x production-start.sh
./production-start.sh # maybe with sudo 
```
or
```bash
chmod +x production-stop.sh
./production-stop.sh
```

production-start.sh uses the process manager, so that a service is restarted if it crashes. The relevant logs can be found in the `logs` folder.

**Installation example** for Raspberry Pi:
```bash
# Update and reboot the system
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y git curl bluetooth bluez
sudo reboot

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Activate Bluetooth
sudo systemctl enable bluetooth
sudo systemctl start bluetooth
sudo rfkill unblock bluetooth

# Clone repository
git clone https://github.com/janrakete/healthcore-bulp.io.git
cd healthcore-bulp.io
npm install

# Find out ZigBee adapter port
ls -l /dev/serial/by-id # change this in .env.local, i.e. CONF_zigBeeAdapterPort=/dev/ttyUSB0

# Start Healthcore and put it to autostart
chmod +x production-start.sh
./production-start.sh
```

## 🔐 Security
> [!WARNING]  
> By default, Healthcore is initially unsecured to facilitate configuration and development.

If `CONF_apiKey`, `CONF_corsURL`, `CONF_brokerUsername`/`CONF_brokerPassword` and/or `CONF_tlsPath` remain empty in the `.env.local` file, security measures are inactive; however, they can be enabled as follows:

1. **CORS**: Cross-Origin Resource Sharing (CORS) is a mechanism that enables Healthcore to specify which origins (domain, scheme, or port) are authorized to access the API. To define these permitted origins, the respective values must be entered as a comma-separated list under `CONF_corsURL` in the `.env.local` file. Please ensure that URLs do not include a trailing slash (/), as this is generally not required and may lead to configuration errors.

2. **API**: To implement API key authentication, the key must be defined in the `.env.local` file under `CONF_apiKey`. Subsequent requests to the API must include the `x-api-key` header containing the specified key.

3. **TLS (HTTPS)**: To further secure API communication, a certificate can be used. This can be created using https://github.com/FiloSottile/mkcert. The created files must be named `cert.pem` and `key.pem`. Please keep these files **outside** the repository, so there is no chance to commit them accidentally. You can change the path in `.env.local` via `CONF_tlsPath`. Default is same level as the repository. If a certificate is set, then automatically MQTTS instead of MQTT is used. So you have to change `CONF_brokerAddress` to `mqtts://localhost:9999` in `.env.local`.

4. **MQTT**: To use an authentification for MQTT, set `CONF_brokerUsername` and `CONF_brokerPassword` in `.env.local`.

## 🔌 API communication
Healthcore provides a comprehensive API that allows you to control all data and devices in a standardized way. Here is a complete example of connecting to a ZigBee device.

You can explore all APIs using Swagger:
```bash
http://localhost:9998/api-docs/
```
(9998 is the standard server port and localhost the standard base URL, configured in `.env` - overwrite it in `.env.local` if you want)

**Example for using ZigBee device:**
```js
// Base URL
const API = "http://localhost:9998";

// 1) Start scan (pairing mode)
const scanResponse = await fetch(API + "/devices/zigbee/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ duration: 30 })
});
const scanData  = await scanResponse.json();
const callID    = scanData.data.callID;

// 2) Read discovered devices (wait a few seconds after starting scan)
const infoResponse  = await fetch(API + "/devices/zigbee/scan/info?callID=" + callID);
const infoData      = await infoResponse.json();
const foundDevice   = infoData.data.devices[0]; // getting first device

// 3) Get current values
const valuesResponse    = await fetch(API + "/devices/zigbee/" + foundDevice.uuid + "/values");
const valuesData        = await valuesResponse.json();
console.log(valuesData);

// 4) Set value(s) (only works for writable properties)
await fetch(API + "/devices/zigbee/" + foundDevice.uuid + "/values", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        values: {
            state: "on"
        }
    })
});
```

If a value write does not change anything, check the converter of your device in `bridge-zigbee/converters/` and verify that the property is writable.

If you need to find the IP address of the server on the local network: The Healthcore server uses a Bonjour service to make itself known on the network. The default identifier is “healthcore”, but it can be customized in the `.env` file with `CONF_serverIDBonjour`.

## 📈 Healthcheck
Healthcore has an integrated dashboard (= Healthcheck) to view the status of the system and to display several data from the APIs.

How to start Healthcheck:
```bash
node healthcheck/app.js
```

Then open a browser und type:  
```bash
http://localhost:9990
```
9990 is the standard port Healthcheck and localhost the standard base URL, configured in `.env` - overwrite it in `.env.local` if you want. If you also want to call the Healthcheck from another client in the same network, please use the IP that is displayed in the console after start. 

## 🧩 Own converters
The **own converters** subsystem lets you transform raw device data (e.g., binary BLE characteristic values) into structured JSON properties that your interface (i.e. your app) can use. Each bridge (Bluetooth, ZigBee, LoRa, HTTP) has its own `converters/` folder with individual converter classes extending a shared `ConverterStandard` base. 

> [!IMPORTANT]  
> As an open-source project, Healthcore thrives on having **as many converters as possible**. So please add your converters via a pull request or as an issue. Use GitHub Copilot, Claude Code or Codex with the following **prompt to create converters** for well-known smart home components: _“Create a ZigBee converter for the SONOFF S60ZBTPF. Use the examples in /bridge-zigbee as a guide.”_ 

Below is a detailed Bluetooth device example:

1. **Create** a new JS file in the bridge’s `converters/` folder (e.g. `Converter_MyConverter.js`).
2. **Extend** `ConverterStandard`:

   In `Converter_MyConverter.js`, import the base and declare your class:  

   ```js
   const { ConverterStandard } = require("./ConverterStandard.js");

   class Converter_MyConverter extends ConverterStandard {
      static productName = "bulp-AZ-123"; // Must match the product name that is reported by the device.

      constructor() {
         // Initializes base converter internals and standard property catalog.
         super();

         // Metadata used when the device is created in Healthcore.
         this.powerType     = "MAINS";
         this.vendorName    = "bulp.io";

         // Custom BLE characteristics (UUIDs)
         this.properties["19b10000e8f2537e4f6cd104768a1217"] = { // BLE characteristic UUID used as key
            name: "rotarySwitch", // property name exposed by the API
            reportingInclude: false, // do not include this field in reporting output
            reportingRole: "actuator", // reporting role metadata used by Healthcore
            notify: true, // subscribe to notifications when value changes
            read: true, // allow reading this value from the device
            write: false, // no writing to this characteristic
            anyValue: 0, // fallback/example value type for validation
            valueType: "Numeric" // value kind shown to the app layer
         };

         this.properties["19b10000e8f2537e4f6cd104768a1218"] = {
            name: "speaker",
            reportingInclude: false,
            reportingRole: "actuator",
            notify: false,
            read: true,
            write: true,
            anyValue: ["on", "off"],
            valueType: "Options"
         };

         // Optional: include standard BLE properties from ConverterStandard
         this.properties["2a19"] = {
            standard: true,
            read: true
         };

         // Replaces { standard: true } placeholders with full standard metadata.
         this.resolveStandardProperties();
      }

      // Convert raw BLE values to Healthcore value objects.
      get(property, value) {
         if (property.read === false) {
            return undefined;
         }

         // Use shared conversion logic for standard UUIDs.
         if (property.standard === true) {
            return this.getStandard(property, value);
         }

         // Handle device-specific UUIDs.
         switch (property.name) {
            case "rotarySwitch":
               const buf = Buffer.from(value);
               return { "value": buf[0], "valueAsNumeric": buf[0] };
            case "speaker":
               return value[0] === 1
                  ? { "value": "on", "valueAsNumeric": 1 }
                  : { "value": "off", "valueAsNumeric": 0 };
            default:
               return undefined;
         }
      }

      // Convert app values to raw bytes before writing to the BLE device.
      set(property, value) {
         if (property.write === false) {
            return undefined;
         }

         switch (property.name) {
            case "speaker":
               // Only allow values listed in property.anyValue.
               if (property.anyValue.includes(value)) {
                  return Buffer.from([value === "on" ? 1 : 0]);
               }
               return undefined;
            default:
               return undefined;
         }
      }
   }

   module.exports = { Converter_MyConverter };
    ```
3. **Auto-load**: `Converters.js` dynamically requires all files in `converters/` (excluding `ConverterStandard.js`), detects the static `productName`, and registers your class.

## 💓 External data via APIs

The Healthcore can receive data directly from devices, but it can also retrieve and store data through APIs provided by services such as Google Health or Garmin.

These integrations are implemented through `bridge-integrations`. Each data provider must have its own implementation in the `converters` subfolder. A "Google Health" integration already exists and will be used as the example below.

### 1. Create a Google Cloud project

1. Sign in to Google Cloud Console with your Google account
2. Create a new project
3. Enable the "Health API" for the project
4. Configure the OAuth consent screen and customize the branding
5. Create an OAuth2 client of type "Desktop Application"
6. Download and save the generated client credentials file
7. Under "Audience", add test users (only these users can authorize access)
8. Under "Data Access", grant the following scopes:
	* `googlehealth.activity_and_fitness.readonly`
	* `googlehealth.health_metrics_and_measurements.readonly`
	* `googlehealth.nutrition.readonly`
	* `googlehealth.sleep.readonly`
	* `googlehealth.irn.readonly`
	* `googlehealth.ecg.readonly`

### 2. Obtain OAuth tokens

Open the following URL in your browser (but replace **{{CLIENT_ID}}** with client ID from the saved file first):
```text
https://accounts.google.com/o/oauth2/v2/auth?client_id={{CLIENT_ID FROM FILE}}&redirect_uri=http://localhost&response_type=code&access_type=offline&scope=https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly https://www.googleapis.com/auth/googlehealth.nutrition.readonly https://www.googleapis.com/auth/googlehealth.sleep.readonly https://www.googleapis.com/auth/googlehealth.irn.readonly https://www.googleapis.com/auth/googlehealth.ecg.readonly
```

Sign in with one of the configured test users and complete the consent flow.

After approval, copy the value of the `code` parameter from the final URL displayed in your browser.

### 3. Exchange the code for tokens

Send a **POST request** to (replace the **{{}}** with the known values):
```text
https://oauth2.googleapis.com/token?code={{CODE FROM ABOVE}}&client_id={{CLIENT_ID FROM FILE}}&client_secret={{CLIENT_SECRET FROM FILE}}&redirect_uri=http://localhost&grant_type=authorization_code
```

### 4. Store the tokens

The response contains:

* `access_token`
* `expires_in`
* `refresh_token`

Insert these values into the `integrations_accounts` table together with an arbitrary "Account ID".

### 5. Create the device

Add a new device through the API.

The device's "Device ID" must match the "Account ID" stored in the `integrations_accounts` table.

### Wait, one more step:  encrypting tokens!

To encrypt the tokens stored in the database:

1. Define a secret key in `.env.local` using the variable `CONF_credentialEngineSecret`

2. Encrypt the tokens using **AES-256-GCM** and the configured secret key.

3. Replace the plain-text values in the `integrations_accounts` table with the encrypted versions.

## 🤖 Using an LLM for reports
To generate reports for each person and the rooms they live in using a local LLM, download a free GGUF model (for example from https://huggingface.co/mradermacher/models?search=instruct). Make sure the filename contains **`Instruct`**, as these models are optimized for instruction-following tasks.

Copy the downloaded model into the `/libs/ReportingEngine-models` directory.

Then update the `.env.local` file and set the `CONF_reportingEngineModel` variable to the name of the downloaded model file.

You can now generate and access reports through the following API endpoints:
* `/reports/generate`
* `/reports`

## 🔎 Testing
You can test Healthcore in two different ways: automated tests and manual tests.

### Automated tests
The automated tests live in the `tests/` folder and are powered by [Jest](https://jestjs.io/). They cover converters for all bridges, data CRUD operations, device management, scenario logic, SQL validation, and authentication. Everything runs against an **in-memory SQLite database**, so no real hardware or running services are needed.

To run all automated tests:
```bash
npm test
```

That's it. If something breaks, you'll know immediately.

### Manual tests
Some things simply can't be automated — real Bluetooth adapters, physical ZigBee devices, push notifications on actual phones, network resilience, and end-to-end flows through the entire system. That's where the manual test plan comes in.

The full manual test plan is documented in [`tests/MANUAL.md`](tests/MANUAL.md).

The rule is simple: **first run `npm test`** to make sure all automated tests pass, **then** work through the manual tests when you have the hardware connected.