"use client";

import { useCallback, useState } from "react";
import type { AdminFixtureAdminRow, AdminOddsRow } from "@maraki/shared";
import { formatAdminDateTime, formatAdminUtcDateTime } from "@/lib/time";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { RelatedLinks } from "@/modules/table/RelatedLinks";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";
import { useUrlFilters } from "@/modules/table/useUrlFilters";

export default function FixturesPage() {
  const { session } = useAdminAuth();
  const [selected, setSelected] = useState<AdminFixtureAdminRow | null>(null);
  const [odds, setOdds] = useState<AdminOddsRow[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const initialFilters = useUrlFilters({
    q: "",
    statusId: "",
    sportId: "",
    tournamentId: "",
    seasonId: "",
    visible: "",
    bettingEnabled: "",
  });

  const fetchPage = useCallback(
    (query: {
      page: number;
      pageSize: number;
      q?: string;
      statusId?: string;
      sportId?: string;
      tournamentId?: string;
      seasonId?: string;
      visible?: string;
      bettingEnabled?: string;
    }) =>
      adminApi.fixtures({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        statusId: query.statusId || undefined,
        sportId: query.sportId || undefined,
        tournamentId: query.tournamentId || undefined,
        seasonId: query.seasonId || undefined,
        visible: query.visible || undefined,
        bettingEnabled: query.bettingEnabled || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminFixtureAdminRow>(Boolean(session), fetchPage, initialFilters);

  async function openFixture(row: AdminFixtureAdminRow) {
    setSelected(row);
    setOdds([]);
    try {
      const page = await adminApi.odds({ fixtureId: row.id, pageSize: 100 });
      setOdds(page.items);
    } catch {
      setOdds([]);
    }
  }

  async function patch(row: AdminFixtureAdminRow, body: { visible?: boolean; bettingEnabled?: boolean }) {
    setBusy(row.id);
    setMessage("");
    try {
      const updated = await adminApi.patchFixture(row.id, body);
      table.reload();
      if (selected?.id === row.id) setSelected({ ...row, ...updated });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy("");
    }
  }

  async function syncFixture(row: AdminFixtureAdminRow) {
    setBusy(`${row.id}-sync`);
    setMessage("");
    try {
      const job = await adminApi.syncFixture(row.id);
      setMessage(`Sync ${job.status}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy("");
    }
  }

  async function remove(row: AdminFixtureAdminRow) {
    if (!window.confirm(`Delete fixture “${row.home} vs ${row.away}”?`)) return;
    setBusy(`${row.id}-del`);
    setMessage("");
    try {
      await adminApi.deleteFixture(row.id);
      if (selected?.id === row.id) setSelected(null);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!window.confirm("Delete ALL fixtures and their cached odds?")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllFixtures();
      setSelected(null);
      setMessage(`Deleted ${result.deleted} fixture(s).`);
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
      <h1>Fixtures</h1>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "Team, tournament, sport", width: "240px" },
          { key: "sportId", label: "Sport ID", placeholder: "e.g. 10", width: "110px" },
          { key: "tournamentId", label: "Tournament ID", placeholder: "ID", width: "130px" },
          { key: "seasonId", label: "Season ID", placeholder: "ID", width: "110px" },
          {
            key: "statusId",
            label: "Status",
            type: "select",
            options: [
              { value: "", label: "All statuses" },
              { value: "0", label: "Pregame" },
              { value: "1", label: "Live" },
              { value: "2", label: "Finished" },
              { value: "3", label: "Cancelled" },
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
          {
            key: "bettingEnabled",
            label: "Betting",
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
            label="Delete all fixtures"
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
          <div className="empty">{table.loading ? "Loading…" : "No fixtures synced yet."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Kickoff</th>
                <th>Match</th>
                <th>Related</th>
                <th>Status</th>
                <th>Visible</th>
                <th>Betting</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={row.id}>
                  <td>{formatAdminDateTime(row.startTime)}</td>
                  <td>
                    {row.home} vs {row.away}
                    <br />
                    <small>
                      {row.homeScore != null && row.awayScore != null
                        ? `${row.homeScore}-${row.awayScore}`
                        : "—"}
                    </small>
                  </td>
                  <td>
                    <RelatedLinks
                      items={[
                        { href: `/sports`, label: row.sportName },
                        {
                          href: `/tournaments?sportId=${row.sportId}`,
                          label: row.tournamentName,
                        },
                        ...(row.seasonId != null
                          ? [
                              {
                                href: `/seasons?sportId=${row.sportId}&tournamentId=${row.tournamentId}`,
                                label: row.seasonName ?? `Season ${row.seasonId}`,
                              },
                            ]
                          : []),
                        { href: `/odds?fixtureId=${encodeURIComponent(row.id)}`, label: "Odds" },
                      ]}
                    />
                  </td>
                  <td>
                    <span className={`status ${(row.statusName ?? "open").toLowerCase()}`}>
                      {row.statusName ?? row.statusId}
                    </span>
                  </td>
                  <td>{row.visible ? "ON" : "OFF"}</td>
                  <td>{row.bettingEnabled ? "ON" : "OFF"}</td>
                  <td>
                    <div className="table-actions">
                      <IconButton icon="view" label="View" onClick={() => void openFixture(row)} />
                      <IconButton
                        icon={row.bettingEnabled ? "betOff" : "betOn"}
                        label={row.bettingEnabled ? "Disable betting" : "Enable betting"}
                        disabled={busy.startsWith(row.id)}
                        onClick={() => void patch(row, { bettingEnabled: !row.bettingEnabled })}
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

      <DetailDrawer
        open={Boolean(selected)}
        title={selected ? `${selected.home} vs ${selected.away}` : "Fixture"}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <DetailGrid
              rows={[
                { label: "Kickoff (Ethiopia)", value: formatAdminDateTime(selected.startTime) },
                { label: "Kickoff (UTC)", value: `${formatAdminUtcDateTime(selected.startTime)} UTC` },
                { label: "Sport", value: selected.sportName },
                { label: "Tournament", value: selected.tournamentName },
                { label: "Season", value: selected.seasonName ?? "—" },
                { label: "Provider status", value: selected.providerStatus ?? String(selected.statusId) },
                { label: "Manual override", value: selected.manualStatusOverride ?? "—" },
                { label: "Visible", value: selected.visible ? "ON" : "OFF" },
                { label: "Betting", value: selected.bettingEnabled ? "ON" : "OFF" },
                {
                  label: "Last synced",
                  value: selected.lastSyncedAt ? new Date(selected.lastSyncedAt).toLocaleString() : "—",
                },
                { label: "Fixture ID", value: selected.id },
              ]}
            />
            <div className="table-actions" style={{ marginTop: 16 }}>
              <IconButton
                icon={selected.visible ? "hide" : "show"}
                label={selected.visible ? "Hide" : "Show"}
                onClick={() => void patch(selected, { visible: !selected.visible })}
              >
                {selected.visible ? "Hide" : "Show"}
              </IconButton>
              <IconButton
                icon={selected.bettingEnabled ? "betOff" : "betOn"}
                label={selected.bettingEnabled ? "Disable betting" : "Enable betting"}
                onClick={() => void patch(selected, { bettingEnabled: !selected.bettingEnabled })}
              >
                {selected.bettingEnabled ? "Disable betting" : "Enable betting"}
              </IconButton>
              <IconButton icon="sync" label="Sync" onClick={() => void syncFixture(selected)}>
                Sync
              </IconButton>
              <IconButton icon="delete" label="Delete" tone="danger" onClick={() => void remove(selected)}>
                Delete
              </IconButton>
            </div>
            <h3 style={{ marginTop: 24 }}>Odds (source vs final)</h3>
            {odds.length === 0 ? (
              <p className="muted">No cached odds for this fixture.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Selection</th>
                    <th>Source</th>
                    <th>Final</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {odds.map((row) => (
                    <tr key={`${row.marketId}-${row.outcomeId}`}>
                      <td>{row.marketName}</td>
                      <td>{row.outcomeName}</td>
                      <td>{row.sourceOdds.toFixed(2)}</td>
                      <td>{row.finalOdds.toFixed(2)}</td>
                      <td>{row.active ? "ON" : "OFF"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </DetailDrawer>
    </>
  );
}
