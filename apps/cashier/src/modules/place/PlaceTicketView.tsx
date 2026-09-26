"use client";

import { useState } from "react";
import type { BetReceiptDto } from "@maraki/shared";
import { useNotify } from "@maraki/ui";
import { cashierApi } from "@/lib/api";

export function PlaceTicketView() {
  const notify = useNotify();
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState<BetReceiptDto | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptChanges, setAcceptChanges] = useState(true);

  async function lookup() {
    setBusy(true);
    setError("");
    setTicket(null);
    try {
      const next = await cashierApi.lookup(code);
      setTicket(next);
      notify.success("Ticket found", { title: next.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Coupon not found";
      setError(message);
      notify.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function place() {
    if (!ticket) return;
    setBusy(true);
    setError("");
    try {
      const placed = await cashierApi.place(ticket.couponCode, acceptChanges);
      setTicket(placed);
      setCode("");
      notify.success("Bet Placed Successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not place coupon";
      setError(message);
      notify.error(message);
    } finally {
      setBusy(false);
    }
  }

  const canPlace = ticket?.kind === "BOOKED" && ticket.status === "BOOKED";

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Place ticket</h1>
          <p className="hint">Look up a booked coupon, collect cash, then place it live.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Lookup</h2>
        </div>
        <div className="panel-body">
          <div className="lookup-row">
            <input
              autoFocus
              placeholder="Coupon number"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && code.trim()) void lookup();
              }}
            />
            <button type="button" disabled={busy || !code.trim()} onClick={() => void lookup()}>
              {busy && !ticket ? "..." : "LOOKUP"}
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </section>

      {ticket ? (
        <section className="panel">
          <div className="panel-head">
            <h2>{ticket.couponCode}</h2>
            <span className={`pill ${ticket.status.toLowerCase()}`}>
              {ticket.status}
              {ticket.channel === "CASH" ? " · CASH" : ticket.kind === "BOOKED" ? " · BOOKED" : ""}
            </span>
          </div>
          <div className="panel-body">
            <dl className="mini-stats">
              <div>
                <dt>Type</dt>
                <dd>{ticket.type}</dd>
              </div>
              <div>
                <dt>Stake</dt>
                <dd>{ticket.stake} ETB</dd>
              </div>
              <div>
                <dt>Odd</dt>
                <dd>{ticket.combinedOdds}</dd>
              </div>
              <div>
                <dt>Win</dt>
                <dd>{ticket.possibleWin} ETB</dd>
              </div>
            </dl>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Market</th>
                    <th>Pick</th>
                    <th>Odd</th>
                  </tr>
                </thead>
                <tbody>
                  {ticket.selections.map((item) => (
                    <tr key={`${item.fixtureLabel}-${item.selection}-${item.outcomeId}`}>
                      <td>{item.fixtureLabel}</td>
                      <td>{item.marketName}</td>
                      <td>{item.selection}</td>
                      <td>{item.placedOdds}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canPlace ? (
              <div className="place-actions">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={acceptChanges}
                    onChange={(event) => setAcceptChanges(event.target.checked)}
                  />
                  Accept odd changes
                </label>
                <button type="button" className="btn-place" disabled={busy} onClick={() => void place()}>
                  {busy ? "PLACING..." : `PLACE · Collect ${ticket.stake} ETB`}
                </button>
              </div>
            ) : ticket.kind === "PLACED" || ticket.status === "ACCEPTED" ? (
              <p className="ok">Ticket is live{ticket.channel === "CASH" ? " (cash desk)" : ""}.</p>
            ) : (
              <p className="warn">Cannot place this ticket ({ticket.status}).</p>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
