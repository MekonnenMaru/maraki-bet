"use client";

import type { BetReceiptDto } from "@maraki/shared";

export function TicketTable({ items }: { items: BetReceiptDto[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Coupon</th>
            <th>Type</th>
            <th>Stake</th>
            <th>Odd</th>
            <th>Win / Payout</th>
            <th>Status</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <b>{item.couponCode}</b>
              </td>
              <td>{item.type}</td>
              <td>{item.stake}</td>
              <td>{item.combinedOdds}</td>
              <td>{item.settledAt ? item.payout : item.possibleWin}</td>
              <td>
                <span className={`pill ${item.status.toLowerCase()}`}>{item.status}</span>
              </td>
              <td className="muted">{formatTime(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
