"use client";

import { useCallback, useState } from "react";
import type { AdminLedgerRow } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";

export function LedgerDirectory({ title, type }: { title: string; type?: string }) {
  const { session } = useAdminAuth();
  const lockedType = type ?? "";
  const [selected, setSelected] = useState<AdminLedgerRow | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; type?: string }) =>
      adminApi.ledger({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        type: (lockedType || query.type || undefined) as string | undefined,
      }),
    [lockedType],
  );

  const table = usePagedTable<AdminLedgerRow>(Boolean(session), fetchPage, {
    q: "",
    type: lockedType,
  });

  if (!session) return null;

  async function remove(row: AdminLedgerRow) {
    if (!window.confirm(`Delete this ${row.type} entry for ${row.username}?`)) return;
    setBusy(`${row.id}-del`);
    setMessage("");
    try {
      await adminApi.deleteLedgerEntry(row.id);
      if (selected?.id === row.id) setSelected(null);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    const label = lockedType || "ledger entries";
    if (!window.confirm(`Delete ALL ${label} records?`)) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllLedger(lockedType || undefined);
      setSelected(null);
      setMessage(`Deleted ${result.deleted} entr${result.deleted === 1 ? "y" : "ies"}.`);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete all failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <h1>{title}</h1>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "User, coupon, note", width: "220px" },
          ...(lockedType
            ? []
            : [
                {
                  key: "type",
                  label: "Type",
                  type: "select" as const,
                  options: [
                    { value: "", label: "All types" },
                    { value: "DEPOSIT", label: "Deposits" },
                    { value: "ADMIN_CREDIT", label: "Admin credit" },
                    { value: "BET_STAKE", label: "Stakes" },
                    { value: "BET_WIN", label: "Wins" },
                    { value: "BET_REFUND", label: "Refunds" },
                    { value: "WITHDRAWAL", label: "Withdrawals" },
                  ],
                },
              ]),
        ]}
        values={table.draft}
        onChange={table.setFilter}
        onSubmit={table.applyFilters}
        onReset={table.resetFilters}
        loading={table.loading}
        actions={
          <IconButton
            icon="deleteAll"
            label={`Delete all ${title.toLowerCase()}`}
            tone="danger"
            disabled={busy === "delete-all"}
            onClick={() => void removeAll()}
          >
            Delete all
          </IconButton>
        }
      />
      {(table.error || message) && <p className="error">{table.error || message}</p>}
      <div className="panel">
        {table.data.items.length === 0 ? (
          <div className="empty">{table.loading ? "Loading…" : "No movements yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.username}</td>
                  <td>
                    <span className={`status ${row.type.toLowerCase()}`}>{row.type}</span>
                  </td>
                  <td>{row.amount}</td>
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
        title={selected ? `Transaction · ${selected.type}` : "Transaction"}
        onClose={() => setSelected(null)}
        footer={
          selected ? (
            <IconButton
              icon="delete"
              label="Delete"
              tone="danger"
              disabled={busy === `${selected.id}-del`}
              onClick={() => void remove(selected)}
            >
              Delete
            </IconButton>
          ) : undefined
        }
      >
        {selected && (
          <DetailGrid
            rows={[
              { label: "When", value: new Date(selected.createdAt).toLocaleString() },
              { label: "User", value: selected.username },
              {
                label: "Type",
                value: <span className={`status ${selected.type.toLowerCase()}`}>{selected.type}</span>,
              },
              { label: "Amount", value: selected.amount },
              { label: "Balance after", value: selected.balanceAfter },
              { label: "Reference", value: selected.ref ?? "—" },
              { label: "Note", value: selected.note ?? "—" },
              { label: "ID", value: selected.id },
            ]}
          />
        )}
      </DetailDrawer>
    </>
  );
}
