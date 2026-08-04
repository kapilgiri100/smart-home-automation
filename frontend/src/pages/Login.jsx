import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { Navigate } from "react-router-dom";
import { LogIn, ShieldAlert, User, Lock, UserPlus, BookOpen, Gauge, ChevronUp, Users, Info } from "lucide-react";
import logoUrl from "../assets/images/logo_1783781770727.jpg";
export const Login = () => {
  const {
    user,
    loginUser,
    registerUser,
    loading
  } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Login Form States
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup Form States
  const [signupFirst, setSignupFirst] = useState("");
  const [signupLast, setSignupLast] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
const [showManual, setShowManual] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  if (user) {
    return <Navigate to="/" replace />;
  }
  const handleLogin = async e => {
    e.preventDefault();
    if (!loginName.trim()) {
      setError("Please enter your registered name.");
      return;
    }
    if (!loginPassword) {
      setError("Please enter your password.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await loginUser(loginName, loginPassword);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/invalid-credential") {
        setError("Invalid name or password. Please verify and try again.");
      } else {
        setError(err.message || "Failed to log in.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSignup = async e => {
    e.preventDefault();
    if (!signupFirst.trim()) {
      setError("Please enter your first name.");
      return;
    }
    if (!signupLast.trim()) {
      setError("Please enter your last name.");
      return;
    }
    if (!signupPassword) {
      setError("Please set a password.");
      return;
    }
    if (signupPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await registerUser(signupFirst, signupLast, signupPassword);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("This name combination is already registered. Please log in or choose another name.");
      } else {
        setError(err.message || "Failed to register account.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  return <div className="min-h-screen bg-[#0A0B0D] flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Decorative blurred backdrop glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/5  rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#16181D] border border-white/5 rounded-2xl p-8 shadow-2xl relative z-10 text-slate-200">
        
        {/* Logo and Headings */}
        <div className="text-center space-y-4 mb-6">
          <div className="inline-flex bg-slate-900 border border-white/10 p-2.5 rounded-2xl shadow-xl shadow-blue-500/5">
            <img src={logoUrl} alt="Smart Home Automation System Logo" className="w-16 h-16 object-contain rounded-xl" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
              Smart Home Automation System
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium uppercase tracking-wider text-emerald-400">
              Fire &amp; Gas Safety Monitor
            </p>
          </div>
        </div>

        {/* Tab Toggle Switch */}
        <div className="grid grid-cols-2 bg-[#0A0B0D] p-1 rounded-xl border border-white/5 mb-6">
          <button onClick={() => {
          setActiveTab("login");
          setError(null);
        }} className={`py-2 px-4 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer ${activeTab === "login" ? "bg-[#16181D] text-white shadow" : "text-slate-400 hover:text-slate-200"}`}>
            Log In
          </button>
          <button onClick={() => {
          setActiveTab("signup");
          setError(null);
        }} className={`py-2 px-4 rounded-lg font-medium text-sm transition-all duration-200 cursor-pointer ${activeTab === "signup" ? "bg-[#16181D] text-white shadow" : "text-slate-400 hover:text-slate-200"}`}>
            Sign Up
          </button>
        </div>

        {/* Error Alert Box */}
        {error && <div className="space-y-4 mb-6">
            <div className="flex items-start space-x-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
              <span className="leading-normal">{error}</span>
            </div>
          </div>}

        {/* Forms area */}
        {activeTab === "login" ? <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 block">Registered Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-500" />
                <input type="text" value={loginName} onChange={e => setLoginName(e.target.value)} placeholder="e.g. John Doe" className="w-full bg-[#0A0B0D] border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all" required />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-500" />
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="••••••••" className="w-full bg-[#0A0B0D] border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all" required />
              </div>
            </div>

            <button type="submit" disabled={isSubmitting || loading} className="w-full mt-2 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/50 disabled:text-slate-500 transition-all cursor-pointer shadow-lg shadow-emerald-500/10">
              {isSubmitting ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> : <>
                  <LogIn className="h-4.5 w-4.5" />
                  <span>Log In to Dashboard</span>
                </>}
            </button>
          </form> : <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 block">First Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input type="text" value={signupFirst} onChange={e => setSignupFirst(e.target.value)} placeholder="John" className="w-full bg-[#0A0B0D] border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all" required />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 block">Last Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input type="text" value={signupLast} onChange={e => setSignupLast(e.target.value)} placeholder="Doe" className="w-full bg-[#0A0B0D] border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all" required />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 block">Set Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-500" />
                <input type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} placeholder="Min. 6 characters" className="w-full bg-[#0A0B0D] border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all" required />
              </div>
            </div>

            <button type="submit" disabled={isSubmitting || loading} className="w-full mt-2 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/50 disabled:text-slate-500 transition-all cursor-pointer shadow-lg shadow-blue-500/10">
              {isSubmitting ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div> : <>
                  <UserPlus className="h-4.5 w-4.5" />
                  <span>Create Account</span>
                </>}
            </button>
          </form>}

      {/* Info Footer */}
        <div className="mt-6 text-center border-t border-white/5 pt-4 text-[11px] text-slate-500">
          <span>Secured by PostgreSQL &amp; JWT session tokens</span>
        </div>
      </div>

{/* User Manual & About Us toggle buttons (side by side) */}
      <div className="w-full max-w-md grid grid-cols-2 gap-3 mt-6 relative z-10">
        <button onClick={() => setShowManual(prev => !prev)} className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium text-white bg-slate-700 hover:bg-slate-600 transition-all cursor-pointer shadow-lg shadow-slate-500/10">
          {showManual ? <ChevronUp className="h-4.5 w-4.5" /> : <BookOpen className="h-4.5 w-4.5" />}
          <span>{showManual ? "Hide Manual" : "View Manual"}</span>
        </button>
        <button onClick={() => setShowAbout(prev => !prev)} className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium text-white bg-indigo-700 hover:bg-indigo-600 transition-all cursor-pointer shadow-lg shadow-indigo-500/10">
          {showAbout ? <ChevronUp className="h-4.5 w-4.5" /> : <Info className="h-4.5 w-4.5" />}
          <span>{showAbout ? "Hide About Us" : "About Us"}</span>
        </button>
      </div>

      {/* ===== User Manual (below the login card) ===== */}
      {showManual && <div className="w-full max-w-md mt-6 space-y-6 text-left">
        {/* Quick Start */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-6 shadow-xl relative z-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2 mb-4">
            <span className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
              <BookOpen className="h-4 w-4" />
            </span>
            User Manual &amp; Quick Start
          </h2>

          {/* Step 1 */}
          <div className="flex items-start gap-3 mb-4">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center border border-emerald-500/30">1</span>
            <div>
              <h3 className="text-xs font-semibold text-white">Create an Account</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                On the Log In / Sign Up tab, enter your <strong>first name</strong>, <strong>last name</strong>, and a <strong>password</strong> (min. 6 characters), then click <strong>Create Account</strong>.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3 mb-4">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center border border-emerald-500/30">2</span>
            <div>
              <h3 className="text-xs font-semibold text-white">Authorize Access</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                The first account (or the admin account) is auto-authorized. Other accounts need the <strong>authorization passcode</strong> to unlock full control of the system.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3 mb-4">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center border border-emerald-500/30">3</span>
            <div>
              <h3 className="text-xs font-semibold text-white">Log In to the Dashboard</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                Log in with your <strong>registered name</strong> and <strong>password</strong>, then click <strong>Log In to Dashboard</strong> to open the System Overview.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center border border-emerald-500/30">4</span>
            <div>
              <h3 className="text-xs font-semibold text-white">Connect Your ESP32 Device</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                Power on the ESP32 and connect to the <strong>Smart-Home-Setup</strong> WiFi network. Open <strong>http://192.168.4.1</strong>, select your local network, and set the backend server URL to your app's address.
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard Features */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-6 shadow-xl relative z-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2 mb-4">
            <span className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
              <Gauge className="h-4 w-4" />
            </span>
            Dashboard Controls
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">💡 Manual Appliances</p>
              <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                Tap the four light bulbs to turn them ON/OFF. They can also be controlled by the four physical switches.
              </p>
            </div>
            <div className="p-3 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">🚿 Automated Pumps</p>
              <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                Overhead fill pump auto-refills when the tank is low. Fire pump is auto-activated during a fire.
              </p>
            </div>
            <div className="p-3 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">🔥 Fire &amp; Gas Safety</p>
              <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                Real-time alerts, buzzer, and warning LED trigger when a fire or gas leak is detected.
              </p>
            </div>
            <div className="p-3 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">⏰ Schedules</p>
              <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                Automate appliances to turn ON/OFF at set times from the Scheduler page.
              </p>
            </div>
          </div>
        </div>

        {/* Safety Notes */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 shadow-xl relative z-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2 mb-3">
            <span className="p-1.5 bg-amber-500/10 rounded-lg">
              <ShieldAlert className="h-4 w-4" />
            </span>
            Safety &amp; Troubleshooting
          </h2>
          <ul className="space-y-2 text-[11px] text-slate-300 leading-relaxed">
            <li className="flex gap-2"><span className="text-amber-400">•</span> Always keep low-voltage wiring and high-voltage AC wiring physically separated.</li>
            <li className="flex gap-2"><span className="text-amber-400">•</span> If the device shows <strong>ESP32 Offline</strong>, check power and WiFi to the Smart-Home-Setup network.</li>
            <li className="flex gap-2"><span className="text-amber-400">•</span> If a sensor is not connected, disable it in <strong>Settings</strong> to avoid false alarms.</li>
<li className="flex gap-2"><span className="text-amber-400">•</span> The physical switches 1–4 control the four light bulbs (GPIO 4, 5, 13, 23).</li>
          </ul>
        </div>
      </div>}

      {/* ===== About Us (toggled separately) ===== */}
      {showAbout && <div className="w-full max-w-md mt-6 space-y-6 text-left">
        {/* About Us */}
        <div className="bg-[#16181D] border border-white/5 rounded-2xl p-6 shadow-xl relative z-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2 mb-4">
            <span className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400">
              <Users className="h-4 w-4" />
            </span>
            About Us
          </h2>
          <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
            This IoT-based Smart Home Automation and Fire &amp; Gas Safety Monitoring System is a final year capstone project built by the Computer Engineering team at <strong className="text-slate-200">Mid-West University, Surkhet, Nepal</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">🧠 Lead Systems &amp; Cloud</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Kapil Giri — embedded firmware &amp; full-stack architecture</p>
            </div>
            <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">🔌 Hardware &amp; Network</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Pramit Giri — ESP32 design, sensors &amp; telemetry</p>
            </div>
            <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">🎨 Frontend UX</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Chandra Ghimire — interfaces &amp; data visualization</p>
            </div>
            <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">🗄️ Database &amp; Backend</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Madan Bhusal — schema, logging &amp; scheduling</p>
            </div>
            <div className="p-2.5 bg-[#0A0B0D]/60 border border-white/5 rounded-xl">
              <p className="text-[11px] font-bold text-white">✅ QA &amp; Documentation</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Purnima Baduwal — testing &amp; project documentation</p>
            </div>
          </div>
        </div>
      </div>}
    </div>;
};
