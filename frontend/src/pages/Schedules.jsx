import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import { Clock, Plus, Trash2, Power, AlertCircle, Calendar, Compass, Lightbulb, Tv, Zap, Check, ToggleLeft, ToggleRight } from "lucide-react";

// Convert stored 24-hour "HH:MM" to 12-hour "h:mm AM/PM" for display
const formatScheduleTime = time24 => {
  if (!time24 || typeof time24 !== "string") return time24;
  const [hourStr, minuteStr = "00"] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return time24;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteStr.padStart(2, "0")} ${period}`;
};

// Custom simple Fan icon animation component using CSS keyframes
const FanIcon = ({
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
export const Schedules = () => {
  const [socket, setSocket] = useState(null);
  const [appliances, setAppliances] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [selectedAppliance, setSelectedAppliance] = useState("");
  const [selectedAction, setSelectedAction] = useState("ON");
  const [selectedTime, setSelectedTime] = useState("08:00");
  const [detectedTimezone, setDetectedTimezone] = useState("UTC");
  useEffect(() => {
    // Detect local timezone
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setDetectedTimezone(tz);
    } catch (e) {
      console.warn("Timezone detection failed, defaulting to UTC");
    }

    // 1. Establish real-time connection
    const socketInstance = io();
    setSocket(socketInstance);

    // 2. Initial state sync
    socketInstance.on("initial-state", data => {
      if (data.appliances) {
        setAppliances(data.appliances);
        if (data.appliances.length > 0) {
          setSelectedAppliance(data.appliances[0].id);
        }
      }
      if (data.schedules) {
        setSchedules(data.schedules);
      }
      setLoading(false);
    });

    // 3. Listen for real-time schedule events
    socketInstance.on("schedule-created", newSched => {
      setSchedules(prev => [...prev, newSched]);
    });
    socketInstance.on("schedule-updated", updatedSched => {
      setSchedules(prev => prev.map(s => s.id === updatedSched.id ? updatedSched : s));
    });
    socketInstance.on("schedule-deleted", data => {
      setSchedules(prev => prev.filter(s => s.id !== data.id));
    });

    // Listen to renames so names stay in sync on schedule list
    socketInstance.on("appliance-updated", updated => {
      if (updated.name) {
        setAppliances(prev => prev.map(app => app.id === updated.id ? {
          ...app,
          name: updated.name
        } : app));
      }
    });

    // Fallback load if socket fails to emit initial state
    const fetchData = async () => {
      try {
        const [appRes, schedRes] = await Promise.all([fetch("/api/appliances"), fetch("/api/schedules")]);
        const apps = await appRes.json();
        const scheds = await schedRes.json();
        if (Array.isArray(apps)) {
          setAppliances(apps);
          if (apps.length > 0 && !selectedAppliance) {
            setSelectedAppliance(apps[0].id);
          }
        }
        if (Array.isArray(scheds)) {
          setSchedules(scheds);
        }
        setLoading(false);
      } catch (err) {
        console.error("Fetch fallback error:", err);
        setError("Could not establish server connection.");
        setLoading(false);
      }
    };
    fetchData();
    return () => {
      socketInstance.disconnect();
    };
  }, []);
  const handleCreateSchedule = async e => {
    e.preventDefault();
    if (!selectedAppliance || !selectedAction || !selectedTime) return;
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          applianceId: selectedAppliance,
          action: selectedAction,
          time: selectedTime,
          timezone: detectedTimezone
        })
      });
      if (!res.ok) {
        throw new Error("Failed to save schedule.");
      }

      // Clear or reset some form values
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to create schedule.");
    }
  };
  const handleToggleSchedule = async (id, currentActive) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          isActive: !currentActive
        })
      });
      if (!res.ok) {
        throw new Error("Failed to update status.");
      }
    } catch (err) {
      setError(err.message);
    }
  };
  const handleDeleteSchedule = async id => {
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        throw new Error("Failed to delete schedule.");
      }
    } catch (err) {
      setError(err.message);
    }
  };
  const getApplianceIcon = id => {
    switch (id) {
      case "light":
        return <Lightbulb className="h-5 w-5 text-blue-400" />;
      case "fan":
        return <FanIcon className="h-5 w-5 text-emerald-400" active={true} />;
      case "tv":
        return <Tv className="h-5 w-5 text-purple-400" />;
      case "socket":
        return <Zap className="h-5 w-5 text-amber-400" />;
      default:
        return <Clock className="h-5 w-5 text-slate-400" />;
    }
  };
  const getApplianceName = id => {
    const app = appliances.find(a => a.id === id);
    return app ? app.name : id;
  };
  return <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/5 pb-5 gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 shadow-lg shadow-blue-500/5">
              <Clock className="h-6 w-6 text-blue-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Appliance Scheduler</h1>
              <p className="text-xs text-slate-400 mt-1">Automate home appliances by setting schedules to turn ON or OFF at specified times</p>
            </div>
          </div>
        </div>
        
        {/* Timezone badge */}
        <div className="flex items-center space-x-2 bg-blue-600/10 border border-blue-500/25 px-3 py-1.5 rounded-xl self-start md:self-center">
          <Compass className="h-4 w-4 text-blue-400 animate-spin" style={{
          animationDuration: "12s"
        }} />
          <span className="text-xs text-slate-300 font-medium">Zone: <span className="text-blue-400 font-mono">{detectedTimezone}</span></span>
        </div>
      </div>

      {error && <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center space-x-3 text-rose-400 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>}

      {loading ? <div className="flex flex-col items-center justify-center p-20 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
          <span className="text-slate-500 text-xs">Syncing schedules...</span>
        </div> : <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Create Schedule Card */}
          <div className="lg:col-span-5 bg-[#16181D] border border-white/5 rounded-2xl p-6 h-fit space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-400" />
              <span>Add New Schedule</span>
            </h2>

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              {/* Select Appliance */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Select Appliance</label>
                <select value={selectedAppliance} onChange={e => setSelectedAppliance(e.target.value)} className="w-full bg-[#0A0B0D] border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all" required>
                  {appliances.map(app => <option key={app.id} value={app.id}>
                      {app.name}
                    </option>)}
                </select>
              </div>

              {/* Action Selection (ON/OFF) */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Target Action</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setSelectedAction("ON")} className={`flex items-center justify-center space-x-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${selectedAction === "ON" ? "bg-emerald-600/10 text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/5" : "bg-[#0A0B0D] text-slate-500 border-white/5 hover:text-slate-300"}`}>
                    <Power className="h-4 w-4" />
                    <span>Turn ON</span>
                  </button>
                  <button type="button" onClick={() => setSelectedAction("OFF")} className={`flex items-center justify-center space-x-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${selectedAction === "OFF" ? "bg-rose-600/10 text-rose-400 border-rose-500/30 shadow-lg shadow-rose-500/5" : "bg-[#0A0B0D] text-slate-500 border-white/5 hover:text-slate-300"}`}>
                    <Power className="h-4 w-4" />
                    <span>Turn OFF</span>
                  </button>
                </div>
              </div>

              {/* Time Picker */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-medium">Scheduled Time</label>
                <div className="relative">
                  <input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} className="w-full bg-[#0A0B0D] border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono" required />
                </div>
                <p className="text-[10px] text-slate-500 italic mt-1 leading-normal">
                  Schedules evaluate at exact minute boundaries based on the detected timezone offset.
                </p>
                {selectedTime && <p className="text-[11px] text-blue-400 font-medium mt-1">
                  Selected: {formatScheduleTime(selectedTime)}
                </p>}
              </div>

              {/* Submit Button */}
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-blue-600/15 hover:shadow-blue-600/25 transition-all text-sm flex items-center justify-center gap-2">
                <Check className="h-4 w-4" />
                <span>Save Schedule</span>
              </button>
            </form>
          </div>

          {/* Schedules List Grid */}
          <div className="lg:col-span-7 bg-[#16181D] border border-white/5 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" />
              <span>List of Schedules ({schedules.length})</span>
            </h2>

            {schedules.length === 0 ? <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 border border-dashed border-white/5 rounded-xl">
                <div className="p-4 bg-slate-800/40 text-slate-500 rounded-full">
                  <Clock className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-300">No Active Schedules</h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-normal">Schedules you create will appear here. They run fully server-side automatically.</p>
                </div>
              </div> : <div className="space-y-3">
                {schedules.map(sched => <div key={sched.id} className={`bg-[#0A0B0D]/55 border transition-all rounded-xl p-4 flex items-center justify-between gap-4 group ${sched.isActive ? "border-white/5 shadow-md hover:border-white/10" : "border-white/5 opacity-60"}`}>
                    <div className="flex items-center space-x-3.5">
                      {/* Schedule parameters */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-base">{formatScheduleTime(sched.time)}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${sched.action === "ON" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border-rose-500/25"}`}>
                            {sched.action}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-300 mt-0.5">{getApplianceName(sched.applianceId)}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{sched.timezone}</p>
                      </div>
                    </div>

                    {/* Right side controls */}
                    <div className="flex items-center space-x-2 shrink-0">
                      {/* Active switch toggle */}
                      <button onClick={() => handleToggleSchedule(sched.id, sched.isActive)} className="p-1.5 text-slate-400 hover:text-white transition-colors" title={sched.isActive ? "Pause Schedule" : "Resume Schedule"}>
                        {sched.isActive ? <ToggleRight className="h-7 w-7 text-blue-500" /> : <ToggleLeft className="h-7 w-7 text-slate-600" />}
                      </button>

                      {/* Delete button */}
                      <button onClick={() => handleDeleteSchedule(sched.id)} className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all border border-transparent hover:border-rose-500/20" title="Delete Schedule">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>)}
              </div>}
          </div>

        </div>}
    </div>;
};
