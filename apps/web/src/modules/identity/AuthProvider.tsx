"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SessionDto, WalletDto } from "@maraki/shared";
import { api } from "@/lib/api";
import { AuthModal } from "./AuthModal";

type AuthMode = "login" | "register" | null;

type AuthContextValue = {
  session: SessionDto | null;
  ready: boolean;
  error: string;
  openAuth: (mode?: "login" | "register") => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  deposit: (amount: number) => Promise<void>;
  refresh: () => Promise<void>;
  setWallet: (wallet: WalletDto) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionDto | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>(null);

  useEffect(() => {
    api
      .me()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready,
      error,
      openAuth: (mode = "login") => setAuthMode(mode),
      async login(username, password) {
        setError("");
        try {
          setSession(await api.login({ username, password }));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Login failed");
          throw err;
        }
      },
      async register(username, password, phone) {
        setError("");
        try {
          setSession(await api.register({ username, password, phone }));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Register failed");
          throw err;
        }
      },
      async logout() {
        await api.logout().catch(() => undefined);
        setSession(null);
      },
      async deposit(amount) {
        const wallet = await api.deposit(amount);
        setSession((current) => (current ? { ...current, wallet } : current));
      },
      async refresh() {
        try {
          setSession(await api.me());
        } catch {
          setSession(null);
        }
      },
      setWallet(wallet) {
        setSession((current) => (current ? { ...current, wallet } : current));
      },
    }),
    [error, ready, session],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
