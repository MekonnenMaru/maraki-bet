"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { cashierApi, type CashierSession } from "@/lib/api";

const SESSION_KEY = "maraki_cashier_session";

type AuthValue = {
  session: CashierSession | null;
  ready: boolean;
  error: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function readCachedSession(): CashierSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CashierSession;
  } catch {
    return null;
  }
}

function writeCachedSession(session: CashierSession | null) {
  try {
    if (!session) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<CashierSession | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedSession();
    if (cached) {
      setSession(cached);
      setReady(true);
    }

    cashierApi
      .me()
      .then((next) => {
        if (cancelled) return;
        setSession(next);
        writeCachedSession(next);
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        writeCachedSession(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      ready,
      error,
      async login(username, password) {
        setError("");
        try {
          const next = await cashierApi.login({ username, password });
          setSession(next);
          writeCachedSession(next);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Login failed");
          throw err;
        }
      },
      async logout() {
        try {
          await cashierApi.logout();
        } finally {
          setSession(null);
          writeCachedSession(null);
        }
      },
    }),
    [session, ready, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
