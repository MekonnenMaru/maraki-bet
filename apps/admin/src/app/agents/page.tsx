"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AGENT_PERMISSION_KEYS,
  type AdminAgentRow,
  type OrgPermissionMap,
} from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton, ActionIcon } from "@/modules/table/ActionIcon";
import { PermissionEditor } from "@/modules/org/PermissionEditor";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";
import Link from "next/link";

function defaultPermissions(): OrgPermissionMap {
  return Object.fromEntries(AGENT_PERMISSION_KEYS.map((key) => [key, true]));
}

export default function AgentsPage() {
  const { session } = useAdminAuth();
  const [selected, setSelected] = useState<AdminAgentRow | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create" | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    username: "",
    password: "",
    displayName: "",
    code: "",
    phone: "",
    notes: "",
    permissions: defaultPermissions(),
  });

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; status?: string }) =>
      adminApi.agents({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        status: query.status || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminAgentRow>(Boolean(session), fetchPage, { q: "", status: "" });

  const drawerOpen = Boolean(mode);

  const title = useMemo(() => {
    if (mode === "create") return "Create agent";
    if (mode === "edit" && selected) return `Edit · ${selected.displayName}`;
    if (selected) return selected.displayName;
    return "Agent";
  }, [mode, selected]);

  function openCreate() {
    setSelected(null);
    setForm({
      username: "",
      password: "",
      displayName: "",
      code: "",
      phone: "",
      notes: "",
      permissions: defaultPermissions(),
    });
    setMode("create");
  }

  function openView(row: AdminAgentRow) {
    setSelected(row);
    setMode("view");
  }

  function openEdit(row: AdminAgentRow) {
    setSelected(row);
    setForm({
      username: row.username,
      password: "",
      displayName: row.displayName,
      code: row.code ?? "",
      phone: row.phone ?? "",
      notes: row.notes ?? "",
      permissions: { ...defaultPermissions(), ...row.permissions },
    });
    setMode("edit");
  }

  async function save() {
    setBusy("save");
    setMessage("");
    try {
      if (mode === "create") {
        const created = await adminApi.createAgent({
          username: form.username,
          password: form.password,
          displayName: form.displayName,
          code: form.code || undefined,
          phone: form.phone || undefined,
          notes: form.notes || undefined,
          permissions: form.permissions,
        });
        setSelected(created);
        setMode("view");
      } else if (mode === "edit" && selected) {
        const updated = await adminApi.updateAgent(selected.id, {
          displayName: form.displayName,
          code: form.code || null,
          phone: form.phone || null,
          notes: form.notes || null,
          permissions: form.permissions,
          password: form.password || undefined,
        });
        setSelected(updated);
        setMode("view");
      }
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function toggleStatus(row: AdminAgentRow) {
    setBusy(`status-${row.id}`);
    setMessage("");
    try {
      const updated = await adminApi.updateAgent(row.id, {
        status: row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
      });
      if (selected?.id === row.id) setSelected(updated);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setBusy("");
    }
  }

  async function remove(row: AdminAgentRow) {
    if (!window.confirm(`Delete agent ${row.displayName}? Shops must be removed first.`)) return;
    setBusy(`del-${row.id}`);
    setMessage("");
    try {
      await adminApi.deleteAgent(row.id);
      if (selected?.id === row.id) {
        setSelected(null);
        setMode(null);
      }
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (
      !window.confirm(
        "Delete ALL agents, their shops, and sales desks? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllAgents();
      setSelected(null);
      setMode(null);
      setMessage(`Deleted ${result.deleted} agent(s).`);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete all failed");
    } finally {
      setBusy("");
    }
  }

  if (!session) return null;

  return (
    <>
      <h1>Agents</h1>
      <p className="muted">Agents own shops. Each agent has their own permissions.</p>
      <div className="org-toolbar">
        <button type="button" onClick={openCreate}>
          Create agent
        </button>
        <Link href="/shops">Manage shops →</Link>
      </div>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "Name, code, username", width: "220px" },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "", label: "All" },
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
            label="Delete all agents"
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
          <div className="empty">{table.loading ? "Loading…" : "No agents yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Username</th>
                <th>Shops</th>
                <th>Sales</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.displayName}</strong>
                    <br />
                    <small>{row.code ?? "—"}</small>
                  </td>
                  <td>{row.username}</td>
                  <td>{row.shopCount}</td>
                  <td>{row.saleCount}</td>
                  <td>
                    <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <IconButton icon="view" label="View" onClick={() => openView(row)} />
                      <IconButton icon="edit" label="Edit" onClick={() => openEdit(row)} />
                      <IconButton
                        icon={row.status === "ACTIVE" ? "disable" : "enable"}
                        label={row.status === "ACTIVE" ? "Suspend" : "Activate"}
                        disabled={busy === `status-${row.id}`}
                        onClick={() => void toggleStatus(row)}
                      />
                      <Link className="icon-btn ghost" href={`/shops?agentId=${row.id}`} title="Shops" aria-label="Shops">
                        <ActionIcon name="shops" />
                      </Link>
                      <IconButton
                        icon="delete"
                        label="Delete"
                        tone="danger"
                        disabled={busy === `del-${row.id}`}
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

      <DetailDrawer open={drawerOpen} title={title} onClose={() => setMode(null)}>
        {(mode === "create" || mode === "edit") && (
          <div className="org-form">
            {mode === "create" && (
              <label>
                Username
                <input
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                />
              </label>
            )}
            <label>
              {mode === "create" ? "Password" : "New password (optional)"}
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
            <label>
              Display name
              <input
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>
            <label>
              Code
              <input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
            <label>
              Notes
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <div>
              <strong>Permissions</strong>
              <PermissionEditor
                keys={AGENT_PERMISSION_KEYS}
                value={form.permissions}
                onChange={(permissions) => setForm((current) => ({ ...current, permissions }))}
              />
            </div>
            <button type="button" disabled={busy === "save"} onClick={() => void save()}>
              Save
            </button>
          </div>
        )}
        {mode === "view" && selected && (
          <>
            <DetailGrid
              rows={[
                { label: "Username", value: selected.username },
                { label: "Code", value: selected.code ?? "—" },
                { label: "Phone", value: selected.phone ?? "—" },
                { label: "Status", value: selected.status },
                { label: "Shops", value: String(selected.shopCount) },
                { label: "Sales", value: String(selected.saleCount) },
                { label: "Wallet", value: `${selected.wallet.currency} ${selected.wallet.available}` },
                { label: "Notes", value: selected.notes ?? "—" },
                { label: "Created", value: new Date(selected.createdAt).toLocaleString() },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <strong>Permissions</strong>
              <PermissionEditor keys={AGENT_PERMISSION_KEYS} value={selected.permissions} readOnly />
            </div>
            <div className="table-actions" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => openEdit(selected)}>
                Edit
              </button>
              <Link href={`/shops?agentId=${selected.id}`}>View shops</Link>
            </div>
          </>
        )}
      </DetailDrawer>
    </>
  );
}
