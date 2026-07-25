import React, { useEffect, useState } from "react";
import { Activity, Search, Filter, RefreshCw, Calendar, AlertTriangle, Zap, Info } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import io from "socket.io-client";
export const ActivityLogs = () => {
  const {
    token
  } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity");
      const data = await res.json();
      if (Array.isArray(data)) {
        // Enforce limit of 20 logs
        setLogs(data.slice(0, 20));
      }
    } catch (err) {
      console.error("Failed to load activities:", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchLogs();

    // Listen to real-time logs via Socket.IO
    const socket = io();
    socket.on("new-activity", newLog => {
      // Limit to last 20 logs in real-time
      setLogs(prev => [newLog, ...prev].slice(0, 20));
    });
    return () => {
      socket.disconnect();
    };
  }, []);
  const getLogCategoryInfo = event => {
    const text = event.toLowerCase();
    if (text.includes("fire") || text.includes("gas") || text.includes("leakage") || text.includes("warning") || text.includes("alarm")) {
      return {
        bg: "bg-rose-500/10 border-rose-500/20 text-rose-400",
        icon: AlertTriangle,
        type: "security"
      };
    }
    if (text.includes("light") || text.includes("fan") || text.includes("tv") || text.includes("socket")) {
      return {
        bg: "bg-blue-500/10 border-blue-500/20 text-blue-400",
        icon: Zap,
        type: "appliances"
      };
    }
    if (text.includes("pump") || text.includes("tank") || text.includes("water")) {
      return {
        bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
        icon: RefreshCw,
        type: "pump"
      };
    }
    return {
      bg: "bg-[#0A0B0D] border-white/5 text-slate-400",
      icon: Info,
      type: "info"
    };
  };

  // Filter & Search Logic
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.event.toLowerCase().includes(search.toLowerCase());
    const info = getLogCategoryInfo(log.event);
    if (filterType === "all") return matchesSearch;
    return matchesSearch && info.type === filterType;
  });
  return <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20">
            <Activity className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">System Activity Logs</h1>
            <p className="text-sm text-slate-400">Review historical smart home events and safety logs in real time</p>
          </div>
        </div>

        <button onClick={fetchLogs} disabled={loading} className="inline-flex items-center space-x-2 py-2 px-4 rounded-lg bg-[#16181D] border border-white/5 hover:bg-white/5 text-slate-300 font-medium text-xs transition-colors cursor-pointer">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Control Panel: Search & Filters */}
      <div className="bg-[#16181D] border border-white/5 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input type="text" placeholder="Search events (e.g. fire, light on...)" value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-[#0A0B0D] border border-white/5 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors" />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {["all", "security", "appliances", "pump"].map(type => <button key={type} onClick={() => setFilterType(type)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${filterType === type ? "bg-blue-600 text-white" : "bg-[#0A0B0D] text-slate-400 border border-white/5 hover:bg-white/5"}`}>
              {type === "all" ? "All Events" : type}
            </button>)}
        </div>
      </div>

      {/* Activity Timeline Card */}
      <div className="bg-[#16181D] border border-white/5 rounded-xl p-6 text-slate-200">
        {loading && logs.length === 0 ? <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent"></div>
            <span className="text-slate-400 text-sm">Querying logs from Cloud SQL...</span>
          </div> : filteredLogs.length === 0 ? <div className="text-center py-20 text-slate-500 text-sm">
            No matching activities found.
          </div> : <div className="space-y-6 relative before:absolute before:inset-0 before:left-3.5 before:bg-white/5 before:w-0.5">
            {filteredLogs.map(log => {
          const info = getLogCategoryInfo(log.event);
          const LogIcon = info.icon;
          return <div key={log.id || log.createdAt} className="flex items-start space-x-4 relative">
                  {/* Category Bullet Indicator */}
                  <div className={`p-1.5 rounded-full border shrink-0 relative z-10 ${info.bg}`}>
                    <LogIcon className="h-4.5 w-4.5" />
                  </div>

                  {/* Log Content */}
                  <div className="flex-1 min-w-0 bg-[#0A0B0D]/60 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200 leading-relaxed truncate pr-4">
                      {log.event}
                    </span>
                    <div className="flex items-center text-xs text-slate-500 space-x-1.5 shrink-0">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>;
        })}
          </div>}
      </div>
    </div>;
};
