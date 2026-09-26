"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CashierDashboardDto } from "@maraki/shared";
import { cashierApi } from "@/lib/api";
import { useAuth } from "@/modules/auth/AuthProvider";
import { TicketTable } from "@/modules/tickets/TicketTable";

export function DashboardView() {
  const { session } = useAuth();
  const [data, setData] = useState<CashierDashboardDto | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setData(await cashierApi.dashboard());
  }, []);

  useEffect(() => {
    if (!session) return;
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load dashboard"));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [session, load]);

  if (!session) return null;

  const money = (value: string) => `${data?.currency ?? "ETB"} ${value}`;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p className="hint">East Africa Time · cash desk summaries · refresh every 60s</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <section className="dash-section">
            <h2 className="dash-section-title">Today</h2>
            <div className="cards">
              <Stat label="Tickets placed" value={data.today.ticketsPlaced} />
              <Stat label="Cash taken" value={money(data.today.cashTaken)} />
              <Stat label="Open tickets" value={data.today.openTickets} />
              <Stat label="Pending payout" value={money(data.today.pendingPayout)} />
              <Stat label="Winning tickets" value={data.today.pendingPayoutCount} />
            </div>
          </section>

          <section className="dash-section">
            <h2 className="dash-section-title">Desk</h2>
            <div className="cards">
              <Stat label="Shop" value={data.desk.shopName} />
              <Stat label="Desk" value={data.desk.label} />
              <Stat label="Agent" value={data.desk.agentName ?? "—"} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Recent placements</h2>
              <Link href="/tickets">View all</Link>
            </div>
            <div className="panel-body">
              {data.recent.length === 0 ? (
                <p className="empty">No cash tickets yet. Place a booked coupon to get started.</p>
              ) : (
                <TicketTable items={data.recent} />
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <article>
      <small>{label}</small>
      <b>{value}</b>
    </article>
  );
}
