#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// ---------------- CONFIGURATION ----------------
const char* ssid = "NEERAJ's S25 Ultra";
const char* password = "Ssbn2703@";

// Your Backend Node.js Server IP and Port
// Example: "http://192.168.1.100:5000"
const char* serverUrl = "http://10.102.96.51:5000/api/device/telemetry";
const char* commandUrl = "http://10.102.96.51:5000/api/device/command/1"; // Assumes device_id = 1

// Device Credentials
const int DEVICE_ID = 6;
const char* DEVICE_KEY = "c2e0450f59649cc5b62e068876bc4099f542cb373571245d89b5c773b9cf278c"; // The raw key generated for this device

// ---------------- HARDWARE PINS ----------------
#define DHT_PIN 4
#define DHT_TYPE DHT11
#define MQ135_PIN 34
#define FAN_PIN 26
#define BUZZER_PIN 23

// Assumes an active-LOW relay or suitable driver
#define FAN_ON LOW
#define FAN_OFF HIGH

DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastUpdate = 0;
const long updateInterval = 5000; // Send data to server every 5 seconds
bool currentFanStatus = false;

void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(FAN_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(FAN_PIN, FAN_OFF);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("HVAC SafeGuard Started");

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi!");
}

void loop() {
  // 1. READ SENSORS
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  int airQuality = analogRead(MQ135_PIN);

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("DHT11 ERROR");
    digitalWrite(FAN_PIN, FAN_OFF);
    digitalWrite(BUZZER_PIN, LOW);
    currentFanStatus = false;
    delay(2000);
    return;
  }

  // 2. LOCAL HARDWARE SAFETY LOGIC
  bool highTemperature = temperature >= 33.0;
  bool highHumidity = humidity >= 90.0;
  bool poorAir = airQuality >= 4000;

  if (highTemperature || highHumidity || poorAir) {
    digitalWrite(FAN_PIN, FAN_ON);
    digitalWrite(BUZZER_PIN, HIGH);
    currentFanStatus = true;
    
    Serial.println("STATUS: WARNING");
    Serial.println("FAN: ON");
    Serial.println("BUZZER: ON");
  } else {
    // If local thresholds are safe, we check if the backend sent a manual override
    digitalWrite(FAN_PIN, currentFanStatus ? FAN_ON : FAN_OFF);
    digitalWrite(BUZZER_PIN, LOW); // Buzzer only on true hardware warning
    
    Serial.println(currentFanStatus ? "STATUS: MANUAL OVERRIDE (FAN ON)" : "STATUS: SAFE");
  }
  Serial.println("----------------------");

  // 3. SEND TELEMETRY TO SERVER (Non-blocking timer)
  if (WiFi.status() == WL_CONNECTED) {
    unsigned long currentMillis = millis();
    if (currentMillis - lastUpdate >= updateInterval) {
      lastUpdate = currentMillis;
      
      // Send the real sensor data to the backend
      sendTelemetry(temperature, humidity, airQuality);
      
      // Check for remote commands (manual overrides from Dashboard)
      pollCommands();
    }
  } else {
    Serial.println("WiFi Disconnected!");
    WiFi.reconnect();
  }

  // Small delay to prevent sensor spam (DHT11 is slow)
  delay(2000);
}

void sendTelemetry(float temp, float hum, float aqi) {
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);

  // Construct JSON payload manually
  String payload = "{";
  payload += "\"device_id\":" + String(DEVICE_ID) + ",";
  payload += "\"temperature\":" + String(temp, 2) + ",";
  payload += "\"humidity\":" + String(hum, 2) + ",";
  payload += "\"mq135_ppm\":" + String(aqi, 2) + ",";
  payload += "\"fan_status\":" + String(currentFanStatus ? "true" : "false") + ",";
  payload += "\"peripherals\":[]";
  payload += "}";

  int httpResponseCode = http.POST(payload);
  if (httpResponseCode > 0) {
    Serial.print("Telemetry Sent. Response Code: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("Error sending telemetry: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }
  http.end();
}

void pollCommands() {
  HTTPClient http;
  http.begin(commandUrl);
  http.addHeader("x-device-key", DEVICE_KEY);

  int httpResponseCode = http.GET();
  if (httpResponseCode == 200) {
    String response = http.getString();
    // Simple string search instead of full JSON parsing to save memory
    if (response.indexOf("\"fan_status\":true") > 0) {
      currentFanStatus = true;
      Serial.println("Command Received from Server: Turn Fan ON");
    } else if (response.indexOf("\"fan_status\":false") > 0) {
      currentFanStatus = false;
      Serial.println("Command Received from Server: Turn Fan OFF");
    }
  }
  http.end();
}
