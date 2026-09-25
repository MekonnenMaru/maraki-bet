"use client";

import { useCallback, useState } from "react";
import type { AdminBetRow } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";

export default function BetsPage() {
  const { session } = useAdminAuth();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<AdminBetRow | null>(null);

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; status?: string }) =>
      adminApi.bets({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        status: query.status || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminBetRow>(Boolean(session), fetchPage, { q: "", status: "" });

  if (!session) return null;

  async function remove(row: AdminBetRow) {
    if (!window.confirm(`Permanently delete coupon ${row.couponCode}? This does not refund.`)) return;
    setBusy(`${row.id}-del`);
    setMessage("");
    try {
      await adminApi.deleteBet(row.id);
      if (selected?.id === row.id) setSelected(null);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!window.confirm("Delete ALL bets permanently? This does not refund stakes.")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllBets();
      setSelected(null);
      setMessage(`Deleted ${result.deleted} bet(s).`);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete all failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <h1>Bets</h1>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "Coupon or username", width: "220px" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "", label: "All statuses" },
              { value: "ACCEPTED", label: "Open" },
              { value: "WON", label: "Won" },
              { value: "LOST", label: "Lost" },
              { value: "VOID", label: "Void" },
            ],
          },
        ]}
        values={table.draft}
        onChange={table.setFilter}
        onSubmit={table.applyFilters}
        onReset={table.resetFilters}
        loading={table.loading}
        actions={
          <>
            <button
              type="button"
              disabled={Boolean(busy) || table.loading}
              onClick={async () => {
                setBusy("settle");
                table.setError("");
                try {
                  await adminApi.settle();
                  await table.reload();
                } catch (err) {
                  table.setError(err instanceof Error ? err.message : "Settle failed");
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === "settle" ? "Settling…" : "Run settlement"}
            </button>
            <IconButton
              icon="deleteAll"
              label="Delete all bets"
              tone="danger"
              disabled={busy === "delete-all"}
              onClick={() => void removeAll()}
            >
              Delete all
            </IconButton>
          </>
        }
      />
      {(table.error || message) && <p className="error">{table.error || message}</p>}
      <div className="panel">
        {table.data.items.length === 0 ? (
          <div className="empty">{table.loading ? "Loading…" : "No coupons yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Coupon</th>
                <th>Player</th>
                <th>Status</th>
                <th>Stake</th>
                <th>Placed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.couponCode}</td>
                  <td>{row.username}</td>
                  <td>
                    <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span>
                  </td>
                  <td>{row.stake}</td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="table-actions">
                      <IconButton icon="view" label="View" onClick={() => setSelected(row)} />
                      <IconButton
                        icon="delete"
                        label="Delete"
                        tone="danger"
                        disabled={busy === `${row.id}-del`}
                        onClick={() => void remove(row)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <TablePagination data={table.data} onPage={table.setPage} onPageSize={table.changePageSize} />
      </div>

      <DetailDrawer
        open={Boolean(selected)}
        title={selected ? `Bet · ${selected.couponCode}` : "Bet"}
        onClose={() => setSelected(null)}
        footer={
          selected ? (
            <>
              {selected.status === "ACCEPTED" ? (
                <IconButton
                  icon="delete"
                  label="Void coupon"
                  tone="danger"
                  disabled={Boolean(busy)}
                  onClick={async () => {
                    if (!window.confirm(`Void ${selected.couponCode} and refund the stake?`)) return;
                    setBusy("void");
                    table.setError("");
                    try {
                      await adminApi.voidBet(selected.couponCode);
                      await table.reload();
                      setSelected(null);
                    } catch (err) {
                      table.setError(err instanceof Error ? err.message : "Void failed");
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  Void coupon
                </IconButton>
              ) : null}
              <IconButton
                icon="delete"
                label="Delete"
                tone="danger"
                disabled={busy === `${selected.id}-del`}
                onClick={() => void remove(selected)}
              >
                Delete
              </IconButton>
            </>
          ) : undefined
        }
      >
        {selected && (
          <>
            <DetailGrid
              rows={[
                { label: "Coupon", value: selected.couponCode },
                { label: "Player", value: selected.username },
                {
                  label: "Status",
                  value: <span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span>,
                },
                { label: "Type", value: selected.type },
                { label: "Stake", value: selected.stake },
                { label: "VAT", value: selected.vat },
                { label: "Net stake", value: selected.netStake },
                { label: "Combined odds", value: selected.combinedOdds },
                { label: "Bonus", value: selected.bonus },
                { label: "Possible win", value: selected.possibleWin },
                { label: "Payout", value: selected.payout },
                { label: "Placed", value: new Date(selected.createdAt).toLocaleString() },
                {
                  label: "Settled",
                  value: selected.settledAt ? new Date(selected.settledAt).toLocaleString() : "—",
                },
              ]}
            />
            <h3 className="drawer-section">Selections</h3>
            <div className="panel nested">
              <table>
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
                  {selected.selections.map((leg, index) => (
                    <tr key={`${selected.id}-${index}`}>
                      <td>{leg.fixtureLabel}</td>
                      <td>{leg.marketName}</td>
                      <td>{leg.selection}</td>
                      <td>{leg.placedOdds}</td>
                      <td>
                        <span className={`status ${leg.status.toLowerCase()}`}>{leg.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DetailDrawer>
    </>
  );
}
