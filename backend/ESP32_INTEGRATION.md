# ESP32 telemetry integration

The dashboard no longer invents sensor readings. It stores real readings posted by a registered ESP32. Register the board in **Device fleet → Add device → ESP32 board**. Save the device ID and one-time API key shown after registration.

## Send readings

Send a POST every 5–15 seconds to `http://<computer-on-your-LAN>:5000/api/device/telemetry` with `Content-Type: application/json` and an `x-device-key` header.

```json
{
  "device_id": 1,
  "temperature": 25.4,
  "humidity": 48.2,
  "mq135_ppm": 185,
  "fan_status": false,
  "peripherals": [
    { "id": 2, "working": true },
    { "id": 3, "working": true }
  ]
}
```

Replace the example values with readings from the sensors and the actual relay output state. `peripherals` is optional; use it to report the working state of registered fans and filters attached to this ESP32. Register each peripheral in the dashboard and select its reporting ESP32. Successful posts are inserted into `sensor_logs` with a timestamp and broadcast to the dashboard. A board and its attached devices are shown connected while the board's last telemetry or command poll is within 30 seconds.

## Read relay commands

Poll `GET http://<computer-on-your-LAN>:5000/api/device/command/<device_id>` every few seconds with the same `x-device-key` header. The response is `{"fan_status":true}` or `{"fan_status":false}`. Apply that value to the board's relay and report the actual output in the next telemetry post. In automatic mode, the server sets this target from the saved temperature, humidity, and air-quality thresholds. In manual mode, the dashboard queues it with the fan control button. The ESP32 firmware must poll this endpoint and drive the physical relay for remote fan controls to take effect.

## AI assistant (optional)

The in-app assistant always has a built-in app-data helper. To enable generated AI responses, add `OPENAI_API_KEY` to `backend/.env` and restart the backend. The server calls the OpenAI Responses API and sends the user's question plus the selected date's saved readings and device status; the key remains on the server. You can set `OPENAI_MODEL` there if you want to select a different model. API usage requires an OpenAI API account and may incur charges.

The computer and board need to be on the same trusted network. Do not expose this development HTTP server directly to the public internet.

## Storage and daily history

Sensor rows remain in PostgreSQL's `sensor_logs` table. The date selector requests one local calendar day and the dashboard charts, table, and assistant use that saved history. No historical rows are deleted by this feature.
