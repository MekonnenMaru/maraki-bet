"use client";

import type { BetReceiptDto, TestSettleOutcome } from "@maraki/shared";

export function CouponCard({
  bet,
  onTestSettle,
}: {
  bet: BetReceiptDto;
  onTestSettle?: (code: string, outcome: TestSettleOutcome) => Promise<void>;
}) {
  const settled =
    Boolean(bet.settledAt) ||
    (bet.status !== "ACCEPTED" &&
      bet.status !== "PENDING" &&
      bet.status !== "BOOKED" &&
      bet.kind !== "BOOKED");

  return (
    <article className="coupon-card">
      <header>
        <b>{bet.couponCode}</b>
        <span className={`bet-status ${(bet.kind === "BOOKED" ? "booked" : bet.status).toLowerCase()}`}>
          {bet.kind === "BOOKED" ? bet.status : bet.status}
        </span>
      </header>
      {bet.kind === "BOOKED" ? (
        <p className="coupon-booked-note">Unpaid booking — take this ticket to a shop cashier.</p>
      ) : null}
      <dl className="receipt-mini">
        <div>
          <dt>Type</dt>
          <dd>{bet.type}</dd>
        </div>
        <div>
          <dt>Stake</dt>
          <dd>{bet.stake}</dd>
        </div>
        <div>
          <dt>Odd</dt>
          <dd>{bet.combinedOdds}</dd>
        </div>
        <div>
          <dt>{settled ? "Payout" : "Possible Win"}</dt>
          <dd>{settled ? bet.payout : bet.possibleWin}</dd>
        </div>
      </dl>
      <table className="receipt-table">
        <thead>
          <tr>
            <th>Match</th>
            <th>Market</th>
            <th>Pick</th>
            <th>Odd</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {bet.selections.map((item) => (
            <tr key={`${item.fixtureLabel}-${item.selection}`}>
              <td>{item.fixtureLabel}</td>
              <td>{item.marketName}</td>
              <td>{item.selection}</td>
              <td>{item.placedOdds}</td>
              <td>
                <span className={`bet-status ${item.status.toLowerCase()}`}>{item.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {onTestSettle && bet.status === "ACCEPTED" && (
        <div className="settle-actions">
          <span>Test settle</span>
          {(["WON", "LOST", "VOID"] as const).map((outcome) => (
            <button key={outcome} type="button" onClick={() => void onTestSettle(bet.couponCode, outcome)}>
              {outcome === "WON" ? "Won" : outcome === "LOST" ? "Lost" : "Void"}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
