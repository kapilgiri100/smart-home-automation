# Water Level Pump Hysteresis Fix - Task List

## Problem
Water level fluctuations near 20% and 80% thresholds cause the pump to rapidly toggle ON/OFF.

## Solution: State-Aware Hysteresis
Instead of checking `waterLevel < 20` or `waterLevel >= 80` on every loop iteration (which causes rapid toggling when readings fluctuate), we use **state-aware logic**:
- If pump is **OFF**: Turn **ON** only when water level ≤ **20%**
- If pump is **ON**: Turn **OFF** only when water level ≥ **80%**
- This creates natural hysteresis: once ON, stays ON until full; once OFF, stays OFF until critically low.

## Implementation Steps - ALL COMPLETED ✅

### Step 1: esp32/main.ino - ESP32 Firmware
- [x] Modify local water pump control logic to use state-aware hysteresis

### Step 2: backend/server.js - REST API Endpoint (POST /api/device/update)
- [x] Modify water level processing to use state-aware hysteresis

### Step 3: backend/server.js - Socket.IO Handler (device-sensor-update event)
- [x] Modify water level processing to use state-aware hysteresis

### Step 4: frontend/src/pages/Dashboard.jsx - Simulator
- [x] Modify `handleSimWaterLevelChange` function to use state-aware hysteresis for optimistic UI updates

