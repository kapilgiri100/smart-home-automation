/**
 * ESP32 LOCAL SCHEDULE MANAGER
 * Stores & executes schedules offline using device's internal clock
 * Syncs with backend when online
 *
 * Features:
 * - Store up to 16 local schedules in EEPROM
 * - Execute schedules based on device time (works offline)
 * - Sync schedules from backend when WiFi connects
 * - Prevent duplicate execution in same minute
 */

#include <Preferences.h>
#include <time.h>

// Schedule structure: 28 bytes per schedule (can store 16 in 448 bytes)
struct LocalSchedule
{
    char applianceId[16]; // "light", "fan", "bulb3", "bulb4", "tv", "socket"
    char action[4];       // "ON" or "OFF"
    char time[6];         // "HH:MM" format
    boolean isActive;     // true = enabled, false = disabled
    time_t lastExecuted;  // Unix timestamp of last execution (prevent duplicates)
};

#define MAX_LOCAL_SCHEDULES 16
LocalSchedule localSchedules[MAX_LOCAL_SCHEDULES];
int numLocalSchedules = 0;

// Preferences object for persistent EEPROM storage
Preferences prefs;

// ============================================================
// LOAD SCHEDULES FROM EEPROM
// ============================================================
void loadLocalSchedulesFromEEPROM()
{
    prefs.begin("schedules", true); // Read-only mode

    numLocalSchedules = prefs.getInt("count", 0);

    for (int i = 0; i < numLocalSchedules && i < MAX_LOCAL_SCHEDULES; i++)
    {
        String key = "sched_" + String(i);
        String data = prefs.getString(key.c_str(), "");

        if (data.length() > 0)
        {
            // Parse stored schedule (format: "applianceId|action|time|isActive")
            int pos1 = data.indexOf('|');
            int pos2 = data.indexOf('|', pos1 + 1);
            int pos3 = data.indexOf('|', pos2 + 1);

            if (pos1 > 0 && pos2 > 0 && pos3 > 0)
            {
                data.substring(0, pos1).toCharArray(localSchedules[i].applianceId, 16);
                data.substring(pos1 + 1, pos2).toCharArray(localSchedules[i].action, 4);
                data.substring(pos2 + 1, pos3).toCharArray(localSchedules[i].time, 6);
                localSchedules[i].isActive = data.substring(pos3 + 1) == "1";
                localSchedules[i].lastExecuted = 0;

                Serial.print("[SCHEDULE] Loaded: ");
                Serial.print(localSchedules[i].applianceId);
                Serial.print(" ");
                Serial.print(localSchedules[i].action);
                Serial.print(" at ");
                Serial.println(localSchedules[i].time);
            }
        }
    }

    prefs.end();
    Serial.println("[SCHEDULE] Loaded " + String(numLocalSchedules) + " schedules from EEPROM");
}

// ============================================================
// SAVE SCHEDULES TO EEPROM
// ============================================================
void saveLocalSchedulesToEEPROM()
{
    prefs.begin("schedules", false); // Write mode

    prefs.putInt("count", numLocalSchedules);

    for (int i = 0; i < numLocalSchedules && i < MAX_LOCAL_SCHEDULES; i++)
    {
        String key = "sched_" + String(i);
        String data = String(localSchedules[i].applianceId) + "|" +
                      String(localSchedules[i].action) + "|" +
                      String(localSchedules[i].time) + "|" +
                      (localSchedules[i].isActive ? "1" : "0");

        prefs.putString(key.c_str(), data.c_str());
    }

    prefs.end();
    Serial.println("[SCHEDULE] Saved " + String(numLocalSchedules) + " schedules to EEPROM");
}

// ============================================================
// ADD LOCAL SCHEDULE
// ============================================================
void addLocalSchedule(const char *applianceId, const char *action, const char *time, boolean isActive)
{
    if (numLocalSchedules >= MAX_LOCAL_SCHEDULES)
    {
        Serial.println("[ERROR] Maximum schedules reached");
        return;
    }

    strcpy(localSchedules[numLocalSchedules].applianceId, applianceId);
    strcpy(localSchedules[numLocalSchedules].action, action);
    strcpy(localSchedules[numLocalSchedules].time, time);
    localSchedules[numLocalSchedules].isActive = isActive;
    localSchedules[numLocalSchedules].lastExecuted = 0;

    numLocalSchedules++;
    saveLocalSchedulesToEEPROM();

    Serial.println("[SCHEDULE] Added new schedule: " + String(applianceId) + " " + String(action) + " at " + String(time));
}

// ============================================================
// CLEAR ALL SCHEDULES
// ============================================================
void clearAllLocalSchedules()
{
    numLocalSchedules = 0;
    prefs.begin("schedules", false);
    prefs.clear();
    prefs.end();
    Serial.println("[SCHEDULE] Cleared all schedules from EEPROM");
}

// ============================================================
// EXECUTE LOCAL SCHEDULES (called every minute from main loop)
// ============================================================
void executeLocalSchedules()
{
    time_t now = time(nullptr);
    struct tm *timeinfo = localtime(&now);

    char currentTime[6];
    snprintf(currentTime, 6, "%02d:%02d", timeinfo->tm_hour, timeinfo->tm_min);

    // Every minute, check if any schedules should run
    static char lastCheckedMinute[6] = "";

    if (strcmp(currentTime, lastCheckedMinute) != 0)
    {
        // New minute - check schedules
        strcpy(lastCheckedMinute, currentTime);

        for (int i = 0; i < numLocalSchedules; i++)
        {
            if (!localSchedules[i].isActive)
                continue;

            // Check if time matches
            if (strcmp(currentTime, localSchedules[i].time) == 0)
            {
                // Check if already executed (within last 60 seconds)
                time_t timeSinceLastExec = now - localSchedules[i].lastExecuted;

                if (timeSinceLastExec >= 60)
                {
                    // Execute the schedule
                    boolean targetStatus = (strcmp(localSchedules[i].action, "ON") == 0);

                    Serial.println();
                    Serial.println("╔═══════════════════════════════════════════╗");
                    Serial.println("║  ⏰ SCHEDULE EXECUTED (OFFLINE MODE) ⏰   ║");
                    Serial.println("╚═══════════════════════════════════════════╝");
                    Serial.print("  Device: ");
                    Serial.print(localSchedules[i].applianceId);
                    Serial.print(" | Action: ");
                    Serial.print(localSchedules[i].action);
                    Serial.print(" | Time: ");
                    Serial.println(currentTime);

                    // Execute the action based on appliance ID
                    if (strcmp(localSchedules[i].applianceId, "light") == 0)
                    {
                        lightState = targetStatus;
                        digitalWrite(RELAY_LIGHT, targetStatus ? LOW : HIGH);
                        stateChanged = true;
                    }
                    else if (strcmp(localSchedules[i].applianceId, "fan") == 0)
                    {
                        fanState = targetStatus;
                        digitalWrite(RELAY_FAN, targetStatus ? LOW : HIGH);
                        stateChanged = true;
                    }
                    else if (strcmp(localSchedules[i].applianceId, "bulb3") == 0)
                    {
                        bulb3State = targetStatus;
                        digitalWrite(RELAY_BULB3, targetStatus ? LOW : HIGH);
                        stateChanged = true;
                    }
                    else if (strcmp(localSchedules[i].applianceId, "bulb4") == 0)
                    {
                        bulb4State = targetStatus;
                        digitalWrite(RELAY_BULB4, targetStatus ? LOW : HIGH);
                        stateChanged = true;
                    }
                    else if (strcmp(localSchedules[i].applianceId, "tv") == 0)
                    {
                        tvState = targetStatus;
                        digitalWrite(RELAY_WATER_PUMP, targetStatus ? LOW : HIGH);
                        stateChanged = true;
                    }
                    else if (strcmp(localSchedules[i].applianceId, "socket") == 0)
                    {
                        socketState = targetStatus;
                        digitalWrite(RELAY_FIRE_PUMP, targetStatus ? LOW : HIGH);
                        stateChanged = true;
                    }

                    // Update lastExecuted to prevent re-execution
                    localSchedules[i].lastExecuted = now;

                    Serial.println();
                }
            }
        }
    }
}

// ============================================================
// DISPLAY ALL LOCAL SCHEDULES (Serial Monitor)
// ============================================================
void displayLocalSchedules()
{
    Serial.println();
    Serial.println("╔═══════════════════════════════════════════╗");
    Serial.println("║     📋 LOCAL SCHEDULES (OFFLINE MODE)    ║");
    Serial.println("╚═══════════════════════════════════════════╝");

    if (numLocalSchedules == 0)
    {
        Serial.println("  ⚠️  No schedules stored on ESP32");
    }
    else
    {
        for (int i = 0; i < numLocalSchedules; i++)
        {
            Serial.print("  [");
            Serial.print(i + 1);
            Serial.print("] ");
            Serial.print(localSchedules[i].applianceId);
            Serial.print(" → ");
            Serial.print(localSchedules[i].action);
            Serial.print(" at ");
            Serial.print(localSchedules[i].time);
            Serial.print(" | Status: ");
            Serial.println(localSchedules[i].isActive ? "✓ ON" : "✗ OFF");
        }
    }
    Serial.println();
}

// ============================================================
// SYNC SCHEDULES FROM BACKEND (when online)
// Call this after successful WiFi connection
// ============================================================
void syncSchedulesFromBackend()
{
    if (WiFi.status() != WL_CONNECTED)
    {
        return;
    }

    try
    {
        HTTPClient http;
        WiFiClientSecure secureClient;
        WiFiClient normalClient;

        // Fetch schedules from backend
        String scheduleUrl = savedServerUrl;
        scheduleUrl.replace("/api/device/update", "/api/schedules");

        bool beginSuccess = false;
        if (scheduleUrl.startsWith("https://"))
        {
            secureClient.setInsecure();
            beginSuccess = http.begin(secureClient, scheduleUrl);
        }
        else
        {
            beginSuccess = http.begin(normalClient, scheduleUrl);
        }

        if (beginSuccess)
        {
            int httpResponseCode = http.GET();

            if (httpResponseCode == 200)
            {
                String response = http.getString();

                // Simple JSON parsing for schedules array
                // Expected format: [{"applianceId":"light","action":"ON","time":"08:00","isActive":true}, ...]

                clearAllLocalSchedules();

                // Very basic parsing (no external JSON library)
                int scheduleCount = 0;
                int pos = 0;
                while ((pos = response.indexOf("{\"applianceId\"", pos)) != -1)
                {
                    // Extract applianceId
                    int idStart = response.indexOf("\"", pos + 16) + 1;
                    int idEnd = response.indexOf("\"", idStart);
                    String appId = response.substring(idStart, idEnd);

                    // Extract action
                    int actStart = response.indexOf("\"action\":\"", idEnd) + 10;
                    int actEnd = response.indexOf("\"", actStart);
                    String act = response.substring(actStart, actEnd);

                    // Extract time
                    int timeStart = response.indexOf("\"time\":\"", actEnd) + 8;
                    int timeEnd = response.indexOf("\"", timeStart);
                    String t = response.substring(timeStart, timeEnd);

                    // Extract isActive
                    int activeStart = response.indexOf("\"isActive\":", timeEnd) + 11;
                    boolean active = response.substring(activeStart, activeStart + 4) == "true";

                    // Add to local storage
                    addLocalSchedule(appId.c_str(), act.c_str(), t.c_str(), active);
                    scheduleCount++;

                    pos = idEnd;
                }

                Serial.println("[SYNC] Synced " + String(scheduleCount) + " schedules from backend");
                displayLocalSchedules();
            }
            else
            {
                Serial.print("[SYNC] Backend fetch failed with code: ");
                Serial.println(httpResponseCode);
            }
            http.end();
        }
    }
    catch (Exception e)
    {
        Serial.println("[SYNC] Error syncing schedules from backend");
    }
}
