"use client";

import { useCallback, useState } from "react";
import type { AdminSeasonRow } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { RelatedLinks } from "@/modules/table/RelatedLinks";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";
import { useUrlFilters } from "@/modules/table/useUrlFilters";

export default function SeasonsPage() {
  const { session } = useAdminAuth();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const initialFilters = useUrlFilters({ q: "", sportId: "", tournamentId: "" });

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; q?: string; sportId?: string; tournamentId?: string }) =>
      adminApi.seasons({
        page: query.page,
        pageSize: query.pageSize,
        q: query.q || undefined,
        sportId: query.sportId || undefined,
        tournamentId: query.tournamentId || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminSeasonRow>(Boolean(session), fetchPage, initialFilters);

  async function remove(row: AdminSeasonRow) {
    if (
      !window.confirm(
        `Clear season “${row.seasonName}” from ${row.fixtureCount} fixture(s)? Fixtures stay; season labels are removed.`,
      )
    ) {
      return;
    }
    setBusy(`${row.tournamentId}-${row.seasonId}`);
    setMessage("");
    try {
      await adminApi.deleteSeason(row.tournamentId, row.seasonId);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!window.confirm("Clear season labels from ALL fixtures?")) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllSeasons();
      setMessage(`Cleared season data on ${result.deleted} fixture(s).`);
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
      <h1>Seasons</h1>
      <p className="muted">Derived from synced fixtures (provider season ids).</p>
      <TableFiltersBar
        fields={[
          { key: "q", label: "Search", placeholder: "Season name", width: "220px" },
          { key: "sportId", label: "Sport ID", placeholder: "e.g. 10", width: "110px" },
          { key: "tournamentId", label: "Tournament ID", placeholder: "ID", width: "130px" },
        ]}
        values={table.draft}
        onChange={table.setFilter}
        onSubmit={table.applyFilters}
        onReset={table.resetFilters}
        loading={table.loading}
        actions={
          <IconButton
            icon="deleteAll"
            label="Delete all seasons"
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
          <div className="empty">{table.loading ? "Loading…" : "No seasons found."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Season</th>
                <th>Tournament</th>
                <th>Sport</th>
                <th>Related</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={`${row.tournamentId}-${row.seasonId}`}>
                  <td>
                    <strong>{row.seasonName}</strong>
                    <br />
                    <small>#{row.seasonId}</small>
                  </td>
                  <td>
                    <RelatedLinks
                      items={[
                        {
                          href: `/tournaments?sportId=${row.sportId}`,
                          label: row.tournamentName,
                        },
                      ]}
                    />
                  </td>
                  <td>
                    <RelatedLinks items={[{ href: `/sports`, label: row.sportName }]} />
                  </td>
                  <td>
                    <RelatedLinks
                      items={[
                        {
                          href: `/fixtures?sportId=${row.sportId}&tournamentId=${row.tournamentId}&seasonId=${row.seasonId}`,
                          label: "Fixtures",
                          count: row.fixtureCount,
                        },
                      ]}
                    />
                  </td>
                  <td>
                    <div className="table-actions">
                      <IconButton
                        icon="delete"
                        label="Delete season"
                        tone="danger"
                        disabled={busy === `${row.tournamentId}-${row.seasonId}`}
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
    </>
  );
}
