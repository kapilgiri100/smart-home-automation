import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { Login } from "./pages/Login.jsx";
import { Register } from "./pages/Register.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { ActivityLogs } from "./pages/ActivityLogs.jsx";
import { Settings } from "./pages/Settings.jsx";
import { Schedules } from "./pages/Schedules.jsx";
import { AboutUs } from "./pages/AboutUs.jsx";
import { NotFound } from "./pages/NotFound.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { GlobalAlarm } from "./components/GlobalAlarm.jsx";
import { Lock, LogOut, ShieldAlert, Cpu, Menu } from "lucide-react";
import io from "socket.io-client";

// Protected Layout wrapper
const AppLayout = () => {
  const {
    user,
    token,
    loading,
    logout
  } = useAuth();
  const [socketConnected, setSocketConnected] = useState(false);
  const [espOnline, setEspOnline] = useState(false);
  const [dbUser, setDbUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [passcode, setPasscode] = useState("");
  const [authError, setAuthError] = useState(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    const socket = io();
    socket.on("connect", () => {
      setSocketConnected(true);
    });
    socket.on("disconnect", () => {
      setSocketConnected(false);
      setEspOnline(false);
    });
    socket.on("initial-state", data => {
      if (data && typeof data.deviceOnline === "boolean") {
        setEspOnline(data.deviceOnline);
      }
    });
    socket.on("device-online-status", data => {
      setEspOnline(data.online);
    });
    return () => {
      socket.disconnect();
    };
  }, [user]);

  // Fetch user authorization status from backend
  const checkAuthStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/auth/profile", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDbUser(data.dbUser);
      }
    } catch (err) {
      console.error("Auth status check failed:", err);
    } finally {
      setAuthChecking(false);
    }
  };
  useEffect(() => {
    if (user && token) {
      checkAuthStatus();
    } else if (!user) {
      setDbUser(null);
      setAuthChecking(false);
    }
  }, [user, token]);
  const handleAuthorize = async e => {
    e.preventDefault();
    if (!passcode.trim() || !token) return;
    setAuthorizing(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          passcode
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDbUser(data.dbUser);
      } else {
        setAuthError(data.error || "Invalid authorization passcode.");
      }
    } catch (err) {
      setAuthError(err.message || "Failed to contact authorization server.");
    } finally {
      setAuthorizing(false);
    }
  };
  if (loading || authChecking) {
    return <div className="min-h-screen bg-[#0A0B0D] flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent"></div>
        <span className="text-slate-400 text-sm font-light">Verifying credentials &amp; authorization...</span>
      </div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If logged in, but database says they are not authorized:
  if (dbUser && !dbUser.isAuthorized) {
    return <div className="min-h-screen bg-[#0A0B0D] flex flex-col justify-center items-center p-4 relative overflow-hidden text-slate-200">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-600/5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="w-full max-w-md bg-[#16181D] border border-rose-500/20 rounded-2xl p-8 shadow-2xl relative z-10 text-center space-y-6">
          <div className="inline-flex bg-rose-500/10 border border-rose-500/25 p-4 rounded-2xl">
            <Lock className="h-8 w-8 text-rose-500 animate-pulse" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Access Restricted</h1>
            <p className="text-xs text-rose-400 font-semibold mt-1.5 uppercase tracking-wider">Unauthorized Account</p>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Your account <span className="text-slate-200 font-mono font-medium">{user.email}</span> is registered but not yet authorized to operate this control system.
            </p>
          </div>

          <form onSubmit={handleAuthorize} className="space-y-4 text-left border-t border-b border-white/5 py-5">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Enter Authorization Passcode</label>
              <input type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="••••••••••••" className="w-full bg-[#0A0B0D] border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500/40 transition-all text-center font-mono placeholder:text-slate-700" required autoFocus />
            </div>

            {authError && <div className="p-3 bg-rose-500/10 border border-rose-500/15 rounded-xl text-xs text-rose-400 flex items-start space-x-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-normal">{authError}</span>
              </div>}

            <button type="submit" disabled={authorizing} className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800/40 disabled:text-slate-500 font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-rose-500/10 hover:shadow-rose-500/20 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer text-white">
              {authorizing ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> : <span>Request Authorization</span>}
            </button>
          </form>

          <button onClick={() => logout()} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-2 mx-auto px-4 py-2 hover:bg-white/5 rounded-xl transition-all font-medium border border-transparent hover:border-white/5">
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out to switch account</span>
          </button>
        </div>
      </div>;
  }
return <div className="flex min-h-screen bg-[#0A0B0D] text-slate-200 font-sans relative">
      {/* Global Alarm - plays selected sounds on any page */}
      <GlobalAlarm />

      {/* Persistent Left Navigation Sidebar */}
      <Sidebar socketConnected={socketConnected} espOnline={espOnline} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Primary Dashboard Panel View */}
      <main className="flex-1 p-5 md:p-8 overflow-y-auto h-screen w-full">
        {/* Mobile top bar */}
        <div className="flex md:hidden items-center justify-between bg-[#111318] border border-white/5 p-4 rounded-2xl mb-6">
          <div className="flex items-center space-x-3">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-[#1c1f26] border border-white/5 text-slate-200 rounded-xl hover:text-white">
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-bold text-sm text-white">Smart Home Panel</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${espOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-amber-500 animate-pulse"}`}></div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{espOnline ? "Online" : "Offline"}</span>
          </div>
        </div>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/activity" element={<ActivityLogs />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/schedule" element={<Schedules />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>;
};
export default function App() {
  return <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Access authentication endpoints */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Secure authenticated layout operations */}
          <Route path="/*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>;
}
