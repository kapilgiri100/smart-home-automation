/**
 * FLAME SENSOR DIAGNOSTIC SKETCH
 * Upload this to ESP32 to identify why flame detection isn't working
 * 
 * Steps:
 * 1. Upload this sketch
 * 2. Open Serial Monitor (115200 baud)
 * 3. Aim flame sensor at a flame/candle/lighter (or LED)
 * 4. Watch the raw ADC values and flicker detection
 * 5. Adjust FLAME_IR_MEAN_MIN/MAX if needed
 */

#define PIN_FLAME 35  // GPIO 35 ADC1_CH7

// Tuneable parameters (adjust based on diagnostic output)
const int FLAME_IR_MEAN_MIN = 40;          
const int FLAME_IR_MEAN_MAX = 4090;        
const int FLAME_FLICKER_PP_THRESHOLD = 25; 
const int FLAME_FLICKER_RATIO_X1000 = 25;  
const int FLAME_WINDOW_SIZE = 30;          
const unsigned long FLAME_SAMPLE_INTERVAL_MS = 30;

// Runtime state
unsigned long lastFlameSampleTime = 0;
int flameSamples[FLAME_WINDOW_SIZE];
int flameSampleIndex = 0;
bool fireDetected = false;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=== FLAME SENSOR DIAGNOSTIC ===");
  Serial.println("Sampling flame sensor on GPIO 35");
  Serial.println("Raw samples will show every 30ms");
  Serial.println("Flicker analysis every 0.9 seconds");
  Serial.println("\n--- THRESHOLDS ---");
  Serial.print("IR Mean Band: ");
  Serial.print(FLAME_IR_MEAN_MIN);
  Serial.print(" - ");
  Serial.println(FLAME_IR_MEAN_MAX);
  Serial.print("Flicker PP: >= ");
  Serial.print(FLAME_FLICKER_PP_THRESHOLD);
  Serial.print(" OR Ratio >= ");
  Serial.print(FLAME_FLICKER_RATIO_X1000);
  Serial.println("/1000");
  Serial.println("\n--- LIVE DATA ---\n");
  
  pinMode(PIN_FLAME, INPUT);
  analogSetAttenuation(ADC_11db); // 0-3.3V range, 0-4095 ADC
}

void loop() {
  unsigned long now = millis();
  
  // Sample at fixed 30ms interval
  if (now - lastFlameSampleTime >= FLAME_SAMPLE_INTERVAL_MS) {
    lastFlameSampleTime = now;
    
    int raw = analogRead(PIN_FLAME);
    flameSamples[flameSampleIndex] = raw;
    
    // Show each raw sample
    Serial.print("Sample ");
    Serial.print(flameSampleIndex);
    Serial.print(": ");
    Serial.println(raw);
    
    flameSampleIndex = (flameSampleIndex + 1) % FLAME_WINDOW_SIZE;
    
    // Analyze window when full
    if (flameSampleIndex == 0) {
      analyzeFlameWindow();
    }
  }
  
  delay(10); // Prevent CPU hogging
}

void analyzeFlameWindow() {
  // Calculate statistics
  long sum = 0;
  int minVal = 4095;
  int maxVal = 0;
  
  for (int i = 0; i < FLAME_WINDOW_SIZE; i++) {
    int v = flameSamples[i];
    sum += v;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  
  int mean = sum / FLAME_WINDOW_SIZE;
  int peakToPeak = maxVal - minVal;
  int flickerRatio = (mean > 0) ? (peakToPeak * 1000 / mean) : 0;
  
  // Check detection criteria
  bool irInBand = (mean >= FLAME_IR_MEAN_MIN) && (mean <= FLAME_IR_MEAN_MAX);
  bool hasFlicker = (peakToPeak >= FLAME_FLICKER_PP_THRESHOLD) ||
                    (flickerRatio >= FLAME_FLICKER_RATIO_X1000);
  
  // Display window analysis
  Serial.println("\n========== WINDOW ANALYSIS ==========");
  Serial.print("Mean IR: ");
  Serial.print(mean);
  Serial.print(" (in-band: ");
  Serial.print(irInBand ? "YES" : "NO");
  Serial.println(")");
  
  Serial.print("Peak-to-Peak: ");
  Serial.print(peakToPeak);
  Serial.print(" (threshold: ");
  Serial.print(FLAME_FLICKER_PP_THRESHOLD);
  Serial.print(", passes: ");
  Serial.print(peakToPeak >= FLAME_FLICKER_PP_THRESHOLD ? "YES" : "NO");
  Serial.println(")");
  
  Serial.print("Flicker Ratio: ");
  Serial.print(flickerRatio);
  Serial.print("/1000 (threshold: ");
  Serial.print(FLAME_FLICKER_RATIO_X1000);
  Serial.print("/1000, passes: ");
  Serial.print(flickerRatio >= FLAME_FLICKER_RATIO_X1000 ? "YES" : "NO");
  Serial.println(")");
  
  Serial.print("Min/Max ADC: ");
  Serial.print(minVal);
  Serial.print(" / ");
  Serial.println(maxVal);
  
  // Final verdict
  if (irInBand && hasFlicker) {
    Serial.println("\n>>> FIRE DETECTED <<<");
    fireDetected = true;
  } else {
    Serial.println("\n>>> NO FIRE (fails detection criteria) <<<");
    fireDetected = false;
  }
  
  // Show which condition failed
  if (!irInBand) {
    Serial.print("  REASON: Mean IR out of band [");
    Serial.print(FLAME_IR_MEAN_MIN);
    Serial.print("-");
    Serial.print(FLAME_IR_MEAN_MAX);
    Serial.println("]");
  }
  if (!hasFlicker) {
    Serial.print("  REASON: Insufficient flicker (PP=");
    Serial.print(peakToPeak);
    Serial.print(", Ratio=");
    Serial.print(flickerRatio);
    Serial.println("/1000)");
  }
  
  Serial.println("====================================\n");
}
