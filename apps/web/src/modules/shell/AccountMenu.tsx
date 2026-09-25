"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/modules/identity/AuthProvider";
import { useWalletVisibility } from "@/modules/identity/useWalletVisibility";

function money(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
}

export function AccountMenu() {
  const { session, logout, deposit } = useAuth();
  const { visible, toggle } = useWalletVisibility();
  const [open, setOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!session) return null;

  return (
    <div className="account-bar" ref={root}>
      <div className="wallet-box">
        <button type="button" className="balance-eye" onClick={toggle} title={visible ? "Hide balance" : "Show balance"}>
          {visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a3 3 0 004.8 3.6" />
              <path d="M9.9 5.1A11 11 0 0122 12s-1.2 2.1-3.4 3.9" />
              <path d="M6.1 6.1C4 7.8 2 12 2 12s4 7 10 7c1.6 0 3.1-.4 4.4-1" />
            </svg>
          )}
        </button>
        <span className="balance-chip">
          {visible ? `${session.wallet.currency} ${money(session.wallet.available)}` : "••••••"}
        </span>
        <button type="button" className="deposit-btn" onClick={() => setDepositOpen(true)}>
          Deposit
        </button>
      </div>
      <button type="button" className="user-menu-btn" onClick={() => setOpen((value) => !value)} title={session.user.username}>
        <svg className="user-ico" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 19c1.4-3.2 4-5 7-5s5.6 1.8 7 5" />
        </svg>
        <span className="caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="user-menu">
          <Link href="/wallet" onClick={() => setOpen(false)}>
            Wallet
          </Link>
          <Link href="/account" onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link href="/bets" onClick={() => setOpen(false)}>
            Bet History
          </Link>
          <Link href="/wallet" onClick={() => setOpen(false)}>
            Transactions
          </Link>
          <button
            type="button"
            className="logout"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            Logout
          </button>
        </div>
      )}
      {depositOpen && (
        <div className="auth-overlay" onClick={() => setDepositOpen(false)}>
          <form
            className="auth-card"
            onClick={(event) => event.stopPropagation()}
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await deposit(Number(amount));
                setDepositOpen(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Deposit failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Deposit</h2>
            <label>
              Amount ({session.wallet.currency})
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <div className="auth-card-actions">
              <button type="button" onClick={() => setDepositOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Please wait..." : "Deposit"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
