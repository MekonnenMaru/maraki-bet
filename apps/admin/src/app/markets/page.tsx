"use client";

import { useCallback, useState } from "react";
import type { AdminMarketRow } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { DisplayOrderEditor } from "@/modules/table/DisplayOrderEditor";
import { RelatedLinks } from "@/modules/table/RelatedLinks";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";
import { useUrlFilters } from "@/modules/table/useUrlFilters";

export default function MarketsPage() {
  const { session } = useAdminAuth();
  const [selected, setSelected] = useState<AdminMarketRow | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const initialFilters = useUrlFilters({ q: "", sportId: "", enabled: "" });

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; sportId?: string; enabled?: string }) =>
      adminApi.markets({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        sportId: query.sportId || undefined,
        enabled: query.enabled || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminMarketRow>(Boolean(session), fetchPage, initialFilters);

  async function patch(
    row: AdminMarketRow,
    body: { enabled?: boolean; visible?: boolean; bettingEnabled?: boolean; displayOrder?: number },
  ) {
    setBusy(String(row.id) + (body.displayOrder != null ? "-order" : ""));
    setMessage("");
    try {
      const updated = await adminApi.patchMarket(row.id, body);
      await table.reload();
      if (selected?.id === row.id) setSelected({ ...row, ...updated });
      if (body.displayOrder != null) setMessage(`Order saved for ${row.nameShort ?? row.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy("");
    }
  }

  async function remove(row: AdminMarketRow) {
    if (!window.confirm(`Delete market “${row.nameShort ?? row.name}”?`)) return;
    setBusy(`${row.id}-del`);
    setMessage("");
    try {
      await adminApi.deleteMarket(row.id);
      if (selected?.id === row.id) setSelected(null);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!window.confirm("Delete ALL markets and outcomes?")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllMarkets();
      setSelected(null);
      setMessage(`Deleted ${result.deleted} market(s).`);
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
      <h1>Markets</h1>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "1X2, BTTS…", width: "220px" },
          { key: "sportId", label: "Sport ID", placeholder: "e.g. 10", width: "110px" },
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
            label="Delete all markets"
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
          <div className="empty">{table.loading ? "Loading…" : "No markets synced yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Market</th>
                <th>Sport</th>
                <th>Outcomes</th>
                <th>Betting</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.displayOrder}</td>
                  <td>
                    <strong>{row.nameShort ?? row.name}</strong>
                    <br />
                    <small>
                      #{row.id} · {row.marketType}
                    </small>
                  </td>
                  <td>
                    <RelatedLinks items={[{ href: `/sports`, label: row.sportName }]} />
                  </td>
                  <td>{row.outcomeCount}</td>
                  <td>
                    <span className={`status ${row.bettingEnabled && row.enabled ? "live" : "cancelled"}`}>
                      {row.enabled ? (row.bettingEnabled ? "ON" : "NO BET") : "OFF"}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <IconButton icon="view" label="View" onClick={() => setSelected(row)} />
                      <IconButton
                        icon={row.enabled ? "disable" : "enable"}
                        label={row.enabled ? "Disable" : "Enable"}
                        disabled={busy === String(row.id)}
                        onClick={() => void patch(row, { enabled: !row.enabled })}
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
      <DetailDrawer open={Boolean(selected)} title={selected?.name ?? "Market"} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <DetailGrid
              rows={[
                { label: "External ID", value: String(selected.id) },
                { label: "Sport", value: selected.sportName },
                { label: "Type", value: selected.marketType },
                { label: "Period", value: selected.period ?? "—" },
                { label: "Enabled", value: selected.enabled ? "ON" : "OFF" },
                { label: "Visible", value: selected.visible ? "ON" : "OFF" },
                { label: "Betting", value: selected.bettingEnabled ? "ON" : "OFF" },
              ]}
            />
            <div className="table-actions" style={{ marginTop: 16, flexDirection: "column", alignItems: "stretch" }}>
              <DisplayOrderEditor
                value={selected.displayOrder}
                busy={busy === `${selected.id}-order`}
                onSave={(displayOrder) => patch(selected, { displayOrder })}
              />
              <div className="table-actions">
              <IconButton
                icon={selected.enabled ? "disable" : "enable"}
                label={selected.enabled ? "Disable" : "Enable"}
                onClick={() => void patch(selected, { enabled: !selected.enabled })}
              >
                {selected.enabled ? "Disable" : "Enable"}
              </IconButton>
              <IconButton
                icon={selected.bettingEnabled ? "betOff" : "betOn"}
                label={selected.bettingEnabled ? "Disable betting" : "Enable betting"}
                onClick={() => void patch(selected, { bettingEnabled: !selected.bettingEnabled })}
              >
                {selected.bettingEnabled ? "Disable betting" : "Enable betting"}
              </IconButton>
              <IconButton
                icon={selected.visible ? "hide" : "show"}
                label={selected.visible ? "Hide" : "Show"}
                onClick={() => void patch(selected, { visible: !selected.visible })}
              >
                {selected.visible ? "Hide" : "Show"}
              </IconButton>
              <IconButton icon="delete" label="Delete" tone="danger" onClick={() => void remove(selected)}>
                Delete
              </IconButton>
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </>
  );
}
