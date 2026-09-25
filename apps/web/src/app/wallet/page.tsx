"use client";

import { useEffect, useState } from "react";
import type { LedgerEntryDto } from "@maraki/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/modules/identity/AuthProvider";
import { useWalletVisibility } from "@/modules/identity/useWalletVisibility";

function ledgerLabel(type: string) {
  if (type === "BET_WIN") return "Win";
  if (type === "BET_REFUND") return "Refund";
  if (type === "BET_STAKE") return "Stake";
  if (type === "DEPOSIT") return "Deposit";
  return type;
}

function money(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
}

export default function WalletPage() {
  const { session, ready, openAuth, deposit } = useAuth();
  const { visible, toggle } = useWalletVisibility();
  const [ledger, setLedger] = useState<LedgerEntryDto[]>([]);
  const [amount, setAmount] = useState("100");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    api
      .ledger()
      .then(setLedger)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load transactions"));
  }, [session]);

  return (
    <div className="detail account-page">
      <h1>Wallet</h1>
      {!ready ? (
        <div className="empty">Loading...</div>
      ) : !session ? (
        <div className="empty">
          Login to view your wallet.
          <button type="button" className="primary" onClick={() => openAuth("login")}>
            Login
          </button>
        </div>
      ) : (
        <>
          <section className="wallet-summary">
            <div>
              <small>
                Available
                <button type="button" className="balance-eye" onClick={toggle}>
                  {visible ? "Hide" : "Show"}
                </button>
              </small>
              <b>{visible ? `${session.wallet.currency} ${money(session.wallet.available)}` : "••••••"}</b>
            </div>
            <div>
              <small>Locked</small>
              <b>{visible ? `${session.wallet.currency} ${money(session.wallet.locked)}` : "••••••"}</b>
            </div>
          </section>
          <form
            className="wallet-deposit"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await deposit(Number(amount));
                setLedger(await api.ledger());
              } catch (err) {
                setError(err instanceof Error ? err.message : "Deposit failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Test deposit
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "..." : "Deposit"}
            </button>
          </form>
          {error && <p className="auth-error">{error}</p>}
          <h2>Transactions</h2>
          {ledger.length === 0 ? (
            <div className="empty">No transactions yet.</div>
          ) : (
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td>{ledgerLabel(row.type)}</td>
                    <td>{visible ? money(row.amount) : "••••"}</td>
                    <td>{visible ? money(row.balanceAfter) : "••••"}</td>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
