"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminDashboardDto } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { last7Inputs, monthInputs, toIsoRange, todayInputs, yesterdayInputs } from "./date-range";

const PRESETS = [
  { id: "today", label: "Today", range: todayInputs },
  { id: "yesterday", label: "Yesterday", range: yesterdayInputs },
  { id: "7d", label: "Last 7 days", range: last7Inputs },
  { id: "month", label: "This month", range: monthInputs },
] as const;

export function DashboardView() {
  const { session } = useAdminAuth();
  const initial = todayInputs();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState(initial);
  const [preset, setPreset] = useState("today");
  const [data, setData] = useState<AdminDashboardDto | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setData(await adminApi.dashboard(toIsoRange(applied.from, applied.to)));
  }, [applied]);

  useEffect(() => {
    if (!session) return;
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load dashboard"));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [session, load]);

  function applyRange(next: { from: string; to: string }, id = "custom") {
    setFrom(next.from);
    setTo(next.to);
    setApplied(next);
    setPreset(id);
  }

  if (!session) return null;

  const money = (value: string) => `${data?.currency ?? "ETB"} ${value}`;

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p className="hint">East Africa Time · finance &amp; summaries · refresh every 60s</p>
        </div>
        <form
          className="dash-filter"
          onSubmit={(event) => {
            event.preventDefault();
            applyRange({ from, to });
          }}
        >
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={preset === item.id ? "on" : "ghost"}
              onClick={() => applyRange(item.range(), item.id)}
            >
              {item.label}
            </button>
          ))}
          <label>
            From
            <input
              type="datetime-local"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPreset("custom");
              }}
            />
          </label>
          <label>
            To
            <input
              type="datetime-local"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPreset("custom");
              }}
            />
          </label>
          <button type="submit">Apply</button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <section className="dash-section">
            <h2 className="dash-section-title">Finance</h2>
            <div className="cards">
              <Stat label="Betting volume" value={money(data.period.volume)} />
              <Stat label="Revenue" value={money(data.period.revenue)} />
              <Stat label="Deposits" value={money(data.period.deposits)} />
              <Stat label="Withdrawals" value={money(data.period.withdrawals)} />
              <Stat label="Bets placed" value={data.period.totalBets} />
              <Stat label="Open bets" value={data.snapshot.openBets} />
            </div>
          </section>

          <section className="dash-section">
            <h2 className="dash-section-title">Summary</h2>
            <div className="cards">
              <Stat label="Players" value={data.snapshot.activePlayers} />
              <Stat label="Agents" value={data.snapshot.activeAgents} />
              <Stat label="Total users" value={data.snapshot.totalUsers} />
              <Stat label="Active sports" value={data.snapshot.activeSports} />
              <Stat label="Tournaments" value={data.snapshot.activeTournaments} />
              <Stat label="Upcoming fixtures" value={data.snapshot.upcomingFixtures} />
              <Stat label="Live matches" value={data.snapshot.liveMatches} />
              <Stat label="Markets" value={data.snapshot.activeMarkets} />
              <Stat label="Sync" value={data.snapshot.syncHealthy ? "Healthy" : "Check"} />
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
