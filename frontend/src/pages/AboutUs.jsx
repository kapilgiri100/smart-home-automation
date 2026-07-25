import React from "react";
import { GraduationCap, Users, Heart, Award, MapPin, Code2 } from "lucide-react";
export const AboutUs = () => {
  const developers = [{
    name: "Kapil Giri",
    role: "Lead Systems & Cloud Developer",
    desc: "Specializes in embedded firmware orchestration, full-stack application architecture, and Firebase/IoT integration.",
    initials: "KG",
    color: "from-blue-500/20 to-indigo-500/10 border-blue-500/30",
    textColor: "text-blue-400"
  }, {
    name: "Pramit Giri",
    role: "Hardware & Network Engineer",
    desc: "Expert in ESP32 hardware design, sensor calibration, real-time wireless telemetry, and physical schematics.",
    initials: "PG",
    color: "from-purple-500/20 to-pink-500/10 border-purple-500/30",
    textColor: "text-purple-400"
  }, {
    name: "Chandra Ghimire",
    role: "Frontend UX Designer",
    desc: "Passionate about high-fidelity visual interfaces, user experience flows, responsive design systems, and data visualization.",
    initials: "CG",
    color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
    textColor: "text-emerald-400"
  }, {
    name: "Madan Bhusal",
    role: "Database & Backend Engineer",
    desc: "Handles relational database schema design, system log management, scheduling systems, and API efficiency.",
    initials: "MB",
    color: "from-amber-500/20 to-orange-500/10 border-amber-500/30",
    textColor: "text-amber-400"
  }, {
    name: "Purnima Baduwal",
    role: "Quality Assurance & Documentation",
    desc: "Focuses on validation testing, reliability protocols, system security auditing, and comprehensive project documentation.",
    initials: "PB",
    color: "from-rose-500/20 to-red-500/10 border-rose-500/30",
    textColor: "text-rose-400"
  }];
  return <div className="space-y-8 max-w-5xl pb-12">
      {/* Page Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-950/40 via-slate-900/40 to-indigo-950/40 border border-white/5 rounded-3xl p-8 md:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-full text-xs text-blue-400 font-medium">
              <Award className="h-3.5 w-3.5" />
              <span>Project Credits</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">About Our Team</h1>
            <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
              Meet the engineering team from Mid-West University who designed and built this IoT-enabled Smart Home Automation System with cloud-based dashboard integration.
            </p>
          </div>
          
          <div className="shrink-0 bg-[#16181D]/80 border border-white/10 p-5 rounded-2xl flex items-center space-x-4 max-w-sm">
            <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <GraduationCap className="h-7 w-7 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Institution</p>
              <h4 className="text-sm font-bold text-white leading-tight">Mid-West University</h4>
              <p className="text-[11px] text-indigo-400 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                <span>Surkhet, Nepal</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* University Context Section */}
      <div className="bg-[#16181D] border border-white/5 rounded-2xl p-6 md:p-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="lg:w-2/3 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-400" />
              <span>Department of Computer Engineering</span>
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              This Smart Home Automation platform is a hallmark capstone demonstration designed to solve real-world hazard safety, environmental control, and water preservation challenges using cutting-edge IoT technology.
            </p>
            <p className="text-sm text-slate-400 leading-relaxed">
              Under the academic guidance of <strong>Mid-West University (Surkhet, Nepal)</strong>, the system implements standard industrial ESP32 architecture, cloud middleware reporting, real-time WebSocket streams, and high-efficiency relays to protect and manage modern home environments securely.
            </p>
          </div>
          <div className="lg:w-1/3 w-full bg-[#0A0B0D]/60 border border-white/5 p-5 rounded-2xl space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Core Research Features</h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span className="text-slate-300">ESP32-to-Cloud Real-time Socket Sync</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span className="text-slate-300">Dual-Level Water Refill & Flame Safety</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span className="text-slate-300">Intelligent Scheduling & Alarm Systems</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span className="text-slate-300">Durable Activity & Diagnostic Logging</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Developer Bento Grid */}
      <div className="space-y-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 px-1">
          <Users className="h-5 w-5 text-indigo-400" />
          <span>Project Developers</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {developers.map((dev, idx) => <div key={idx} className={`bg-gradient-to-br ${dev.color} bg-[#16181D]/40 border rounded-2xl p-6 flex flex-col justify-between h-full hover:scale-[1.01] hover:bg-[#16181D]/60 transition-all duration-300 shadow-lg`}>
              <div className="space-y-4">
                {/* Initials Avatar */}
                <div className={`w-12 h-12 rounded-xl bg-[#0A0B0D] border border-white/10 flex items-center justify-center text-sm font-bold tracking-wider ${dev.textColor}`}>
                  {dev.initials}
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">{dev.name}</h3>
                  <p className={`text-xs font-semibold ${dev.textColor} uppercase tracking-wider`}>{dev.role}</p>
                </div>
                
                <p className="text-xs text-slate-400 leading-relaxed font-light">
                  {dev.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>MID-WEST UNIVERSITY</span>
                <span className="text-indigo-400">TEAM MEMBER</span>
              </div>
            </div>)}
        </div>
      </div>

      {/* System Footer Signature */}
      <div className="pt-6 border-t border-white/5 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="flex items-center justify-center gap-1.5">
          <span>Co-created with dedication by the team</span>
          <Heart className="h-3 w-3 text-rose-500 fill-rose-500" />
          <span>in Surkhet, Nepal</span>
        </p>
        <p className="font-mono text-[10px]">
          v1.4.0 • Academic Capstone 2026
        </p>
      </div>
    </div>;
};
