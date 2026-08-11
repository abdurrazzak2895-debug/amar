import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import {
  getAuthStatus,
  getProfile,
  triggerLogin,
  logout as apiLogout,
  type AuthStatus,
} from "@/lib/takamol-api";

interface TakamolAuthContextType {
  loggedIn: boolean;
  loading: boolean;
  profile: any | null;
  error: string | null;
  refresh: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const TakamolAuthContext = createContext<TakamolAuthContextType>({
  loggedIn: false,
  loading: true,
  profile: null,
  error: null,
  refresh: async () => {},
  login: async () => {},
  logout: async () => {},
});

export function useTakamolAuth() {
  return useContext(TakamolAuthContext);
}

export function TakamolAuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const st = await getAuthStatus();
      setStatus(st);
      setError(null);
      if (st.loggedIn) {
        getProfile()
          .then((p) => setProfile(p))
          .catch(() => setProfile(null));
      } else {
        setProfile(null);
      }
      return st;
    } catch (err: any) {
      setError(err?.message || "Failed to check Takamol auth status");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await triggerLogin({});
    } catch (err: any) {
      setError(err?.message || "Failed to start the Playwright login. Open the console manually.");
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await apiLogout();
    } catch {
      // ignore — still clear local state
    } finally {
      setStatus({ loggedIn: false, tokenInfo: null });
      setProfile(null);
      setLoading(false);
    }
  }, []);

  // Initial status check + poll every 8s while the login flow may be running.
  useEffect(() => {
    let active = true;
    refresh().then((st) => {
      if (!active) return;
      if (st && st.loggedIn) return;
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          getAuthStatus()
            .then((s) => {
              setStatus(s);
              if (s.loggedIn) {
                setProfile(null);
                getProfile().then((p) => setProfile(p)).catch(() => setProfile(null));
                if (pollRef.current) clearInterval(pollRef.current);
                pollRef.current = null;
              }
            })
            .catch(() => {});
        }, 8000);
      }
    });
    return () => {
      active = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [refresh]);

  return (
    <TakamolAuthContext.Provider
      value={{
        loggedIn: !!status?.loggedIn,
        loading,
        profile,
        error,
        refresh,
        login,
        logout,
      }}
    >
      {children}
    </TakamolAuthContext.Provider>
  );
}
