"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminPageDto, AdminSyncJobRow, AdminSyncStatusDto } from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { DetailDrawer, DetailGrid } from "@/modules/table/DetailDrawer";
import { TablePagination } from "@/modules/table/TablePagination";
import { SyncProgressConsole } from "@/modules/sync/SyncProgressConsole";

const RESOURCES = [
  "sports",
  "tournaments",
  "seasons",
  "fixtures",
  "teams",
  "markets",
  "outcomes",
  "odds",
  "scores",
] as const;

const EMPTY_JOBS: AdminPageDto<AdminSyncJobRow> = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  pageCount: 1,
};

export default function SyncPage() {
  const { session } = useAdminAuth();
  const [status, setStatus] = useState<AdminSyncStatusDto | null>(null);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsPageSize, setJobsPageSize] = useState(10);
  const [jobs, setJobs] = useState<AdminPageDto<AdminSyncJobRow>>(EMPTY_JOBS);
  const [selected, setSelected] = useState<AdminSyncJobRow | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [intervalValue, setIntervalValue] = useState(5);
  const [intervalUnit, setIntervalUnit] = useState("MINUTES");
  const [scope, setScope] = useState("EVERYTHING");
  const [scopeId, setScopeId] = useState("");
  const [resources, setResources] = useState<string[]>([...RESOURCES]);
  const [syncMode, setSyncMode] = useState<"automatic" | "manual">("manual");
  const [progressJob, setProgressJob] = useState<AdminSyncJobRow | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const scheduleHydratedRef = useRef(false);
  const pinnedJobIdRef = useRef<string | null>(null);

  const active = status?.runningJob;
  const isActive = active?.status === "RUNNING" || active?.status === "PAUSED";
  const progressLive =
    progressJob?.status === "RUNNING" || progressJob?.status === "PAUSED";
  const showProgress = progressOpen && Boolean(progressJob);

  const reloadStatus = useCallback(async () => {
    const nextStatus = await adminApi.syncStatus();
    setStatus(nextStatus);
    if (!scheduleHydratedRef.current) {
      setIntervalValue(nextStatus.intervalValue);
      setIntervalUnit(nextStatus.intervalUnit);
      scheduleHydratedRef.current = true;
    }
    return nextStatus;
  }, []);

  const reloadJobs = useCallback(async () => {
    setJobs(
      await adminApi.syncJobs({
        page: jobsPage,
        pageSize: jobsPageSize,
      }),
    );
  }, [jobsPage, jobsPageSize]);

  const refreshAll = useCallback(async () => {
    setError("");
    try {
      await Promise.all([reloadStatus(), reloadJobs()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sync status");
    }
  }, [reloadJobs, reloadStatus]);

  const refreshLive = useCallback(async (withJobs = false) => {
    setError("");
    try {
      const next = await reloadStatus();
      const running =
        next.runningJob?.status === "RUNNING" || next.runningJob?.status === "PAUSED";
      if (withJobs || running) await reloadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update sync status");
    }
  }, [reloadJobs, reloadStatus]);

  useEffect(() => {
    if (!session) return;
    void refreshAll();
  }, [session, jobsPage, jobsPageSize]);

  useEffect(() => {
    if (!session) return;
    const ms = isActive || progressLive ? 1500 : 20_000;
    const timer = setInterval(() => {
      void reloadStatus().catch(() => undefined);
      if (isActive || progressLive) void reloadJobs().catch(() => undefined);
    }, ms);
    return () => clearInterval(timer);
  }, [session, isActive, progressLive, reloadStatus, reloadJobs]);

  // Keep the progress panel pinned to the job the user is watching — do not auto-hide on finish.
  useEffect(() => {
    if (!active) return;
    if (active.status === "RUNNING" || active.status === "PAUSED") {
      pinnedJobIdRef.current = active.id;
      setProgressJob(active);
      setProgressOpen(true);
      return;
    }
    if (pinnedJobIdRef.current === active.id) {
      setProgressJob(active);
      setProgressOpen(true);
    }
  }, [active]);

  useEffect(() => {
    if (!progressOpen || !progressJob) return;
    if (active?.id === progressJob.id) {
      setProgressJob(active);
      return;
    }
    const wasLive = progressJob.status === "RUNNING" || progressJob.status === "PAUSED";
    if (!wasLive) return;
    let cancelled = false;
    void adminApi
      .syncJob(progressJob.id)
      .then((job) => {
        if (!cancelled) setProgressJob(job);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, progressOpen, progressJob?.id, progressJob?.status]);

  useEffect(() => {
    if (!selected) return;
    if (progressJob && selected.id === progressJob.id) setSelected(progressJob);
    else if (active && selected.id === active.id) setSelected(active);
  }, [progressJob, active, selected?.id]);

  function closeProgress() {
    setProgressOpen(false);
    pinnedJobIdRef.current = null;
  }
  async function saveSchedule() {
    setBusy("save");
    setError("");
    try {
      await adminApi.syncConfig({
        automaticEnabled: status?.automaticEnabled,
        masterEnabled: status?.masterEnabled,
        intervalValue,
        intervalUnit,
        scheduleType: "INTERVAL",
      });
      await refreshLive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save schedule");
    } finally {
      setBusy("");
    }
  }

  async function toggleMaster(next: boolean) {
    if (!window.confirm(next ? "Enable master sync?" : "Disable master sync? Automatic jobs will stop.")) return;
    setBusy("master");
    try {
      await adminApi.syncConfig({ masterEnabled: next });
      await refreshLive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update master sync");
    } finally {
      setBusy("");
    }
  }

  async function toggleAutomatic(next: boolean) {
    if (!window.confirm(next ? "Enable automatic sync?" : "Disable automatic synchronization?")) return;
    setBusy("auto");
    try {
      await adminApi.syncConfig({ automaticEnabled: next });
      await refreshLive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update automatic sync");
    } finally {
      setBusy("");
    }
  }

  async function startManual() {
    if (scope !== "EVERYTHING" && !scopeId.trim()) {
      setError("Scope id is required for selective sync");
      return;
    }
    if (isActive) {
      setError("A synchronization job is already running");
      return;
    }
    if (!window.confirm("Start manual sync with the selected resources?")) return;
    setBusy("manual");
    setError("");
    try {
      const job = await adminApi.syncStart({
        scope,
        scopeId: scope === "EVERYTHING" ? undefined : scopeId.trim(),
        resources,
        force: true,
      });
      pinnedJobIdRef.current = job.id;
      setProgressJob(job);
      setProgressOpen(true);
      await refreshLive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual sync failed");
    } finally {
      setBusy("");
    }
  }

  async function pauseSync() {
    setBusy("pause");
    try {
      const job = await adminApi.syncPause();
      setProgressJob(job);
      setProgressOpen(true);
      await refreshLive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pause sync");
    } finally {
      setBusy("");
    }
  }

  async function resumeSync() {
    setBusy("resume");
    try {
      const job = await adminApi.syncResume();
      setProgressJob(job);
      setProgressOpen(true);
      await refreshLive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume sync");
    } finally {
      setBusy("");
    }
  }

  async function cancelSync() {
    if (!window.confirm("Stop the current sync job?")) return;
    setBusy("cancel");
    try {
      const job = await adminApi.syncCancel();
      setProgressJob(job);
      setProgressOpen(true);
      await refreshLive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop sync");
    } finally {
      setBusy("");
    }
  }

  function toggleResource(name: string) {
    setResources((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  function selectAllResources() {
    setResources([...RESOURCES]);
  }

  function clearResources() {
    setResources([]);
  }

  if (!session) return null;

  return (
    <div className="sync-page">
      <div className="sync-page-head">
        <div>
          <h1>Sports Data Sync</h1>
          <p className="hint">OddsPapi → Maraki. Progress survives page refresh.</p>
        </div>
        <button type="button" className="ghost" onClick={() => void refreshAll()}>
          Refresh
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="sync-status-strip">
        <article>
          <small>Master</small>
          <b className={status?.masterEnabled ? "text-ok" : "text-warn"}>
            {status ? (status.masterEnabled ? "ON" : "OFF") : "…"}
          </b>
          {status && (
            <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void toggleMaster(!status.masterEnabled)}>
              {status.masterEnabled ? "Disable" : "Enable"}
            </button>
          )}
        </article>
        <article>
          <small>OddsPapi</small>
          <b>{status?.health.apiConnection ?? "…"}</b>
          <span>{status?.provider.apiKeyMasked ?? "—"}</span>
        </article>
        <article>
          <small>Scheduler</small>
          <b>{status?.health.scheduler ?? "…"}</b>
          <span>{status?.timezone ?? "—"}</span>
        </article>
        <article>
          <small>Last success</small>
          <b>{status?.lastSuccessAt ? formatShort(status.lastSuccessAt) : "—"}</b>
          <span>Next {status?.nextRunAt ? formatShort(status.nextRunAt) : "—"}</span>
        </article>
        <article>
          <small>Active job</small>
          <b>{active && isActive ? `${active.progressPct}%` : "Idle"}</b>
          <span>{active && isActive ? active.status : "No running sync"}</span>
        </article>
      </section>

      {showProgress && progressJob && (
        <section className="panel sync-progress-panel">
          <div className="sync-progress-row">
            <div className="sync-progress-main">
              <div className="sync-progress-meta">
                <strong>
                  {progressJob.trigger} · {progressJob.scope}
                  {progressJob.scopeId ? ` #${progressJob.scopeId}` : ""}
                </strong>
                <span
                  className={`status ${
                    progressJob.status === "SUCCESS"
                      ? "live"
                      : progressJob.status === "FAILED" || progressJob.status === "CANCELLED"
                        ? "cancelled"
                        : progressJob.status === "PAUSED"
                          ? "cancelled"
                          : "live"
                  }`}
                >
                  {progressJob.status}
                </span>
                <span>{progressJob.progressPct}%</span>
              </div>
              <div
                className="sync-progress-track"
                aria-valuenow={progressJob.progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="sync-progress-fill"
                  style={{ width: `${Math.min(100, progressJob.progressPct)}%` }}
                />
              </div>
              <p className="sync-progress-step">
                <strong>{progressJob.currentStep ?? "…"}</strong>
                {" — "}
                {progressJob.progressMessage ?? "Working…"}
              </p>
            </div>
            <div className="sync-progress-actions">
              {progressJob.status === "RUNNING" && (
                <button type="button" disabled={Boolean(busy)} onClick={() => void pauseSync()}>
                  Pause
                </button>
              )}
              {progressJob.status === "PAUSED" && (
                <button type="button" disabled={Boolean(busy)} onClick={() => void resumeSync()}>
                  Resume
                </button>
              )}
              {progressLive && (
                <button type="button" className="danger" disabled={Boolean(busy)} onClick={() => void cancelSync()}>
                  Stop
                </button>
              )}
              <button type="button" className="ghost" onClick={closeProgress}>
                Close
              </button>
            </div>
          </div>
          <SyncProgressConsole entries={progressJob.progressLog ?? []} live={progressLive} />
        </section>
      )}

      <section className="panel sync-mode-panel">
        <div className="sync-mode-bar">
          <label className="sync-mode-field">
            <span>Sync mode</span>
            <select
              value={syncMode}
              onChange={(event) => setSyncMode(event.target.value as "automatic" | "manual")}
            >
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </select>
          </label>
        </div>

        <div className="sync-panel-body">
          {syncMode === "automatic" ? (
            status ? (
              <div className="sync-form compact">
                <div className="switch-row">
                  <span>Automatic sync</span>
                  <button
                    type="button"
                    className={`switch${status.automaticEnabled ? " on" : ""}`}
                    role="switch"
                    aria-checked={status.automaticEnabled}
                    disabled={Boolean(busy)}
                    onClick={() => void toggleAutomatic(!status.automaticEnabled)}
                  >
                    <span className="switch-knob" />
                  </button>
                </div>
                <div className="sync-inline-fields">
                  <label>
                    Every
                    <input
                      type="number"
                      min={1}
                      value={intervalValue}
                      onChange={(event) => setIntervalValue(Number(event.target.value) || 1)}
                    />
                  </label>
                  <label>
                    Unit
                    <select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value)}>
                      {["SECONDS", "MINUTES", "HOURS", "DAYS", "WEEKS"].map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" disabled={busy === "save"} onClick={() => void saveSchedule()}>
                  Save schedule
                </button>
              </div>
            ) : (
              <div className="empty">Loading…</div>
            )
          ) : (
            <div className="sync-form compact">
              <div className="sync-inline-fields">
                <label>
                  Scope
                  <select value={scope} onChange={(event) => setScope(event.target.value)} disabled={isActive}>
                    <option value="EVERYTHING">Everything</option>
                    <option value="SPORT">Sport</option>
                    <option value="TOURNAMENT">Tournament</option>
                    <option value="FIXTURE">Fixture</option>
                  </select>
                </label>
                {scope !== "EVERYTHING" && (
                  <label>
                    Scope ID
                    <input
                      value={scopeId}
                      onChange={(event) => setScopeId(event.target.value)}
                      placeholder="External id"
                      disabled={isActive}
                    />
                  </label>
                )}
              </div>
              <div className="resource-toolbar">
                <span>Resources</span>
                <div className="resource-toolbar-actions">
                  <button type="button" className="ghost" disabled={isActive} onClick={selectAllResources}>
                    Select all
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={isActive || resources.length === 0}
                    onClick={clearResources}
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div className="resource-grid dense">
                {RESOURCES.map((name) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={resources.includes(name)}
                      onChange={() => toggleResource(name)}
                      disabled={isActive}
                    />
                    {name}
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy === "manual" || !status?.masterEnabled || isActive || resources.length === 0}
                onClick={() => void startManual()}
              >
                {isActive ? "Sync running…" : "Sync now"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="panel sync-jobs-panel">
        <div className="panel-head">
          <h2>
            Recent jobs <small>{jobs.total} total</small>
          </h2>
        </div>
        {jobs.items.length === 0 ? (
          <div className="empty">No sync jobs yet.</div>
        ) : (
          <div className="sync-jobs-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Scope</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Counts</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.items.map((job) => (
                  <tr key={job.id}>
                    <td>{new Date(job.startedAt).toLocaleString()}</td>
                    <td>{job.trigger}</td>
                    <td>
                      {job.scope}
                      {job.scopeId ? ` #${job.scopeId}` : ""}
                    </td>
                    <td>
                      {job.progressPct}%
                      {job.currentStep ? ` · ${job.currentStep}` : ""}
                    </td>
                    <td>
                      <span
                        className={`status ${
                          job.status === "SUCCESS"
                            ? "live"
                            : job.status === "FAILED" || job.status === "CANCELLED"
                              ? "cancelled"
                              : "open"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td>
                      +{job.createdCount} / ~{job.updatedCount} / !{job.failedCount}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setSelected(job);
                          setProgressJob(job);
                          setProgressOpen(true);
                          pinnedJobIdRef.current = job.id;
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              data={jobs}
              onPage={(page) => setJobsPage(page)}
              onPageSize={(size) => {
                setJobsPageSize(size);
                setJobsPage(1);
              }}
            />
          </div>
        )}
      </section>

      <DetailDrawer
        open={Boolean(selected)}
        title={selected ? `Sync job ${selected.id}` : "Job"}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <DetailGrid
              rows={[
                { label: "Status", value: selected.status },
                { label: "Progress", value: `${selected.progressPct}% · ${selected.currentStep ?? "—"}` },
                { label: "Message", value: selected.progressMessage ?? "—" },
                { label: "Trigger", value: selected.trigger },
                { label: "Scope", value: `${selected.scope}${selected.scopeId ? ` #${selected.scopeId}` : ""}` },
                { label: "Started", value: new Date(selected.startedAt).toLocaleString() },
                {
                  label: "Finished",
                  value: selected.finishedAt ? new Date(selected.finishedAt).toLocaleString() : "—",
                },
                { label: "Duration", value: selected.durationMs != null ? `${selected.durationMs} ms` : "—" },
                { label: "Created", value: String(selected.createdCount) },
                { label: "Updated", value: String(selected.updatedCount) },
                { label: "Skipped", value: String(selected.skippedCount) },
                { label: "Failed", value: String(selected.failedCount) },
                { label: "Started by", value: selected.startedBy ?? "—" },
                { label: "Error", value: selected.errorMessage ?? "—" },
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <SyncProgressConsole
                entries={selected.progressLog ?? []}
                live={selected.status === "RUNNING" || selected.status === "PAUSED"}
              />
            </div>
          </>
        )}
      </DetailDrawer>
    </div>
  );
}

function formatShort(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Addis_Ababa",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
