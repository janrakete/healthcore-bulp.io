# healthcore.dev by bulp.io

▷ **Current status:** 0% ████████████████████████████▒▒ 100% (= first running version)

Hi.

Welcome to healthcore.dev❗️

But wait: **what the hell is healthcore.dev**❓

healthcore.dev (or simply Healthcore) is part of the **open software and hardware architecture of [bulp.io](https://www.bulp.io)**. With bulp, healthcare devices from any manufacturer can communicate with each other and any interface through a variety of protocols and APIs. In this way, bulp centrally captures a person's **condition in many different ways**, reacts automatically to changes in their environment, and optionally informs caregivers, nurses or family members. bulp.io follows the **open-core approach**: the software core is open source, while revenue is generated through hardware and services.

The software core is called "Healthcore" (obviously!) and it **standardizes** the data from various devices, processes scenarios, and triggers actions. A simple API allows interfaces such as apps to visualize the device data.

Healthcore can **run on any hardware** — a Raspberry Pi, a PC, or any other device with a Linux system or Windows. The choice is yours.

Just imagine something like Home Assistant or OpenHAB, but specialized for healthcare. **That’s exactly what this is**.

In addition, this repository also contains an app for Android and iOS that demonstrates how Healthcore can communicate with an interface. 

So let’s democratize and de-monopolize the healthcare sector. Make healthcare devices and infrastructure affordable for everyone!

🤘HEALTHCORE!!!🤘

## 👉 Read more about ...

- 🏗️ [Architecture](#%EF%B8%8F-architecture)
- 💻 [Installation (software)](#-installation-software)
- 📁 [Folder structure](#-folder-structure)
- 🔧 [Installation (hardware)](#-installation-hardware)
- 📈 [Healthcheck - a monitor for Healthcore](#-healthcheck---a-monitor-for-healthcore)
- 🧩 [Own converters](#-own-converters)
- 🔌 [API communication](#-api-communication)
- 📱 [App](#-app)


## 🏗️ Architecture
Let’s take a look at the **architecture** of bulp.io:
![alt text](architecture.png "bulp.io architecture")

In the middle — that’s the Healthcore. The Healthcore consists of several Node.js servers with different tasks. The Node.js servers communicate with each other via MQTT. The most important thing is that there is a separate bridge for each protocol, which standardizes the incoming and outgoing data of the devices. The Healthcore supports the following protocols:
- Bluetooth
- ZigBee
- LoRa P2P
- HTTP
- Thread (planned)

And now the best part: you can **add your own devices to the Healthcore**! Each bridge includes a list of classes for devices. So you can handle the data transformation with simple JavaScript in a class for your device (= very cool). 

On the left, you can see how various interfaces communicate bi-directionally with the Healthcore via a standardized API and visualize the data, for example. Just **bring your own interface** (or use the bulp.io app - see below).

## 💻 Installation (software)

**Prerequisites**
- Node.js (v22 or higher) and npm

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
node "bridge - bluetooth/app.js"
node "bridge - zigbee/app.js"
node "bridge - lora/app.js"
node "bridge - http/app.js"
```

If you want to use it for production, just run
```bash
.\production-start.sh
```
production-start.sh uses the process manager, so that a service is restarted if it crashes. The relevant logs can be found in the `logs` folder.

## 📁 Folder structure
```plaintext
├── broker/               # MQTT broker
├── server/               # Server
│   ├── routes/           # Routes for communication Interface via SSE ↔ Server ↔ Interface via API 
│   └── libs/             # Additionally libraries
├── bridge - bluetooth/   # Bluetooth ↔ MQTT bridge
│   └── converters/       # Common and own converters
├── bridge - zigbee/      # ZigBee ↔ MQTT bridge
│   └── converters/       # Common and own converters
├── bridge - lora/        # LoRa ↔ MQTT bridge
│   └── converters/       # Common and own converters
├── bridge - http/        # HTTP ↔ MQTT bridge
│   └── converters/       # Common and own converters
├── tests/                # Example device firmware (for Arduino) and other testing scripts
├── healthcheck/          # Healthcheck (see below)
└── app/                  # App
```

## 🔧 Installation (hardware)
- **Host platform**  
  - Raspberry Pi 4 or (or better) or any Linux/Windows PC with network access
- **Adapters**  
  - **Bluetooth**: Built-in BLE or USB dongle  
  - **ZigBee**: USB coordinator (e.g. CC2531, ConBee II, Sonoff Zigbee 3.0 USB stick)  
  - **LoRa**: USB or serial LoRa adapter (e.g. Dragino LA66 LoRaWAN USB Adapter)
- **Connections**  
  - Plug adapters into host; note device paths (e.g. `/dev/ttyUSB0` or `COMx`) and set in `.env.local`

## 📈 Healthcheck - a monitor for Healthcore
Healthcore has an integrated interface (= healthcheck) to view the status of the individual bridges, brokers and servers and to start and stop them. All outputs are displayed in a console.

How to start healthcheck:
```bash
node healthcheck/app.js
```

Then open a browser und type:  
```bash
http://localhost:9990
```
(9990 is the standard port healthcheck and localhost the standard base URL, configured in `.env`)

## 🧩 Own converters
The **Own converters** subsystem lets you transform raw device data (e.g., binary BLE characteristic values) into structured JSON properties that your interface (i.e. your app) can use. Each bridge (Bluetooth, ZigBee, LoRa, HTTP) has its own `converters/` folder with individual converter classes extending a shared `ConverterStandard` base. Below is a detailed Bluetooth bridge example:

1. **Create** a new JS file in the bridge’s `converters/` folder (e.g. `Converter_MyConverter.js`).
2. **Extend** `ConverterStandard`:

   In `Converter_MyConverter.js`, import the base and declare your class:  

   ```js
    const { ConverterStandard } = require("./ConverterStandard.js");

    class Converter_BulpAZ123 extends ConverterStandard { // always extend "ConverterStandard"
      static productName = "bulp-AZ-123"; // static property to identify the product name this converter is for

      constructor() { 
          super(); // call the parent class constructor

          this.powerType = WIRE; // set the power type for this device ("WIRE" or "BATTERY")

          // Define the properties supported by this device, using their Bluetooth UUIDs as keys. Each property object contains metadata used for conversion and access control.
          this.properties["19b10000e8f2537e4f6cd104768a1217"] = {
              name:        "rotary_switch", // property name (easy to understand)
              notify:      true, // notify healthcore if this value changes
              read:        true, // read access
              write:       false, // write access
              anyValue:    0, // pre-defined value
              standard:    false, // is this a standard value? (https://www.bluetooth.com/wp-content/uploads/Files/Specification/Assigned_Numbers.html)
              valueType:   "Integer" // Integer or String or Options
          };

          this.properties["19b10000e8f2537e4f6cd104768a1218"] = {
              name:        "speaker",
              notify:      false,
              read:        true,
              write:       true,
              anyValue:    ["on", "off"],
              valueType:   "Options"
          };

          // ...
      }

      // GET: Converts a raw value from the device into a higher-level representation, based on the property metadata.
      get(property, value) {
          if (property.read === false) {
            return undefined; // property is not readable, so return undefined
          }   
          else {
              if (property.standard === true) { // if this is a standard property then use common converter
                  return this.getStandard(property, value);
              }
              else { // device-specific conversion logic
                switch (property.name) {
                    case "rotary_switch":
                        const buf = Buffer.from(value);
                        return {"value": buf[0], "valueAsNumeric": buf[0]};
                    case "speaker":
                        return value[0] === 1 ? {"value": "on", "valueAsNumeric": 1} : {"value": "off", "valueAsNumeric": 0};
                    default:
                        return undefined;
                }
              }
          }
      }

      // SET: Converts a higher-level value into a format suitable for writing to the device, based on the property metadata.
      set(property, value) {
          if (property.write === false) {
              return undefined; // if property is not writable, so return undefined
          }
          else {
            switch (property.name) {
                case "speaker":
                    if (property.anyValue.includes(value)) {
                        return Buffer.from([value === "on" ? 1 : 0]);
                    } else {
                        return undefined;
                    }
                case "led":
                    if (property.anyValue.includes(value)) {
                        return Buffer.from([value === "on" ? 1 : 0]);
                    } else {
                        return undefined;
                    }
                default:
                    return undefined;
            }   
          }       
      }
    }

    module.exports = { Converter_BulpAZ123 };
    ```
3. **Auto-load**: `Converters.js` dynamically requires all files in `converters/` (excluding `ConverterStandard.js`), detects the static `productName`, and registers your class.

## 🔌 API communication
Healthcore provides a comprehensive API that allows you to control all data and devices in a standardized way. Here is a complete example of connecting to a ZigBee device.

You can explore all APIs using Swagger:
```bash
http://localhost:9998/api-docs/
```
(9998 is the standard server port and localhost the standard base URL, configured in .env)

**Example for ZigBee:**
```js
Example coming soon.
```

If you need to find the IP address of the server on the local network: The Healthcore server uses a Bonjour service to make itself known on the network. The default identifier is “healthcore”, but it can be customized in the `.env` file with `CONF_serverIDBonjour`.

## 📱 App
Yes, there is also an app in this repository. More specifically, it is the official bulp.io app or rather the source code for it.

It is fully functional and can be used until you have programmed your own interface.

The app is located in the `app/` folder and has its own `package.json`. So you have to install it separately from Healthcore via npm. Here are the steps. By the way: the app is programmed in the Ionic Framework/Capacitor with Vanilla JS. 

Installing and compiling the app:
1. Change to folder `app/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run locally in web browser: 
   ```bash
   npm run dev
   ```
   Open in browser:
   `http://localhost:5173/` (the correct url is shown in the console)
4. Deploy to Android:
   1. To setup the environment for Android, follow the instructions [here](https://capacitorjs.com/docs/getting-started/environment-setup) 
   2. To use Firebase Cloud Messaging (= push notifications), you need to generate and save two files:
      1. `google-services.json` in `app/android/app/` (https://support.google.com/firebase/answer/7015592?hl=en)
      2. `push-firebase-admin.json` in Healthcore root directory ()
   3. Build:
      `npm run build`
   4. Sync:
      `npx cap sync` 
   5. Compile and deploy to device (Android device must be connected - maybe first start Android Studio once and make sure that debug mode on device is activated, then connect device with Android Studio):
      `npx cap run android`
5. Deploy to iOS:
   Coming soon (but it's nearly the same like Android)
6. To see the console output of the app:
   Use Chrome: `chrome://inspect/`
7. Make changes to app config (if you want):
   See `app/public/assets/config.json`

That's it. Basically, it is of course advisable to familiarize yourself with Ionic and Capacitor. Many problems encountered during compilation have already been discussed and, in the best case, solved somewhere in those forums.