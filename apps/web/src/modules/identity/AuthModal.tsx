"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function AuthModal({
  mode,
  onClose,
}: {
  mode: "login" | "register";
  onClose: () => void;
}) {
  const { login, register, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  return (
    <div className="auth-overlay">
      <form
        className="auth-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setLocalError("");
          try {
            if (mode === "login") await login(username, password);
            else await register(username, password, phone || undefined);
            onClose();
          } catch (err) {
            setLocalError(err instanceof Error ? err.message : "Request failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>{mode === "login" ? "Login" : "Register"}</h2>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </label>
        {mode === "register" && (
          <label>
            Phone (optional)
            <input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
          </label>
        )}
        {(localError || error) && <p className="auth-error">{localError || error}</p>}
        <div className="auth-card-actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}
