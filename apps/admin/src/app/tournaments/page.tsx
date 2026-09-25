"use client";

import { useCallback, useState } from "react";
import type { AdminTournamentRow } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { TournamentFixturesPanel } from "@/modules/catalog/TournamentFixturesPanel";
import { IconButton } from "@/modules/table/ActionIcon";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { DisplayOrderEditor } from "@/modules/table/DisplayOrderEditor";
import { RelatedLinks } from "@/modules/table/RelatedLinks";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { TableState } from "@/modules/table/TableState";
import { usePagedTable } from "@/modules/table/usePagedTable";
import { useUrlFilters } from "@/modules/table/useUrlFilters";

export default function TournamentsPage() {
  const { session } = useAdminAuth();
  const [selected, setSelected] = useState<AdminTournamentRow | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const initialFilters = useUrlFilters({ q: "", sportId: "", enabled: "", visible: "" });

  const fetchPage = useCallback(
    (query: {
      page: number;
      pageSize: number;
      q?: string;
      sportId?: string;
      enabled?: string;
      visible?: string;
    }) =>
      adminApi.tournaments({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        sportId: query.sportId || undefined,
        enabled: query.enabled || undefined,
        visible: query.visible || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminTournamentRow>(Boolean(session), fetchPage, initialFilters);

  async function toggle(row: AdminTournamentRow, field: "enabled" | "visible") {
    setBusy(`${row.id}-${field}`);
    setMessage("");
    try {
      const updated = await adminApi.patchTournament(row.id, { [field]: !row[field] });
      table.reload();
      if (selected?.id === row.id) setSelected({ ...row, ...updated });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy("");
    }
  }

  async function saveOrder(row: AdminTournamentRow, displayOrder: number) {
    setBusy(`${row.id}-order`);
    setMessage("");
    try {
      const updated = await adminApi.patchTournament(row.id, { displayOrder });
      await table.reload();
      if (selected?.id === row.id) setSelected({ ...row, ...updated });
      setMessage(`Order saved for ${row.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Order update failed");
    } finally {
      setBusy("");
    }
  }

  async function syncTournament(row: AdminTournamentRow) {
    setBusy(`${row.id}-sync`);
    setMessage("");
    try {
      const job = await adminApi.syncTournament(row.id);
      setMessage(`Sync job ${job.status}: ${job.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy("");
    }
  }

  async function remove(row: AdminTournamentRow) {
    if (!window.confirm(`Delete tournament “${row.name}”? Its fixtures will also be deleted.`)) return;
    setBusy(`${row.id}-del`);
    setMessage("");
    try {
      await adminApi.deleteTournament(row.id);
      if (selected?.id === row.id) setSelected(null);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!window.confirm("Delete ALL tournaments and their fixtures?")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllTournaments();
      setSelected(null);
      setMessage(`Deleted ${result.deleted} tournament(s).`);
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
      <h1>Tournaments</h1>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "League or country", width: "220px" },
          { key: "sportId", label: "Sport ID", placeholder: "e.g. 10", width: "110px" },
          {
            key: "enabled",
            label: "Enabled",
            type: "select",
            options: [
              { value: "", label: "All" },
              { value: "true", label: "Enabled" },
              { value: "false", label: "Disabled" },
            ],
          },
          {
            key: "visible",
            label: "Visible",
            type: "select",
            options: [
              { value: "", label: "All" },
              { value: "true", label: "Visible" },
              { value: "false", label: "Hidden" },
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
            label="Delete all tournaments"
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
        <TableState loading={table.loading} empty="No tournaments synced yet." hasRows={table.data.items.length > 0}>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Tournament</th>
                <th>Sport</th>
                <th>Related</th>
                <th>Status</th>
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
                    <small>{row.categoryName ?? "—"}</small>
                  </td>
                  <td>
                    <RelatedLinks
                      items={[{ href: `/sports`, label: row.sportName }]}
                    />
                  </td>
                  <td>
                    <RelatedLinks
                      items={[
                        {
                          href: `/seasons?tournamentId=${row.id}&sportId=${row.sportId}`,
                          label: "Seasons",
                          count: row.seasonCount,
                        },
                        {
                          href: `/fixtures?tournamentId=${row.id}&sportId=${row.sportId}`,
                          label: "Fixtures",
                          count: row.fixtureCount,
                        },
                      ]}
                    />
                  </td>
                  <td>
                    <span className={`status ${row.enabled && row.visible ? "live" : "cancelled"}`}>
                      {row.enabled ? (row.visible ? "ON" : "HIDDEN") : "OFF"}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <IconButton icon="view" label="View" onClick={() => setSelected(row)} />
                      <IconButton
                        icon={row.enabled ? "disable" : "enable"}
                        label={row.enabled ? "Disable" : "Enable"}
                        disabled={busy.startsWith(String(row.id))}
                        onClick={() => void toggle(row, "enabled")}
                      />
                      <IconButton
                        icon="sync"
                        label="Sync"
                        disabled={busy === `${row.id}-sync`}
                        onClick={() => void syncTournament(row)}
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
        </TableState>
        <TablePagination data={table.data} onPage={table.setPage} onPageSize={table.changePageSize} />
      </div>
      <DetailDrawer
        open={Boolean(selected)}
        title={selected?.name ?? "Tournament"}
        onClose={() => setSelected(null)}
        size="wide"
      >
        {selected && (
          <>
            <DetailGrid
              rows={[
                { label: "External ID", value: String(selected.id) },
                { label: "Sport", value: selected.sportName },
                { label: "Seasons", value: String(selected.seasonCount) },
                { label: "Fixtures", value: String(selected.fixtureCount) },
                { label: "Country / category", value: selected.categoryName ?? "—" },
                { label: "Enabled", value: selected.enabled ? "ON" : "OFF" },
                { label: "Visible", value: selected.visible ? "ON" : "OFF" },
                {
                  label: "Last synced",
                  value: selected.lastSyncedAt ? new Date(selected.lastSyncedAt).toLocaleString() : "—",
                },
              ]}
            />
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
              <IconButton
                icon="sync"
                label="Sync"
                disabled={busy === `${selected.id}-sync`}
                onClick={() => void syncTournament(selected)}
              >
                Sync
              </IconButton>
              <IconButton icon="delete" label="Delete" tone="danger" onClick={() => void remove(selected)}>
                Delete
              </IconButton>
              </div>
            </div>
            <TournamentFixturesPanel
              tournamentId={selected.id}
              sportId={selected.sportId}
              onChanged={(fixtureCount) => {
                setSelected((current) =>
                  current && current.fixtureCount !== fixtureCount ? { ...current, fixtureCount } : current,
                );
              }}
            />
          </>
        )}
      </DetailDrawer>
    </>
  );
}
