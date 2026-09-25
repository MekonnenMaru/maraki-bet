"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminFixtureAdminRow, AdminPageDto } from "@maraki/shared";
import { formatAdminDateTime } from "@/lib/time";
import { adminApi } from "@/lib/api";
import { IconButton } from "@/modules/table/ActionIcon";
import { TablePagination } from "@/modules/table/TablePagination";

const EMPTY: AdminPageDto<AdminFixtureAdminRow> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  pageCount: 1,
};

export function TournamentFixturesPanel({
  tournamentId,
  sportId,
  onChanged,
}: {
  tournamentId: number;
  sportId: number;
  onChanged?: (fixtureCount: number) => void;
}) {
  const [data, setData] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusId, setStatusId] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const pageData = await adminApi.fixtures({
        tournamentId: String(tournamentId),
        page,
        pageSize,
        q: appliedQ || undefined,
        statusId: statusId || undefined,
      });
      setData(pageData);
      onChangedRef.current?.(pageData.total);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load fixtures");
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, page, pageSize, appliedQ, statusId]);

  useEffect(() => {
    setPage(1);
    setAppliedQ("");
    setQ("");
    setStatusId("");
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(row: AdminFixtureAdminRow, body: { visible?: boolean; bettingEnabled?: boolean }) {
    setBusy(row.id);
    setMessage("");
    try {
      await adminApi.patchFixture(row.id, body);
      await load();
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
      setMessage(`Fixture sync ${job.status}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy("");
    }
  }

  async function syncTournament() {
    setBusy("tournament-sync");
    setMessage("");
    try {
      const job = await adminApi.syncTournament(tournamentId);
      setMessage(`Tournament sync ${job.status}: ${job.id}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Tournament sync failed");
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
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <section>
      <div className="drawer-section-head">
        <h3>Fixtures ({data.total})</h3>
        <Link href={`/fixtures?tournamentId=${tournamentId}&sportId=${sportId}`} className="muted">
          Open full list →
        </Link>
      </div>

      <div className="drawer-toolbar">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setPage(1);
              setAppliedQ(q.trim());
            }
          }}
          placeholder="Search teams"
          style={{ flex: 1, minWidth: 120 }}
        />
        <select
          value={statusId}
          onChange={(event) => {
            setPage(1);
            setStatusId(event.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="0">Pregame</option>
          <option value="1">Live</option>
          <option value="2">Finished</option>
          <option value="3">Cancelled</option>
        </select>
        <IconButton
          icon="sync"
          label="Sync tournament fixtures"
          disabled={busy === "tournament-sync"}
          onClick={() => void syncTournament()}
        >
          Sync
        </IconButton>
        <IconButton
          icon="view"
          label="Apply search"
          onClick={() => {
            setPage(1);
            setAppliedQ(q.trim());
          }}
        >
          Search
        </IconButton>
      </div>

      {message && <p className="error">{message}</p>}

      {loading && data.items.length === 0 ? (
        <p className="muted">Loading fixtures…</p>
      ) : data.items.length === 0 ? (
        <p className="muted">No fixtures for this tournament yet. Use Sync to pull from OddsPapi.</p>
      ) : (
        <table className="drawer-nested-table">
          <thead>
            <tr>
              <th>Kickoff</th>
              <th>Match</th>
              <th>Status</th>
              <th>Flags</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <tr key={row.id}>
                <td>
                  <small>{formatAdminDateTime(row.startTime)}</small>
                </td>
                <td>
                  <strong>
                    {row.home} vs {row.away}
                  </strong>
                  {row.seasonName ? (
                    <>
                      <br />
                      <small className="muted">{row.seasonName}</small>
                    </>
                  ) : null}
                </td>
                <td>
                  <span className={`status ${(row.statusName ?? "open").toLowerCase()}`}>
                    {row.statusName ?? row.statusId}
                  </span>
                </td>
                <td>
                  <small>
                    Vis {row.visible ? "ON" : "OFF"}
                    <br />
                    Bet {row.bettingEnabled ? "ON" : "OFF"}
                  </small>
                </td>
                <td>
                  <div className="table-actions">
                    <IconButton
                      icon={row.visible ? "hide" : "show"}
                      label={row.visible ? "Hide" : "Show"}
                      disabled={busy.startsWith(row.id)}
                      onClick={() => void patch(row, { visible: !row.visible })}
                    />
                    <IconButton
                      icon={row.bettingEnabled ? "betOff" : "betOn"}
                      label={row.bettingEnabled ? "Disable betting" : "Enable betting"}
                      disabled={busy.startsWith(row.id)}
                      onClick={() => void patch(row, { bettingEnabled: !row.bettingEnabled })}
                    />
                    <IconButton
                      icon="sync"
                      label="Sync fixture"
                      disabled={busy === `${row.id}-sync`}
                      onClick={() => void syncFixture(row)}
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

      <TablePagination
        data={data}
        onPage={setPage}
        onPageSize={(size) => {
          setPage(1);
          setPageSize(size);
        }}
      />
    </section>
  );
}
