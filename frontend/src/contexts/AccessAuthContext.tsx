import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  accessAuthApi,
  saveAccessToken,
  clearAccessToken,
  getAccessUser,
  saveAccessUser,
  clearAccessUser,
} from "@/lib/access-api";
import { resolveAccessPermission } from "@/lib/access-permissions";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "AGENCY" | "USER";
  status: string;
  agency_id?: string;
  permission_mode?: "LEGACY" | "MANAGED";
  self_registered?: boolean;
  permissions?: Record<string, boolean>;
}

interface AccessAuthContextType {
  user: AccessUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AccessUser>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AccessAuthContext = createContext<AccessAuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
  hasPermission: () => false,
});

export function useAccessAuth() {
  return useContext(AccessAuthContext);
}

export function AccessAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccessUser | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doLogout = useCallback(() => {
    clearAccessToken();
    clearAccessUser();
    localStorage.removeItem("access_login_time");
    setUser(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const startSessionTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const loginTime = Number(localStorage.getItem("access_login_time") || "0");
    if (!loginTime) return;
    const elapsed = Date.now() - loginTime;
    const remaining = SESSION_TIMEOUT_MS - elapsed;
    if (remaining <= 0) {
      doLogout();
      return;
    }
    timerRef.current = setTimeout(() => {
      doLogout();
    }, remaining);
  }, [doLogout]);

  // Reset activity timer on user interaction
  const resetActivity = useCallback(() => {
    if (!user) return;
    localStorage.setItem("access_login_time", String(Date.now()));
    startSessionTimer();
  }, [user, startSessionTimer]);

  useEffect(() => {
    if (!user) return;
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetActivity));
    };
  }, [user, resetActivity]);

  useEffect(() => {
    const stored = getAccessUser();
    const loginTime = Number(localStorage.getItem("access_login_time") || "0");
    if (stored && loginTime) {
      // Check if session expired
      if (Date.now() - loginTime > SESSION_TIMEOUT_MS) {
        doLogout();
        setLoading(false);
        return;
      }
      setUser(stored);
      startSessionTimer();
      // Verify token is still valid
      accessAuthApi("/me")
        .then((res) => {
          setUser(res.user);
          saveAccessUser(res.user);
        })
        .catch(() => {
          doLogout();
        })
        .finally(() => setLoading(false));
    } else {
      if (stored) doLogout(); // no login time but user exists = stale
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AccessUser> => {
    const res = await accessAuthApi<{ accessToken: string; user: AccessUser }>("/login", { email, password });
    saveAccessToken(res.accessToken);
    saveAccessUser(res.user);
    localStorage.setItem("access_login_time", String(Date.now()));
    setUser(res.user);
    startSessionTimer();
    return res.user;
  }, [startSessionTimer]);

  const logout = useCallback(() => {
    doLogout();
  }, [doLogout]);

  const hasPermission = useCallback((permission: string) => {
    return resolveAccessPermission(user, permission);
  }, [user]);

  return (
    <AccessAuthContext.Provider value={{ user, loading, isAuthenticated: !!user, login, logout, hasPermission }}>
      {children}
    </AccessAuthContext.Provider>
  );
}
