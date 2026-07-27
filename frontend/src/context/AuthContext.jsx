import React, { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(undefined);

const STORAGE_USER_KEY = "auth_user";
const STORAGE_TOKEN_KEY = "auth_token";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore a saved session (regular login/signup or demo) from localStorage
    const savedUser = localStorage.getItem(STORAGE_USER_KEY);
    const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      } catch (e) {
        // Corrupted localStorage data — clear it
        localStorage.removeItem(STORAGE_USER_KEY);
        localStorage.removeItem(STORAGE_TOKEN_KEY);
      }
    }
    setLoading(false);
  }, []);

  const persistSession = (nextUser, nextToken) => {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(nextUser));
    localStorage.setItem(STORAGE_TOKEN_KEY, nextToken);
    setUser(nextUser);
    setToken(nextToken);
  };

  const formatEmailFromName = (nameStr) => {
    let email = nameStr.trim().toLowerCase();
    if (!email.includes("@")) {
      // replace any spaces or non-alphanumeric chars except dots with a dot
      let sanitized = email.replace(/[^a-z0-9.]/g, ".");
      // replace multiple consecutive dots with a single dot
      sanitized = sanitized.replace(/\.+/g, ".");
      // trim leading/trailing dots
      sanitized = sanitized.replace(/^\.|\.$/g, "");
      email = `${sanitized}@smarthome.local`;
    }
    return email;
  };

  const safeParseJSON = async (response) => {
    const text = await response.text();
    if (!text) {
      throw new Error("Server returned an empty response. Make sure the backend server is running on port 3000.");
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      if (text.startsWith("<") || text.startsWith("<!DOCTYPE")) {
        throw new Error("Backend server returned HTML instead of JSON. The server may be down or the proxy is misconfigured.");
      }
      throw new Error(`Unexpected response from server: ${text.substring(0, 100)}...`);
    }
  };

  const loginUser = async (name, password) => {
    setLoading(true);
    try {
      const email = formatEmailFromName(name);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await safeParseJSON(res);
      if (!res.ok) {
        const error = new Error(data.error || "Failed to log in.");
        error.code = "auth/invalid-credential";
        throw error;
      }
      persistSession(data.user, data.token);
    } catch (error) {
      console.error("Login Error:", error);
      setLoading(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (firstName, lastName, password) => {
    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const email = formatEmailFromName(fullName);
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName: fullName }),
      });
      const data = await safeParseJSON(res);
      if (!res.ok) {
        const error = new Error(data.error || "Failed to register account.");
        if (res.status === 409) error.code = "auth/email-already-in-use";
        throw error;
      }
      persistSession(data.user, data.token);
    } catch (error) {
      console.error("Registration Error:", error);
      setLoading(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      setUser(null);
      setToken(null);
    } catch (error) {
      console.error("Sign-Out Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, loginUser, registerUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
