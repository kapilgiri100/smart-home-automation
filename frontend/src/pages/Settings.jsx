import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { User, Cpu, Network, AlertTriangle, Settings as SettingsIcon, Code, Droplet, Waves, FileCode, Compass, Flame, Music, Play, Trash2, Check, Upload, Volume2 } from "lucide-react";
import { getAllSounds, addCustomSound, removeCustomSound, setFireSound, setGasSound, loadSettings } from "../utils/alarmSounds.js";
export const Settings = () => {
  const {
    user
  } = useAuth();

  // Sensor Connection Availability State
  const [sensors, setSensors] = useState({
    fireSensorAvailable: true,
    gasSensorAvailable: true,
    sonicSensorAvailable: true
  });
  const [loadingSensors, setLoadingSensors] = useState(true);

  // Calibration State for Ultrasonic simulation
  const [tankHeight, setTankHeight] = useState(100); // in cm
  const [airDistance, setAirDistance] = useState(35); // in cm
const [savingCalibration, setSavingCalibration] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Alert Sound Selection State
  const [sounds, setSounds] = useState(getAllSounds());
  const [soundSettings, setSoundSettings] = useState(loadSettings());
  const [playingSoundId, setPlayingSoundId] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewAudio, setPreviewAudio] = useState(null);
  const refreshSounds = () => {
    setSounds(getAllSounds());
    setSoundSettings(loadSettings());
  };
const handlePlayPreview = sound => {
    // Stop current preview
    if (previewAudio) {
      previewAudio.pause();
      setPreviewAudio(null);
    }
    if (playingSoundId === sound.id) {
      setPlayingSoundId(null);
      return;
    }
    if (sound.type === "custom" && sound.data) {
      const audio = new Audio(sound.data);
      audio.onended = () => setPlayingSoundId(null);
      audio.play().catch(err => {
        console.warn("Preview play blocked:", err);
        setPlayingSoundId(null);
      });
      setPreviewAudio(audio);
      setPlayingSoundId(sound.id);
    } else {
      // Built-in synthesized sounds: play a short preview via Web Audio
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const now = ctx.currentTime;
        let osc;
        if (sound.kind === "fire") {
          osc = ctx.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(2900, now);
        } else {
          osc = ctx.createOscillator();
          osc.type = "square";
          osc.frequency.setValueAtTime(1500, now);
        }
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.8);
        setPlayingSoundId(sound.id);
        setTimeout(() => {
          osc.stop();
          ctx.close();
          setPlayingSoundId(null);
        }, 900);
      }
    }
  };
  const handleAddSound = async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await addCustomSound(file);
      refreshSounds();
    } catch (err) {
      setUploadError(err.message || "Failed to add sound.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };
  const handleRemoveSound = id => {
    removeCustomSound(id);
    refreshSounds();
  };
  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        const res = await fetch("/api/sensors");
        const data = await res.json();
        if (data) {
          setSensors({
            fireSensorAvailable: data.fireSensorAvailable !== false,
            gasSensorAvailable: data.gasSensorAvailable !== false,
            sonicSensorAvailable: data.sonicSensorAvailable !== false
          });
        }
      } catch (err) {
        console.error("Failed to load sensor availability in settings:", err);
      } finally {
        setLoadingSensors(false);
      }
    };
    const fetchWaterTank = async () => {
      try {
        const res = await fetch("/api/water");
        const data = await res.json();
        if (data && typeof data.tankHeight === "number") {
          setTankHeight(data.tankHeight);
          const p = data.percentage !== undefined ? data.percentage : 50;
          const targetAir = Math.round(data.tankHeight * (100 - p) / 100);
          // Clamp air distance between 2 and tankHeight to respect physical limits
          setAirDistance(Math.min(data.tankHeight, Math.max(2, targetAir)));
        }
      } catch (err) {
        console.error("Failed to load water tank height in settings:", err);
      }
    };
fetchAvailability();
    fetchWaterTank();
  }, []);
  useEffect(() => {
    return () => {
      if (previewAudio) {
        previewAudio.pause();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleToggleAvailability = async key => {
    const nextVal = !sensors[key];

    // Optimistic UI update
    setSensors(prev => ({
      ...prev,
      [key]: nextVal
    }));
    try {
      const res = await fetch("/api/sensors/availability", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          [key]: nextVal
        })
      });
      const result = await res.json();
      if (!result.success) {
        // Rollback on failure
        setSensors(prev => ({
          ...prev,
          [key]: !nextVal
        }));
      }
    } catch (err) {
      console.error("Failed to save sensor availability:", err);
      // Rollback on error
      setSensors(prev => ({
        ...prev,
        [key]: !nextVal
      }));
    }
  };
  const handleSaveCalibration = async () => {
    if (tankHeight < 2 || tankHeight > 400) {
      setSaveError("Tank height must be between 2 cm and 400 cm.");
      return;
    }
    setSavingCalibration(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      // Calculate the new percentage based on current slider values
      const actualWaterHeight = Math.max(0, tankHeight - airDistance);
      const computedPercentage = Math.min(100, Math.max(0, Math.round(actualWaterHeight / tankHeight * 100)));
      const res = await fetch("/api/water", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tankHeight: tankHeight,
          percentage: computedPercentage
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(result.error || "Failed to save calibration.");
      }
    } catch (err) {
      console.error("Save calibration error:", err);
      setSaveError("Failed to save calibration due to connection issue.");
    } finally {
      setSavingCalibration(false);
    }
  };

  // Calculate live water parameters
  const actualWaterHeight = Math.max(0, tankHeight - airDistance);
  const waterPercentage = Math.min(100, Math.max(0, Math.round(actualWaterHeight / tankHeight * 100)));

  // Speed of sound: 0.0343 cm per microsecond
  // Time = Distance * 2 / Speed
  const roundTripTimeUs = Math.round(airDistance * 2 / 0.0343);
  const pinout = [{
    peripheral: "Relay 1 — Light Bulb 1",
    gpio: "GPIO 18",
    mode: "OUTPUT (Active Low)"
  }, {
    peripheral: "Relay 2 — Light Bulb 2",
    gpio: "GPIO 19",
    mode: "OUTPUT (Active Low)"
  }, {
    peripheral: "Relay 3 — Light Bulb 3 (expansion)",
    gpio: "GPIO 32",
    mode: "OUTPUT (Active Low)"
  }, {
    peripheral: "Relay 4 — Light Bulb 4 (expansion)",
    gpio: "GPIO 33",
    mode: "OUTPUT (Active Low)"
  }, {
    peripheral: "Relay 5 — Overhead Fill Pump (Pump 1)",
    gpio: "GPIO 21",
    mode: "OUTPUT (Active Low)"
  }, {
    peripheral: "Relay 6 — Fire Extinguisher Pump (Pump 2)",
    gpio: "GPIO 22",
    mode: "OUTPUT (Active Low)"
  }, {
    peripheral: "Physical Switch 1 — Light",
    gpio: "GPIO 4",
    mode: "INPUT (Internal Pullup)"
  }, {
    peripheral: "Physical Switch 2 — Fan",
    gpio: "GPIO 5",
    mode: "INPUT (Internal Pullup)"
}, {
peripheral: "Physical Switch 3 — Light Bulb 3 (expansion)",
    gpio: "GPIO 13",
    mode: "INPUT (Internal Pullup)"
  }, {
    peripheral: "Physical Switch 4 — Light Bulb 4 (expansion)",
    gpio: "GPIO 23",
    mode: "INPUT (Internal Pullup)"
  }, {
peripheral: "Flame Sensor (AO, Analog)",
    gpio: "GPIO 35 (ADC1_CH7)",
    mode: "INPUT (Analog, flicker-filtered, rejects sunlight)"
  }, {
    peripheral: "MQ-2 Gas Sensor (Analog)",
    gpio: "GPIO 34",
    mode: "INPUT (Analog, 11dB atten)"
  }, {
    peripheral: "HC-SR04 Ultrasonic — Trigger",
    gpio: "GPIO 25",
    mode: "OUTPUT"
  }, {
    peripheral: "HC-SR04 Ultrasonic — Echo",
    gpio: "GPIO 26",
    mode: "INPUT"
  }, {
    peripheral: "Active Buzzer Relay (Alarm)",
    gpio: "GPIO 27",
    mode: "OUTPUT (Active Low = sound)"
  }, {
    peripheral: "Warning Indicator LED Relay",
    gpio: "GPIO 14",
    mode: "OUTPUT (Active Low = lit)"
  }];
  return <div className="space-y-8 max-w-4xl">
      {/* Page Title */}
      <div className="flex items-center space-x-3">
        <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20">
          <SettingsIcon className="h-6 w-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">System Settings</h1>
          <p className="text-sm text-slate-400">Manage user profiles and review ESP32 pin configurations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="md:col-span-1 bg-[#16181D] border border-white/5 rounded-2xl p-6 text-slate-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
            <User className="h-4 w-4 text-blue-500" />
            <span>User Profile</span>
          </h2>

          {user && <div className="space-y-4">
              <div className="flex flex-col items-center text-center p-4 bg-[#0A0B0D]/60 rounded-xl border border-white/5 animate-fade-in">
                {user.photoURL ? <img src={user.photoURL} alt={user.displayName || "User"} className="h-16 w-16 rounded-full border border-white/5 object-cover mb-3" referrerPolicy="no-referrer" /> : <div className="h-16 w-16 rounded-full bg-[#0A0B0D] border border-white/5 flex items-center justify-center mb-3">
                    <User className="h-8 w-8 text-slate-400" />
                  </div>}
                <h3 className="font-semibold text-white">{user.displayName || "Smart Home Admin"}</h3>
                <span className="text-xs text-slate-400 mt-0.5">{user.email}</span>
              </div>

              <div className="text-xs space-y-2 pt-2 text-slate-400">
                <div className="flex justify-between">
                  <span>Firebase ID:</span>
                  <span className="font-mono text-slate-300 truncate w-24 text-right" title={user.uid}>
                    {user.uid}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Authorized:</span>
                  <span className="text-emerald-500">Active</span>
                </div>
              </div>
            </div>}
        </div>

        {/* Network Connections Card */}
        <div className="md:col-span-2 bg-[#16181D] border border-white/5 rounded-2xl p-6 text-slate-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
            <Network className="h-4 w-4 text-emerald-500" />
            <span>ESP32 Network Parameters</span>
          </h2>

          <div className="space-y-4">
            <div className="p-4 bg-[#0A0B0D]/60 rounded-xl border border-white/5 space-y-3">
              <div className="flex flex-col space-y-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Device Endpoint Url:</span>
                <span className="text-xs font-mono text-blue-400 bg-[#0A0B0D] py-2 px-3 rounded border border-white/5 break-all select-all">
                  {window.location.origin}/api/device/update
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Add this exact endpoint URL to your ESP32 Arduino C++ firmware script (`main.ino`) in order to report gas, fire, and water level sensor readings to this cloud application in real-time.
              </p>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-3 text-xs text-amber-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div>
                <h4 className="font-semibold mb-0.5">Physical Device Warning</h4>
                <p className="leading-relaxed">
                  Relay channels are active-low. When controlling AC appliances, always utilize a fused, isolated channel box to guarantee user protection.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Physical Sensors Installation Settings Card */}
        <div className="md:col-span-3 bg-[#16181D] border border-white/5 rounded-2xl p-6 text-slate-200">
          <div className="flex items-center space-x-2.5 mb-5 border-b border-white/5 pb-4">
            <SettingsIcon className="h-5 w-5 text-blue-500 animate-pulse" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Physical Sensor Connections &amp; Installation</h2>
              <p className="text-xs text-slate-400 mt-0.5">Configure which sensors are physically connected to your ESP32 device to prevent alerts &amp; false alarms</p>
            </div>
          </div>

          {loadingSensors ? <div className="flex items-center justify-center py-6 space-x-2 text-xs text-slate-400">
              <span className="text-blue-500 font-mono animate-spin">⚡</span>
              <span>Loading connectivity states...</span>
            </div> : <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
              
              {/* Flame/Fire sensor */}
              <div className="p-4 bg-[#0A0B0D]/50 border border-white/5 rounded-xl flex flex-col justify-between space-y-4">
                <div className="flex items-start space-x-3">
                  <div className={`p-2.5 rounded-lg border shrink-0 ${sensors.fireSensorAvailable ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-slate-500/5 border-white/5 text-slate-500"}`}>
                    <Flame className="h-5 w-5" />
                  </div>
                  <div>
<h3 className="text-xs font-bold uppercase tracking-wider text-white">Fire / Flame Sensor</h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
Reads the analog AO pin (GPIO 35, ADC1_CH7). Uses a mean + peak-to-peak flicker filter: confirms fire when the average IR is strong AND the signal oscillates (real flame flicker), while rejecting steady sunlight. Once confirmed, the alarm LATCHES (buzzer/pump stay ON) for the whole time fire is detected and turns OFF ~1s after the flame is gone.

                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${sensors.fireSensorAvailable ? "text-emerald-400" : "text-slate-500"}`}>
                    {sensors.fireSensorAvailable ? "Installed / Active" : "Not Connected"}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input type="checkbox" checked={sensors.fireSensorAvailable} onChange={() => handleToggleAvailability("fireSensorAvailable")} className="sr-only peer" />
                    <div className="w-9 h-5 bg-[#16181D] border border-white/5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                  </label>
                </div>
              </div>

              {/* LPG Gas Sensor */}
              <div className="p-4 bg-[#0A0B0D]/50 border border-white/5 rounded-xl flex flex-col justify-between space-y-4">
                <div className="flex items-start space-x-3">
                  <div className={`p-2.5 rounded-lg border shrink-0 ${sensors.gasSensorAvailable ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-slate-500/5 border-white/5 text-slate-500"}`}>
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">LPG Gas Leakage Sensor</h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Monitors MQ-2 LPG gas density levels. If disconnected, toggle OFF to suppress leakage alarms and alert warnings.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${sensors.gasSensorAvailable ? "text-emerald-400" : "text-slate-500"}`}>
                    {sensors.gasSensorAvailable ? "Installed / Active" : "Not Connected"}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input type="checkbox" checked={sensors.gasSensorAvailable} onChange={() => handleToggleAvailability("gasSensorAvailable")} className="sr-only peer" />
                    <div className="w-9 h-5 bg-[#16181D] border border-white/5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                  </label>
                </div>
              </div>

              {/* HC-SR04 Ultrasonic Level Sensor */}
              <div className="p-4 bg-[#0A0B0D]/50 border border-white/5 rounded-xl flex flex-col justify-between space-y-4">
                <div className="flex items-start space-x-3">
                  <div className={`p-2.5 rounded-lg border shrink-0 ${sensors.sonicSensorAvailable ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-slate-500/5 border-white/5 text-slate-500"}`}>
                    <Waves className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">Water Tank Sonic Sensor</h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Measures acoustic waves for water level. If disconnected, toggle OFF to avoid false low capacity and filling pump triggers.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${sensors.sonicSensorAvailable ? "text-emerald-400" : "text-slate-500"}`}>
                    {sensors.sonicSensorAvailable ? "Installed / Active" : "Not Connected"}
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input type="checkbox" checked={sensors.sonicSensorAvailable} onChange={() => handleToggleAvailability("sonicSensorAvailable")} className="sr-only peer" />
                    <div className="w-9 h-5 bg-[#16181D] border border-white/5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:border-slate-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                  </label>
                </div>
              </div>

</div>}
        </div>

        {/* Alert Sounds Configuration Card */}
        <div className="md:col-span-3 bg-[#16181D] border border-white/5 rounded-2xl p-6 text-slate-200">
          <div className="flex items-center space-x-2.5 mb-5 border-b border-white/5 pb-4">
            <Music className="h-5 w-5 text-indigo-500 animate-pulse" />
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Alert Sounds</h2>
              <p className="text-xs text-slate-400 mt-0.5">Choose or upload custom alarm sounds for fire and gas alerts</p>
            </div>
          </div>

          {/* Horizontal list of sounds */}
          <div className="flex flex-wrap gap-3 items-stretch">
            {sounds.map(sound => {
              const isFire = soundSettings.fireSoundId === sound.id;
              const isGas = soundSettings.gasSoundId === sound.id;
              const isPlaying = playingSoundId === sound.id;
              return <div key={sound.id} className={`flex flex-col gap-2 p-3.5 rounded-xl border bg-[#0A0B0D]/50 min-w-[180px] flex-1 max-w-[240px] transition-all ${isFire || isGas ? "border-indigo-500/40 bg-indigo-500/5" : "border-white/5"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${sound.type === "custom" ? "bg-emerald-500/10 text-emerald-400" : "bg-indigo-500/10 text-indigo-400"}`}>
                      <Volume2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{sound.name}</p>
                      <p className="text-[9px] uppercase tracking-wider text-slate-500">
                        {sound.type === "custom" ? "Custom Sound" : "Built-in"}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handlePlayPreview(sound)} className={`p-1.5 rounded-lg transition-all cursor-pointer shrink-0 ${isPlaying ? "bg-rose-500/20 text-rose-400" : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"}`} title="Preview">
                    {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/5">
                  <button onClick={() => {
                    setFireSound(sound.id);
                    refreshSounds();
                  }} className={`flex-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg transition-all cursor-pointer ${isFire ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-transparent"}`}>
                    {isFire ? "✓ Fire" : "Fire"}
                  </button>
                  <button onClick={() => {
                    setGasSound(sound.id);
                    refreshSounds();
                  }} className={`flex-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg transition-all cursor-pointer ${isGas ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-transparent"}`}>
                    {isGas ? "✓ Gas" : "Gas"}
                  </button>
                  {sound.type === "custom" && <button onClick={() => handleRemoveSound(sound.id)} className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>}
                </div>
              </div>;
            })}

            {/* Add Sound upload card */}
            <label className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border border-dashed border-white/10 bg-[#0A0B0D]/30 min-w-[180px] flex-1 max-w-[240px] cursor-pointer hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
              <Upload className="h-5 w-5 text-indigo-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {uploading ? "Uploading..." : "Add Sound"}
              </span>
              <span className="text-[9px] text-slate-600 text-center">mp3 / wav / ogg</span>
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,audio/mp4" onChange={handleAddSound} className="hidden" />
            </label>
          </div>

          {uploadError && <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="leading-normal">{uploadError}</span>
          </div>}

          <div className="mt-4 p-3.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">How it works:</span> Select a sound to assign it as the <span className="text-rose-400 font-semibold">Fire</span> or <span className="text-amber-400 font-semibold">Gas</span> alert. Upload your own audio files to add them to the list. The selected sounds play automatically on the dashboard when an alert is detected.
          </div>
        </div>

        {/* Pinout configuration table */}
        <div className="md:col-span-3 bg-[#16181D] border border-white/5 rounded-2xl p-6 text-slate-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center space-x-2">
            <Cpu className="h-4 w-4 text-blue-500" />
            <span>ESP32 Microcontroller Schematic &amp; Hardware Pinouts</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-400">
              <thead className="bg-[#0A0B0D] text-slate-300 font-semibold border-b border-white/5 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Peripheral Component Name</th>
                  <th className="px-4 py-3">ESP32 GPIO Pin</th>
                  <th className="px-4 py-3">Pin Mode &amp; Logical State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pinout.map((item, idx) => <tr key={idx} className="hover:bg-[#0A0B0D]/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{item.peripheral}</td>
                    <td className="px-4 py-3 font-mono text-blue-400 font-semibold">{item.gpio}</td>
                    <td className="px-4 py-3 text-slate-300">{item.mode}</td>
                  </tr>)}
              </tbody>
            </table>
          </div>
        </div>

        {/* HC-SR04 Ultrasonic Calibration & Physics Formulas Guide */}
        <div className="md:col-span-3 bg-[#16181D] border border-white/5 rounded-2xl p-6 text-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4 gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <Waves className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">HC-SR04 Ultrasonic Sensor &amp; Calibration</h2>
                <p className="text-xs text-slate-400">Understand, calculate, and calibrate real-time water levels using ultrasonic distance measurements</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                       {/* Left calibration controllers */}
            <div className="lg:col-span-5 space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                <Compass className="h-3.5 w-3.5 text-blue-400" />
                <span>1. Live Calibration &amp; Simulation</span>
              </h3>
 
              {/* Tank Total Height Controller */}
              <div className="bg-[#0A0B0D]/60 border border-white/5 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-300">Total Tank Height (H)</span>
                  <div className="flex items-center space-x-2">
                    <input type="number" min="2" max="400" value={tankHeight} onChange={e => {
                    let h = parseInt(e.target.value) || 2;
                    if (h < 2) h = 2;
                    if (h > 400) h = 400;
                    setTankHeight(h);
                    if (airDistance > h) setAirDistance(h);
                  }} className="w-16 text-center text-xs font-mono font-bold bg-[#16181D] border border-white/10 rounded py-1 px-1.5 text-blue-400 focus:outline-none focus:border-blue-500" />
                    <span className="text-xs text-slate-400">cm</span>
                  </div>
                </div>
                <input type="range" min="2" max="400" value={tankHeight} onChange={e => {
                const h = parseInt(e.target.value);
                setTankHeight(h);
                if (airDistance > h) setAirDistance(h);
              }} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                <p className="text-[10px] text-slate-500 leading-normal">
                  Adjustable according to HC-SR04 capacity: <span className="font-semibold">2 cm</span> (min) to <span className="font-semibold">400 cm</span> (max). This is the vertical distance from the top-lid sensor face to the bottom of the empty tank.
                </p>
              </div>
 
              {/* Air Distance Controller */}
              <div className="bg-[#0A0B0D]/60 border border-white/5 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-300">Measured Air Distance (D)</span>
                  <div className="flex items-center space-x-2">
                    <input type="number" min="2" max={tankHeight} value={airDistance} onChange={e => {
                    let d = parseInt(e.target.value) || 2;
                    if (d < 2) d = 2;
                    if (d > tankHeight) d = tankHeight;
                    setAirDistance(d);
                  }} className="w-16 text-center text-xs font-mono font-bold bg-[#16181D] border border-white/10 rounded py-1 px-1.5 text-cyan-400 focus:outline-none focus:border-cyan-500" />
                    <span className="text-xs text-slate-400">cm</span>
                  </div>
                </div>
                <input type="range" min="2" max={tankHeight} value={airDistance} onChange={e => setAirDistance(parseInt(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400" />
                <p className="text-[10px] text-slate-500 leading-normal">
                  The raw echo distance measured by the sensor. Sound travel roundtrip is mapped to active water level percentage.
                </p>
              </div>

              {/* Save Calibration Button */}
              <div className="pt-1">
                <button type="button" onClick={handleSaveCalibration} disabled={savingCalibration} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg shadow-blue-500/10 active:scale-95">
                  <span>{savingCalibration ? "Saving to Cloud..." : "Save Calibration Parameters"}</span>
                </button>
                {saveSuccess && <div className="mt-2 text-center text-[11px] font-semibold text-emerald-400 animate-fade-in">
                    ✓ Calibration successfully saved and synced to the cloud!
                  </div>}
                {saveError && <div className="mt-2 text-center text-[11px] font-semibold text-rose-400 animate-fade-in">
                    ✗ {saveError}
                  </div>}
              </div>
 
              {/* Mathematical breakdown results */}
              <div className="bg-[#0A0B0D]/60 border border-white/5 p-4 rounded-xl space-y-3 text-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Live Mathematical Outputs</span>
                
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Echo Pulse Duration:</span>
                  <span className="font-mono text-slate-200">{roundTripTimeUs.toLocaleString()} µs</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Calculated Water Height:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{actualWaterHeight} cm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Computed Water Level:</span>
                  <span className="font-mono text-blue-400 font-bold text-sm">{waterPercentage}%</span>
                </div>
              </div>
            </div>

            {/* Middle Tank Visual Representation */}
            <div className="lg:col-span-3 flex flex-col justify-center items-center bg-[#0A0B0D]/40 border border-white/5 rounded-xl p-5 min-h-[300px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-4 text-center">Visual Tank Schematic</span>
              
              <div className="relative w-32 h-52 border-x-4 border-b-4 border-slate-700 rounded-b-2xl bg-[#0A0B0D] overflow-hidden flex flex-col justify-end">
                {/* Visual Sensor at top */}
                <div className="absolute top-0 inset-x-0 h-6 bg-slate-800 border-b border-slate-700 flex justify-around items-center px-2 z-20">
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border border-blue-500 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  </div>
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-900 border border-blue-500 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
                  </div>
                </div>

                {/* Animated propagation wave if air distance > 0 */}
                {airDistance > 0 && <div className="absolute top-6 inset-x-0 bottom-0 flex flex-col items-center justify-start pt-2 space-y-1.5 opacity-60 z-10 pointer-events-none">
                    <div className="w-8 h-1 border-t border-cyan-400/80 rounded-full animate-pulse"></div>
                    <div className="w-12 h-1 border-t border-cyan-400/60 rounded-full animate-pulse delay-75"></div>
                    <div className="w-16 h-1 border-t border-cyan-400/40 rounded-full animate-pulse delay-150"></div>
                  </div>}

                {/* Visual water level */}
                <div className="w-full bg-gradient-to-t from-cyan-600/60 to-cyan-400/50 transition-all duration-300 relative" style={{
                height: `${waterPercentage}%`
              }}>
                  <div className="absolute top-0 inset-x-0 h-1 bg-cyan-300/80 animate-pulse"></div>
                  
                  {/* Floating bubble particles */}
                  {waterPercentage > 5 && <div className="absolute inset-0 overflow-hidden flex justify-around items-end pb-2 opacity-50">
                      <span className="w-1 h-1 bg-white rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-100"></span>
                      <span className="w-1 h-1 bg-white rounded-full animate-bounce delay-200"></span>
                    </div>}
                </div>

                {/* Legend Labels on Tank Overlay */}
                <div className="absolute bottom-2 right-2 bg-slate-950/80 px-2 py-0.5 rounded border border-white/5 text-[9px] font-mono text-slate-300 z-10">
                  {waterPercentage}%
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-3 text-center">Distance: {airDistance}cm | Water Height: {actualWaterHeight}cm</p>
            </div>

            {/* Right formula explanations & Arduino snippet */}
            <div className="lg:col-span-4 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                <FileCode className="h-3.5 w-3.5 text-blue-400" />
                <span>2. Mathematical Formulas &amp; Physics</span>
              </h3>

              <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
                <div>
                  <span className="font-semibold text-white block">Step A: Calculate Distance in CM</span>
                  <p className="text-slate-400 mt-1">
                    Sound travels at <span className="font-semibold text-slate-200">340 meters per second</span> (or 0.0343 cm per microsecond). Because the wave travels to the obstacle and back, divide by 2:
                  </p>
                  <div className="bg-[#0A0B0D] p-2 rounded border border-white/5 font-mono text-[11px] text-center text-blue-400 mt-1.5">
                    Distance = (EchoDuration * 0.0343) / 2
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-white block">Step B: Compute Final Percentage</span>
                  <p className="text-slate-400 mt-1">
                    Subtract the measured air gap distance from the total tank height, then divide by the total height to determine percentage volume:
                  </p>
                  <div className="bg-[#0A0B0D] p-2 rounded border border-white/5 font-mono text-[11px] text-center text-blue-400 mt-1.5">
                    Percentage = ((TotalHeight - Distance) / TotalHeight) * 100
                  </div>
                </div>

                <div className="bg-blue-600/10 border border-blue-500/20 p-3.5 rounded-xl text-[11px] text-slate-300 leading-relaxed">
                  <span className="font-bold text-white block mb-1">💡 Engineering Tip:</span>
                  Always place the ultrasonic sensor face securely pointing downward, flat with the horizontal plane, to prevent acoustic wave scattering off non-flat tank contours.
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>;
};
