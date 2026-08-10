# Flame Detection Troubleshooting Guide

## Problem: Fire Not Being Detected

### Step 1: Run Diagnostic Sketch
1. Upload `flame_diagnostics.ino` to your ESP32
2. Open **Serial Monitor** (115200 baud, 9600ms timeout)
3. Hold a **real flame** (lighter, candle, or match) ~5-10cm from the sensor
4. Observe the output every 0.9 seconds

### Step 2: Analyze the Output

#### **Case A: Mean IR is WAY TOO LOW (< 40)**
- **Symptom**: Mean = 0-20
- **Cause**: Sensor not connected or no IR reaching it
- **Fix**:
  - Check GPIO 35 is wired to flame sensor AO pin
  - Ensure sensor has power (VCC connected)
  - Check for loose connections

#### **Case B: Mean IR is WAY TOO HIGH (> 4090) - SATURATED**
- **Symptom**: Mean = 4093-4095, PP = 0
- **Cause**: Flame too close or sensor overexposed
- **Fix**:
  - Move flame 10-15cm away from sensor
  - Could also mean sensor is broken (stuck high)
  - Try rotating sensor orientation

#### **Case C: Mean is IN RANGE but NO FLICKER**
- **Symptom**: Mean = 1000-3000, but PP < 25 and Ratio < 25/1000
- **Cause**: Steady IR (sunlight, LED) or flame isn't flickering enough
- **Fix Option 1** (Adjust thresholds - easier):
  ```
  Reduce FLAME_FLICKER_PP_THRESHOLD from 25 to 10-15
  Reduce FLAME_FLICKER_RATIO_X1000 from 25 to 15-20
  ```
  
  **Fix Option 2** (Check sensor type):
  - Some flame sensors are more sensitive than others
  - Try different flame sources (blue flame vs yellow flame)
  - Yellow candle flame: usually better flicker
  - Blue lighter flame: sometimes steadier

#### **Case D: Mean is TOO HIGH but IN RANGE, PP is LOW**
- **Symptom**: Mean = 3500-4090, PP = 5-20
- **Cause**: Flame too close (sensor saturating slightly) OR steady IR
- **Fix**:
  - Move flame farther away (15-20cm)
  - Or slightly increase FLAME_IR_MEAN_MAX to catch high-sensitivity sensors
  - Try reducing FLAME_FLICKER_PP_THRESHOLD

#### **Case E: Mean appears in band AND good flicker, but still no detection**
- **Symptom**: Window says "FIRE DETECTED" but irInBand or hasFlicker is NO
- **Cause**: Threshold values conflict
- **Fix**: Check that BOTH conditions are true:
  ```
  irInBand = (mean >= 40) AND (mean <= 4090)
  hasFlicker = (PP >= 25) OR (Ratio >= 25/1000)
  ```

### Step 3: Adjust Thresholds in Main Code

If the diagnostic shows the sensor CAN detect flame, adjust these values in `main.ino`:

```cpp
// MORE SENSITIVE (catches lower flicker/IR):
const int FLAME_IR_MEAN_MIN = 30;          // Lower than 40
const int FLAME_FLICKER_PP_THRESHOLD = 10; // Lower than 25
const int FLAME_FLICKER_RATIO_X1000 = 15;  // Lower than 25

// LESS SENSITIVE (rejects false positives):
const int FLAME_IR_MEAN_MIN = 50;          // Higher than 40
const int FLAME_FLICKER_PP_THRESHOLD = 40; // Higher than 25
const int FLAME_FLICKER_RATIO_X1000 = 50;  // Higher than 25
```

### Step 4: Common Issues & Solutions

| Issue | Serial Output Shows | Solution |
|-------|---------------------|----------|
| Sensor not connected | Mean = 0, PP = 0 | Check GPIO 35 wiring |
| Sensor powered off | Mean = 0, PP = 0 | Check sensor VCC power |
| Flame too close | Mean = 4095, PP = 0 | Move flame 15cm away |
| Flame too far | Mean = 10, PP = 2 | Move flame 5-10cm closer |
| No flicker (sunlight) | Mean = 2000, PP = 0 | Sensor working fine, just steady IR |
| Weak flame source | Mean = 500, PP = 3 | Use candle or lighter instead of LED |
| Sensor orientation wrong | Mean in range, PP < 5 | Rotate sensor to face heat source |

### Step 5: Test with Main Code

Once diagnostic shows detection working:
1. Restore `main.ino` with your adjusted thresholds
2. Upload and test real flame detection
3. Check Serial: should see `[FLAME FILTER] FIRE CONFIRMED!`
4. Verify buzzer activates
5. Verify fire pump turns on

### Step 6: Calibration Best Practices

**For most environments**, these settings work well:
```cpp
const int FLAME_IR_MEAN_MIN = 40;          
const int FLAME_IR_MEAN_MAX = 4090;        
const int FLAME_FLICKER_PP_THRESHOLD = 20; // Slightly lower than default
const int FLAME_FLICKER_RATIO_X1000 = 20;  // Slightly lower than default
```

**Adjust ONLY if needed** based on your specific:
- Flame sensor model/type
- Environmental IR (sunlight, heat sources)
- Desired sensitivity vs false-positive rate

## Hardware Checklist

- [ ] GPIO 35 (AO pin) connected to flame sensor AO
- [ ] Sensor power (VCC) connected to 3.3V or 5V (check sensor specs)
- [ ] Sensor GND connected to ESP32 GND
- [ ] No loose connections or cold solder joints
- [ ] Sensor lens clean (not covered by dust/oil)
- [ ] Sensor orientation facing the hazard area
