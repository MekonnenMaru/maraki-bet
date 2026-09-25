"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  SALE_PERMISSION_KEYS,
  type AdminSaleRow,
  type AdminShopRow,
  type OrgPermissionMap,
} from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { PermissionEditor } from "@/modules/org/PermissionEditor";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";

function defaultPermissions(): OrgPermissionMap {
  return Object.fromEntries(SALE_PERMISSION_KEYS.map((key) => [key, true]));
}

export default function SalesPage() {
  const { session } = useAdminAuth();
  const search = useSearchParams();
  const shopFromUrl = search.get("shopId") ?? "";
  const [shops, setShops] = useState<AdminShopRow[]>([]);
  const [selected, setSelected] = useState<AdminSaleRow | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create" | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    shopId: shopFromUrl,
    username: "",
    password: "",
    label: "",
    code: "",
    notes: "",
    permissions: defaultPermissions(),
  });

  useEffect(() => {
    if (!session) return;
    void adminApi.shops({ pageSize: 100 }).then((page) => setShops(page.items)).catch(() => undefined);
  }, [session]);

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; status?: string; shopId?: string }) =>
      adminApi.sales({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        status: query.status || undefined,
        shopId: query.shopId || shopFromUrl || undefined,
      }),
    [shopFromUrl],
  );

  const table = usePagedTable<AdminSaleRow>(Boolean(session), fetchPage, {
    q: "",
    status: "",
    shopId: shopFromUrl,
  });

  useEffect(() => {
    if (!shopFromUrl) return;
    table.setFilter("shopId", shopFromUrl);
    table.applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopFromUrl]);

  const title = useMemo(() => {
    if (mode === "create") return "Create sales desk";
    if (mode === "edit" && selected) return `Edit · ${selected.label}`;
    if (selected) return selected.label;
    return "Sales";
  }, [mode, selected]);

  function openCreate() {
    setSelected(null);
    setForm({
      shopId: shopFromUrl || shops[0]?.id || "",
      username: "",
      password: "",
      label: "",
      code: "",
      notes: "",
      permissions: defaultPermissions(),
    });
    setMode("create");
  }

  function openView(row: AdminSaleRow) {
    setSelected(row);
    setMode("view");
  }

  function openEdit(row: AdminSaleRow) {
    setSelected(row);
    setForm({
      shopId: row.shopId,
      username: row.username,
      password: "",
      label: row.label,
      code: row.code ?? "",
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
        const created = await adminApi.createSale({
          shopId: form.shopId,
          username: form.username,
          password: form.password,
          label: form.label,
          code: form.code || undefined,
          notes: form.notes || undefined,
          permissions: form.permissions,
        });
        setSelected(created);
        setMode("view");
      } else if (mode === "edit" && selected) {
        const updated = await adminApi.updateSale(selected.id, {
          shopId: form.shopId,
          label: form.label,
          code: form.code || null,
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

  async function toggleStatus(row: AdminSaleRow) {
    setBusy(`status-${row.id}`);
    try {
      const updated = await adminApi.updateSale(row.id, {
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

  async function remove(row: AdminSaleRow) {
    if (!window.confirm(`Delete sales desk ${row.label} (${row.username})?`)) return;
    setBusy(`del-${row.id}`);
    try {
      await adminApi.deleteSale(row.id);
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
    if (!window.confirm("Delete ALL sales desks?")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllSales();
      setSelected(null);
      setMode(null);
      setMessage(`Deleted ${result.deleted} sales desk(s).`);
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
      <h1>Sales</h1>
      <p className="muted">Cashiers / sales desks sit inside shops. Each sales account has its own permissions.</p>
      <div className="org-toolbar">
        <button type="button" onClick={openCreate}>
          Create sales
        </button>
        <Link href="/shops">← Shops</Link>
      </div>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "Label, username, shop", width: "220px" },
          {
            key: "shopId",
            label: "Shop",
            type: "select",
            options: [
              { value: "", label: "All shops" },
              ...shops.map((shop) => ({ value: shop.id, label: `${shop.name} (${shop.agentName})` })),
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
            label="Delete all sales"
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
          <div className="empty">{table.loading ? "Loading…" : "No sales desks yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Sales</th>
                <th>Username</th>
                <th>Shop</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.label}</strong>
                    <br />
                    <small>{row.code ?? "—"}</small>
                  </td>
                  <td>{row.username}</td>
                  <td>{row.shopName}</td>
                  <td>{row.agentName}</td>
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
              Shop
              <select
                value={form.shopId}
                onChange={(event) => setForm((current) => ({ ...current, shopId: event.target.value }))}
              >
                <option value="">Select shop</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name} · {shop.agentName}
                  </option>
                ))}
              </select>
            </label>
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
              Label
              <input
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
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
                keys={SALE_PERMISSION_KEYS}
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
                { label: "Shop", value: selected.shopName },
                { label: "Agent", value: selected.agentName },
                { label: "Code", value: selected.code ?? "—" },
                { label: "Status", value: selected.status },
                { label: "Wallet", value: `${selected.wallet.currency} ${selected.wallet.available}` },
                { label: "Notes", value: selected.notes ?? "—" },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <strong>Permissions</strong>
              <PermissionEditor keys={SALE_PERMISSION_KEYS} value={selected.permissions} readOnly />
            </div>
            <div className="table-actions" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => openEdit(selected)}>
                Edit
              </button>
            </div>
          </>
        )}
      </DetailDrawer>
    </>
  );
}
