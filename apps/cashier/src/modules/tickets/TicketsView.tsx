"use client";

import { useCallback, useEffect, useState } from "react";
import type { BetReceiptDto } from "@maraki/shared";
import { cashierApi } from "@/lib/api";
import { useAuth } from "@/modules/auth/AuthProvider";
import { TicketTable } from "./TicketTable";

export function TicketsView() {
  const { session } = useAuth();
  const [items, setItems] = useState<BetReceiptDto[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError("");
    const data = await cashierApi.bets(100);
    setItems(data.items);
    setTotal(data.total);
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load tickets"))
      .finally(() => setLoading(false));
  }, [session, load]);

  if (!session) return null;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>My tickets</h1>
          <p className="hint">Cash bets placed from this desk ({total} total)</p>
        </div>
        <button type="button" className="btn-ghost" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <div className="panel-body">
          {loading && items.length === 0 ? (
            <p className="hint">Loading…</p>
          ) : items.length === 0 ? (
            <p className="empty">No cash tickets from this desk yet.</p>
          ) : (
            <TicketTable items={items} />
          )}
        </div>
      </section>
    </>
  );
}
