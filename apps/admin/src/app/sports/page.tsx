"use client";

import { useCallback, useState } from "react";
import type { AdminSportRow } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { DisplayOrderEditor } from "@/modules/table/DisplayOrderEditor";
import { RelatedLinks } from "@/modules/table/RelatedLinks";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";

export default function SportsPage() {
  const { session } = useAdminAuth();
  const [selected, setSelected] = useState<AdminSportRow | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; enabled?: string }) =>
      adminApi.sports({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        enabled: query.enabled || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminSportRow>(Boolean(session), fetchPage, { q: "", enabled: "" });

  async function toggle(row: AdminSportRow, field: "enabled" | "visible") {
    setBusy(`${row.id}-${field}`);
    setMessage("");
    try {
      const updated = await adminApi.patchSport(row.id, { [field]: !row[field] });
      table.reload();
      if (selected?.id === row.id) setSelected({ ...row, ...updated });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy("");
    }
  }

  async function saveOrder(row: AdminSportRow, displayOrder: number) {
    setBusy(`${row.id}-order`);
    setMessage("");
    try {
      const updated = await adminApi.patchSport(row.id, { displayOrder });
      await table.reload();
      if (selected?.id === row.id) setSelected({ ...row, ...updated });
      setMessage(`Order saved for ${row.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Order update failed");
    } finally {
      setBusy("");
    }
  }

  async function syncSport(row: AdminSportRow) {
    setBusy(`${row.id}-sync`);
    setMessage("");
    try {
      const job = await adminApi.syncSport(row.id);
      setMessage(`Sync job ${job.status}: ${job.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy("");
    }
  }

  async function remove(row: AdminSportRow) {
    if (
      !window.confirm(
        `Delete sport “${row.name}”? This also deletes its tournaments, fixtures, and markets.`,
      )
    ) {
      return;
    }
    setBusy(`${row.id}-del`);
    setMessage("");
    try {
      await adminApi.deleteSport(row.id);
      if (selected?.id === row.id) setSelected(null);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!window.confirm("Delete ALL sports and related tournaments, fixtures, and markets?")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllSports();
      setSelected(null);
      setMessage(`Deleted ${result.deleted} sport(s).`);
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
      <h1>Sports</h1>
      <p className="muted">Imported from OddsPapi. Delete removes local rows; re-sync to restore.</p>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "Name or slug", width: "220px" },
          {
            key: "enabled",
            label: "Status",
            type: "select",
            options: [
              { value: "", label: "All" },
              { value: "true", label: "Enabled" },
              { value: "false", label: "Disabled" },
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
            label="Delete all sports"
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
          <div className="empty">{table.loading ? "Loading…" : "No sports synced yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Name</th>
                <th>Related</th>
                <th>Enabled</th>
                <th>Visible</th>
                <th>Last Sync</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.displayOrder}</td>
                  <td>
                    <strong>{row.name}</strong>
                    <br />
                    <small>
                      #{row.id} · {row.slug}
                    </small>
                  </td>
                  <td>
                    <RelatedLinks
                      items={[
                        {
                          href: `/tournaments?sportId=${row.id}`,
                          label: "Tournaments",
                          count: row.tournamentCount,
                        },
                        { href: `/seasons?sportId=${row.id}`, label: "Seasons", count: row.seasonCount },
                        { href: `/fixtures?sportId=${row.id}`, label: "Fixtures", count: row.fixtureCount },
                        { href: `/markets?sportId=${row.id}`, label: "Markets", count: row.marketCount },
                      ]}
                    />
                  </td>
                  <td>
                    <span className={`status ${row.enabled ? "live" : "cancelled"}`}>
                      {row.enabled ? "ON" : "OFF"}
                    </span>
                  </td>
                  <td>{row.visible ? "Show" : "Hide"}</td>
                  <td>{row.lastSyncedAt ? new Date(row.lastSyncedAt).toLocaleString() : "—"}</td>
                  <td>
                    <div className="table-actions">
                      <IconButton icon="view" label="View" onClick={() => setSelected(row)} />
                      <IconButton
                        icon={row.enabled ? "disable" : "enable"}
                        label={row.enabled ? "Disable" : "Enable"}
                        disabled={busy === `${row.id}-enabled`}
                        onClick={() => void toggle(row, "enabled")}
                      />
                      <IconButton
                        icon="sync"
                        label="Sync"
                        disabled={busy === `${row.id}-sync`}
                        onClick={() => void syncSport(row)}
                      />
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
      <DetailDrawer open={Boolean(selected)} title={selected?.name ?? "Sport"} onClose={() => setSelected(null)}>
        {selected && (
          <DetailGrid
            rows={[
              { label: "External ID", value: String(selected.id) },
              { label: "Provider", value: selected.provider },
              { label: "Slug", value: selected.slug },
              { label: "Tournaments", value: String(selected.tournamentCount) },
              { label: "Seasons", value: String(selected.seasonCount) },
              { label: "Fixtures", value: String(selected.fixtureCount) },
              { label: "Markets", value: String(selected.marketCount) },
              { label: "Enabled", value: selected.enabled ? "ON" : "OFF" },
              { label: "Visible", value: selected.visible ? "ON" : "OFF" },
              {
                label: "Last synced",
                value: selected.lastSyncedAt ? new Date(selected.lastSyncedAt).toLocaleString() : "—",
              },
            ]}
          />
        )}
        {selected && (
          <div className="table-actions" style={{ marginTop: 16, flexDirection: "column", alignItems: "stretch" }}>
            <DisplayOrderEditor
              value={selected.displayOrder}
              busy={busy === `${selected.id}-order`}
              onSave={(displayOrder) => saveOrder(selected, displayOrder)}
            />
            <div className="table-actions">
              <IconButton
                icon={selected.enabled ? "disable" : "enable"}
                label={selected.enabled ? "Disable" : "Enable"}
                onClick={() => void toggle(selected, "enabled")}
              >
                {selected.enabled ? "Disable" : "Enable"}
              </IconButton>
              <IconButton
                icon={selected.visible ? "hide" : "show"}
                label={selected.visible ? "Hide" : "Show"}
                onClick={() => void toggle(selected, "visible")}
              >
                {selected.visible ? "Hide" : "Show"}
              </IconButton>
              <IconButton icon="delete" label="Delete" tone="danger" onClick={() => void remove(selected)}>
                Delete
              </IconButton>
            </div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
