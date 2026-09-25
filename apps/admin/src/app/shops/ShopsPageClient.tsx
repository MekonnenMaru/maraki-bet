"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  SHOP_PERMISSION_KEYS,
  type AdminAgentRow,
  type AdminShopRow,
  type OrgPermissionMap,
} from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { ActionIcon, IconButton } from "@/modules/table/ActionIcon";
import { PermissionEditor } from "@/modules/org/PermissionEditor";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";

function defaultPermissions(): OrgPermissionMap {
  return Object.fromEntries(SHOP_PERMISSION_KEYS.map((key) => [key, true]));
}

export default function ShopsPage() {
  const { session } = useAdminAuth();
  const search = useSearchParams();
  const agentFromUrl = search.get("agentId") ?? "";
  const [agents, setAgents] = useState<AdminAgentRow[]>([]);
  const [selected, setSelected] = useState<AdminShopRow | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create" | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    agentId: agentFromUrl,
    name: "",
    code: "",
    address: "",
    phone: "",
    notes: "",
    permissions: defaultPermissions(),
  });

  useEffect(() => {
    if (!session) return;
    void adminApi.agents({ pageSize: 100 }).then((page) => setAgents(page.items)).catch(() => undefined);
  }, [session]);

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; status?: string; agentId?: string }) =>
      adminApi.shops({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        status: query.status || undefined,
        agentId: query.agentId || agentFromUrl || undefined,
      }),
    [agentFromUrl],
  );

  const table = usePagedTable<AdminShopRow>(Boolean(session), fetchPage, {
    q: "",
    status: "",
    agentId: agentFromUrl,
  });

  useEffect(() => {
    if (!agentFromUrl) return;
    table.setFilter("agentId", agentFromUrl);
    table.applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFromUrl]);

  const title = useMemo(() => {
    if (mode === "create") return "Create shop";
    if (mode === "edit" && selected) return `Edit · ${selected.name}`;
    if (selected) return selected.name;
    return "Shop";
  }, [mode, selected]);

  function openCreate() {
    setSelected(null);
    setForm({
      agentId: agentFromUrl || agents[0]?.id || "",
      name: "",
      code: "",
      address: "",
      phone: "",
      notes: "",
      permissions: defaultPermissions(),
    });
    setMode("create");
  }

  function openView(row: AdminShopRow) {
    setSelected(row);
    setMode("view");
  }

  function openEdit(row: AdminShopRow) {
    setSelected(row);
    setForm({
      agentId: row.agentId,
      name: row.name,
      code: row.code ?? "",
      address: row.address ?? "",
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
        const created = await adminApi.createShop({
          agentId: form.agentId,
          name: form.name,
          code: form.code || undefined,
          address: form.address || undefined,
          phone: form.phone || undefined,
          notes: form.notes || undefined,
          permissions: form.permissions,
        });
        setSelected(created);
        setMode("view");
      } else if (mode === "edit" && selected) {
        const updated = await adminApi.updateShop(selected.id, {
          agentId: form.agentId,
          name: form.name,
          code: form.code || null,
          address: form.address || null,
          phone: form.phone || null,
          notes: form.notes || null,
          permissions: form.permissions,
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

  async function toggleStatus(row: AdminShopRow) {
    setBusy(`status-${row.id}`);
    try {
      const updated = await adminApi.updateShop(row.id, {
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

  async function remove(row: AdminShopRow) {
    if (!window.confirm(`Delete shop ${row.name}? Sales desks must be removed first.`)) return;
    setBusy(`del-${row.id}`);
    try {
      await adminApi.deleteShop(row.id);
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
    if (!window.confirm("Delete ALL shops and their sales desks?")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllShops();
      setSelected(null);
      setMode(null);
      setMessage(`Deleted ${result.deleted} shop(s).`);
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
      <h1>Shops</h1>
      <p className="muted">Branches/shops belong to an agent. Sales desks live inside each shop.</p>
      <div className="org-toolbar">
        <button type="button" onClick={openCreate}>
          Create shop
        </button>
        <Link href="/agents">← Agents</Link>
        <Link href="/sales">Sales →</Link>
      </div>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "Shop name or code", width: "220px" },
          {
            key: "agentId",
            label: "Agent",
            type: "select",
            options: [
              { value: "", label: "All agents" },
              ...agents.map((agent) => ({ value: agent.id, label: agent.displayName })),
            ],
          },
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
            label="Delete all shops"
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
          <div className="empty">{table.loading ? "Loading…" : "No shops yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Agent</th>
                <th>Sales</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    <br />
                    <small>{row.code ?? row.address ?? "—"}</small>
                  </td>
                  <td>{row.agentName}</td>
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
                      <Link className="icon-btn ghost" href={`/sales?shopId=${row.id}`} title="Sales" aria-label="Sales">
                        <ActionIcon name="sales" />
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

      <DetailDrawer open={Boolean(mode)} title={title} onClose={() => setMode(null)}>
        {(mode === "create" || mode === "edit") && (
          <div className="org-form">
            <label>
              Agent
              <select
                value={form.agentId}
                onChange={(event) => setForm((current) => ({ ...current, agentId: event.target.value }))}
              >
                <option value="">Select agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Shop name
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
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
              Address
              <input
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
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
                keys={SHOP_PERMISSION_KEYS}
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
                { label: "Agent", value: selected.agentName },
                { label: "Code", value: selected.code ?? "—" },
                { label: "Address", value: selected.address ?? "—" },
                { label: "Phone", value: selected.phone ?? "—" },
                { label: "Sales desks", value: String(selected.saleCount) },
                { label: "Status", value: selected.status },
                { label: "Notes", value: selected.notes ?? "—" },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <strong>Permissions</strong>
              <PermissionEditor keys={SHOP_PERMISSION_KEYS} value={selected.permissions} readOnly />
            </div>
            <div className="table-actions" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => openEdit(selected)}>
                Edit
              </button>
              <Link href={`/sales?shopId=${selected.id}`}>View sales</Link>
            </div>
          </>
        )}
      </DetailDrawer>
    </>
  );
}
