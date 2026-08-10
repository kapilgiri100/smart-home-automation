# Flame Detection Code Adjustments & Fixes

## Quick Fix: If Sensor Not Detecting Fire

### Option 1: Reduce Flicker Threshold (Most Common Fix)
**Problem**: Sensor sees IR but flicker is too subtle for current thresholds

**In main.ino, change lines around line 128-131:**

**BEFORE:**
```cpp
const int FLAME_FLICKER_PP_THRESHOLD = 25; // Absolute peak-to-peak ADC variation
const int FLAME_FLICKER_RATIO_X1000 = 25;  // Relative flicker: PP*1000/mean >= this
```

**AFTER (More Sensitive):**
```cpp
const int FLAME_FLICKER_PP_THRESHOLD = 15; // Reduced from 25
const int FLAME_FLICKER_RATIO_X1000 = 15;  // Reduced from 25
```

### Option 2: Widen IR Mean Band (If Sensor Reads Oddly)
**Problem**: Sensor output is outside the 40-4090 range

**BEFORE:**
```cpp
const int FLAME_IR_MEAN_MIN = 40;   // ADC avg below this = disconnected
const int FLAME_IR_MEAN_MAX = 4090; // ADC avg above this = pinned at rail
```

**AFTER (More Permissive):**
```cpp
const int FLAME_IR_MEAN_MIN = 20;   // Allows very low IR
const int FLAME_IR_MEAN_MAX = 4095; // Allows full range (all the way to rail)
```

### Option 3: Reduce Sample Window (Faster Detection)
**Problem**: Taking 0.9 seconds to detect fire is too slow

**BEFORE:**
```cpp
const int FLAME_WINDOW_SIZE = 30;  // 30 samples × 30ms = 900ms
```

**AFTER (Faster):**
```cpp
const int FLAME_WINDOW_SIZE = 15;  // 15 samples × 30ms = 450ms (faster detection)
```

---

## Advanced Diagnostic: Add Extra Serial Logging

### Add This After `sampleFlameFlicker()` Function (around line 700)

Insert this diagnostic function:

```cpp
// DIAGNOSTIC: Show every raw sample reading in real-time
void diagnosticRawReadings()
{
  unsigned long now = millis();
  static unsigned long lastDiagTime = 0;
  
  // Show raw readings at startup, then every 10 seconds
  if (now - lastDiagTime > 10000)
  {
    lastDiagTime = now;
    
    Serial.println("\n[DIAGNOSTIC] Last 5 raw readings:");
    for (int i = -4; i <= 0; i++)
    {
      int idx = (flameSampleIndex + i + FLAME_WINDOW_SIZE) % FLAME_WINDOW_SIZE;
      Serial.print("  [");
      Serial.print(flameSamples[idx]);
      Serial.println("]");
    }
  }
}
```

Then in `loop()`, add this call after `sampleFlameFlicker();` (around line 847):

```cpp
  // 2. Read Safety Sensors
  sampleFlameFlicker();
  
  diagnosticRawReadings(); // ADD THIS LINE
  
  // MQ-2 Gas Sensor...
```

Now Serial Monitor will show the actual ADC values every 10 seconds, which helps verify the sensor is reading correctly.

---

## Testing Protocol

### Test 1: Verify Sensor Connection
```
1. Open Serial Monitor
2. Look for raw ADC values in range 0-4095
3. If all zeros or all 4095 → sensor not connected
4. If responding to flame → connection OK
```

### Test 2: Measure Flicker Quality
```
1. Hold flame 8-12 cm from sensor
2. Watch Serial debug output
3. Record Mean IR value
4. Record Peak-to-Peak flicker
5. Calculate Ratio = PP * 1000 / Mean

Example Good Readings:
  Mean = 2000, PP = 40
  Ratio = 40 * 1000 / 2000 = 20 ✓ (detects fine)
  
Example Bad Readings:
  Mean = 3900, PP = 2
  Ratio = 2 * 1000 / 3900 = 0 ✗ (too saturated, move flame away)
```

### Test 3: Incremental Threshold Reduction
```
Start with factory defaults:
  FLAME_FLICKER_PP_THRESHOLD = 25
  FLAME_FLICKER_RATIO_X1000 = 25
  
If not detecting:
  Round 1: Reduce to 20 (both)
  Round 2: Reduce to 15 (both)
  Round 3: Reduce to 10 (both)
  
Stop when flame IS detected.
Document the working threshold.
```

---

## Common Sensor Models & Their Quirks

### YG1006 Flame Sensor (Most Common)
- Inverted output: AO FALLS with more IR
- Mean around 3500 in darkness, 500 in bright flame
- Works best with blue/yellow flame
- Expected Ratio: 20-50/1000 with real flame

**Tuning for YG1006:**
```cpp
const int FLAME_IR_MEAN_MIN = 100;  // Allow lower end
const int FLAME_IR_MEAN_MAX = 3800; // Cap at lower max
const int FLAME_FLICKER_PP_THRESHOLD = 20;
const int FLAME_FLICKER_RATIO_X1000 = 15;
```

### Generic IR Flame Sensor (Alibaba)
- Normal output: AO RISES with more IR
- Mean around 500 in darkness, 3000+ in bright flame
- Works with any IR (flicker-filtered)
- Expected Ratio: 15-40/1000 with real flame

**Tuning for Generic:**
```cpp
const int FLAME_IR_MEAN_MIN = 50;
const int FLAME_IR_MEAN_MAX = 4000;
const int FLAME_FLICKER_PP_THRESHOLD = 15;
const int FLAME_FLICKER_RATIO_X1000 = 20;
```

---

## Emergency Fallback: Force Fire Detection ON (Testing Only)

If you need to test the fire pump/buzzer without an actual flame:

**In main.ino around line 918, change:**

```cpp
  // 2. Read Safety Sensors
  sampleFlameFlicker();
  
  // MQ-2 Gas Sensor...
```

**TO (temporarily for testing):**

```cpp
  // 2. Read Safety Sensors
  sampleFlameFlicker();
  
  // EMERGENCY TEST ONLY: Force fire detection for testing
  // fireDetected = true;  // Uncomment to simulate fire
  
  // MQ-2 Gas Sensor...
```

Then uncomment that line to force `fireDetected = true`, test the pump/buzzer, then comment it back out.

---

## Monitoring Fire Detection Health

Add this to your backend/frontend to track sensor performance:

```javascript
// Track fire detection statistics
const flameStats = {
  totalDetections: 0,
  lastDetectionTime: null,
  detectionDuration: 0,
  averageDetectionLength: 0
};

// In your API handler:
if (payload.fireStatus === true) {
  if (!flameStats.lastDetectionTime) {
    flameStats.totalDetections++;
    flameStats.lastDetectionTime = new Date();
  }
}

if (payload.fireStatus === false && flameStats.lastDetectionTime) {
  flameStats.detectionDuration = new Date() - flameStats.lastDetectionTime;
  flameStats.lastDetectionTime = null;
  
  // Log for debugging
  console.log(`Fire event lasted: ${flameStats.detectionDuration}ms`);
}
```

This helps you verify the sensor is working in production by seeing:
- How many fires detected per day
- How long each detection lasts (should be ~0.9s minimum per flame)
- Pattern anomalies (e.g., frequent 100ms blips = false positives)
