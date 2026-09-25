"use client";

import { useCallback, useState } from "react";
import type { AdminUserRow, UserRole } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";

export function UsersDirectory({
  title,
  role,
  roles,
  readOnly,
}: {
  title: string;
  role?: UserRole;
  roles?: UserRole[];
  readOnly?: boolean;
}) {
  const { session } = useAdminAuth();
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; status?: string }) =>
      adminApi.users({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        status: query.status || undefined,
        role,
        roles: roles?.join(","),
      }),
    [role, roles],
  );

  const table = usePagedTable<AdminUserRow>(Boolean(session), fetchPage, { q: "", status: "" });

  if (!session) return null;

  async function afterAction(next?: AdminUserRow | null) {
    await table.reload();
    if (next) setSelected(next);
  }

  async function remove(row: AdminUserRow) {
    if (row.id === session.user.id) {
      setMessage("Cannot delete your own account");
      return;
    }
    if (!window.confirm(`Delete account “${row.username}”? Bets and wallet history for this user are removed.`)) {
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
    const label = role ? role.toLowerCase() + "s" : roles?.join(", ") ?? "users";
    if (!window.confirm(`Delete ALL ${label} in this list (except your own admin account)?`)) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteUsers({
        role,
        roles: roles?.join(","),
      });
      setSelected(null);
      setMessage(`Deleted ${result.deleted} account(s).`);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete all failed");
    } finally {
      setBusy("");
    }
  }

  const canMutate = !readOnly;

  return (
    <>
      <h1>{title}</h1>
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
          canMutate || role === "ADMIN" ? (
            <IconButton
              icon="deleteAll"
              label={`Delete all ${title.toLowerCase()}`}
              tone="danger"
              disabled={busy === "delete-all"}
              onClick={() => void removeAll()}
            >
              Delete all
            </IconButton>
          ) : undefined
        }
      />
      {(table.error || message) && <p className="error">{table.error || message}</p>}
      <div className="panel">
        {table.data.items.length === 0 ? (
          <div className="empty">{table.loading ? "Loading…" : "No accounts in this list yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Balance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.username}</td>
                  <td>{row.role}</td>
                  <td>
                    <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span>
                  </td>
                  <td>
                    {row.wallet.currency} {row.wallet.available}
                  </td>
                  <td>
                    <div className="table-actions">
                      <IconButton
                        icon="view"
                        label="View"
                        onClick={() => {
                          setAmount("100");
                          setSelected(row);
                        }}
                      />
                      {canMutate && row.role !== "ADMIN" && (
                        <IconButton
                          icon={row.status === "ACTIVE" ? "disable" : "enable"}
                          label={row.status === "ACTIVE" ? "Suspend" : "Activate"}
                          disabled={Boolean(busy)}
                          onClick={async () => {
                            setBusy(`${row.id}-status`);
                            table.setError("");
                            try {
                              const nextStatus = row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
                              await adminApi.setStatus(row.id, nextStatus);
                              await afterAction(selected?.id === row.id ? { ...row, status: nextStatus } : null);
                            } catch (err) {
                              table.setError(err instanceof Error ? err.message : "Status update failed");
                            } finally {
                              setBusy("");
                            }
                          }}
                        />
                      )}
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
        title={selected ? `User · ${selected.username}` : "User"}
        onClose={() => setSelected(null)}
        footer={
          selected ? (
            <>
              {canMutate && selected.role !== "ADMIN" ? (
                <>
                  <div className="drawer-action-row">
                    <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={async () => {
                        setBusy("credit");
                        table.setError("");
                        try {
                          await adminApi.credit(selected.id, Number(amount));
                          await afterAction({
                            ...selected,
                            wallet: {
                              ...selected.wallet,
                              available: (Number(selected.wallet.available) + Number(amount)).toFixed(2),
                            },
                          });
                        } catch (err) {
                          table.setError(err instanceof Error ? err.message : "Credit failed");
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      Credit
                    </button>
                  </div>
                  <button
                    type="button"
                    className={selected.status === "ACTIVE" ? "danger" : undefined}
                    disabled={Boolean(busy)}
                    onClick={async () => {
                      setBusy("status");
                      table.setError("");
                      try {
                        const nextStatus = selected.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
                        await adminApi.setStatus(selected.id, nextStatus);
                        await afterAction({ ...selected, status: nextStatus });
                      } catch (err) {
                        table.setError(err instanceof Error ? err.message : "Status update failed");
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    {selected.status === "ACTIVE" ? "Suspend" : "Activate"}
                  </button>
                </>
              ) : null}
              {selected.id !== session.user.id ? (
                <IconButton
                  icon="delete"
                  label="Delete"
                  tone="danger"
                  disabled={busy === `${selected.id}-del`}
                  onClick={() => void remove(selected)}
                >
                  Delete
                </IconButton>
              ) : null}
            </>
          ) : undefined
        }
      >
        {selected && (
          <DetailGrid
            rows={[
              { label: "Username", value: selected.username },
              { label: "Phone", value: selected.phone ?? "—" },
              { label: "Role", value: selected.role },
              {
                label: "Status",
                value: <span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span>,
              },
              { label: "Available", value: `${selected.wallet.currency} ${selected.wallet.available}` },
              { label: "Locked", value: `${selected.wallet.currency} ${selected.wallet.locked}` },
              { label: "Bets", value: selected.bets },
              { label: "Joined", value: new Date(selected.createdAt).toLocaleString() },
              { label: "User ID", value: selected.id },
            ]}
          />
        )}
      </DetailDrawer>
    </>
  );
}
