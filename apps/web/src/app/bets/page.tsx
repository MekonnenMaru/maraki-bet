"use client";

import { useEffect, useState } from "react";
import type { BetReceiptDto, TestSettleOutcome } from "@maraki/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/modules/identity/AuthProvider";
import { CouponCard } from "@/modules/slip/CouponCard";

export default function MyBetsPage() {
  const { session, ready, openAuth, refresh } = useAuth();
  const [bets, setBets] = useState<BetReceiptDto[]>([]);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "SETTLED">("ALL");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    api
      .myBets()
      .then(setBets)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load bets"));
  }, [session]);

  const visible = bets.filter((bet) => {
    if (filter === "OPEN") return bet.status === "ACCEPTED" || bet.status === "PENDING";
    if (filter === "SETTLED") return bet.status !== "ACCEPTED" && bet.status !== "PENDING";
    return true;
  });

  return (
    <div className="detail bets-page">
      <h1>My Bets</h1>
      {!ready ? (
        <div className="empty">Loading...</div>
      ) : !session ? (
        <div className="empty">
          Login to see your coupons.
          <button type="button" className="primary" onClick={() => openAuth("login")}>
            Login
          </button>
        </div>
      ) : (
        <>
          <div className="expand-tabs">
            {(["ALL", "OPEN", "SETTLED"] as const).map((item) => (
              <button key={item} type="button" className={filter === item ? "on" : ""} onClick={() => setFilter(item)}>
                {item === "ALL" ? "All" : item === "OPEN" ? "Open" : "Settled"}
              </button>
            ))}
          </div>
          {error && <p className="auth-error">{error}</p>}
          {visible.length === 0 ? (
            <div className="empty">No bets in this list.</div>
          ) : (
            visible.map((bet) => (
              <CouponCard
                key={bet.id}
                bet={bet}
                onTestSettle={async (code: string, outcome: TestSettleOutcome) => {
                  try {
                    const updated = await api.testSettle(code, outcome);
                    setBets((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not settle coupon");
                  }
                }}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
