# Manual Test Plan

These tests require real hardware, running services, or the mobile app and cannot be automated. Run `npm test` first to verify all 168 automated tests pass before proceeding with manual testing.

---

## Hardware & Connectivity

| # | Test | Explanation |
|---|------|-------------|
| 1 | **Bluetooth bridge discovers BLE devices** | Start a scan via `POST /devices/bluetooth/scan` with a real BLE adapter plugged in. Verify that nearby BLE devices appear in the scan results via `GET /devices/bluetooth/scan/info?callID=...`. |
| 2 | **Bluetooth connect/disconnect cycle** | Use `POST /devices/bluetooth/{deviceID}/connect` to pair with a discovered device, then `POST .../disconnect` to unpair. Confirm the device status updates correctly in both the bridge and the server. |
| 3 | **Bluetooth reconnect after power loss** | Connect a BLE device, then physically turn it off or move it out of range. Verify the bridge detects the loss and automatically attempts reconnection (up to `CONF_devicesBluetoothReconnectMaxAttempts` times). |
| 4 | **Bluetooth signal strength updates** | With a connected BLE device, check that `GET /devices/all` shows a `strength` value that changes when you move the device closer or further away. The bridge should periodically publish strength updates via MQTT to `server/devices/strength`. |
| 5 | **Bluetooth battery monitoring & low-battery alert** | Connect a battery-powered BLE device (e.g. BangleJS2) and read its battery level. Verify that when the battery drops below `CONF_devicesBluetoothBatteryThresholdPercent`, an alert is triggered with a cooldown of `CONF_devicesBluetoothBatteryAlertCooldownHours`. |
| 6 | **Bluetooth watchdog detects unresponsive device** | Connect a BLE device and let it become unresponsive (e.g. freeze it or shield it). After `CONF_devicesBluetoothWatchdogTimeoutSeconds` the watchdog should detect the stale connection and trigger a reconnect attempt. |
| 7 | **ZigBee bridge discovers devices** | Put a ZigBee device (IKEA TRADFRI, SONOFF, etc.) into pairing mode and run `POST /devices/zigbee/scan`. Confirm the device appears in the scan results with its correct product name, vendor, and properties. |
| 8 | **ZigBee pairing mode / permit join** | Trigger a scan which enables "permit join" on the ZigBee coordinator. Verify that the coordinator accepts new devices only during the scan window (`CONF_scanTimeDefaultSeconds`) and rejects them afterwards. |
| 9 | **ZigBee connect/disconnect cycle** | Use `POST /devices/zigbee/{deviceID}/connect` to add a paired ZigBee device to the network, then `DELETE /devices/zigbee/{deviceID}` to remove it. Verify the device is added to and removed from the `devices` table. |
| 10 | **ZigBee reconnect with exponential backoff** | Disconnect a ZigBee device (e.g. unplug it) and observe the bridge logs. The bridge should retry connection with increasing delays from `CONF_devicesZigBeeReconnectBaseDelaySeconds` up to `CONF_devicesZigBeeReconnectMaxDelaySeconds`. |
| 11 | **ZigBee reporting interval works** | Connect a ZigBee sensor (e.g. VALLHORN motion sensor) and verify it sends periodic reports. The reporting interval is configured via `CONF_zigBeeReportingTimeout` and values should appear in `mqtt_history_devices_values` at regular intervals. |
| 12 | **ZigBee watchdog detects stale devices** | Connect a ZigBee device, then remove its power source. After `CONF_devicesZigBeeWatchdogTimeoutSeconds` without receiving data, the watchdog (checked every `CONF_devicesZigBeeWatchdogIntervalSeconds`) should flag the device as offline. |
| 13 | **ZigBee battery monitoring & alert** | Connect a battery-powered ZigBee device (e.g. SONOFF SNZB-01P). When the reported battery level drops below `CONF_devicesZigBeeBatteryThresholdPercent`, verify an alert is generated with the configured cooldown (`CONF_devicesZigBeeBatteryAlertCooldownHours`). |
| 14 | **LoRa serial adapter opens and receives AT responses** | Plug in the LoRa module at the configured serial port (`CONF_loRaAdapterPath`). On bridge startup, it should send AT configuration commands (FRE, SF, BW, POWER, CRC, RXMOD) and log successful responses from the module. |
| 15 | **LoRa receives P2P packets from sensor** | Power on a LoRa sensor that transmits P2P packets. Verify the bridge parses the incoming data, runs it through the converter (heartrate ×1000, color mapping), and publishes the converted values to `server/devices/values/get`. |
| 16 | **LoRa adapter reconnect after disconnect** | Unplug the LoRa USB adapter while the bridge is running. The bridge should detect the serial port loss and retry the connection every `CONF_loRaAdapterReconnectIntervalSeconds` until the adapter is plugged back in. |
| 17 | **HTTP bridge receives PUT to create device** | Send a `PUT /message` request to the HTTP bridge (port 9996) with `{ deviceID, productName, powerType }`. Verify the device gets registered in the server's `devices` table and appears in `GET /devices/all`. You can also test `POST /message` to send values and `DELETE /message` to remove the device. |

---

## Live Service Integration

| # | Test | Explanation |
|---|------|-------------|
| 18 | **Full system startup** | Run `./production-start.sh` (or `pm2 start production.config.js`) and verify that all processes launch: broker on port 9999, server on 9998, and all configured bridges on their respective ports. Check logs for "online" status messages. |
| 19 | **MQTT broker accepts authenticated connections** | Set `CONF_brokerUsername` and `CONF_brokerPassword` in `.env.local`, restart the broker, and try connecting with `mosquitto_sub -u <user> -P <pass> -t "#"`. Valid credentials should connect successfully and show published messages. |
| 20 | **MQTT broker rejects wrong credentials** | With broker authentication enabled, attempt to connect using incorrect credentials. The broker should reject the connection with return code 4 (bad credentials) and log the failed attempt. |
| 21 | **MQTT TLS encryption works** | Set `CONF_tlsPath` to a directory containing `cert.pem` and `key.pem`, restart the broker. Connect using `mqtts://` protocol and verify the encrypted connection succeeds. Plain `mqtt://` connections should be refused. |
| 22 | **HTTPS server with TLS certificates** | With `CONF_tlsPath` configured, restart the server. Open `https://localhost:9998/info` in a browser or curl. Verify the TLS certificate is served correctly and HTTP responses work over HTTPS. |
| 23 | **MQTT persistence: messages saved to mqtt_history** | Send any MQTT message while the broker is running, then query the SQLite database: `SELECT * FROM mqtt_history ORDER BY historyID DESC LIMIT 5`. Every published message should have a corresponding row with topic, message, and timestamp. |
| 24 | **MQTT persistence: device values saved** | Have a device send values through any bridge. Query `SELECT * FROM mqtt_history_devices_values ORDER BY valueID DESC LIMIT 5` and verify each property is stored with its numeric value, time features (weekdaySin, weekdayCos, hourSin, hourCos, month), and correct deviceID/bridge. |
| 25 | **Bonjour/mDNS service published** | Start the server and use a Bonjour browser (e.g. `dns-sd -B _http._tcp` on macOS, or Bonjour Browser app). Verify the server advertises itself with the name from `CONF_serverIDBonjour` and the correct port. |
| 26 | **CORS rejects unauthorized origins** | Set `CONF_corsURL` to a specific URL (e.g. `http://localhost:5173`) in `.env.local`. Then make a request from a different origin (e.g. `curl -H "Origin: http://evil.com" http://localhost:9998/info`). The response should include a CORS error for the unauthorized origin. |

---

## End-to-End Flows

| # | Test | Explanation |
|---|------|-------------|
| 27 | **Device value → Scenario trigger → Action** | Create a scenario (e.g. "heartrate > 100 → turn on light"), then send a device value that exceeds the threshold. Verify the entire chain: MQTT message arrives at server, ScenarioEngine evaluates triggers, action is published to the target bridge, and the target device receives the command. |
| 28 | **Delayed scenario actions execute correctly** | Create a scenario with an action that has `delay: 5` (seconds). Trigger it and measure the time until the action's MQTT message is published. It should fire approximately 5 seconds after the trigger, not immediately. |
| 29 | **Push notifications delivered via Firebase** | Register a push token via `POST /data/push_tokens` with a real FCM token from the mobile app. Then trigger a scenario with `pushNotification: true`. Check that the notification arrives on the mobile device with the correct title and description. |
| 30 | **Push notification cleans up invalid tokens** | Insert an invalid/expired FCM token into `push_tokens`. Trigger a push notification and verify the PushEngine removes the invalid token from the database after Firebase returns an error code like `messaging/invalid-registration-token`. |
| 31 | **Anomaly detection flags abnormal values** | With `CONF_anomalyDetectionActive` enabled, send ~200 normal heartrate values (60–80) to build a baseline. Then send an extreme value (e.g. 250). Check the server logs or MQTT for `server/devices/anomaly` messages with a score exceeding `CONF_anomalyDetectionThreshold`. |
| 32 | **Anomaly detection publishes MQTT alert** | After triggering an anomaly (see above), subscribe to `server/devices/anomaly` with an MQTT client. Verify the published message contains the deviceID, property, value, and anomaly score. |
| 33 | **Graceful shutdown** | Start the full system, then send `SIGINT` (Ctrl+C or `kill -2`). Verify the server publishes `{ status: "offline" }` to `server/status`, the MQTT client disconnects cleanly, and the SQLite database is closed without corruption. |

---

## App Frontend (Ionic/Capacitor)

| # | Test | Explanation |
|---|------|-------------|
| 34 | **App connects to server and loads devices** | Open the app, enter the server URL, and verify it discovers the server (via Bonjour or manual entry). The device list should load showing all registered devices with their names, bridges, and connection status. |
| 35 | **App shows live device values** | Open a connected device's detail view in the app. Change a sensor value physically (e.g. press a BangleJS2 button). The app should update the displayed value in real-time without needing to refresh manually. |
| 36 | **App can create/edit/delete scenarios** | Use the app's scenario UI to create a new scenario with triggers and actions. Verify it appears in `GET /scenarios/all`. Edit its name and triggers, then delete it. Confirm the database reflects each change. |
| 37 | **App receives push notifications** | With the app installed on a real device and a valid FCM token registered, trigger a scenario. The phone should display a push notification with the scenario name and description, even when the app is in the background. |
| 38 | **App works on iOS and Android** | Build and deploy the app on both platforms using Capacitor (`npx cap run ios` / `npx cap run android`). Test basic flows (login, device list, scenario creation) on each platform to check for platform-specific rendering or behavior issues. |
| 39 | **App handles server offline gracefully** | While the app is connected, stop the server. The app should display an offline indicator or error message rather than crashing. When the server comes back, the app should reconnect automatically. |

---

## Healthcheck

| # | Test | Explanation |
|---|------|-------------|
| 40 | **Healthcheck returns status of all processes** | With all services running, open `http://localhost:{CONF_portHealthcheck}/` in a browser. It should return the status of the broker, server, and each bridge (online/offline) in a structured JSON response. |
| 41 | **Healthcheck detects crashed bridge** | Stop one bridge (e.g. kill the ZigBee bridge process). Then query the healthcheck endpoint again. The stopped bridge should now show as "offline" while all other services remain "online". |

---

## Swagger

| # | Test | Explanation |
|---|------|-------------|
| 42 | **Swagger UI loads** | Open `http://localhost:9998/api-docs` in a browser. The Swagger UI should render with all documented endpoints grouped by tag (Data, Devices, Scenarios). Verify you can expand each endpoint and see its parameters, request body, and response schema. |
| 43 | **Swagger JSON spec is valid** | Open `http://localhost:9998/swagger.json` and paste the output into [editor.swagger.io](https://editor.swagger.io). It should parse without errors and match the actually implemented routes. |
