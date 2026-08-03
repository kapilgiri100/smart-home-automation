# Smart Home Automation - Task List

## ✅ COMPLETED: Fix Flame Sensor Sunlight False-Positive + Buzzer Stutter (Analog + Flicker Filter + Latching)

### Problem
1. **Sunlight false-positive:** The IR flame sensor (GPIO 35) detected sunlight as fire. A single
   digital read cannot distinguish sunlight (constant IR) from a real flame (flickering IR), so the
   system triggered false fire alarms whenever sunlight hit the sensor.
2. **Buzzer ring-break-ring stutter:** The first flicker filter used a short 1.5s hold timer. Real
   flames have momentary flicker lulls / brief AO saturation, so the fire state dropped and the
   buzzer cut out mid-fire ("ring → break → ring").
3. **Missed fires (v2):** A fixed high-level count + transition-count threshold missed fires when
   the AO signal saturated or swung only a small amount.

### Solution
- Read the flame sensor's **ANALOG output (AO)** on GPIO 35 (ADC1_CH7).
- **v3 (polarity-independent mean-band + flicker ratio):** FIRE is confirmed when the mean IR is
  within an operating band (works with sensors whose AO RISES or FALLS with IR) AND the signal
  flickers (absolute peak-to-peak variation ≥ 25 OR relative flicker ratio `PP*1000/mean` ≥ 25).
  Real flames flicker at ~1-10 Hz; steady sunlight does not.
- **Latching (keeps buzzer ON during fire, OFF when no fire):** Once confirmed, `fireDetected`
  LATCHES ON so the buzzer/fire pump stay active continuously through the whole fire (no ring-break-ring).
  It clears after 1 no-flame window (`FLAME_CLEAR_WINDOWS = 1`, ~0.9s), so the buzzer turns OFF
  promptly once the fire is gone. `FLAME_IR_MEAN_MAX` widened to 4090 so a close/bright flame that
  saturates AO still qualifies via flicker.

### Why v3?
- v1 (single digital read) → false positives on sunlight.
- v2 (fixed high-level count + transition count, high thresholds) → MISSED real fires when the
  sensor saturates on a close/bright flame or when the AO output swings only a small amount.
- v3 uses a mean "band" (polarity-independent) + low peak-to-peak threshold + relative flicker
  ratio, catching real flames reliably while still rejecting steady sunlight.
- Latching avoids momentary-drop buzzer stutter (continuous alarm until fire truly cleared).

### Implementation Steps - ALL COMPLETED ✅

#### Step 1: esp32/main.ino - Firmware
- [x] Header comments updated to document AO wiring (ADC1_CH7) and latching behavior
- [x] Added flame filter constants (mean min/max band, peak-to-peak threshold, relative flicker ratio, window, clear windows)
- [x] Added flame filter state variables (ring buffer, timestamps, `flameClearWindowCount`, `fireDetected` latch)
- [x] Added non-blocking `sampleFlameFlicker()` function (called every loop)
- [x] v3 algorithm: computes mean IR (band check) + peak-to-peak + relative flicker ratio over sliding window
- [x] Replaced naive `digitalRead(PIN_FLAME)` with flicker-confirmed detection
- [x] Replaced 1.5s hold timer with consecutive-clear latching (`FLAME_CLEAR_WINDOWS = 5`)
- [x] setup() documents GPIO 35 as ADC input
- [x] Serial debug output on fire confirm / fire clear / periodic tuning stats

#### Step 2: frontend/src/pages/Settings.jsx - Documentation
- [x] Fire/Flame sensor card description mentions analog AO + mean/peak-to-peak flicker filtering + latched alarm (~4.5s)
- [x] Pinout table row updated to "Flame Sensor (AO, Analog)" / ADC1_CH7 / flicker-filtered

#### Step 3: wiring-diagram.html - Documentation
- [x] SVG sensor label updated: Flame Sensor (AO) → D35 (ADC1_CH7)
- [x] Pinout table row updated to Analog / ADC1_CH7 / mean + peak-to-peak flicker filter; alarm latches ~4.5s
- [x] Added hardware note: connect flame sensor AO pin to GPIO 35 (move wire from DO to AO)

### Verification
- [x] Backend unchanged; no server.js edits required
- [x] Frontend `npx vite build` PASSED
- [x] Backend `node --check server.js` PASSED
- [x] main.ino manually reviewed for syntax (arduino-cli not available)
- [x] No stale references to removed flame variables (flameHighCount / flameTransitions / FLAME_HIGH_THRESHOLD / FLAME_CONFIRM_MS / lastFlameConfirmTime)

### ⚠️ Hardware Note
Connect the flame sensor's **AO (Analog Output)** pin to **GPIO 35** (DO is no longer used).
For tuning, watch the Serial monitor: `[FLAME DEBUG] raw_mean=... pp=... ratio=... fire=...`.
- If real fires are still missed: lower `FLAME_IR_MEAN_MIN` / `FLAME_FLICKER_PP_THRESHOLD` / `FLAME_FLICKER_RATIO_X1000`.
- If sunlight still causes false positives: raise `FLAME_FLICKER_PP_THRESHOLD` / `FLAME_FLICKER_RATIO_X1000`.

---
## ✅ COMPLETED: Dashboard UI - Separate Manual & Automated Appliances

### Problem
All appliances were displayed in a single grid, mixing manual and automated appliances together.

### Solution
Split the appliances section into two distinct blocks:
- **Manual Appliances** (Light Bulb 1, 2, 3, 4) - user-controlled, clickable
- **Automated Appliances** (Overhead Fill Pump, Fire Extinguisher Pump) - system-controlled with "Auto" badges

### Implementation Steps - ALL COMPLETED ✅

#### Step 1: frontend/src/pages/Dashboard.jsx
- [x] Replaced the single appliances grid with two separate blocks
- [x] Manual Appliances block (4 light bulbs) in 2x2 grid - blue theme
- [x] Automated Appliances block (2 pumps) in 2x2 grid with "Auto" badges - amber theme
- [x] Added Light Bulb 3 (bulb3) & Light Bulb 4 (bulb4) to state
- [x] Added bulb3/bulb4 to simPhysicalSwitches
- [x] Added bulb3/bulb4 icons in getApplianceIcon
- [x] Header updated to "Monitoring 8 active sensors and 6 controllers."
- [x] Manual section subtitle: "Four light bulb switch control system"
- [x] All toggle, rename, and real-time sync functionality preserved

#### Step 2: backend/server.js
- [x] Added bulb3/bulb4 to DB seed defaults
- [x] Secondary-table pump-status sync added to `/api/device/update` handler (tv→waterTank.pumpStatus, socket→sensors.firePumpStatus)
- [x] Secondary-table pump-status sync added to Socket.IO `device-sensor-update` handler
- [x] Syntax check passed (node --check)

#### Step 3: esp32/main.ino - ESP32 Firmware
- [x] Added RELAY_BULB3 (GPIO 32) & RELAY_BULB4 (GPIO 33) for light bulb control
- [x] Added SWITCH_BULB3 (GPIO 16) & SWITCH_BULB4 (GPIO 17) physical switches
- [x] JSON payload + response parsing include bulb3/bulb4
- [x] Fire-pump manual control restored (no longer force-off each loop)
- [x] Pump state sync across secondary tables
- [x] `getWaterLevelPercentage()` returns -1 on echo timeout
- [x] Pump logic skips auto-fill on -1 and force-turns fill pump OFF on sensor failure (overflow safety)
- [x] waterLevel sent as 50 instead of -1 on failure
- [x] Header comments/pin docs corrected (pumps are D21/D22)

#### Step 4: frontend/src/pages/Settings.jsx
- [x] Pinout table corrected to match firmware
- [x] Added GPIO 16/17 switch rows for Light Bulb 3 & 4

#### Step 5: wiring-diagram.html
- [x] Created (SVG ESP32 diagram, pinout table, power/relay notes, AC-safety warning)
- [x] Updated D16/D17 switch pins in board diagram
- [x] Added GPIO 16/17 rows to pinout table

#### Step 6: Active-Low Buzzer & Warning LED Relay Consistency
- [x] esp32/main.ino — Buzzer (GPIO 27) & LED (GPIO 14) driven active-low via relay module (LOW = relay energized = ON)
- [x] esp32/main.ino — setup() initializes both relays OFF (HIGH)
- [x] esp32/main.ino — factory-reset warning blinks, connect double-blink, auto-heal blinks, and config-mode LED pulse all active-low
- [x] esp32/main.ino — loop() safety action sets buzzer/LED LOW on alarm, HIGH when clear
- [x] Settings.jsx — Buzzer/LED pinout rows updated to "Active Low" modes
- [x] wiring-diagram.html — Buzzer/LED rows + SVG labels + power note updated for active-low relay operation

### Verification
- [x] Frontend `npx vite build` PASSED (1725 modules, built in ~4.4s)
- [x] Backend `node --check server.js` PASSED
- [x] Dashboard header verified ("Monitoring 8 active sensors and 6 controllers.")
- [x] Manual/Automated split verified in Dashboard.jsx
- [x] bulb3/bulb4 verified in all layers (UI, backend seed, firmware)
- [x] All PIN_LED/PIN_BUZZER references in main.ino verified consistent with active-low relay logic

### ⚠️ Notes
- ESP32 firmware changes were NOT compile-verified with arduino-cli (not available). Review main.ino before flashing.

