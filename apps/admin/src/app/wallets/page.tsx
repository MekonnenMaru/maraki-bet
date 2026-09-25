"use client";

import { useCallback, useState } from "react";
import type { AdminUserRow } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";

export default function WalletsPage() {
  const { session } = useAdminAuth();
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; status?: string }) =>
      adminApi.users({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        status: query.status || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminUserRow>(Boolean(session), fetchPage, { q: "", status: "" });

  if (!session) return null;

  const pageTotal = table.data.items.reduce((sum, row) => sum + Number(row.wallet.available), 0);

  async function remove(row: AdminUserRow) {
    if (row.id === session.user.id) {
      setMessage("Cannot delete your own account");
      return;
    }
    if (
      !window.confirm(
        `Delete wallet account “${row.username}”? This deletes the user and their bets/ledger.`,
      )
    ) {
      return;
    }
    setBusy(`${row.id}-del`);
    setMessage("");
    try {
      await adminApi.deleteUser(row.id);
      if (selected?.id === row.id) setSelected(null);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!window.confirm("Delete ALL non-admin wallet accounts (except your own)?")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteUsers({ roles: "PLAYER,AGENT,CASHIER" });
      setSelected(null);
      setMessage(`Deleted ${result.deleted} account(s).`);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete all failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <h1>Wallets</h1>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "Username or phone", width: "220px" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "", label: "All statuses" },
              { value: "ACTIVE", label: "Active" },
              { value: "SUSPENDED", label: "Suspended" },
            ],
          },
        ]}
        values={table.draft}
        onChange={table.setFilter}
        onSubmit={table.applyFilters}
        onReset={table.resetFilters}
        loading={table.loading}
        actions={
          <IconButton
            icon="deleteAll"
            label="Delete all wallets"
            tone="danger"
            disabled={busy === "delete-all"}
            onClick={() => void removeAll()}
          >
            Delete all
          </IconButton>
        }
      />
      {(table.error || message) && <p className="error">{table.error || message}</p>}
      <section className="cards">
        <article>
          <small>Page available</small>
          <b>ETB {pageTotal.toFixed(2)}</b>
        </article>
        <article>
          <small>Accounts</small>
          <b>{table.data.total}</b>
        </article>
      </section>
      <div className="panel">
        {table.data.items.length === 0 ? (
          <div className="empty">{table.loading ? "Loading…" : "No wallets yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Available</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.username}</td>
                  <td>
                    <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span>
                  </td>
                  <td>{row.wallet.available}</td>
                  <td>
                    <div className="table-actions">
                      <IconButton icon="view" label="View" onClick={() => setSelected(row)} />
                      {row.id !== session.user.id && (
                        <IconButton
                          icon="delete"
                          label="Delete"
                          tone="danger"
                          disabled={busy === `${row.id}-del`}
                          onClick={() => void remove(row)}
                        />
                      )}
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
        title={selected ? `Wallet · ${selected.username}` : "Wallet"}
        onClose={() => setSelected(null)}
        footer={
          selected && selected.id !== session.user.id ? (
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
              { label: "User", value: selected.username },
              { label: "Phone", value: selected.phone ?? "—" },
              { label: "Role", value: selected.role },
              {
                label: "Status",
                value: <span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span>,
              },
              { label: "Available", value: `${selected.wallet.currency} ${selected.wallet.available}` },
              { label: "Locked", value: `${selected.wallet.currency} ${selected.wallet.locked}` },
              { label: "Bets placed", value: selected.bets },
              { label: "Joined", value: new Date(selected.createdAt).toLocaleString() },
            ]}
          />
        )}
      </DetailDrawer>
    </>
  );
}
