# Flame Detection System - End-to-End Integration

## Hardware Signal Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    FLAME SENSOR (AO)                        │
│                      GPIO 35 (ADC1_CH7)                      │
│                    Reads: 0-4095 ADC Value                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              ANALOG FLICKER FILTER (v3)                      │
│  - Samples AO every 30ms into 30-sample sliding window      │
│  - Calculates: Mean IR, Peak-to-Peak, Flicker Ratio         │
│  - Confirms FIRE when BOTH:                                 │
│    ✓ Mean in band (40-4090)                                 │
│    ✓ Flicker detected (PP≥25 OR Ratio≥25/1000)             │
│  - Latches ON, clears after 1 no-flame window (~0.9s)      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
    ┌──────────────┐         ┌──────────────┐
    │  BUZZER      │         │  WARNING LED │
    │  GPIO 27     │         │  GPIO 14     │
    │  Relay ON    │         │  Relay ON    │
    │  (active-low)│         │  (active-low)│
    └──────────────┘         └──────────────┘
            │
            ▼
    ┌──────────────────┐
    │  FIRE PUMP       │
    │  GPIO 22         │
    │  Relay ON        │
    │  (active-low)    │
    └──────────────────┘
            │
            ▼
    Water spray to extinguish
```

## Software Data Flow

```
ESP32 Main Loop (every 100ms)
│
├─► sampleFlameFlicker()  ┐
│   - Takes 1 analog read  │
│   - Stores in ring buffer│
│   - Every 30 samples:    │
│     * Analyze statistics │
│     * Confirm fire?      │
│     * Update fireDetected│
│   - Debug output every 5s│
│                          │
├─► Check Local Sensors:   │
│   fireActive = fireDetected (local)
│   
├─► Hardware Response:     ┐
│   if (fireActive || gasActive) │
│   │  digitalWrite(PIN_BUZZER, LOW)
│   │  digitalWrite(PIN_LED, LOW)
│   else
│      digitalWrite(PIN_BUZZER, HIGH)
│      digitalWrite(PIN_LED, HIGH)
│   
│   if (fireDetected || serverFirePumpStatus)
│      digitalWrite(RELAY_FIRE_PUMP, LOW)   # PUMP ON
│   else
│      digitalWrite(RELAY_FIRE_PUMP, HIGH)  # PUMP OFF
│
├─► Send to Backend (every 1.5s or on change)
│   {
│     "fireStatus": fireDetected,
│     "gasStatus": gasLeakage,
│     "waterLevel": percentage,
│     "appliancesState": { ... }
│   }
│
└─► Receive Server Response & Apply:
    - Update fireAvail (sensor enabled/disabled)
    - Update serverFirePumpStatus (remote pump override)
    - Sync appliance states (light, fan, etc.)
```

## Backend Integration Points

### /api/device/update (POST)
**ESP32 sends:**
```json
{
  "fireStatus": true,          // Current flame detection (local)
  "gasStatus": false,
  "waterLevel": 45,
  "isPhysicalToggle": false,
  "appliancesState": {
    "socket": true             // Fire pump ON (relayed as "socket")
  }
}
```

**Backend responds with:**
```json
{
  "fire": false,               // Server-side fire simulation (for info only)
  "fireAvail": true,           // Can disable sensor from dashboard
  "firePump": true,            // Remote fire pump override
  "light": false,
  "fan": false,
  "bulb3": false,
  "bulb4": false,
  "pump": false,
  "tv": false,
  "socket": true               // Fire pump state echo
}
```

## Dashboard Interaction

### User Can:
1. **View** flame detection status in real-time
2. **Enable/Disable** flame sensor from dashboard (fireAvail flag)
3. **Manually trigger** fire pump remotely (firePump override)
4. **View** fire alarm logs and history

### Data Flow:
Dashboard (Frontend)
   ↓
Backend API
   ↓
Database (stores fire events, logs)
   ↓
ESP32 (reads response, applies remote overrides)

## Integration with Other Systems

### Fire Detection → Water Pump Auto-Fill
- If flame detected: buzzer/LED activate immediately
- Fire pump activates to suppress fire
- Water level monitored to ensure fill happens
- If water low during fire: auto-fill pump activates in parallel

### Fire Detection → Gas Sensor
- Both use same buzzer/LED response
- Either sensor can trigger alarm independently
- Both sent to backend in single update payload
- Backend can disable either sensor individually

### Fire Detection → Physical Switches
- Physical light switches ONLY control lights
- Fire pump is AUTONOMOUS (automatic only)
- Cannot be manually controlled via switch
- Can only be turned off if:
  - Local flame sensor clears, AND
  - No remote override from server, AND
  - Server-sent disable flag received

## Safety Features

### ✅ Local Autonomy (No WiFi Dependency)
- Fire detection works even if WiFi is down
- Buzzer rings and pump runs immediately
- No waiting for network response

### ✅ Server Can't Disable Emergency Response
- Physical buzzer ONLY responds to local sensors
- Server `serverFireStatus` is informational only
- Even stale/simulated web fire won't activate pump

### ✅ Dual Override System
- Fire pump activates if:
  - `(fireDetected)` [local] OR `(serverFirePumpStatus)` [remote override]
- Prevents single-point failure
- Remote override used for testing/simulation

### ✅ Latching & Hysteresis
- Fire latches ON when flicker confirmed
- Stays ON for duration of fire
- Clears after 1 window of no flicker (~0.9s)
- Prevents ring-break-ring buzzer stuttering

## Troubleshooting Checklist

- [ ] Flame sensor GPIO 35 connected
- [ ] Sensor has power (VCC)
- [ ] Serial Monitor shows raw ADC values (0-4095)
- [ ] Mean IR level responds to flame
- [ ] Peak-to-peak shows flicker
- [ ] Buzzer/LED relay pins (27, 14) functional
- [ ] Fire pump relay pin 22 functional
- [ ] WiFi connection stable for backend sync
- [ ] Backend receiving fireStatus updates
- [ ] Dashboard showing fire state in real-time
