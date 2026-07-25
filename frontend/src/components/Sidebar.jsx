import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Activity, Settings, LogOut, Cpu, Wifi, User, Clock, Sliders, X, Info } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import logoUrl from "../assets/images/logo_1783781770727.jpg";
export const Sidebar = ({
  socketConnected,
  espOnline,
  isOpen,
  onClose
}) => {
  const {
    user,
    logout
  } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    onClose();
    await logout();
    navigate("/login");
  };
  const navItems = [{
    name: "Dashboard",
    path: "/",
    icon: LayoutDashboard
  }, {
    name: "Schedule",
    path: "/schedule",
    icon: Clock
  }, {
    name: "Activity Logs",
    path: "/activity",
    icon: Activity
  }, {
    name: "Settings",
    path: "/settings",
    icon: Settings
  }, {
    name: "About Us",
    path: "/about",
    icon: Info
  }];
  return <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity duration-300" onClick={onClose} />}

      <aside className={`fixed md:sticky top-0 left-0 h-screen w-60 bg-[#111318] border-r border-white/5 flex flex-col justify-between text-slate-200 z-50 transition-transform duration-300 ease-in-out transform ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div>
          {/* Header Branding */}
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img src={logoUrl} alt="Smart Home Logo" className="w-10 h-10 object-contain rounded-xl bg-slate-900 border border-white/10 p-1 shadow-lg shadow-blue-500/5" referrerPolicy="no-referrer" />
              <div>
                <h1 className="font-bold text-sm leading-tight text-white tracking-tight">Smart Home</h1>
                <p className="text-[9px] text-emerald-400 tracking-wider uppercase font-mono font-semibold">Automation System</p>
              </div>
            </div>
            
            {/* Close button on mobile */}
            <button onClick={onClose} className="md:hidden p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="p-4 space-y-1">
            {navItems.map(item => {
            const Icon = item.icon;
            return <NavLink key={item.path} to={item.path} onClick={onClose} className={({
              isActive
            }) => `flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? "bg-blue-600/10 text-blue-400 border border-blue-600/20" : "text-slate-400 border border-transparent hover:text-white hover:bg-white/5"}`}>
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </NavLink>;
          })}
          </nav>
        </div>

        {/* Footer Status & Profile */}
        <div className="p-6 border-t border-white/5 space-y-4 mt-auto">
          {/* Connection Status Indicator */}
          <div className={`p-4 rounded-xl border transition-all duration-300 ${espOnline ? "bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20" : "bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border-amber-500/20 animate-pulse"}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] ${espOnline ? "bg-green-500" : "bg-amber-500"}`}></div>
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${espOnline ? "text-green-400" : "text-amber-400"}`}>
                {espOnline ? "ESP32 Connected" : "ESP32 Offline"}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              {espOnline ? "STATUS: ONLINE" : "STATUS: OFFLINE"}
            </p>
          </div>

          {/* User Info & Logout */}
          {user && <div className="flex items-center justify-between pt-2">
              <div className="flex items-center space-x-2.5 overflow-hidden">
                {user.photoURL ? <img src={user.photoURL} alt={user.displayName || "User"} className="h-10 w-10 rounded-full border border-white/5 object-cover" referrerPolicy="no-referrer" /> : <div className="h-10 w-10 rounded-full bg-[#1e2229] border border-white/5 flex items-center justify-center">
                    <User className="h-5 w-5 text-slate-300" />
                  </div>}
                <div className="flex flex-col text-left overflow-hidden">
                  <span className="text-sm font-medium text-white truncate">
                    {user.displayName || user.email?.split("@")[0]}
                  </span>
                  <span className="text-xs text-slate-500 truncate">{user.email}</span>
                </div>
              </div>

              <button onClick={handleLogout} className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Logout">
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>}
        </div>
      </aside>
    </>;
};
