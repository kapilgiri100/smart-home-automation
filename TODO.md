# TODO.md - Physical Switch & Buzzer Fix

## Task 4: Fix Physical Switches 3 & 4 (GPIO 16/17 -> 13/23)

### Root Cause
Physical switches 3 & 4 were wired to GPIO 16 and GPIO 17. On ESP32-WROVER
(PSRAM) modules, GPIO 16/17 are hard-wired to the PSRAM chip and cannot be
used as GPIO — so switches 1 & 2 (GPIO 4/5) worked but switches 3 & 4 did not.

### Fix
- [x] `esp32/main.ino`: Remapped `SWITCH_BULB3` to GPIO 13 and `SWITCH_BULB4` to GPIO 23
- [x] `frontend/src/pages/Settings.jsx`: Updated pinout table (GPIO 13 / GPIO 23)
- [x] `wiring-diagram.html`: Updated SVG + pinout table to GPIO 13 / GPIO 23
- [x] Updated header comment to document why GPIO 16/17 are not used

### WIRING INSTRUCTION (physical)
- Switch 3: one leg to GPIO 13, other leg to GND (internal pullup)
- Switch 4: one leg to GPIO 23, other leg to GND (internal pullup)
- Relays 3/4 remain on GPIO 32 / GPIO 33 (active-low)

### Verification
- [ ] Rebuild & flash `esp32/main.ino`
- [ ] Confirm switches 3 & 4 now toggle Light Bulb 3 & 4 and sync to dashboard

---

## Task 1: Physical switches only control the four light bulbs
## Task 2: Buzzer rings only while flame/gas is detected locally

## Plan - ALL COMPLETED ✅

### Task 1: esp32/main.ino - Physical Switch Fix
- [x] Removed `SWITCH_TV` (GPIO 12) & `SWITCH_SOCKET` (GPIO 13) debounced switch handlers so they no longer toggle the water/fire pumps
- [x] Removed `SWITCH_TV`/`SWITCH_SOCKET` pin defines, `pinMode` calls, and `digitalRead` calls
- [x] Removed unused TV/Socket last-state variables, debounce timestamps, and pressed flags
- [x] Updated header comment: only 4 physical switches control the 4 light bulbs
- [x] Updated documentation (Settings.jsx, wiring-diagram.html)

### Task 2: esp32/main.ino - Buzzer Fix (rings only while hazard detected)
- [x] **ROOT CAUSE**: Buzzer was driven by `serverFireStatus`/`serverGasStatus` — server-latched flags echoed from the backend (possibly held TRUE by the web simulator or stale DB state) kept the buzzer ringing long after the flame cleared.
- [x] Changed `fireActive` to `fireAvail && fireDetected` (LOCAL flame sensor only)
- [x] Changed `gasActive` to `gasAvail && gasLeakage` (LOCAL gas sensor only)
- [x] Fire pump now triggers on `fireDetected || serverFirePumpStatus` (removed reliance on latched `serverFireStatus`)
- [x] Documented that `serverFireStatus`/`serverGasStatus` are now informational only
- [x] Buzzer/LED turn OFF as soon as the local hazard clears (fireDetected clears in ~1s; gas clears when reading drops below threshold)

### Verification
- [x] Backend `node --check server.js` PASSED
- [x] main.ino manually reviewed - no leftover references to removed switch variables
- [x] Buzzer logic now responds only to local sensors (on when detected, off when cleared)

### ⚠️ Notes
- ESP32 firmware changes were NOT compile-verified with arduino-cli (not available). Review main.ino before flashing.
- The buzzer now turns ON only when the physical flame/gas sensor detects a hazard, and turns OFF immediately when the hazard clears. Server-simulated fire/gas no longer ring the physical buzzer.

---

# Task 3: Tank-Full Safety Guard (Overhead Fill Pump)

## Goal
The Overhead Fill Pump must NOT be able to turn ON (manually or automatically) when the water tank is at or above 80% (full). The tank is considered FULL and the pump stays OFF.

## Plan
- [x] Add `FILL_PUMP_SHUTOFF_LEVEL = 80` constant in `backend/server.js`
- [x] Add shared tank-fill guard for the fill pump (`tv`) in `backend/server.js`
- [x] Apply guard in `socket.on("toggle-appliance")` (manual dashboard ON)
- [x] Apply guard in `app.put("/api/appliances/:id")` (generic REST ON)
- [x] Apply guard in `app.post("/api/device/update")` (physical-toggle path)
- [x] Apply guard in `socket.on("device-sensor-update")` (simulator physical-toggle path)
- [x] Apply guard in `checkSchedules()` (scheduled ON)
- [x] Frontend `Dashboard.jsx`: block manual ON at tank >= 80%, show "Tank Full" notice & disable pump card
- [x] ESP32 `main.ino`: local guard never energizes fill pump when local tank >= 80%

## Verification
- [ ] Backend `node --check server.js` PASSED
- [ ] Frontend builds successfully
- [ ] Manual review of Dashboard.jsx and main.ino
