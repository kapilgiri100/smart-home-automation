# ESP32 OFFLINE SCHEDULE EXECUTION - Integration Guide

## Overview
The ESP32 can now execute schedules **even when offline** by storing schedules locally and using the device's internal clock.

## How It Works

### Online (WiFi Connected):
1. Backend checks schedules every 60 seconds
2. Backend sends commands to ESP32 via HTTP POST
3. Backend also syncs all schedules to ESP32's local storage
4. ESP32 stores schedules in EEPROM for offline use

### Offline (No WiFi):
1. ESP32 reads stored schedules from EEPROM
2. Checks time against stored schedules every minute
3. Executes scheduled actions automatically
4. Syncs with backend again when WiFi reconnects

---

## Integration Steps

### Step 1: Add the Schedule Manager Include
At the top of your main.ino, add:

```cpp
#include "schedule_manager.ino"  // Add this with other includes
```

Or copy the entire `schedule_manager.ino` content into main.ino before the `setup()` function.

---

### Step 2: Initialize Schedules in setup()
In your `setup()` function, after WiFi connection setup:

```cpp
void setup() {
  Serial.begin(115200);
  
  // ... existing relay and sensor initialization ...
  
  // Load any stored schedules from EEPROM
  loadLocalSchedulesFromEEPROM();
  
  // ... rest of setup ...
}
```

---

### Step 3: Call Schedule Execution in loop()
In your `loop()` function, after reading sensors:

```cpp
void loop() {
  // ... existing WiFi config mode check ...
  
  // ... existing switch reading ...
  
  // ... existing sensor reading ...
  
  // Execute any local schedules (works offline!)
  executeLocalSchedules();
  
  // ... rest of loop ...
}
```

---

### Step 4: Sync Schedules When WiFi Connects
After successful WiFi connection, add:

```cpp
// In your connection-success section
if (WiFi.status() == WL_CONNECTED) {
  // ... existing connection actions ...
  
  // Sync all schedules from backend
  static unsigned long lastSyncTime = 0;
  if (millis() - lastSyncTime > 300000) {  // Sync every 5 minutes
    lastSyncTime = millis();
    syncSchedulesFromBackend();
  }
}
```

---

### Step 5: Optional - Serial Commands to Manage Schedules
You can add debug commands to test schedules:

```cpp
// In your Serial event handler or loop
if (Serial.available()) {
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  
  if (cmd == "show_schedules") {
    displayLocalSchedules();
  }
  else if (cmd == "clear_schedules") {
    clearAllLocalSchedules();
  }
  else if (cmd.startsWith("add_schedule:")) {
    // Format: add_schedule:light|ON|08:00|1
    String params = cmd.substring(13);
    // Parse and add...
  }
}
```

---

## Testing

### Test 1: Online Mode
1. ESP32 connects to WiFi
2. Create a schedule in the dashboard
3. Check Serial Monitor: `[SYNC] Synced 1 schedules from backend`
4. Run `displayLocalSchedules()` → Shows schedule stored locally

### Test 2: Offline Mode
1. Schedule set for 08:00 ON "Light Bulb 1"
2. Disconnect WiFi (unplug router or use WiFi toggle)
3. Wait until 08:00
4. Light automatically turns ON ✓
5. Serial shows: `⏰ SCHEDULE EXECUTED (OFFLINE MODE) ⏰`

### Test 3: Offline then Online
1. Execute schedule while offline
2. Reconnect to WiFi
3. Backend receives the state change
4. Dashboard shows appliance state updated

---

## Features

### ✅ Local Storage
- Stores up to 16 schedules in EEPROM
- Persists across power loss
- Lightweight (448 bytes total)

### ✅ Offline Execution
- Executes schedules based on device time
- No internet connection needed
- Works immediately after boot

### ✅ Duplicate Prevention
- Tracks `lastExecuted` timestamp
- Prevents running same schedule multiple times in one minute
- Checks `timeSinceLastExec >= 60`

### ✅ Backend Sync
- Automatically syncs all schedules when WiFi connects
- Updates local storage with latest from backend
- Syncs every 5 minutes to stay in sync

### ✅ Logging
- Serial Monitor shows all executions
- Displays `[SCHEDULE]` tags for easy filtering
- Shows which appliance and what action

---

## Serial Monitor Output Examples

### Schedule Stored:
```
[SCHEDULE] Loaded: light ON at 08:00
[SCHEDULE] Loaded 1 schedules from EEPROM
```

### Schedule Synced from Backend:
```
[SYNC] Synced 2 schedules from backend
📋 LOCAL SCHEDULES (OFFLINE MODE)
  [1] light → ON at 08:00 | Status: ✓ ON
  [2] fan → OFF at 22:00 | Status: ✓ ON
```

### Schedule Executed (Offline):
```
⏰ SCHEDULE EXECUTED (OFFLINE MODE) ⏰
  Device: light | Action: ON | Time: 08:00
```

---

## Troubleshooting

### Schedules not syncing from backend
- Check WiFi connection is stable
- Verify backend server is running
- Check URL in preferences is correct

### Schedules not executing offline
- Verify schedule is enabled (isActive = true)
- Check ESP32 system time is correct
- Confirm schedule is stored: run `displayLocalSchedules()`
- Check Serial Monitor for execution messages

### Schedule runs multiple times
- Should not happen - `lastExecuted` prevents this
- If it does, check system time isn't jumping backwards

### EEPROM full
- Maximum 16 schedules per ESP32
- Delete unused schedules from backend
- Sync again to update EEPROM

---

## API Reference

```cpp
// Load schedules from EEPROM
void loadLocalSchedulesFromEEPROM();

// Save current schedules to EEPROM
void saveLocalSchedulesToEEPROM();

// Add a new schedule to local storage
void addLocalSchedule(const char* applianceId, 
                      const char* action, 
                      const char* time, 
                      boolean isActive);

// Execute any schedules that match current time
void executeLocalSchedules();

// Display all stored schedules on Serial
void displayLocalSchedules();

// Clear all schedules from EEPROM
void clearAllLocalSchedules();

// Fetch schedules from backend and store locally
void syncSchedulesFromBackend();
```

---

## Example: Complete Setup

```cpp
#include <WiFi.h>
#include "schedule_manager.ino"  // Add this

void setup() {
  Serial.begin(115200);
  
  // Initialize pins...
  pinMode(RELAY_LIGHT, OUTPUT);
  // ... other pins ...
  
  // Load stored schedules
  loadLocalSchedulesFromEEPROM();
  
  // Connect WiFi...
  connectWiFi();
  
  Serial.println("System ready - schedules will execute offline!");
}

void loop() {
  // ... WiFi checks ...
  
  // ... Read sensors ...
  
  // Execute schedules (offline-capable)
  executeLocalSchedules();
  
  // ... Send updates to backend ...
  
  // Sync schedules periodically
  static unsigned long lastSync = 0;
  if (WiFi.status() == WL_CONNECTED && millis() - lastSync > 300000) {
    lastSync = millis();
    syncSchedulesFromBackend();
  }
}
```

---

## Limitations & Notes

- **Time Accuracy**: Schedules execute based on ESP32's internal clock
  - Drifts ~1-2 minutes per day (ESP32 RTC not crystal-accurate)
  - Syncs with backend NTP when connected
  - Use stable WiFi for better time accuracy

- **Timezone Handling**: 
  - Stored schedules use timezone from backend
  - Offline execution assumes stored time is in your local timezone
  - Verify timezone is set correctly on ESP32

- **Maximum Schedules**: 16 per device (EEPROM constraint)
  - Can be increased if you have external PSRAM
  - Most use cases need only 2-4 schedules

- **Sync Frequency**: Every 5 minutes when online
  - Prevents too many HTTP requests
  - Keeps local storage in sync with backend
  - Configurable in your loop()

