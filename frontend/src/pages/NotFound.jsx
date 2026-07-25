import React from "react";
import { Link } from "react-router-dom";
import { Home, ShieldAlert } from "lucide-react";
export const NotFound = () => {
  return <div className="min-h-screen bg-[#0A0B0D] flex flex-col justify-center items-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="inline-flex bg-rose-500/10 border border-rose-500/20 p-4 rounded-full text-rose-500">
          <ShieldAlert className="h-12 w-12" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-white tracking-tight">404 - Page Not Found</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            The page you are looking for does not exist or has been moved. Check the path and try again.
          </p>
        </div>
        <Link to="/" className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm py-2.5 px-5 rounded-xl border border-blue-500/30 transition-all shadow-lg shadow-blue-500/10 cursor-pointer">
          <Home className="h-4.5 w-4.5" />
          <span>Go back home</span>
        </Link>
      </div>
    </div>;
};
