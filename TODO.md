# Dashboard UI - Separate Manual & Automated Appliances

## Problem
All appliances were displayed in a single grid, mixing manual and automated appliances together.

## Solution
- **Manual Appliances section**: Light Bulb 1, Light Bulb 2, Light Bulb 3, Light Bulb 4 (2x2 grid) — all clickable/toggleable
- **Automated Active section**: Overhead Fill Pump, Fire Extinguisher Pump with "Auto" badges — all clickable/toggleable
- **Auto badges** shown on the 2 automated pumps to identify them

## Implementation Steps

### Step 1: backend/server.js
- [x] Added Light Bulb 3 (bulb3) and Light Bulb 4 (bulb4) to DB seed defaults

### Step 2: frontend/src/pages/Dashboard.jsx
- [x] **Manual Appliances** section: Light Bulb 1, Light Bulb 2, Light Bulb 3, Light Bulb 4 (2x2 grid, blue theme)
- [x] **Automated Active** section: Overhead Fill Pump, Fire Extinguisher Pump (2x2 grid, amber theme, "Auto" badges)
- [x] All toggle, rename, and real-time sync functionality intact

### Step 3: Wiring Diagram & Pinout Correction
- [x] Created `wiring-diagram.html` — full interactive SVG wiring diagram of the system
- [x] Corrected pinout table in `frontend/src/pages/Settings.jsx` to match actual firmware:
  - Relays: Light Bulb 1→D18, Light Bulb 2→D19, Bulb 3→D32, Bulb 4→D33, Fill Pump→D21, Fire Pump→D22
  - Physical switches: Light→D4, Fan→D5, Fill Pump→D12, Fire Pump→D13
  - Sensors: Flame→D35, MQ-2→D34, HC-SR04 Trig→D25, Echo→D26
  - Safety: Buzzer→D27, LED→D14
- [x] Frontend production build verified (vite build ✓)

