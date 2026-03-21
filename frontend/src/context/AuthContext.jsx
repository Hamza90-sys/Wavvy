import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);
// allow proxy fallback when REACT_APP_API_URL is not specified
const API_URL = process.env.REACT_APP_API_URL || "";

const readStoredToken = () => {
  const raw = localStorage.getItem("wavvy_token");
  if (!raw || raw === "undefined" || raw === "null") return "";
  return raw;
};

const readStoredUser = () => {
  const raw = localStorage.getItem("wavvy_user");
  if (!raw || raw === "undefined" || raw === "null") return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    localStorage.removeItem("wavvy_user");
    return null;
  }
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readStoredToken);
  const [user, setUser] = useState(readStoredUser);

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      localStorage.setItem("wavvy_user", JSON.stringify(nextUser));
    } else {
      localStorage.removeItem("wavvy_user");
    }
  }, []);

  const persist = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    updateUser(nextUser);
    localStorage.setItem("wavvy_token", nextToken);
  }, [updateUser]);

  const clear = useCallback(() => {
    setToken("");
    updateUser(null);
    localStorage.removeItem("wavvy_token");
    localStorage.removeItem("wavvy_user");
    localStorage.removeItem("wavvy_settings");
    localStorage.removeItem("wavvy_lang");
  }, [updateUser]);

  const login = useCallback(async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");
      persist(data.token, data.user);
    } catch (err) {
      // network errors manifest as TypeError "Failed to fetch"
      if (err instanceof TypeError) {
        throw new Error(
          "Unable to contact server. Is the backend running?"
        );
      }
      throw err;
    }
  }, [persist]);

  const register = useCallback(async (username, email, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Registration failed");
      persist(data.token, data.user);
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(
          "Unable to contact server. Is the backend running?"
        );
      }
      throw err;
    }
  }, [persist]);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } finally {
      clear();
    }
  }, [clear, token]);

  const value = useMemo(
    () => ({ token, user, login, register, logout, setUser: updateUser }),
    [token, user, login, register, logout, updateUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
