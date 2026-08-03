/**
 * IoT-Based Smart Home Automation and Fire & Gas Safety Monitoring System
 * Final Year Computer Engineering Project
 * ESP32 Firmware (main.ino)
 *
 * Hardware components and ESP32 Pin Connections:
 * - 6-Channel Relay Module (4 Light Bulbs + 2 Pumps):
 *   - Relay 1 (Light Bulb 1)          -> Pin D18
 *   - Relay 2 (Light Bulb 2)          -> Pin D19
 *   - Relay 3 (Light Bulb 3)          -> Pin D32 (expansion)
 *   - Relay 4 (Light Bulb 4)          -> Pin D33 (expansion)
 *   - Relay 5 (Overhead Fill Pump)    -> Pin D21 (Automated)
 *   - Relay 6 (Fire Extinguisher Pump)-> Pin D22 (Automated)
 * - 4 Physical Switches (manual control ONLY for the four light bulbs):
 *   - Switch 1 (Light Bulb 1)        -> Pin D4  (Internal Pullup)
*   - Switch 2 (Light Bulb 2)        -> Pin D5  (Internal Pullup)
 *   - Switch 3 (Light Bulb 3)        -> Pin D13 (Internal Pullup, expansion)
 *   - Switch 4 (Light Bulb 4)        -> Pin D23 (Internal Pullup, expansion)
 *   (NOTE: GPIO 16/17 are NOT used because they are hard-wired to the
 *    PSRAM chip on ESP32-WROVER modules and cannot act as GPIO.)
 *   (The Overhead Fill Pump D12 and Fire Pump D13 are NO LONGER used as
 *    physical switches — the pumps are fully AUTOMATED.)
 * - Sensors:
 *   - MQ-2 Gas Sensor        -> Pin D34 (Analog input or Digital input)
 *   - Flame Sensor (AO)      -> Pin D35 (Analog input, ADC1_CH7)
 *   - HC-SR04 Ultrasonic (Water level):
 *     - Trig Pin             -> Pin D25
 *     - Echo Pin             -> Pin D26
 * - Warning & Alarm Peripherals (driven through relay module, active-low):
 *   - Active Buzzer Relay      -> Pin D27 (LOW = buzzer ON)
 *   - Red Alarm Warning LED Relay -> Pin D14 (LOW = LED ON)
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

// Web Server and DNS Server for captive portal
WebServer webServer(80);
DNSServer dnsServer;
Preferences preferences;

// WiFi & API Configuration variables (loaded from Preferences)
String ssid = "";
String password = "";
String savedServerUrl = "https://YOUR-APPLET-URL.run.app/api/device/update"; // Configurable on the portal

bool inConfigMode = false;

// Pre-scanned networks for faster configuration portal page loading
struct ScannedNetwork
{
  String ssid;
  int rssi;
};
#define MAX_SCANNED_NETWORKS 15
ScannedNetwork scannedNetworks[MAX_SCANNED_NETWORKS];
int numScannedNetworks = 0;

void scanLocalNetworks()
{
  Serial.println("Pre-scanning available WiFi networks...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  int n = WiFi.scanNetworks();
  numScannedNetworks = (n > MAX_SCANNED_NETWORKS) ? MAX_SCANNED_NETWORKS : n;

  for (int i = 0; i < numScannedNetworks; ++i)
  {
    scannedNetworks[i].ssid = WiFi.SSID(i);
    scannedNetworks[i].rssi = WiFi.RSSI(i);
  }
  WiFi.scanDelete(); // Free memory
  Serial.printf("Pre-scan complete. Found %d networks.\n", numScannedNetworks);
}

// Hardware Pin Definitions
#define RELAY_LIGHT 18      // Relay 1: Light Bulb 1
#define RELAY_FAN 19        // Relay 2: Light Bulb 2
#define RELAY_BULB3 32      // Relay 3: Light Bulb 3 (expansion)
#define RELAY_BULB4 33      // Relay 4: Light Bulb 4 (expansion)
#define RELAY_WATER_PUMP 21 // Relay 5: Overhead Fill Pump (Automated)
#define RELAY_FIRE_PUMP 22  // Relay 6: Fire Extinguisher Pump (Automated)

#define SWITCH_LIGHT 4
#define SWITCH_FAN 5
#define SWITCH_BULB3 13
#define SWITCH_BULB4 23

#define PIN_GAS 34
#define PIN_FLAME 35 // AO (Analog Output) of flame sensor -> ADC1_CH7

// Ultrasonic Sensor Pins (standard 4-wire mode)
#define US_TRIG 25
#define US_ECHO 26

#define PIN_BUZZER 27
#define PIN_LED 14

// Physical parameters
int TANK_HEIGHT = 100;                      // Tank height in cm (adjustable)
const unsigned long UPDATE_INTERVAL = 1500; // Send update every 1.5 seconds

// ============================================================
// Flame Sensor Anti-Sunlight Filter (Analog Mean + Flicker) v3
// ------------------------------------------------------------
// Real flames flicker due to turbulent combustion: the IR
// intensity oscillates at roughly 1-10 Hz. Sunlight, however,
// produces a STEADY (non-flickering) IR signal. A naive single
// digital read cannot distinguish them, causing false fire
// alarms when sunlight hits the sensor.
//
// v3 tuning (fixes "sensor not detecting fire"):
//   - v1 (single digital read) caused false positives on sunlight.
//   - v2 (fixed high-level count + transition count with high
//     thresholds) MISSED fires when the sensor saturates on a
//     close/bright flame (analog stops crossing the threshold).
//   - v3 uses a mean "band" + low peak-to-peak + relative flicker
//     ratio, catching real flames reliably while still rejecting
//     steady sunlight.
//
// New algorithm samples the ANALOG AO pin (GPIO35, ADC1_CH7)
// every FLAME_SAMPLE_INTERVAL_MS into a sliding window and
// computes:
//   1. Mean IR level   -> presence of an IR source (using a band,
//      works with sensors whose AO rises OR falls with IR).
//   2. Peak-to-peak    -> variation of the raw signal (flicker).
//   3. Relative ratio  -> PP*1000/mean, catches small-swing sensors.
// FIRE is confirmed when the mean IR is in-band AND flicker is
// present. This catches real flames while still rejecting steady
// sunlight (low PP).
//
// Once confirmed, the fire state LATCHES so the buzzer/fire pump
// stay active continuously during the fire (no ring-break-ring).
// It clears after 1 no-flame window (~0.9s), so the buzzer turns OFF
// promptly once the fire is gone (it stays ON the whole time fire is detected).
// ============================================================
// Tuned for robustness: cheap flame-sensor AO outputs vary widely.
// Some modules output a voltage that RISES with IR, others DROP
// (phototransistor pulls AO low). We therefore use a mean "band"
// (not too dark, not too bright) which works for BOTH polarities
// and also rejects saturating sunlight by its extreme mean level.
// Real flame is confirmed only when mean is in-band AND the signal
// FLICKERS (peak-to-peak or relative flicker ratio).
const int FLAME_IR_MEAN_MIN = 40;          // ADC avg below this = disconnected / pinned low (no signal)
const int FLAME_IR_MEAN_MAX = 4090;        // ADC avg above this = pinned at rail; flicker is still the discriminator
const int FLAME_FLICKER_PP_THRESHOLD = 25; // Absolute peak-to-peak ADC variation -> flicker (real flame)
const int FLAME_FLICKER_RATIO_X1000 = 25;  // Relative flicker: PP*1000/mean >= this (catches small-swing flames)
const int FLAME_WINDOW_SIZE = 30;          // Samples per evaluation window (~0.9s at 30ms) - responsive
const unsigned long FLAME_SAMPLE_INTERVAL_MS = 30;
const int FLAME_CLEAR_WINDOWS = 1;                  // Clear fire after 1 no-flame window (~0.9s): buzzer OFF promptly when no fire
const unsigned long FLAME_DEBUG_INTERVAL_MS = 5000; // Periodic Serial debug for field tuning

// Flame filter runtime state
unsigned long lastFlameSampleTime = 0;
int flameSamples[FLAME_WINDOW_SIZE]; // Ring buffer of recent raw analog readings
int flameSampleIndex = 0;
int flameClearWindowCount = 0; // Consecutive no-flame windows (to unlatch fire)
unsigned long lastFlameDebugTime = 0;
bool fireDetected = false; // Latched flicker-confirmed fire (default: no fire)

// Last known physical states to detect local changes
bool lastSwitchLightState = HIGH;
bool lastSwitchFanState = HIGH;
bool lastSwitchBulb3State = HIGH;
bool lastSwitchBulb4State = HIGH;

// Debounce: timestamps for when each switch was pressed, flags to prevent multiple toggles
const unsigned long DEBOUNCE_DELAY = 300; // 300ms debounce window
unsigned long debounceLightTime = 0;
unsigned long debounceFanTime = 0;
unsigned long debounceBulb3Time = 0;
unsigned long debounceBulb4Time = 0;
bool switchLightPressed = false;
bool switchFanPressed = false;
bool switchBulb3Pressed = false;
bool switchBulb4Pressed = false;

bool lightState = false;
bool fanState = false;
bool tvState = false;
bool socketState = false;
bool bulb3State = false;
bool bulb4State = false;

// Server-side safety overrides to ring physical buzzer if triggered via web
bool serverFireStatus = false;
bool serverGasStatus = false;
bool serverFirePumpStatus = false; // Remote override status for Fire Extinguisher Pump

// Sensor availability status from server (Default to true/enabled)
bool fireAvail = true;
bool gasAvail = true;
bool sonicAvail = true;

unsigned long lastUpdateTime = 0;

// Connect to the saved WiFi access point
bool connectWiFi()
{
  if (ssid == "")
    return false;

  Serial.println("Attempting to connect to WiFi: " + ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  // Wait up to 15 seconds (30 * 500ms) for connection
  int timeout = 30;
  while (WiFi.status() != WL_CONNECTED && timeout > 0)
  {
    delay(500);
    Serial.print(".");
    timeout--;
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("\nWiFi Connected! IP Address: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  else
  {
    Serial.println("\nFailed to connect to saved WiFi.");
    return false;
  }
}

// Render the mobile-friendly configuration page
void handleRoot()
{
  String html = "<!DOCTYPE html><html><head>";
  html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">";
  html += "<title>Smart Home WiFi Setup</title>";
  html += "<style>";
  html += "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; text-align: center; margin: 0; }";
  html += ".card { background: #1e293b; max-width: 420px; margin: 30px auto; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4); border: 1px solid #334155; }";
  html += "h2 { margin-top: 0; color: #38bdf8; font-weight: 600; font-size: 1.6rem; letter-spacing: -0.025em; }";
  html += "p { color: #94a3b8; font-size: 0.9rem; line-height: 1.4; }";
  html += "label { display: block; text-align: left; margin: 15px 0 6px; color: #94a3b8; font-size: 0.85rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }";
  html += "input, select { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: white; box-sizing: border-box; font-size: 1rem; transition: border-color 0.2s; }";
  html += "input:focus, select:focus { outline: none; border-color: #38bdf8; }";
  html += "button { width: 100%; background: #38bdf8; color: #0f172a; border: none; padding: 13px; border-radius: 8px; font-weight: bold; font-size: 1rem; margin-top: 25px; cursor: pointer; transition: background 0.2s, transform 0.1s; }";
  html += "button:hover { background: #0ea5e9; }";
  html += "button:active { transform: scale(0.98); }";
  html += ".footer { margin-top: 25px; font-size: 0.75rem; color: #64748b; border-top: 1px solid #334155; padding-top: 15px; }";
  html += "</style></head><body>";
  html += "<div class=\"card\">";
  html += "<h2>Smart Home Setup</h2>";
  html += "<p>Connect the device to your local network and register the backend server URL.</p>";
  html += "<form action=\"/save\" method=\"POST\">";

  html += "<label>Select Local Network</label>";
  html += "<select name=\"ssid\" id=\"ssid_select\">";

  // Display pre-scanned WiFi networks
  if (numScannedNetworks <= 0)
  {
    html += "<option value=\"\">No networks found - Enter manually</option>";
  }
  else
  {
    for (int i = 0; i < numScannedNetworks; ++i)
    {
      String network = scannedNetworks[i].ssid;
      int rssi = scannedNetworks[i].rssi;
      html += "<option value=\"" + network + "\">" + network + " (" + String(rssi) + " dBm)</option>";
    }
  }
  html += "</select>";

  html += "<div style=\"margin-top: 8px; text-align: left;\">";
  html += "<span style=\"color: #64748b; font-size: 0.8rem;\">Or type SSID manually:</span>";
  html += "<input type=\"text\" name=\"manual_ssid\" placeholder=\"Manual Network Name\" style=\"margin-top: 5px;\">";
  html += "</div>";

  html += "<label>WiFi Password</label>";
  html += "<input type=\"password\" name=\"password\" placeholder=\"••••••••\">";

  html += "<label>Backend Server URL</label>";
  html += "<input type=\"text\" name=\"server_url\" value=\"" + savedServerUrl + "\">";

  html += "<button type=\"submit\">Save &amp; Connect</button>";
  html += "</form>";
  html += "<div class=\"footer\">ESP32 Smart Home Node Firmware v2.0</div>";
  html += "</div>";
  html += "</body></html>";

  webServer.send(200, "text/html", html);
}

// Handle the credentials save request
void handleSave()
{
  String reqSsid = webServer.arg("ssid");
  String manualSsid = webServer.arg("manual_ssid");
  String reqPassword = webServer.arg("password");
  String reqServerUrl = webServer.arg("server_url");

  if (manualSsid != "")
  {
    reqSsid = manualSsid;
  }

  if (reqSsid != "")
  {
    // Save to Non-Volatile Storage (Preferences)
    preferences.begin("wifi", false);
    preferences.putString("ssid", reqSsid);
    preferences.putString("password", reqPassword);
    preferences.putString("server_url", reqServerUrl);
    preferences.end();

    String successHtml = "<!DOCTYPE html><html><head>";
    successHtml += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">";
    successHtml += "<title>Setup Completed</title>";
    successHtml += "<style>body { font-family: -apple-system, sans-serif; background: #0f172a; color: white; padding: 20px; text-align: center; }";
    successHtml += ".card { background: #1e293b; max-width: 400px; margin: 50px auto; padding: 30px; border-radius: 12px; border: 1px solid #10b981; }";
    successHtml += "h2 { color: #10b981; }</style></head><body>";
    successHtml += "<div class=\"card\"><h2>Setup Completed Successfully!</h2>";
    successHtml += "<p>WiFi settings have been saved. The ESP32 is now attempting to connect to <strong>" + reqSsid + "</strong>.</p>";
    successHtml += "<p style=\"color: #94a3b8; font-size: 0.9rem;\">The device is restarting. You can disconnect your mobile phone from 'Smart-Home-Setup' and refresh your Dashboard.</p></div></body></html>";

    webServer.send(200, "text/html", successHtml);
    delay(1000);
    WiFi.softAPdisconnect(true);
    WiFi.disconnect(true);
    delay(500);
    ESP.restart();
  }
  else
  {
    webServer.send(400, "text/plain", "Error: SSID cannot be empty.");
  }
}

bool isIp(String str)
{
  for (size_t i = 0; i < str.length(); i++)
  {
    int c = str.charAt(i);
    if (c != '.' && (c < '0' || c > '9'))
    {
      return false;
    }
  }
  return true;
}

void handleNotFound()
{
  String uri = webServer.uri();
  String host = webServer.hostHeader();

  // If the request is not for our ESP32 IP address, redirect to it to trigger captive portal popup
  if (!isIp(host) && host != "192.168.4.1" && host != "localhost")
  {
    Serial.println("Redirecting: " + host + uri + " to 192.168.4.1");
    webServer.sendHeader("Location", "http://192.168.4.1/", true);
    webServer.send(302, "text/plain", ""); // Empty response with redirect header
    return;
  }

  // If it's directly for our IP but a random path, serve the setup page
  handleRoot();
}

// Start Soft Access Point
void startCaptivePortal()
{
  Serial.println("\n--- Entering AP Configuration Mode ---");

  // First pre-scan available networks to populate list before AP mode disrupts channel scanning
  scanLocalNetworks();

  WiFi.mode(WIFI_AP_STA);

  // Create an open, easily accessible setup network
  WiFi.softAP("Smart-Home-Setup");
  delay(100);

  Serial.print("Access Point 'Smart-Home-Setup' is active. ");
  Serial.print("Connect your phone and navigate to: http://");
  Serial.println(WiFi.softAPIP());

  // Configure DNS Server to capture all domains (Captive Portal experience)
  dnsServer.start(53, "*", WiFi.softAPIP());

  // Web routes
  webServer.on("/", handleRoot);
  webServer.on("/save", handleSave);
  webServer.onNotFound(handleNotFound); // Robust redirect for captive portal detection

  webServer.begin();
}

void setup()
{
  Serial.begin(115200);

  // Initialize Relays as outputs and set to active-low (high-impedance/OFF default)
  pinMode(RELAY_LIGHT, OUTPUT);
  pinMode(RELAY_FAN, OUTPUT);
  pinMode(RELAY_BULB3, OUTPUT);
  pinMode(RELAY_BULB4, OUTPUT);
  pinMode(RELAY_WATER_PUMP, OUTPUT);
  pinMode(RELAY_FIRE_PUMP, OUTPUT);

  digitalWrite(RELAY_LIGHT, HIGH); // HIGH = relay OFF for active-low modules
  digitalWrite(RELAY_FAN, HIGH);
  digitalWrite(RELAY_BULB3, HIGH);
  digitalWrite(RELAY_BULB4, HIGH);
  digitalWrite(RELAY_WATER_PUMP, HIGH);
  digitalWrite(RELAY_FIRE_PUMP, HIGH);

  // Initialize warning & alarm peripherals (active-low relay module):
  // HIGH = relay de-energized (OFF), LOW = relay energized (ON)
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_LED, HIGH);    // LED relay OFF
  digitalWrite(PIN_BUZZER, HIGH); // Buzzer relay OFF

  // Initialize switches with pullups (only the 4 light-bulb switches)
  pinMode(SWITCH_LIGHT, INPUT_PULLUP);
  pinMode(SWITCH_FAN, INPUT_PULLUP);
  pinMode(SWITCH_BULB3, INPUT_PULLUP);
  pinMode(SWITCH_BULB4, INPUT_PULLUP);

  // Initialize sensors
  pinMode(PIN_GAS, INPUT);
  analogSetAttenuation(ADC_11db); // Configure 11dB attenuation for 0-3.3V full-scale range on ESP32 ADC
  // PIN_FLAME (GPIO 35 = ADC1_CH7) used in analog mode (no pinMode needed, but set for clarity)
  pinMode(PIN_FLAME, INPUT); // Analog input (ADC) for flame sensor AO
  pinMode(US_TRIG, OUTPUT);
  digitalWrite(US_TRIG, LOW);
  pinMode(US_ECHO, INPUT);

  // --- Check for Factory Reset Trigger ---
  // If the Light switch is toggled/held LOW on boot, we clear all WiFi credentials
  delay(200);
  if (digitalRead(SWITCH_LIGHT) == LOW)
  {
    Serial.println("\n[RESET TRIGGERED] Clearing saved WiFi settings...");
    preferences.begin("wifi", false);
    preferences.clear();
    preferences.end();

    // Quick warning blinks (active-low relay: LOW = LED ON)
    for (int i = 0; i < 15; i++)
    {
      digitalWrite(PIN_LED, LOW);
      delay(80);
      digitalWrite(PIN_LED, HIGH);
      delay(80);
    }
  }

  // --- Load Saved Credentials ---
  preferences.begin("wifi", true);
  ssid = preferences.getString("ssid", "");
  password = preferences.getString("password", "");
  savedServerUrl = preferences.getString("server_url", "https://YOUR-APPLET-URL.run.app/api/device/update");
  TANK_HEIGHT = preferences.getInt("tank_height", 100);
  preferences.end();

  // If URL is empty or is the placeholder template, auto-override to the actual project server URL
  if (savedServerUrl.indexOf("YOUR-APPLET-URL") != -1 || savedServerUrl == "" || savedServerUrl == "https://YOUR-APPLET-URL.run.app/api/device/update")
  {
    savedServerUrl = "https://ais-dev-xfuy6cok7yatn5f2pcjra7-72596629860.asia-southeast1.run.app/api/device/update";
  }

  // --- Connection Router ---
  bool connected = false;
  if (ssid != "")
  {
    connected = connectWiFi();
  }

  if (!connected)
  {
    inConfigMode = true;
    startCaptivePortal();
  }
  else
  {
    // Normal connection visual signal (slow double blink, active-low: LOW = LED ON)
    digitalWrite(PIN_LED, LOW);
    delay(200);
    digitalWrite(PIN_LED, HIGH);
    delay(100);
    digitalWrite(PIN_LED, LOW);
    delay(200);
    digitalWrite(PIN_LED, HIGH);
  }
}

// Function to measure water tank level percentage
// Returns -1 if the ultrasonic sensor read fails (no echo), so the pump logic
// can safely skip auto-fill instead of falsely triggering on 0%.
int getWaterLevelPercentage()
{
  digitalWrite(US_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(US_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(US_TRIG, LOW);

  long duration = pulseIn(US_ECHO, HIGH, 30000); // 30ms timeout to prevent hanging
  if (duration == 0)
    return -1; // No echo received — sensor failure/out-of-range

  // Calculate distance in cm
  float distance = duration * 0.034 / 2;

  if (distance > TANK_HEIGHT)
    distance = TANK_HEIGHT;
  if (distance < 0)
    distance = 0;

  // Formula: Percentage = ((Height - Distance) / Height) * 100
  int percentage = ((TANK_HEIGHT - distance) / TANK_HEIGHT) * 100;
  if (percentage < 0)
    percentage = 0;
  if (percentage > 100)
    percentage = 100;

  return percentage;
}

// ============================================================
// Non-blocking flame sensor flicker filter v3 (mean + peak-to-peak).
// Called every loop iteration. Samples the analog AO pin into a
// sliding window, computes mean IR + peak-to-peak flicker, and
// updates fireDetected.
// ============================================================
void sampleFlameFlicker()
{
  unsigned long now = millis();
  if (now - lastFlameSampleTime < FLAME_SAMPLE_INTERVAL_MS)
  {
    return; // Not yet time for next sample
  }
  lastFlameSampleTime = now;

  // Read analog value from flame sensor AO pin (ADC1_CH7, 0-4095)
  int raw = analogRead(PIN_FLAME);

  // Store in ring buffer (overwriting the oldest sample)
  flameSamples[flameSampleIndex] = raw;
  flameSampleIndex = (flameSampleIndex + 1) % FLAME_WINDOW_SIZE;

  // Every time the ring buffer completes a full window, evaluate it.
  if (flameSampleIndex == 0)
  {
    // Compute mean IR level and peak-to-peak over the window.
    long sum = 0;
    int minVal = 4095;
    int maxVal = 0;
    for (int i = 0; i < FLAME_WINDOW_SIZE; i++)
    {
      int v = flameSamples[i];
      sum += v;
      if (v < minVal)
        minVal = v;
      if (v > maxVal)
        maxVal = v;
    }
    int mean = sum / FLAME_WINDOW_SIZE;
    int peakToPeak = maxVal - minVal;

    // Confidence checks (polarity-independent):
    //   - Mean IR is within an operating band: not too dark (no IR
    //     source / very far) and not fully saturated at either rail.
    //     This works for sensors whose AO rises OR falls with IR.
    //   - Flicker: absolute peak-to-peak variation, OR a relative
    //     flicker ratio (PP*1000/mean) for small-swing sensors.
    //     A real flame flickers; steady sunlight does not.
    bool irInBand = (mean >= FLAME_IR_MEAN_MIN) && (mean <= FLAME_IR_MEAN_MAX);
    int flickerRatio = (mean > 0) ? (peakToPeak * 1000 / mean) : 0;
    bool hasFlicker = (peakToPeak >= FLAME_FLICKER_PP_THRESHOLD) ||
                      (flickerRatio >= FLAME_FLICKER_RATIO_X1000);

    if (irInBand && hasFlicker)
    {
      // Real flame confirmed (mean in-band AND flicker) -> latch ON
      flameClearWindowCount = 0; // Reset the unlatch counter
      if (!fireDetected)
      {
        fireDetected = true;
        Serial.print("[FLAME FILTER] FIRE CONFIRMED! mean=");
        Serial.print(mean);
        Serial.print(", PP=");
        Serial.print(peakToPeak);
        Serial.print(", ratio=");
        Serial.print(flickerRatio);
        Serial.println();
      }
    }
    else
    {
      // No flame in this window (out-of-band OR no flicker).
      // To avoid a ring-break-ring stutter from a momentary flicker
      // lull or a brief saturation, we do NOT unlatch immediately.
      // We only unlatch after FLAME_CLEAR_WINDOWS consecutive
      // no-flame windows (~0.9s), so the buzzer turns OFF promptly
      // once the fire is gone.
      flameClearWindowCount++;
      if (fireDetected && flameClearWindowCount >= FLAME_CLEAR_WINDOWS)
      {
        fireDetected = false;
        flameClearWindowCount = 0;
        Serial.print("[FLAME FILTER] Fire cleared after sustained absence (mean=");
        Serial.print(mean);
        Serial.print(", PP=");
        Serial.println(peakToPeak);
      }
    }
  }

  // Periodic debug (once every few seconds) for on-site tuning
  if (now - lastFlameDebugTime >= FLAME_DEBUG_INTERVAL_MS)
  {
    lastFlameDebugTime = now;
    int latestMean = 0;
    int latestPP = 0;
    long s = 0;
    int mn = 4095;
    int mx = 0;
    for (int i = 0; i < FLAME_WINDOW_SIZE; i++)
    {
      int v = flameSamples[i];
      s += v;
      if (v < mn)
        mn = v;
      if (v > mx)
        mx = v;
    }
    latestMean = s / FLAME_WINDOW_SIZE;
    latestPP = mx - mn;
    Serial.print("[FLAME DEBUG] raw_mean=");
    Serial.print(latestMean);
    Serial.print(" pp=");
    Serial.print(latestPP);
    Serial.print(" ratio=");
    Serial.print(latestMean > 0 ? (latestPP * 1000 / latestMean) : 0);
    Serial.print(" clear_count=");
    Serial.print(fireDetected ? flameClearWindowCount : 0);
    Serial.print(" fire=");
    Serial.println(fireDetected ? "YES" : "no");
  }
}

void loop()
{
  // If in AP Config mode, run portal servers and check background liveness
  if (inConfigMode)
  {
    dnsServer.processNextRequest();
    webServer.handleClient();

    // Config Mode indicator: Slow pulsing on status LED (active-low: LOW = LED ON)
    static unsigned long lastFlash = 0;
    if (millis() - lastFlash > 1000)
    {
      lastFlash = millis();
      digitalWrite(PIN_LED, !digitalRead(PIN_LED));
    }

    // Auto-heal reconnect: Periodically check if we can connect to the saved router in background
    static unsigned long lastBackgroundReconnect = 0;
    if (ssid != "" && (millis() - lastBackgroundReconnect > 12000))
    {
      lastBackgroundReconnect = millis();
      Serial.println("\n[AUTO-HEAL] Checking background router connection...");
      if (WiFi.status() == WL_CONNECTED)
      {
        Serial.println("[AUTO-HEAL] Reconnected to router successfully in background! Resuming normal mode.");
        WiFi.softAPdisconnect(true); // Shut down AP
        WiFi.mode(WIFI_STA);         // Switch back to station-only mode
        inConfigMode = false;

        // Clear background timer and flash success sequence (3 quick blinks, active-low: LOW = LED ON)
        for (int i = 0; i < 3; i++)
        {
          digitalWrite(PIN_LED, LOW);
          delay(100);
          digitalWrite(PIN_LED, HIGH);
          delay(100);
        }
        return;
      }
      else
      {
        // Explicitly trigger a background reconnect
        WiFi.begin(ssid.c_str(), password.c_str());
      }
    }
    return;
  }

  // Monitor WiFi connection liveness
  static unsigned long lastWifiConnectedTime = millis();
  if (WiFi.status() == WL_CONNECTED)
  {
    lastWifiConnectedTime = millis();
  }
  else
  {
    // If disconnected for more than 15 seconds, automatically fall back to AP captive portal configuration mode
    if (millis() - lastWifiConnectedTime > 15000)
    {
      Serial.println("\n[WIFI LOST] WiFi connection lost for >15 seconds. Re-entering AP Captive Portal configuration mode...");
      inConfigMode = true;
      WiFi.disconnect(false); // Disconnect STA but keep configuration profiles
      delay(100);
      startCaptivePortal();
      return;
    }
  }

  // 1. Read Physical Switches & Detect Changes (Toggle action)
  // Only the four light-bulb switches are active. The pumps are automated-only.
  bool switchLight = digitalRead(SWITCH_LIGHT);
  bool switchFan = digitalRead(SWITCH_FAN);
  bool switchBulb3 = digitalRead(SWITCH_BULB3);
  bool switchBulb4 = digitalRead(SWITCH_BULB4);

  bool stateChanged = false;
  unsigned long now = millis();

  // --- Light Switch (Debounced) ---
  if (switchLight == LOW)
  {
    if (!switchLightPressed && (now - debounceLightTime > DEBOUNCE_DELAY))
    {
      switchLightPressed = true;
      debounceLightTime = now;
      lightState = !lightState;
      digitalWrite(RELAY_LIGHT, lightState ? LOW : HIGH);
      stateChanged = true;
      Serial.println("Physical Switch: Light Toggled!");
    }
  }
  else
  {
    // Reset flag when released, so next press fires again
    if (switchLightPressed)
    {
      switchLightPressed = false;
      debounceLightTime = now;
    }
  }

  // --- Fan Switch (Debounced) ---
  if (switchFan == LOW)
  {
    if (!switchFanPressed && (now - debounceFanTime > DEBOUNCE_DELAY))
    {
      switchFanPressed = true;
      debounceFanTime = now;
      fanState = !fanState;
      digitalWrite(RELAY_FAN, fanState ? LOW : HIGH);
      stateChanged = true;
      Serial.println("Physical Switch: Fan Toggled!");
    }
  }
  else
  {
    if (switchFanPressed)
    {
      switchFanPressed = false;
      debounceFanTime = now;
    }
  }

  // --- Bulb 3 Switch (Debounced) ---
  if (switchBulb3 == LOW)
  {
    if (!switchBulb3Pressed && (now - debounceBulb3Time > DEBOUNCE_DELAY))
    {
      switchBulb3Pressed = true;
      debounceBulb3Time = now;
      bulb3State = !bulb3State;
      digitalWrite(RELAY_BULB3, bulb3State ? LOW : HIGH);
      stateChanged = true;
      Serial.println("Physical Switch: Light Bulb 3 Toggled!");
    }
  }
  else
  {
    if (switchBulb3Pressed)
    {
      switchBulb3Pressed = false;
      debounceBulb3Time = now;
    }
  }

  // --- Bulb 4 Switch (Debounced) ---
  if (switchBulb4 == LOW)
  {
    if (!switchBulb4Pressed && (now - debounceBulb4Time > DEBOUNCE_DELAY))
    {
      switchBulb4Pressed = true;
      debounceBulb4Time = now;
      bulb4State = !bulb4State;
      digitalWrite(RELAY_BULB4, bulb4State ? LOW : HIGH);
      stateChanged = true;
      Serial.println("Physical Switch: Light Bulb 4 Toggled!");
    }
  }
  else
  {
    if (switchBulb4Pressed)
    {
      switchBulb4Pressed = false;
      debounceBulb4Time = now;
    }
  }

  // NOTE: Physical switch control is ONLY for the four light bulbs (Light, Fan, Bulb3, Bulb4).
  // The Overhead Fill Pump and Fire Extinguisher Pump are fully AUTOMATED (water level / fire
  // detection / web dashboard) and are NOT controlled by physical switches.

  // 2. Read Safety Sensors
  // Flame Sensor (AO, analog): sampled via non-blocking flicker filter
  // Rejects steady sunlight; only confirms fire when IR flickers (real flame).
  sampleFlameFlicker();

  // MQ-2 Gas Sensor: Take 8-sample average to filter out ADC noise spikes
  int gasSum = 0;
  for (int i = 0; i < 8; i++)
  {
    gasSum += analogRead(PIN_GAS);
    delayMicroseconds(150);
  }
  int gasValue = gasSum / 8;

  // MQ-2 heating element requires ~20 seconds warm-up after boot to stabilize output
  bool gasWarmupComplete = (millis() > 20000);
  bool gasLeakage = gasWarmupComplete && (gasValue > 1500); // Threshold: >1500 ADC (out of 4095 with 11dB attenuation)

  // 3. Hardware Safety Actions (Autonomous buzzer & alarm)
  // IMPORTANT FIX: The physical buzzer/LED alarm responds ONLY to the LOCAL
  // physical sensors (fireDetected / gasLeakage), NOT to the server-latched
  // flags. Previously serverFireStatus / serverGasStatus (echoed from the
  // backend and possibly held TRUE by the web simulator or stale DB state)
  // kept the buzzer ringing for a long time AFTER the flame was already gone.
  // Now: buzzer rings while the sensor detects the hazard, and turns OFF as
  // soon as the hazard clears locally (fireDetected clears in ~1s, gas leaks
  // clear when the gas reading drops below the threshold).
  // Buzzer/LED are connected through a relay module (active-low): LOW = relay energized = ON.
  bool fireActive = fireAvail && fireDetected; // Local flame sensor only
  bool gasActive = gasAvail && gasLeakage;     // Local gas sensor only

  if (fireActive || gasActive)
  {
    digitalWrite(PIN_BUZZER, LOW); // Buzzer relay ON (alarm sounding)
    digitalWrite(PIN_LED, LOW);    // Warning LED relay ON
  }
  else
  {
    digitalWrite(PIN_BUZZER, HIGH); // Buzzer relay OFF
    digitalWrite(PIN_LED, HIGH);    // Warning LED relay OFF
  }

  // Dual-Pump Control: Autonomous & remote-triggered Fire Suppression Pump 2
  // The fire pump turns ON when the LOCAL flame sensor detects fire, OR when a
  // remote override (serverFirePumpStatus) is active. It does NOT rely on the
  // latched serverFireStatus, so a stale/simulated web fire cannot keep the
  // pump running after the local flame is out.
  if (fireAvail)
  {
    if (fireDetected || serverFirePumpStatus)
    {
      digitalWrite(RELAY_FIRE_PUMP, LOW); // Turn ON Fire Suppression Pump (Active Low)
      socketState = true;
    }
    else
    {
      // No fire present and no remote override: ensure the fire pump is OFF.
      digitalWrite(RELAY_FIRE_PUMP, HIGH); // Turn OFF Fire Suppression Pump (Active Low)
      socketState = false;
    }
  }
  else
  {
    // If the flame sensor is unavailable, keep the fire pump OFF as a safety precaution.
    digitalWrite(RELAY_FIRE_PUMP, HIGH);
    socketState = false;
  }

  // 4. Calculate Water Tank Percentage
  int waterLevel = getWaterLevelPercentage();
  bool waterSensorValid = (waterLevel >= 0); // -1 means sensor read failed

  // Local physical autonomous safeguard with hysteresis:
  // - When pump is OFF: turn ON only when water level drops to 20% or below
  // - When pump is ON:  turn OFF only when water level reaches 80% or above
  // This creates a natural deadband preventing rapid ON/OFF toggling
  // when water level fluctuates near the thresholds.
  // NOTE: Auto-fill is SKIPPED entirely if the ultrasonic sensor read fails
  // (waterSensorValid == false) to prevent false pump activation on 0%.
  if (sonicAvail)
  {
    if (!waterSensorValid)
    {
      // SAFETY: Ultrasonic sensor read failed — turn OFF the fill pump to
      // prevent indefinite running / water overflow (we cannot trust readings).
      if (tvState)
      {
        digitalWrite(RELAY_WATER_PUMP, HIGH); // Turn OFF overhead fill pump (Active Low)
        tvState = false;
      }
    }
    else if (tvState)
    {
      // Pump is currently ON — only turn OFF when tank is sufficiently full
      if (waterLevel >= 80)
      {
        digitalWrite(RELAY_WATER_PUMP, HIGH); // Turn OFF overhead fill pump (Active Low)
        tvState = false;
      }
    }
    else
    {
      // Pump is currently OFF — only turn ON when tank is critically low
      if (waterLevel <= 20)
      {
        digitalWrite(RELAY_WATER_PUMP, LOW); // Turn ON overhead fill pump (Active Low)
        tvState = true;
      }
    }
  }

  // 5. Send parameters to server if time interval elapsed OR state changed
  if (millis() - lastUpdateTime > UPDATE_INTERVAL || stateChanged)
  {
    lastUpdateTime = millis();

    if (WiFi.status() == WL_CONNECTED)
    {
      HTTPClient http;
      bool beginSuccess = false;
      WiFiClientSecure secureClient;
      WiFiClient normalClient;

      // Handle both secure (HTTPS) and non-secure (HTTP) endpoints cleanly
      if (savedServerUrl.startsWith("https://"))
      {
        secureClient.setInsecure(); // Ignore SSL fingerprint validation to bypass secure connection hurdles
        beginSuccess = http.begin(secureClient, savedServerUrl);
      }
      else
      {
        beginSuccess = http.begin(normalClient, savedServerUrl);
      }

      if (beginSuccess)
      {
        http.addHeader("Content-Type", "application/json");

        // Construct JSON payload
        // If ultrasonic sensor read failed (waterLevel == -1), report 50% to
        // the backend as a neutral safe value so no false pump trigger occurs.
        int reportedWaterLevel = (waterLevel >= 0) ? waterLevel : 50;
        String payload = "{\"fireStatus\":" + String(fireDetected ? "true" : "false") +
                         ",\"gasStatus\":" + String(gasLeakage ? "true" : "false") +
                         ",\"waterLevel\":" + String(reportedWaterLevel) +
                         ",\"isPhysicalToggle\":" + String(stateChanged ? "true" : "false") +
                         ",\"appliancesState\":{" +
                         "\"light\":" + String(lightState ? "true" : "false") + "," +
                         "\"fan\":" + String(fanState ? "true" : "false") + "," +
                         "\"bulb3\":" + String(bulb3State ? "true" : "false") + "," +
                         "\"bulb4\":" + String(bulb4State ? "true" : "false") + "," +
                         "\"tv\":" + String(tvState ? "true" : "false") + "," +
                         "\"socket\":" + String(socketState ? "true" : "false") +
                         "}}";

        int httpResponseCode = http.POST(payload);

        if (httpResponseCode > 0)
        {
          String response = http.getString();
          Serial.println("HTTP Response code: " + String(httpResponseCode));
          Serial.println("Response: " + response);

          // Parse state updates from response (using simple, robust flat states key checks)
          if (response.indexOf("\"light\":true") != -1)
          {
            lightState = true;
            digitalWrite(RELAY_LIGHT, LOW);
          }
          else if (response.indexOf("\"light\":false") != -1)
          {
            lightState = false;
            digitalWrite(RELAY_LIGHT, HIGH);
          }

          if (response.indexOf("\"fan\":true") != -1)
          {
            fanState = true;
            digitalWrite(RELAY_FAN, LOW);
          }
          else if (response.indexOf("\"fan\":false") != -1)
          {
            fanState = false;
            digitalWrite(RELAY_FAN, HIGH);
          }

          if (response.indexOf("\"bulb3\":true") != -1)
          {
            bulb3State = true;
            digitalWrite(RELAY_BULB3, LOW);
          }
          else if (response.indexOf("\"bulb3\":false") != -1)
          {
            bulb3State = false;
            digitalWrite(RELAY_BULB3, HIGH);
          }

          if (response.indexOf("\"bulb4\":true") != -1)
          {
            bulb4State = true;
            digitalWrite(RELAY_BULB4, LOW);
          }
          else if (response.indexOf("\"bulb4\":false") != -1)
          {
            bulb4State = false;
            digitalWrite(RELAY_BULB4, HIGH);
          }

          if (response.indexOf("\"tv\":true") != -1)
          {
            tvState = true;
            digitalWrite(RELAY_WATER_PUMP, LOW);
          }
          else if (response.indexOf("\"tv\":false") != -1)
          {
            tvState = false;
            digitalWrite(RELAY_WATER_PUMP, HIGH);
          }

          if (response.indexOf("\"socket\":true") != -1)
          {
            socketState = true;
            digitalWrite(RELAY_FIRE_PUMP, LOW);
          }
          else if (response.indexOf("\"socket\":false") != -1)
          {
            socketState = false;
            digitalWrite(RELAY_FIRE_PUMP, HIGH);
          }

          // Apply water pump relay status from server (Overhead Fill Pump 1)
          if (response.indexOf("\"pump\":true") != -1)
          {
            digitalWrite(RELAY_WATER_PUMP, LOW); // Turn on water pump
          }
          else if (response.indexOf("\"pump\":false") != -1)
          {
            digitalWrite(RELAY_WATER_PUMP, HIGH); // Turn off water pump
          }

          // Apply fire suppression pump status from server (Fire Extinguisher Pump 2)
          if (response.indexOf("\"firePump\":true") != -1)
          {
            serverFirePumpStatus = true;
          }
          else if (response.indexOf("\"firePump\":false") != -1)
          {
            serverFirePumpStatus = false;
          }

          // Sync fire and gas alarm states from server response (e.g. if simulated on web)
          // NOTE: These are no longer used to drive the physical buzzer/LED (which now
          // responds only to local sensors). They are parsed for informational sync only.
          if (response.indexOf("\"fire\":true") != -1)
          {
            serverFireStatus = true;
          }
          else if (response.indexOf("\"fire\":false") != -1)
          {
            serverFireStatus = false;
          }

          if (response.indexOf("\"gas\":true") != -1)
          {
            serverGasStatus = true;
          }
          else if (response.indexOf("\"gas\":false") != -1)
          {
            serverGasStatus = false;
          }

          // Parse sensor availability status
          if (response.indexOf("\"fireAvail\":true") != -1)
          {
            fireAvail = true;
          }
          else if (response.indexOf("\"fireAvail\":false") != -1)
          {
            fireAvail = false;
          }

          if (response.indexOf("\"gasAvail\":true") != -1)
          {
            gasAvail = true;
          }
          else if (response.indexOf("\"gasAvail\":false") != -1)
          {
            gasAvail = false;
          }

          if (response.indexOf("\"sonicAvail\":true") != -1)
          {
            sonicAvail = true;
          }
          else if (response.indexOf("\"sonicAvail\":false") != -1)
          {
            sonicAvail = false;
          }

          // Parse calibrated tank height from server response if available
          int idx = response.indexOf("\"tankHeight\":");
          if (idx != -1)
          {
            int startIdx = idx + 13;
            int endIdx = startIdx;
            while (endIdx < response.length() && (response.charAt(endIdx) >= '0' && response.charAt(endIdx) <= '9'))
            {
              endIdx++;
            }
            if (endIdx > startIdx)
            {
              int serverTankHeight = response.substring(startIdx, endIdx).toInt();
              if (serverTankHeight >= 2 && serverTankHeight <= 400 && serverTankHeight != TANK_HEIGHT)
              {
                TANK_HEIGHT = serverTankHeight;
                preferences.begin("wifi", false);
                preferences.putInt("tank_height", TANK_HEIGHT);
                preferences.end();
                Serial.println("[CALIBRATION] Calibrated tank height updated to: " + String(TANK_HEIGHT) + " cm");
              }
            }
          }
        }
        else
        {
          Serial.print("Error code in POST request: ");
          Serial.println(httpResponseCode);
        }
        http.end();

        // Reset the physical-toggle flag after one successful update attempt
        // to avoid repeated POSTs caused by the same button press.
        stateChanged = false;
      }
      else
      {
        Serial.println("Failed to initiate HTTP/HTTPS connection!");
      }
    }
    else
    {
      Serial.println("WiFi Disconnected!");
    }
  }

  // Small delay before next loop iteration
  delay(100);
}
