"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminOddsPapiAccountDto,
  AdminOddsPapiRefreshKeyDto,
  AdminSyncStatusDto,
} from "@maraki/shared";
import { adminApi } from "@/lib/api";
import { useAdminAuth } from "@/modules/auth/AuthProvider";
import { TableState } from "@/modules/table/TableState";

type SectionLoad = {
  status: boolean;
  account: boolean;
};

export default function OddsPapiPage() {
  const { session } = useAdminAuth();
  const [status, setStatus] = useState<AdminSyncStatusDto | null>(null);
  const [account, setAccount] = useState<AdminOddsPapiAccountDto | null>(null);
  const [language, setLanguage] = useState("");
  const [refreshed, setRefreshed] = useState<AdminOddsPapiRefreshKeyDto | null>(null);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState<SectionLoad>({
    status: true,
    account: true,
  });

  const anyLoading = loading.status || loading.account;

  /** Local sync status + unmetered GET /account only — never billable OddsPapi endpoints. */
  const reload = useCallback(async () => {
    setError("");
    setLoading({ status: true, account: true });

    const statusTask = adminApi
      .syncStatus()
      .then((next) => setStatus(next))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load connection status");
      })
      .finally(() => setLoading((current) => ({ ...current, status: false })));

    const accountTask = adminApi
      .oddsPapiAccount()
      .then((next) => {
        setAccount(next);
        setLanguage(next.languageCode ?? "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load OddsPapi account");
      })
      .finally(() => setLoading((current) => ({ ...current, account: false })));

    await Promise.allSettled([statusTask, accountTask]);
  }, []);

  useEffect(() => {
    if (!session) return;
    void reload();
  }, [session, reload]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    await run("test", async () => {
      const started = Date.now();
      const next = await adminApi.oddsPapiAccount();
      setAccount(next);
      setLanguage(next.languageCode ?? "");
      setTestResult(`Account reachable in ${Date.now() - started}ms (unmetered GET /account)`);
      const nextStatus = await adminApi.syncStatus();
      setStatus(nextStatus);
    });
  }

  async function saveLanguage() {
    if (!language.trim()) return;
    await run("language", async () => {
      setLoading((current) => ({ ...current, account: true }));
      try {
        const next = await adminApi.oddsPapiUpdateAccount(language.trim().toLowerCase());
        setAccount(next);
        setLanguage(next.languageCode ?? language);
        setMessage(`Language updated to ${next.languageName ?? next.languageCode ?? language}`);
      } finally {
        setLoading((current) => ({ ...current, account: false }));
      }
    });
  }

  async function refreshApiKey() {
    if (
      !window.confirm(
        "Rotate the OddsPapi API key? The old key stops working immediately. You must copy the new key into .env.",
      )
    ) {
      return;
    }
    await run("refresh", async () => {
      const next = await adminApi.oddsPapiRefreshApiKey();
      setRefreshed(next);
      setCopied(false);
      setMessage("New key is active for this process — save it to .env and restart.");
      await reload();
    });
  }

  async function copyKey() {
    if (!refreshed?.apiKey) return;
    try {
      await navigator.clipboard.writeText(refreshed.apiKey);
      setCopied(true);
    } catch {
      setError("Could not copy — select the key manually");
    }
  }

  const activeSub = !account
    ? null
    : (account.subscriptions.find((row) => row.subscriptionId === account.currentSubscriptionId) ??
      account.subscriptions.find((row) => row.isActive) ??
      account.subscriptions[0] ??
      null);

  const used = activeSub?.requestCount;
  const limit = activeSub?.requestLimit;
  const usagePct =
    used == null || !limit || limit <= 0 ? null : Math.min(100, Math.round((used / limit) * 1000) / 10);

  const bookmakers = activeSub ? Object.entries(activeSub.bookmakers) : [];
  const connected = Boolean(status?.provider.connected) || Boolean(account);
  const locked = Boolean(busy) || anyLoading;

  if (!session) return null;

  return (
    <div className="op-page">
      {anyLoading && <div className="page-loading-bar" aria-hidden />}

      <div className="op-head">
        <div className="op-head-copy">
          <div className="op-brand-row">
            <span className="op-mark">OP</span>
            <div>
              <h1>OddsPapi</h1>
              <p className="hint">
                Live provider account &amp; usage via unmetered <code>GET /account</code> only — does not use your
                request quota
              </p>
            </div>
          </div>
        </div>
        <div className="op-head-actions">
          <button
            type="button"
            className="ghost"
            disabled={locked}
            onClick={() =>
              void run("reload", async () => {
                await reload();
              })
            }
          >
            {busy === "reload" || anyLoading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" disabled={locked} onClick={() => void testConnection()}>
            {busy === "test" ? "Testing…" : "Test account"}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="text-ok">{message}</p>}
      {testResult && <p className="text-ok">{testResult}</p>}

      <SectionShell loading={loading.status || loading.account}>
        <section className={`op-hero${connected ? " is-ok" : " is-warn"}`}>
          <div className="op-hero-main">
            <span className={`op-pill${connected ? " ok" : " warn"}`}>
              <span className="op-dot" />
              {loading.account
                ? "LOADING"
                : account
                  ? "ACCOUNT OK"
                  : (status?.health.apiConnection ?? "UNKNOWN")}
            </span>
            <div className="op-hero-meta">
              <div>
                <small>API key</small>
                <strong>
                  {loading.account || loading.status
                    ? "…"
                    : (account?.apiKeyMasked ?? status?.provider.apiKeyMasked ?? "—")}
                </strong>
              </div>
              <div>
                <small>Endpoint</small>
                <strong className="op-mono">{loading.status ? "…" : (status?.provider.baseUrl ?? "—")}</strong>
              </div>
              <div>
                <small>Language</small>
                <strong>
                  {loading.account
                    ? "…"
                    : `${account?.languageName ?? "—"}${account?.languageCode ? ` · ${account.languageCode}` : ""}`}
                </strong>
              </div>
            </div>
          </div>
          <div className="op-usage">
            <div className="op-usage-top">
              <span>Package usage</span>
              <strong>
                {loading.account ? "…" : (activeSub?.requestCount ?? "—")}
                <span> / {loading.account ? "…" : (activeSub?.requestLimit ?? "—")}</span>
              </strong>
            </div>
            <div className="op-usage-bar" aria-hidden>
              <i style={{ width: `${loading.account ? 0 : (usagePct ?? 0)}%` }} />
            </div>
            <div className="op-usage-foot">
              <span>
                {loading.account
                  ? "Loading usage…"
                  : usagePct == null
                    ? "Usage unavailable"
                    : `${usagePct}% of monthly requests`}
              </span>
              <span>
                Last call{" "}
                {loading.status
                  ? "…"
                  : status?.provider.lastRequestAt
                    ? new Date(status.provider.lastRequestAt).toLocaleString()
                    : "—"}
              </span>
            </div>
          </div>
        </section>
      </SectionShell>

      <SectionShell loading={loading.status || loading.account}>
        <section className="cards op-kpis">
          <article>
            <small>Process requests</small>
            <b>{loading.status ? "…" : (status?.provider.requestsThisProcess ?? "—")}</b>
          </article>
          <article>
            <small>Sports on plan</small>
            <b>{loading.account ? "…" : (activeSub?.sportIds.length ?? "—")}</b>
          </article>
          <article>
            <small>Bookmakers</small>
            <b>{loading.account ? "…" : bookmakers.length || "—"}</b>
          </article>
          <article>
            <small>WebSocket</small>
            <b>{loading.account ? "…" : (activeSub?.websocketAccess ?? "—")}</b>
          </article>
        </section>
      </SectionShell>

      <section className="op-grid">
        <div className="panel op-panel">
          <div className="panel-head">
            <h2>Connection</h2>
            {loading.status && <LoadingBadge />}
          </div>
          <TableState loading={loading.status} empty="No connection data." hasRows={Boolean(status)}>
            {status ? (
              <dl className="op-facts">
                <div>
                  <dt>Status</dt>
                  <dd className={connected ? "text-ok" : "text-warn"}>
                    {account ? "Account reachable" : status.health.apiConnection}
                  </dd>
                </div>
                <div>
                  <dt>Last request</dt>
                  <dd>
                    {status.provider.lastRequestAt
                      ? new Date(status.provider.lastRequestAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Last error</dt>
                  <dd>{status.provider.lastError ?? "None"}</dd>
                </div>
                <div>
                  <dt>Account created</dt>
                  <dd>{account?.createdAt ? new Date(account.createdAt).toLocaleString() : "—"}</dd>
                </div>
              </dl>
            ) : null}
          </TableState>
        </div>

        <div className="panel op-panel">
          <div className="panel-head">
            <h2>Plan</h2>
            {loading.account && <LoadingBadge />}
          </div>
          <TableState loading={loading.account} empty="No account data." hasRows={Boolean(account)}>
            {account ? (
              <>
                <dl className="op-facts">
                  <div>
                    <dt>Active subscription</dt>
                    <dd className="op-mono op-truncate" title={activeSub?.subscriptionId ?? undefined}>
                      {activeSub?.subscriptionId ?? account.currentSubscriptionId ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Rate limit</dt>
                    <dd>{activeSub?.rateLimit ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Sports</dt>
                    <dd>{activeSub?.sportIds.length ? activeSub.sportIds.join(", ") : "—"}</dd>
                  </div>
                </dl>
                <div className="op-chips">
                  <span className="op-chips-label">Bookmakers</span>
                  <div className="op-chip-row">
                    {bookmakers.length === 0 ? (
                      <span className="op-chip muted">None listed</span>
                    ) : (
                      bookmakers.map(([slug, meta]) => (
                        <span key={slug} className="op-chip">
                          {slug}
                          {(meta.hasLiveOdds || meta.hasPlayerProps) && (
                            <em>
                              {[meta.hasLiveOdds ? "live" : null, meta.hasPlayerProps ? "props" : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </em>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </TableState>
        </div>
      </section>

      <section className="op-grid">
        <div className="panel op-panel">
          <div className="panel-head">
            <h2>Language</h2>
            <div className="op-head-inline">
              {busy === "language" && <LoadingBadge />}
              <button type="button" disabled={locked || !language.trim()} onClick={() => void saveLanguage()}>
                {busy === "language" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
          <p className="muted op-help">
            Updates via <code>POST /account</code>. Enter a 2-letter code (e.g. <code>en</code>) — we do not call
            billable <code>GET /languages</code>.
          </p>
          <label className="op-field">
            Account language (a2)
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value.toLowerCase())}
              disabled={locked}
              maxLength={2}
              placeholder="en"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="panel op-panel">
          <div className="panel-head">
            <h2>API key</h2>
            <div className="op-head-inline">
              {(loading.account || busy === "refresh") && <LoadingBadge />}
              <button type="button" className="danger" disabled={locked} onClick={() => void refreshApiKey()}>
                {busy === "refresh" ? "Rotating…" : "Rotate key"}
              </button>
            </div>
          </div>
          <p className="muted op-help">
            Rotating invalidates the old key immediately. Copy the new value into <code>ODDSPAPI_API_KEY</code>, then
            restart the API.
          </p>
          <SectionShell loading={loading.account && !refreshed}>
            {refreshed ? (
              <div className="op-key-box">
                <div className="op-key-top">
                  <strong>New key — copy now</strong>
                  <button type="button" className="ghost" onClick={() => void copyKey()}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="op-key-value">{refreshed.apiKey}</code>
                <small>Masked: {refreshed.apiKeyMasked}</small>
              </div>
            ) : (
              <div className="op-key-idle">
                <span className="op-mono">
                  {loading.account
                    ? "Loading key…"
                    : (account?.apiKeyMasked ?? status?.provider.apiKeyMasked ?? "—")}
                </span>
                <small>Current key stays on the server — browser never sees the full value.</small>
              </div>
            )}
          </SectionShell>
        </div>
      </section>

      <section className="panel op-panel">
        <div className="panel-head">
          <h2>Subscriptions</h2>
          <div className="op-head-inline">
            {loading.account && <LoadingBadge />}
            {!loading.account && account && (
              <small className="muted">{account.subscriptions.length} total</small>
            )}
          </div>
        </div>
        <TableState
          loading={loading.account}
          empty="No subscriptions on this account."
          hasRows={Boolean(account && account.subscriptions.length > 0)}
        >
          {account ? (
            <div className="op-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subscription</th>
                    <th>Status</th>
                    <th>Usage</th>
                    <th>Valid until</th>
                  </tr>
                </thead>
                <tbody>
                  {account.subscriptions.map((sub) => (
                    <tr key={sub.subscriptionId} className={sub.isActive ? "is-active" : undefined}>
                      <td>
                        <code className="op-mono" title={sub.subscriptionId}>
                          {shortId(sub.subscriptionId)}
                        </code>
                      </td>
                      <td>
                        <span className={`op-pill tiny${sub.isActive ? " ok" : ""}`}>
                          {sub.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {sub.requestCount ?? "—"} / {sub.requestLimit ?? "—"}
                      </td>
                      <td>{sub.validUntil ? new Date(sub.validUntil).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </TableState>
      </section>
    </div>
  );
}

function SectionShell({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <div className={loading ? "op-section is-loading" : "op-section"} aria-busy={loading}>
      {children}
      {loading && (
        <div className="op-section-overlay">
          <span className="page-loading-pulse" />
          Loading…
        </div>
      )}
    </div>
  );
}

function LoadingBadge() {
  return (
    <span className="op-loading-badge" aria-live="polite">
      <span className="page-loading-pulse" />
      Loading
    </span>
  );
}

function shortId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
