# TODO.md - Physical Switch Fix

## Task
Physical switches should only control the four light bulbs, NOT the automated pumps.

## Plan - ALL COMPLETED ✅

### Step 1: esp32/main.ino - Firmware
- [x] Removed `SWITCH_TV` (GPIO 12) & `SWITCH_SOCKET` (GPIO 13) debounced switch handlers so they no longer toggle the water/fire pumps
- [x] Removed `SWITCH_TV`/`SWITCH_SOCKET` pin defines
- [x] Removed `pinMode` for GPIO 12/13 in setup()
- [x] Removed `switchTv`/`switchSocket` reads in loop()
- [x] Removed unused debug last-state variables for TV/Socket
- [x] Removed unused debounce timestamps and pressed flags for TV/Socket
- [x] Updated header comment: only 4 physical switches control the 4 light bulbs
- [x] Added inline comment noting pumps are fully automated

### Step 2: frontend/src/pages/Settings.jsx - Documentation
- [x] Removed "Physical Switch 3 — Fill Pump" (GPIO 12) and "Physical Switch 4 — Fire Pump" (GPIO 13) rows
- [x] Renumbered switches to 4 (Light Bulb 3 = GPIO 16, Light Bulb 4 = GPIO 17)

### Step 3: wiring-diagram.html - Documentation
- [x] SVG switch box updated to "4× PHYSICAL SWITCHES" with only the 4 light-bulb switches
- [x] Added note "Pumps are AUTOMATED (no switch)"
- [x] Pinout table updated: removed pump switch rows, renumbered to 4 switches
- [x] Added GPIO 12/13 "Not used (pump is automated)" rows

### Verification
- [x] Frontend `npx vite build` PASSED (1725 modules, built in ~5.79s)
- [x] Backend `node --check server.js` PASSED
- [x] main.ino manually reviewed - no leftover references to removed switch variables
- [x] Buzzer/fire-pump/water-pump automated logic preserved (water level, fire detection, web dashboard)

### ⚠️ Notes
- ESP32 firmware changes were NOT compile-verified with arduino-cli (not available). Review main.ino before flashing.
- The Overhead Fill Pump (D21) and Fire Extinguisher Pump (D22) remain fully automated: controlled by water level (20%/80% hysteresis), fire detection, and web dashboard/remote overrides.
