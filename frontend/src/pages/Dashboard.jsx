import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import io from "socket.io-client";
import { Flame, Droplet, Lightbulb, Tv, Zap, Activity, ShieldAlert, RefreshCw, Wifi, WifiOff, Cpu, AlertTriangle, Play, Square, Volume2, VolumeX, ListRestart, Pencil, Check, X, BellRing, Radio, SlidersHorizontal, ChevronUp } from "lucide-react";

// Types

// Fan icon animation component using CSS keyframes for the dashboard
const FanIconComponent = ({
  className,
  active
}) => {
  return <svg className={`${className} ${active ? "animate-spin" : ""}`} style={{
    animationDuration: active ? "1s" : "0s"
  }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12c.5-1 1.5-2.5 3-2.5a2.5 2.5 0 0 1 2.5 2.5c0 1.5-1.5 2.5-2.5 3" />
      <path d="M12 12c1 .5 2.5 1.5 2.5 3a2.5 2.5 0 0 1-2.5 2.5c-1.5 0-2.5-1.5-2.5-2.5" />
      <path d="M12 12c-.5 1-1.5 2.5-3 2.5A2.5 2.5 0 0 1 6.5 12c0-1.5 1.5-2.5 2.5-2.5" />
      <path d="M12 12c-1-.5-2.5-1.5-2.5-3A2.5 2.5 0 0 1 12 6.5c1.5 0 2.5 1.5 2.5 2.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>;
};

// Web Audio API Synthesizer for Fire and Gas alarms
class AlarmSoundEngine {
  ctx = null;
  intervalId = null;
  isMuted = false;
  constructor() {}
  initCtx() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.ctx = new AudioContextClass();
        } catch (e) {
          console.warn("Failed to initialize AudioContext", e);
        }
      }
    }
  }
  unlock() {
    // If ctx exists and is suspended, iOS Safari might have locked it permanently.
    // Close and recreate inside this user gesture handler for 100% success.
    if (this.ctx && this.ctx.state === "running") {
      return;
    }
    if (this.ctx) {
      try {
        this.ctx.close().catch(() => {});
      } catch (e) {}
      this.ctx = null;
    }
    this.initCtx();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(err => {
        console.warn("Failed to resume AudioContext during unlock:", err);
      });
    }
    try {
      // Play brief silent note to trigger iOS Safari audio activation
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      osc.start(0);
      osc.stop(0.01);
    } catch (e) {
      console.warn("Failed to play silent beep for unlock:", e);
    }
  }
  isLocked() {
    return !this.ctx || this.ctx.state === "suspended";
  }
  setMute(mute) {
    this.isMuted = mute;
    if (mute) {
      this.stop();
    }
  }
  start(type) {
    this.stop();
    if (this.isMuted) return;
    this.initCtx();
    let toggle = false;
    this.intervalId = setInterval(() => {
      if (this.isMuted) {
        this.stop();
        return;
      }
      if (!this.ctx || this.ctx.state === "suspended") return;
      try {
        const now = this.ctx.currentTime;
        if (type === "fire") {
          // Fire alarm: Piercing dual-frequency physical horn simulation (2800Hz and 2830Hz)
          // Creates a beating frequency that sounds identical to real smoke detector horns.
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();
          osc1.type = "sawtooth";
          osc1.frequency.setValueAtTime(toggle ? 2800 : 2900, now);
          osc2.type = "square";
          osc2.frequency.setValueAtTime(toggle ? 2830 : 2930, now);

          // Combine both for a realistic, loud resonance
          gainNode.gain.setValueAtTime(0.15, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(this.ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.23);
          osc2.start(now);
          osc2.stop(now + 0.23);
          toggle = !toggle;
        } else if (type === "gas") {
          // Gas alarm: Repetitive rapid warning square wave beep (1500Hz)
          const osc = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(1500, now); // Urgent mid-high frequency warning

          gainNode.gain.setValueAtTime(0.14, now);
          gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12); // Shorter, sharper beeps

          osc.connect(gainNode);
          gainNode.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.14);
        }
      } catch (err) {
        console.error("Synthesizer sound error:", err);
      }
    }, 250);
  }
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
export const Dashboard = () => {
  // Socket.io and State
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [espOnline, setEspOnline] = useState(false);

  // Home states
  const [appliances, setAppliances] = useState([{
    id: "light",
    name: "Light Bulb 1",
    status: false
  }, {
    id: "fan",
    name: "Light Bulb 2",
    status: false
  }, {
    id: "bulb3",
    name: "Light Bulb 3",
    status: false
  }, {
    id: "bulb4",
    name: "Light Bulb 4",
    status: false
  }, {
    id: "tv",
    name: "Overhead Fill Pump",
    status: false
  }, {
    id: "socket",
    name: "Fire Extinguisher Pump",
    status: false
  }]);
  const [sensors, setSensors] = useState({
    fireStatus: false,
    gasStatus: false,
    firePumpStatus: false,
    fireSensorAvailable: true,
    gasSensorAvailable: true,
    sonicSensorAvailable: true
  });
  const [waterTank, setWaterTank] = useState({
    percentage: 50,
    pumpStatus: false
  });
  const [timeline, setTimeline] = useState([]);

  // Simulation states (replicates hardware sensors in real-time)
  const [simFire, setSimFire] = useState(false);
  const [simGasValue, setSimGasValue] = useState(400); // Analog raw 0 - 4095
  const [simWaterLevel, setSimWaterLevel] = useState(50); // percentage 0 - 100
const [simPhysicalSwitches, setSimPhysicalSwitches] = useState({
    light: false,
    fan: false,
    bulb3: false,
    bulb4: false,
    tv: false,
    socket: false
  });

  // Toggling loading states
  const [togglingAppliance, setTogglingAppliance] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  // Sound Alarm States
  const [isMuted, setIsMuted] = useState(false);
  const [testAlarmType, setTestAlarmType] = useState(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [audioLocked, setAudioLocked] = useState(true);

  // Ref to hold stable AlarmSoundEngine instance across renders
  const alarmEngineRef = React.useRef(null);
  if (!alarmEngineRef.current) {
    alarmEngineRef.current = new AlarmSoundEngine();
  }

  // Effect to automatically start or stop alarm sounds
  useEffect(() => {
    const engine = alarmEngineRef.current;
    if (!engine) return;
    engine.setMute(isMuted);
    if (!isMuted) {
      if (testAlarmType) {
        engine.start(testAlarmType);
      } else if (sensors.fireStatus) {
        engine.start("fire");
      } else if (sensors.gasStatus) {
        engine.start("gas");
      } else {
        engine.stop();
      }
    } else {
      engine.stop();
    }
    setAudioLocked(engine.isLocked());
    return () => {
      engine.stop();
    };
  }, [sensors.fireStatus, sensors.gasStatus, isMuted, testAlarmType]);

  // Unlock audio state on any user interaction with the document (standard browser policy)
  useEffect(() => {
    const resumeAudio = () => {
      if (alarmEngineRef.current) {
        alarmEngineRef.current.unlock();
        setAudioLocked(alarmEngineRef.current.isLocked());
      }
    };
    // Use capture phase to bypass child elements doing e.stopPropagation()
    window.addEventListener("click", resumeAudio, {
      capture: true
    });
    window.addEventListener("touchstart", resumeAudio, {
      capture: true
    });
    window.addEventListener("touchend", resumeAudio, {
      capture: true
    });
    return () => {
      window.removeEventListener("click", resumeAudio, {
        capture: true
      });
      window.removeEventListener("touchstart", resumeAudio, {
        capture: true
      });
      window.removeEventListener("touchend", resumeAudio, {
        capture: true
      });
    };
  }, []);

  // Editing appliance name state
  const [editingId, setEditingId] = useState(null);
  const [editNameValue, setEditNameValue] = useState("");
  const handleSaveName = async id => {
    if (!editNameValue.trim()) return;
    try {
      const res = await fetch(`/api/appliances/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: editNameValue.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setAppliances(prev => prev.map(app => app.id === id ? {
          ...app,
          name: editNameValue.trim()
        } : app));
        setEditingId(null);
      }
    } catch (err) {
      console.error("Failed to save name:", err);
    }
  };
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // 1. Establish real-time connection
    const socketInstance = io();
    setSocket(socketInstance);
    socketInstance.on("connect", () => {
      setSocketConnected(true);
    });
    socketInstance.on("disconnect", () => {
      setSocketConnected(false);
      setEspOnline(false);
    });
    socketInstance.on("device-online-status", data => {
      setEspOnline(data.online);
    });

    // 2. Receive Initial State
    socketInstance.on("initial-state", data => {
      if (typeof data.deviceOnline === "boolean") {
        setEspOnline(data.deviceOnline);
      }
      if (data.appliances && Array.isArray(data.appliances)) {
        setAppliances(data.appliances);
        // Sync simulation switches with DB status initially
        const switches = {};
        data.appliances.forEach(app => {
          switches[app.id] = app.status;
        });
        setSimPhysicalSwitches(switches);
      }
      if (data.sensors) {
        setSensors(data.sensors);
        setSimFire(data.sensors.fireStatus);
        setSimGasValue(data.sensors.gasStatus ? 2500 : 400);
      }
      if (data.waterTank) {
        setWaterTank(data.waterTank);
        setSimWaterLevel(data.waterTank.percentage);
      }
    });

    // 3. Listen for appliance update broadcasts
    socketInstance.on("appliance-updated", updated => {
      setAppliances(prev => prev.map(app => app.id === updated.id ? {
        ...app,
        status: typeof updated.status === "boolean" ? updated.status : app.status,
        name: typeof updated.name === "string" ? updated.name : app.name
      } : app));
      if (typeof updated.status === "boolean") {
        setTogglingAppliance(prev => ({
          ...prev,
          [updated.id]: false
        }));
        // Keep simulator switch in sync with DB state
        setSimPhysicalSwitches(prev => ({
          ...prev,
          [updated.id]: updated.status
        }));
      }
    });

    // 4. Listen for general sensor or water tank updates
    socketInstance.on("water-updated", updatedWater => {
      setWaterTank(updatedWater);
    });
    socketInstance.on("sensors-updated", updatedSensors => {
      setSensors(updatedSensors);
    });
    socketInstance.on("device-sync", syncData => {
      if (syncData.sensors) setSensors(syncData.sensors);
      if (syncData.waterTank) setWaterTank(syncData.waterTank);
      if (syncData.appliances && Array.isArray(syncData.appliances)) setAppliances(syncData.appliances);
    });

    // 5. Query recent timeline activity logs
    const fetchRecentTimeline = async () => {
      try {
        const res = await fetch("/api/activity");
        const logs = await res.json();
        if (Array.isArray(logs)) {
          setTimeline(logs.slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to load timeline logs:", err);
      }
    };
    fetchRecentTimeline();

    // Listen for new real-time activities to append to the timeline list
    socketInstance.on("new-activity", newLog => {
      setTimeline(prev => [newLog, ...prev.slice(0, 4)]);
    });
    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Web Dashboard toggling handler (Appliance command)
  const toggleAppliance = (id, currentStatus) => {
    if (!socket) return;

    // Optimistic Update: instantly flip state on UI for zero-latency response
    const nextStatus = !currentStatus;
    setAppliances(prev => prev.map(app => app.id === id ? {
      ...app,
      status: nextStatus
    } : app));
    setSimPhysicalSwitches(prev => ({
      ...prev,
      [id]: nextStatus
    }));

    // Send toggle event via socket
    socket.emit("toggle-appliance", {
      id,
      status: nextStatus
    });
  };

  // Virtual ESP32 Hardware triggers / updates
  const handleSimulatorSync = updates => {
    if (!socket) return;
    socket.emit("device-sensor-update", updates);
  };
  const handleSimFireToggle = () => {
    const nextFire = !simFire;
    setSimFire(nextFire);
    const isAvailable = sensors.fireSensorAvailable !== false;
    if (isAvailable) {
      // Optimistic Update: instantly trigger safety warnings on the dashboard and activate/deactivate Fire Pump
      setSensors(prev => ({
        ...prev,
        fireStatus: nextFire,
        firePumpStatus: nextFire
      }));
      setAppliances(prev => prev.map(app => app.id === "socket" ? {
        ...app,
        status: nextFire
      } : app));
      setSimPhysicalSwitches(prev => ({
        ...prev,
        socket: nextFire
      }));
    } else {
      setSensors(prev => ({
        ...prev,
        fireStatus: false
      }));
    }
    handleSimulatorSync({
      fireStatus: nextFire
    });
  };
  const handleSimGasChange = e => {
    const gasVal = parseInt(e.target.value);
    setSimGasValue(gasVal);
    const hasLeak = gasVal > 1500;

    // Optimistically update gas alert indicators in real-time
    const currentlyHasLeak = sensors.gasStatus;
    if (hasLeak !== currentlyHasLeak) {
      const isAvailable = sensors.gasSensorAvailable !== false;
      if (isAvailable) {
        setSensors(prev => ({
          ...prev,
          gasStatus: hasLeak
        }));
      } else {
        setSensors(prev => ({
          ...prev,
          gasStatus: false
        }));
      }
      handleSimulatorSync({
        gasStatus: hasLeak
      });
    }
  };
  const handleSimWaterLevelChange = e => {
    const level = parseInt(e.target.value);
    setSimWaterLevel(level);
    const isAvailable = sensors.sonicSensorAvailable !== false;
    if (isAvailable) {
      // Optimistic Update with hysteresis: use current pump status to decide transitions
      setWaterTank(prev => {
        let nextPumpStatus = prev.pumpStatus;
        // Hysteresis: state-aware control prevents rapid toggling at thresholds
        if (prev.pumpStatus) {
          // Pump is ON — only turn OFF when tank reaches 80% or above
          if (level >= 80) {
            nextPumpStatus = false;
          }
        } else {
          // Pump is OFF — only turn ON when tank drops to 20% or below
          if (level <= 20) {
            nextPumpStatus = true;
          }
        }
        setAppliances(prevApps => prevApps.map(app => app.id === "tv" ? {
          ...app,
          status: nextPumpStatus
        } : app));
        return {
          ...prev,
          percentage: level,
          pumpStatus: nextPumpStatus
        };
      });
    } else {
      // Keep pumpStatus and tv appliance state unchanged (manual) when ultrasonic sensor is offline
      setWaterTank(prev => ({
        ...prev,
        percentage: level
      }));
    }
    handleSimulatorSync({
      waterLevel: level
    });
  };
  const submitSimWaterLevel = () => {
    handleSimulatorSync({
      waterLevel: simWaterLevel
    });
  };
  const handleSimPhysicalSwitchToggle = key => {
    const nextVal = !simPhysicalSwitches[key];

    // Optimistic Update: instantly align simulated hardware buttons and primary status lights
    setSimPhysicalSwitches(prev => ({
      ...prev,
      [key]: nextVal
    }));
    setAppliances(prev => prev.map(app => app.id === key ? {
      ...app,
      status: nextVal
    } : app));

    // Sync to backend via Socket.IO
    handleSimulatorSync({
      isPhysicalToggle: true,
      appliancesState: {
        [key]: nextVal
      }
    });
  };

// Helper icons
  const getApplianceIcon = (id, active) => {
    switch (id) {
      case "light":
        return <Lightbulb className={`h-6 w-6 ${active ? "text-yellow-400 font-bold drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" : "text-slate-500"}`} />;
      case "fan":
        return <FanIconComponent className={`h-6 w-6 ${active ? "drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" : ""}`} active={active} />;
      case "bulb3":
        return <Lightbulb className={`h-6 w-6 ${active ? "text-yellow-400 font-bold drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" : "text-slate-500"}`} />;
      case "bulb4":
        return <Lightbulb className={`h-6 w-6 ${active ? "text-yellow-400 font-bold drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" : "text-slate-500"}`} />;
      case "tv":
        return <Droplet className={`h-6 w-6 ${active ? "text-blue-400 animate-pulse drop-shadow-[0_0_10px_rgba(96,165,250,0.5)]" : "text-slate-500"}`} />;
      case "socket":
        return <ShieldAlert className={`h-6 w-6 ${active ? "text-red-500 animate-pulse drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "text-slate-500"}`} />;
      default:
        return <Zap className={`h-6 w-6 ${active ? "text-blue-500 animate-pulse" : "text-slate-500"}`} />;
    }
  };
  return <div className="space-y-6">
      {/* Elegant Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-white/5 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">System Overview</h2>
<p className="text-slate-400 text-sm">Monitoring 8 active sensors and 6 controllers.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <p className="text-sm font-medium text-white">
              {currentTime.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric"
            })}
            </p>
            <p className="text-xs text-slate-500 font-mono">
              {currentTime.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })}
            </p>
          </div>
        </div>
      </header>

      {/* 1. Urgent Warning Banners */}
      {sensors.fireStatus && <div className="bg-rose-500 text-white rounded-xl p-5 shadow-lg shadow-rose-500/20 border border-rose-400 animate-pulse flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-white/20 rounded-full">
              <Flame className="h-7 w-7 text-white animate-bounce" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg uppercase tracking-wider">CRITICAL: FIRE DETECTED!</h2>
              <p className="text-sm text-rose-100 font-light mt-0.5 leading-normal">
                Buzzer active. Emergency Fire Suppression Pump (Pump 2) is CURRENTLY ACTIVE &amp; spraying sprinklers.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest bg-white text-rose-600 px-3 py-1 rounded-full border border-rose-200">
            Suppression Active
          </span>
        </div>}

      {sensors.gasStatus && <div className="bg-amber-500 text-white rounded-xl p-5 shadow-lg shadow-amber-500/20 border border-amber-400 animate-pulse flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-white/20 rounded-full">
              <AlertTriangle className="h-7 w-7 text-white animate-bounce" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg uppercase tracking-wider">ALERT: LPG GAS LEAKAGE!</h2>
              <p className="text-sm text-amber-100 font-light mt-0.5 leading-normal">
                Active alarm buzzer sounding. Emergency ventilation fan operations recommended immediately.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest bg-white text-amber-600 px-3 py-1 rounded-full border border-amber-200">
            LPG Hazard Detected
          </span>
        </div>}

      {/* Audio Locked Prompt */}
      {audioLocked && !isMuted && (sensors.fireStatus || sensors.gasStatus || testAlarmType) && <div className="bg-blue-600/10 border border-blue-500/20 text-blue-300 rounded-xl p-4.5 flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
          <div className="flex items-start space-x-3 text-left">
            <VolumeX className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Mobile Audio Autoplay Blocked</p>
              <p className="text-[11px] text-slate-300 font-light mt-0.5 leading-normal">
                Mobile browsers block automatic audio. <strong>Tap anywhere on the screen</strong> or click the button to activate real-time audible warnings.
              </p>
            </div>
          </div>
          <button onClick={e => {
        e.stopPropagation();
        if (alarmEngineRef.current) {
          alarmEngineRef.current.unlock();
          setAudioLocked(alarmEngineRef.current.isLocked());
        }
      }} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg shrink-0 transition-all cursor-pointer shadow-lg shadow-blue-500/25">
            Enable Audio
          </button>
        </div>}

      {/* ESP32 Setup & Online Status Helper Banner */}
      {socketConnected && !espOnline && <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3 text-left">
            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg mt-0.5 shrink-0">
              <WifiOff className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Physical ESP32 Device Offline</p>
              <p className="text-[11px] text-slate-300 font-light mt-0.5 leading-normal">
                To connect your ESP32 hardware, power on the device and connect your phone/PC to the <strong className="text-amber-300">"Smart-Home-Setup"</strong> WiFi network. Open <strong className="text-blue-400">http://192.168.4.1</strong> in your browser, select your local network, and set your Backend Server URL to:
              </p>
              <code className="block mt-1.5 p-1 px-2 text-[9px] bg-[#0A0B0D] border border-white/5 text-slate-400 rounded select-all max-w-full overflow-x-auto font-mono">
                {window.location.origin}/api/device/update
              </code>
            </div>
          </div>
          <div className="shrink-0 w-full md:w-auto text-right">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">Using Hardware simulator instead?</p>
            <button onClick={() => setShowSimulator(true)} className="mt-1 w-full md:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all cursor-pointer shadow-lg shadow-amber-500/10">
              Open Simulator
            </button>
          </div>
        </div>}

      {/* 2. System Overview & Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Connection card */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sync Status</span>
            <h3 className="text-lg font-bold text-white mt-1">
              {!socketConnected ? "Server Offline" : espOnline ? "ESP32 Online" : "ESP32 Offline"}
            </h3>
          </div>
          <div className={`p-3 rounded-xl ${!socketConnected ? "bg-rose-500/10 text-rose-500" : espOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500 animate-pulse"}`}>
            <Wifi className="h-6 w-6" />
          </div>
        </div>

        {/* Safety Overview */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Safety Status</span>
            {sensors.fireSensorAvailable === false && sensors.gasSensorAvailable === false ? <h3 className="text-lg font-bold mt-1 text-slate-500">
                Sensors N/A
              </h3> : <h3 className={`text-lg font-bold mt-1 ${sensors.fireStatus || sensors.gasStatus ? "text-rose-500 animate-pulse" : "text-emerald-500"}`}>
                {sensors.fireStatus ? "Fire Danger!" : sensors.gasStatus ? "Gas Leak!" : "SECURED"}
              </h3>}
          </div>
          <div className={`p-3 rounded-xl ${sensors.fireSensorAvailable === false && sensors.gasSensorAvailable === false ? "bg-slate-500/10 text-slate-500" : sensors.fireStatus || sensors.gasStatus ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
            <ShieldAlert className="h-6 w-6" />
          </div>
        </div>

        {/* Water Tank Level */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-5 flex items-center justify-between relative overflow-hidden">
          {sensors.sonicSensorAvailable !== false && <div className="absolute bottom-0 left-0 h-1 bg-cyan-500 transition-all duration-550" style={{
          width: `${waterTank.percentage}%`
        }}></div>}
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Water Tank</span>
            <h3 className="text-lg font-bold text-white mt-1">
              {sensors.sonicSensorAvailable === false ? <span className="text-slate-500 text-base">Sensor N/A</span> : `${waterTank.percentage}%`}
            </h3>
          </div>
          <div className={`p-3 rounded-xl ${sensors.sonicSensorAvailable === false ? "bg-slate-500/10 text-slate-500" : waterTank.percentage < 20 ? "bg-rose-500/10 text-rose-500 animate-pulse" : "bg-cyan-500/10 text-cyan-400"}`}>
            <Droplet className="h-6 w-6" />
          </div>
        </div>

        {/* Active Appliances */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Appliances</span>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-lg font-bold text-white">{appliances.filter(a => a.status).length}</span>
              <span className="text-sm text-blue-400 mb-0.5">/ {appliances.length}</span>
            </div>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
            <Zap className="h-6 w-6" />
          </div>
        </div>
      </div>

{/* 3. Middle Section: Appliances, Water Tank and Safety Test Console */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
{/* Appliances Overview Widget */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-6 flex flex-col space-y-6">
          
{/* --- Manual Appliances Section (4 Switches) --- */}
          <div>
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Manual Appliances</h2>
                <p className="text-xs text-slate-400 mt-1">Four light bulb switch control system</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {appliances.filter(a => a.id === "light" || a.id === "fan" || a.id === "bulb3" || a.id === "bulb4").map(app => {
              const active = app.status;
              return <div key={app.id} onClick={() => toggleAppliance(app.id, active)} className={`p-3.5 rounded-xl border flex flex-col justify-between h-28 text-left transition-all cursor-pointer group/card ${active ? "bg-blue-600/5 border-blue-500/20 hover:bg-blue-600/10" : "bg-[#0A0B0D]/50 border-white/5 hover:bg-white/5"}`}>
                    <div className="flex items-center justify-between w-full">
                      <div className={`p-1.5 rounded-lg ${active ? "bg-blue-600/10 text-blue-400" : "bg-[#16181D] text-slate-500"}`}>
                        {getApplianceIcon(app.id, active)}
                      </div>
                      <div className="flex items-center gap-1">
                        {editingId !== app.id && <button onClick={e => {
                      e.stopPropagation();
                      setEditingId(app.id);
                      setEditNameValue(app.name);
                    }} className="opacity-0 group-hover/card:opacity-100 p-1 text-slate-500 hover:text-white rounded transition-all" title="Rename">
                            <Pencil className="h-3 w-3" />
                          </button>}
                        <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" : "bg-slate-700"}`}></span>
                      </div>
                    </div>
                    <div className="mt-2.5">
                      {editingId === app.id ? <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input type="text" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} className="bg-[#0A0B0D] border border-blue-500/50 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none w-20" autoFocus onKeyDown={e => {
                      if (e.key === "Enter") handleSaveName(app.id);
                      if (e.key === "Escape") setEditingId(null);
                    }} />
                          <button onClick={() => handleSaveName(app.id)} className="p-0.5 text-emerald-400 hover:bg-emerald-500/10 rounded">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-0.5 text-rose-400 hover:bg-rose-500/10 rounded">
                            <X className="h-3 w-3" />
                          </button>
                        </div> : <>
                          <p className="text-xs font-bold text-white truncate">{app.name}</p>
                          <p className={`text-[9px] mt-0.5 font-semibold uppercase tracking-wider ${active ? "text-blue-400" : "text-slate-500"}`}>
                            {active ? "ON" : "OFF"}
                          </p>
                        </>}
                    </div>
                  </div>;
            })}
            </div>
          </div>

          {/* --- Automated Active Section --- */}
          <div>
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-3 mb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">Automated Active</h2>
                <p className="text-xs text-slate-400 mt-1">System-controlled pumps with safety logic</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {appliances.filter(a => a.id === "tv" || a.id === "socket").map(app => {
              const active = app.status;
              return <div key={app.id} onClick={() => toggleAppliance(app.id, active)} className={`p-3.5 rounded-xl border flex flex-col justify-between h-28 text-left transition-all cursor-pointer group/card ${active ? "bg-amber-600/5 border-amber-500/20 hover:bg-amber-600/10" : "bg-[#0A0B0D]/50 border-white/5 hover:bg-white/5"}`}>
                    <div className="flex items-center justify-between w-full">
                      <div className={`p-1.5 rounded-lg ${active ? "bg-amber-600/10 text-amber-400" : "bg-[#16181D] text-slate-500"}`}>
                        {getApplianceIcon(app.id, active)}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">Auto</span>
                        {editingId !== app.id && <button onClick={e => {
                      e.stopPropagation();
                      setEditingId(app.id);
                      setEditNameValue(app.name);
                    }} className="opacity-0 group-hover/card:opacity-100 p-1 text-slate-500 hover:text-white rounded transition-all" title="Rename">
                            <Pencil className="h-3 w-3" />
                          </button>}
                        <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "bg-slate-700"}`}></span>
                      </div>
                    </div>
                    <div className="mt-2.5">
                      {editingId === app.id ? <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input type="text" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} className="bg-[#0A0B0D] border border-amber-500/50 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none w-20" autoFocus onKeyDown={e => {
                      if (e.key === "Enter") handleSaveName(app.id);
                      if (e.key === "Escape") setEditingId(null);
                    }} />
                          <button onClick={() => handleSaveName(app.id)} className="p-0.5 text-emerald-400 hover:bg-emerald-500/10 rounded">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-0.5 text-rose-400 hover:bg-rose-500/10 rounded">
                            <X className="h-3 w-3" />
                          </button>
                        </div> : <>
                          <p className="text-xs font-bold text-white truncate">{app.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className={`text-[9px] font-semibold uppercase tracking-wider ${active ? "text-amber-400" : "text-slate-500"}`}>
                              {active ? "ON" : "OFF"}
                            </p>
                            <span className="text-[7px] text-slate-500 font-medium">(Auto)</span>
                          </div>
                        </>}
                    </div>
                  </div>;
            })}
            </div>
          </div>

        </div>

        {/* Water Tank Diagram Column */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Water Storage Tank</h2>
            
            {/* Visual Tank diagram using CSS & SVG */}
            <div className="flex flex-col items-center py-5 bg-[#0A0B0D]/60 rounded-xl border border-white/5 p-4 w-full">
              <div className="relative w-24 h-36 border-4 border-slate-700 rounded-b-2xl rounded-t-lg bg-[#0A0B0D] overflow-hidden flex flex-col justify-end">
                {sensors.sonicSensorAvailable === false ? <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/30">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider text-center px-2 leading-tight">Sensor<br />Offline</span>
                  </div> : <>
                    {/* Visual water column */}
                    <div className={`w-full transition-all duration-1000 ease-in-out relative ${waterTank.percentage < 20 ? "bg-rose-500/80 shadow-rose-500/50" : "bg-blue-500/80 shadow-blue-500/50"}`} style={{
                  height: `${waterTank.percentage}%`
                }}>
                      {/* Fluid waves animation */}
                      <div className="absolute -top-1 left-0 right-0 h-1.5 bg-white/20 animate-pulse rounded-full"></div>
                    </div>

                    {/* Level overlay text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
                      <span className="text-xl font-black text-white drop-shadow-md">{waterTank.percentage}%</span>
                      <span className="text-[8px] uppercase tracking-widest text-slate-300 font-bold drop-shadow-md">Capacity</span>
                    </div>
                  </>}
              </div>

              {/* Dual Pump Actuator Status */}
              <div className="mt-4 w-full border-t border-white/5 pt-4 space-y-3.5 text-left">
                {/* Pump 1: Overhead Tank Filling Pump */}
                <div className="p-2.5 bg-[#0A0B0D]/80 rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="pr-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Overhead Fill Pump (Pump 1)</p>
                    {sensors.sonicSensorAvailable === false ? <p className="text-[9px] text-amber-500/90 mt-0.5 leading-normal font-medium">
                        Auto control suspended (Sonic sensor offline)
                      </p> : <p className="text-[9px] text-slate-500 mt-0.5 leading-normal">
                        Auto refills when Tank &lt; 20%, stops at 80%
                      </p>}
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span className={`h-2 w-2 rounded-full ${waterTank.pumpStatus ? "bg-emerald-500 animate-ping" : "bg-slate-600"}`}></span>
                    <span className={`text-[10px] font-extrabold uppercase ${waterTank.pumpStatus ? "text-emerald-400" : "text-slate-500"}`}>
                      {waterTank.pumpStatus ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>

                {/* Pump 2: Emergency Fire Extinguisher Pump */}
                <div className="p-2.5 bg-[#0A0B0D]/80 rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="pr-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Fire Suppression Pump (Pump 2)</p>
                    {sensors.fireSensorAvailable === false ? <p className="text-[9px] text-amber-500/90 mt-0.5 leading-normal font-medium">
                        Auto activation disabled (Flame sensor offline)
                      </p> : <p className="text-[9px] text-slate-500 mt-0.5 leading-normal">
                        Auto-activated when active Fire is detected
                      </p>}
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span className={`h-2 w-2 rounded-full ${sensors.firePumpStatus ? "bg-rose-500 animate-ping" : "bg-slate-600"}`}></span>
                    <span className={`text-[10px] font-extrabold uppercase ${sensors.firePumpStatus ? "text-rose-400" : "text-slate-500"}`}>
                      {sensors.firePumpStatus ? "ACTIVE" : "OFF"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Safety & Alarm Control Console */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Alarm &amp; Safety Control</h2>
                <p className="text-xs text-slate-400 mt-1">Test safety relays &amp; sounds</p>
              </div>
              <button onClick={() => {
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (!nextMuted && alarmEngineRef.current) {
                alarmEngineRef.current.unlock();
                setAudioLocked(alarmEngineRef.current.isLocked());
              }
            }} className={`p-2 rounded-xl border transition-all cursor-pointer ${isMuted ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20" : "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20"}`} title={isMuted ? "Unmute Alarm Sound" : "Mute Alarm Sound"}>
                {isMuted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
              </button>
            </div>

            {/* Simulated Alarm Wave indicator */}
            {(sensors.fireStatus || sensors.gasStatus) && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider animate-pulse flex items-center gap-1">
                    <BellRing className="h-3.5 w-3.5 text-red-500 animate-bounce" />
                    {sensors.fireStatus ? "Fire Alarm Ringing!" : "Gas Leak Ringing!"}
                  </span>
                </div>
                <div className="flex items-center space-x-0.5">
                  <div className="w-0.5 h-3 bg-red-500 animate-pulse rounded-full" style={{
                animationDelay: "0ms"
              }}></div>
                  <div className="w-0.5 h-4.5 bg-red-500 animate-pulse rounded-full" style={{
                animationDelay: "150ms"
              }}></div>
                  <div className="w-0.5 h-2 bg-red-500 animate-pulse rounded-full" style={{
                animationDelay: "300ms"
              }}></div>
                  <div className="w-0.5 h-3.5 bg-red-500 animate-pulse rounded-full" style={{
                animationDelay: "450ms"
              }}></div>
                </div>
              </div>}

            {!showSimulator ? (/* System Active Panel (When collapsed) */
          <div className="space-y-3">
                <div className="flex flex-col items-center justify-center py-5 border border-dashed border-white/5 rounded-xl bg-[#0A0B0D]/20 text-center px-4">
                  <ShieldAlert className="h-6 w-6 text-emerald-400 mb-2 animate-pulse" />
                  <p className="text-[11px] font-bold text-slate-300">Hardware Sensor Status</p>
                  
                  {/* Small clean status badges */}
                  <div className="flex flex-wrap justify-center gap-1.5 mt-2.5 mb-1">
                    <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${sensors.fireSensorAvailable !== false ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 animate-pulse" : "bg-slate-500/10 text-slate-500 border border-slate-500/10"}`}>
                      🔥 Flame: {sensors.fireSensorAvailable !== false ? "Armed" : "N/A"}
                    </span>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${sensors.gasSensorAvailable !== false ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 animate-pulse" : "bg-slate-500/10 text-slate-500 border border-slate-500/10"}`}>
                      ⚠️ LPG Gas: {sensors.gasSensorAvailable !== false ? "Armed" : "N/A"}
                    </span>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${sensors.sonicSensorAvailable !== false ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 animate-pulse" : "bg-slate-500/10 text-slate-500 border border-slate-500/10"}`}>
                      📏 Sonic: {sensors.sonicSensorAvailable !== false ? "Armed" : "N/A"}
                    </span>
                  </div>
                </div>
                
                <button onClick={() => setShowSimulator(true)} className="w-full py-2.5 px-3 bg-[#0A0B0D] hover:bg-white/5 border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-blue-400" />
                  <span>Open Hardware Simulator</span>
                </button>
              </div>) : (/* Test Simulation Controls (When expanded) */
          <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">1. Alarm &amp; Tank Testing</h3>
                  <button onClick={() => setShowSimulator(false)} className="text-[9px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1 hover:underline">
                    <ChevronUp className="h-3 w-3" />
                    <span>Collapse</span>
                  </button>
                </div>
                
                {/* Simulate Fire trigger */}
                <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Flame className={`h-4 w-4 ${sensors.fireStatus ? "text-rose-500 animate-bounce" : "text-slate-500"}`} />
                    <div>
                      <p className="text-[11px] font-bold text-white">Simulate Fire</p>
                      <p className="text-[9px] text-slate-500">Auto starts Fire Pump (Pump 2)</p>
                    </div>
                  </div>
                  <button onClick={handleSimFireToggle} className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${sensors.fireStatus ? "bg-rose-600 hover:bg-rose-500 text-white" : "bg-[#16181D] border border-white/5 hover:bg-white/5 text-slate-300"}`}>
                    {sensors.fireStatus ? "Extinguish" : "Trigger"}
                  </button>
                </div>

                {/* Simulate Gas trigger */}
                <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className={`h-4 w-4 ${sensors.gasStatus ? "text-amber-500 animate-bounce" : "text-slate-500"}`} />
                    <div>
                      <p className="text-[11px] font-bold text-white">Simulate Gas Leak</p>
                      <p className="text-[9px] text-slate-500">Triggers alarm buzzer</p>
                    </div>
                  </div>
                  <button onClick={() => {
                const nextGas = !sensors.gasStatus;
                setSimGasValue(nextGas ? 2500 : 400);
                handleSimulatorSync({
                  gasStatus: nextGas
                });
              }} className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${sensors.gasStatus ? "bg-amber-600 hover:bg-amber-500 text-white" : "bg-[#16181D] border border-white/5 hover:bg-white/5 text-slate-300"}`}>
                    {sensors.gasStatus ? "Clear" : "Leak Gas"}
                  </button>
                </div>

                {/* Simulate Water Tank level slider */}
                <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl space-y-1.5">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-slate-400">Simulate Water Level</span>
                    <div className="flex items-center space-x-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[9px] font-bold uppercase text-emerald-400 font-mono">Live</span>
                      <span className="font-mono text-cyan-400 font-bold ml-1">{simWaterLevel}%</span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <input type="range" min="0" max="100" value={simWaterLevel} onChange={handleSimWaterLevelChange} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                  </div>
                </div>

                {/* Simulated Manual Switches for Manual Appliances */}
                <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl space-y-3 mt-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">3. Manual Appliance Switches</h3>
                    <span className="text-[9px] uppercase tracking-wider text-slate-400">Live Control</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['light', 'fan', 'bulb3', 'bulb4'].map(key => {
                    const isActive = simPhysicalSwitches[key];
                    const title = {
                      light: 'Light Bulb 1',
                      fan: 'Light Bulb 2',
                      bulb3: 'Light Bulb 3',
                      bulb4: 'Light Bulb 4'
                    }[key];
                    return <button key={key} onClick={() => handleSimPhysicalSwitchToggle(key)} className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${isActive ? 'bg-blue-600/10 border-blue-500 text-blue-200' : 'bg-[#16181D] border-white/5 text-slate-300 hover:bg-white/5'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
                            <span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold">{isActive ? 'ON' : 'OFF'}</span>
                            {getApplianceIcon(key, isActive)}
                          </div>
                        </button>;
                  })}
                  </div>
                </div>

                {/* Audible Siren Tester */}
                <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">2. Audible Siren Tester</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => {
                  if (testAlarmType === "fire") {
                    setTestAlarmType(null);
                  } else {
                    setTestAlarmType("fire");
                    if (alarmEngineRef.current) {
                      alarmEngineRef.current.unlock();
                    }
                  }
                }} className={`p-2.5 rounded-xl border text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${testAlarmType === "fire" ? "bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse" : "bg-[#0A0B0D]/40 border-white/5 hover:bg-white/5 text-slate-300"}`}>
                      <span className="text-sm">🔥</span>
                      <span>{testAlarmType === "fire" ? "Stop Fire Siren" : "Test Fire Siren"}</span>
                    </button>
                    <button onClick={() => {
                  if (testAlarmType === "gas") {
                    setTestAlarmType(null);
                  } else {
                    setTestAlarmType("gas");
                    if (alarmEngineRef.current) {
                      alarmEngineRef.current.unlock();
                    }
                  }
                }} className={`p-2.5 rounded-xl border text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${testAlarmType === "gas" ? "bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse" : "bg-[#0A0B0D]/40 border-white/5 hover:bg-white/5 text-slate-300"}`}>
                      <span className="text-sm">⚠️</span>
                      <span>{testAlarmType === "gas" ? "Stop Gas Siren" : "Test Gas Siren"}</span>
                    </button>
                  </div>
                </div>
              </div>)}
          </div>

          <div className="text-[9px] text-slate-500 leading-normal border-t border-white/5 pt-2.5 mt-2.5">
            {!isMuted && (sensors.fireStatus || sensors.gasStatus) && <p className="text-amber-400/90 font-medium animate-pulse">
                ℹ️ Click anywhere on the dashboard to enable the synthesized alarm sound if blocked.
              </p>}
            {isMuted && <p className="text-slate-400">
                🔈 Audible warnings are muted. Toggle mute icon to hear system sirens.
              </p>}
            {!sensors.fireStatus && !sensors.gasStatus && <p>
                🔒 Sensors armed. Use the buttons above to simulate emergency alarms and check pump response.
              </p>}
          </div>
        </div>
      </div>
    </div>;
};
