"use client";

import { useCallback, useState } from "react";
import type { AdminOddsRow } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { IconButton } from "@/modules/table/ActionIcon";
import { RelatedLinks } from "@/modules/table/RelatedLinks";
import { TableFiltersBar } from "@/modules/table/TableFiltersBar";
import { TablePagination } from "@/modules/table/TablePagination";
import { usePagedTable } from "@/modules/table/usePagedTable";
import { useUrlFilters } from "@/modules/table/useUrlFilters";
import { SettingsCards } from "@/modules/ui/SettingsCards";

export default function OddsPage() {
  const { session } = useAdminAuth();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const initialFilters = useUrlFilters({ fixtureId: "" });

  const fetchPage = useCallback(
    (query: { page: number; pageSize: number; fixtureId?: string }) =>
      adminApi.odds({
        page: query.page,
        pageSize: query.pageSize,
        fixtureId: query.fixtureId || undefined,
      }),
    [],
  );

  const table = usePagedTable<AdminOddsRow>(Boolean(session), fetchPage, initialFilters);

  async function remove(row: AdminOddsRow) {
    if (!window.confirm(`Delete odds for “${row.outcomeName}”?`)) return;
    setBusy(`${row.fixtureId}-${row.outcomeId}`);
    setMessage("");
    try {
      await adminApi.deleteOddsQuote(row.fixtureId, row.outcomeId);
      await table.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    const fixtureId = table.applied.fixtureId?.trim();
    const label = fixtureId
      ? `Delete all cached odds for fixture ${fixtureId}?`
      : "Delete ALL cached odds across every fixture?";
    if (!window.confirm(label)) return;
    setBusy("delete-all");
    setMessage("");
    try {
      const result = await adminApi.deleteAllOdds(fixtureId || undefined);
      setMessage(`Deleted ${result.deleted} odds key(s).`);
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
      <h1>Odds</h1>
      <SettingsCards title="Pricing" keys={["sourceBookmaker", "houseMargin", "lastOddsSyncAt"]} />
      <p className="muted">Enter a fixture id to inspect source vs final odds.</p>
      <TableFiltersBar
        fields={[{ key: "fixtureId", label: "Fixture ID", placeholder: "OddsPapi fixture id", width: "280px" }]}
        values={table.draft}
        onChange={table.setFilter}
        onSubmit={table.applyFilters}
        onReset={table.resetFilters}
        loading={table.loading}
        actions={
          <IconButton
            icon="deleteAll"
            label="Delete all odds"
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
          <div className="empty">{table.loading ? "Loading…" : "No odds loaded. Search by fixture id."}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fixture</th>
                <th>Market</th>
                <th>Selection</th>
                <th>Source</th>
                <th>Final</th>
                <th>Margin gap</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {table.data.items.map((row) => (
                <tr key={`${row.fixtureId}-${row.marketId}-${row.outcomeId}`}>
                  <td>
                    <RelatedLinks
                      items={[
                        {
                          href: `/fixtures?q=${encodeURIComponent(row.fixtureId)}`,
                          label: row.fixtureId,
                        },
                      ]}
                    />
                  </td>
                  <td>{row.marketName}</td>
                  <td>{row.outcomeName}</td>
                  <td>{row.sourceOdds.toFixed(2)}</td>
                  <td>{row.finalOdds.toFixed(2)}</td>
                  <td>
                    {row.sourceOdds > 0
                      ? `${(((row.sourceOdds - row.finalOdds) / row.sourceOdds) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td>{row.active ? "ON" : "OFF"}</td>
                  <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}</td>
                  <td>
                    <div className="table-actions">
                      <IconButton
                        icon="delete"
                        label="Delete odds"
                        tone="danger"
                        disabled={busy === `${row.fixtureId}-${row.outcomeId}`}
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
