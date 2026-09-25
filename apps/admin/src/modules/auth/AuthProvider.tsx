"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SessionDto } from "@maraki/shared";
import { adminApi, clearAdminCaches } from "@/lib/api";

const SESSION_KEY = "maraki_admin_session";

type AuthValue = {
  session: SessionDto | null;
  ready: boolean;
  error: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function readCachedSession(): SessionDto | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionDto;
  } catch {
    return null;
  }
}

function writeCachedSession(session: SessionDto | null) {
  try {
    if (!session) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionDto | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedSession();
    if (cached) {
      setSession(cached);
      setReady(true);
    }

    adminApi
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
          const next = await adminApi.login({ username, password });
          setSession(next);
          writeCachedSession(next);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Login failed");
          throw err;
        }
      },
      async logout() {
        await adminApi.logout().catch(() => undefined);
        clearAdminCaches();
        setSession(null);
        writeCachedSession(null);
      },
    }),
    [error, ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAdminAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAdminAuth must be used inside AuthProvider");
  return value;
}
