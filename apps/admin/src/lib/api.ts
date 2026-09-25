import type {
  AdminAgentRow,
  AdminBetRow,
  AdminDashboardDto,
  AdminFixtureAdminRow,
  AdminLedgerRow,
  AdminMarketRow,
  AdminOddsPapiAccountDto,
  AdminOddsPapiLanguage,
  AdminOddsPapiRefreshKeyDto,
  AdminOddsRow,
  AdminPageDto,
  AdminSaleRow,
  AdminSeasonRow,
  AdminSettingsDto,
  AdminShopRow,
  AdminSportRow,
  AdminSyncJobRow,
  AdminSyncStatusDto,
  AdminTournamentRow,
  AdminUserRow,
  BetReceiptDto,
  OrgPermissionMap,
  SessionDto,
  UserRole,
  WalletDto,
} from "@maraki/shared";


const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const FETCH_TIMEOUT_MS = 8_000;

let settingsCache: { data: AdminSettingsDto; at: number } | null = null;
const SETTINGS_TTL_MS = 60_000;

async function request<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error ?? `API ${path} failed (${response.status})`);
  return body.data as T;
}

function withQuery(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function loadAdminSettings(force = false) {
  if (!force && settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.data;
  }
  const data = await request<AdminSettingsDto>("/api/v1/admin/settings");
  settingsCache = { data, at: Date.now() };
  return data;
}

export function clearAdminCaches() {
  settingsCache = null;
}

export const adminApi = {
  me: () => request<SessionDto>("/api/v1/admin/auth/me"),
  login: (body: { username: string; password: string }) =>
    request<SessionDto>("/api/v1/admin/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>("/api/v1/admin/auth/logout", { method: "POST" }),
  dashboard: (query?: { from?: string; to?: string }) =>
    request<AdminDashboardDto>(withQuery("/api/v1/admin/dashboard", query)),
  settings: () => loadAdminSettings(),
  fixtures: (query?: {
    q?: string;
    statusId?: string;
    sportId?: string;
    tournamentId?: string;
    seasonId?: string;
    visible?: string;
    bettingEnabled?: string;
    page?: number;
    pageSize?: number;
  }) => request<AdminPageDto<AdminFixtureAdminRow>>(withQuery("/api/v1/admin/fixtures", query)),
  patchFixture: (id: string, body: { visible?: boolean; bettingEnabled?: boolean }) =>
    request<{ id: string; visible: boolean; bettingEnabled: boolean }>(`/api/v1/admin/fixtures/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteFixture: (id: string) =>
    request<{ ok: boolean; deleted: number }>(`/api/v1/admin/fixtures/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  deleteAllFixtures: () =>
    request<{ ok: boolean; deleted: number }>("/api/v1/admin/fixtures", { method: "DELETE" }),
  sports: (query?: { q?: string; enabled?: string; page?: number; pageSize?: number }) =>
    request<AdminPageDto<AdminSportRow>>(withQuery("/api/v1/admin/sports", query)),
  patchSport: (id: number, body: { enabled?: boolean; visible?: boolean; displayOrder?: number }) =>
    request<{ id: number; enabled: boolean; visible: boolean; displayOrder: number }>(
      `/api/v1/admin/sports/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteSport: (id: number) =>
    request<{ ok: boolean; deleted: number }>(`/api/v1/admin/sports/${id}`, { method: "DELETE" }),
  deleteAllSports: () =>
    request<{ ok: boolean; deleted: number }>("/api/v1/admin/sports", { method: "DELETE" }),
  tournaments: (query?: {
    q?: string;
    sportId?: string;
    enabled?: string;
    visible?: string;
    page?: number;
    pageSize?: number;
  }) => request<AdminPageDto<AdminTournamentRow>>(withQuery("/api/v1/admin/tournaments", query)),
  patchTournament: (id: number, body: { enabled?: boolean; visible?: boolean; displayOrder?: number }) =>
    request<{ id: number; enabled: boolean; visible: boolean; displayOrder: number }>(
      `/api/v1/admin/tournaments/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteTournament: (id: number) =>
    request<{ ok: boolean; deleted: number }>(`/api/v1/admin/tournaments/${id}`, { method: "DELETE" }),
  deleteAllTournaments: () =>
    request<{ ok: boolean; deleted: number }>("/api/v1/admin/tournaments", { method: "DELETE" }),
  seasons: (query?: { q?: string; sportId?: string; tournamentId?: string; page?: number; pageSize?: number }) =>
    request<AdminPageDto<AdminSeasonRow>>(withQuery("/api/v1/admin/seasons", query)),
  deleteSeason: (tournamentId: number, seasonId: number) =>
    request<{ ok: boolean; deleted: number }>(`/api/v1/admin/seasons/${tournamentId}/${seasonId}`, {
      method: "DELETE",
    }),
  deleteAllSeasons: () =>
    request<{ ok: boolean; deleted: number }>("/api/v1/admin/seasons", { method: "DELETE" }),
  markets: (query?: { q?: string; sportId?: string; enabled?: string; page?: number; pageSize?: number }) =>
    request<AdminPageDto<AdminMarketRow>>(withQuery("/api/v1/admin/markets", query)),
  patchMarket: (
    id: number,
    body: { enabled?: boolean; visible?: boolean; bettingEnabled?: boolean; displayOrder?: number },
  ) =>
    request<{ id: number; enabled: boolean; visible: boolean; bettingEnabled: boolean; displayOrder: number }>(
      `/api/v1/admin/markets/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteMarket: (id: number) =>
    request<{ ok: boolean; deleted: number }>(`/api/v1/admin/markets/${id}`, { method: "DELETE" }),
  deleteAllMarkets: () =>
    request<{ ok: boolean; deleted: number }>("/api/v1/admin/markets", { method: "DELETE" }),
  odds: (query?: { fixtureId?: string; page?: number; pageSize?: number }) =>
    request<AdminPageDto<AdminOddsRow>>(withQuery("/api/v1/admin/odds", query)),
  deleteOddsQuote: (fixtureId: string, outcomeId: number) =>
    request<{ ok: boolean; deleted: number }>(
      `/api/v1/admin/odds/${encodeURIComponent(fixtureId)}/${outcomeId}`,
      { method: "DELETE" },
    ),
  deleteAllOdds: (fixtureId?: string) =>
    request<{ ok: boolean; deleted: number }>(
      withQuery("/api/v1/admin/odds", { fixtureId }),
      { method: "DELETE" },
    ),
  syncStatus: () => request<AdminSyncStatusDto>("/api/v1/admin/sync/status"),
  syncConfig: (body: {
    masterEnabled?: boolean;
    automaticEnabled?: boolean;
    scheduleType?: string;
    intervalValue?: number;
    intervalUnit?: string;
    timezone?: string;
    retryEnabled?: boolean;
    maxRetries?: number;
  }) => request<unknown>("/api/v1/admin/sync/config", { method: "PUT", body: JSON.stringify(body) }),
  syncStart: (body?: {
    scope?: string;
    scopeId?: string;
    resources?: string[];
    force?: boolean;
  }) => request<AdminSyncJobRow>("/api/v1/admin/sync/start", { method: "POST", body: JSON.stringify(body ?? {}) }),
  syncPause: () => request<AdminSyncJobRow>("/api/v1/admin/sync/pause", { method: "POST" }),
  syncResume: () => request<AdminSyncJobRow>("/api/v1/admin/sync/resume", { method: "POST" }),
  syncCancel: () => request<AdminSyncJobRow>("/api/v1/admin/sync/cancel", { method: "POST" }),
  syncTest: () =>
    request<{ ok: boolean; latencyMs: number; sportsVisible: number; apiKeyMasked: string }>(
      "/api/v1/admin/sync/test",
      { method: "POST" },
    ),
  oddsPapiAccount: () => request<AdminOddsPapiAccountDto>("/api/v1/admin/oddspapi/account"),
  oddsPapiUpdateAccount: (language: string) =>
    request<AdminOddsPapiAccountDto>("/api/v1/admin/oddspapi/account", {
      method: "POST",
      body: JSON.stringify({ language }),
    }),
  oddsPapiRefreshApiKey: () =>
    request<AdminOddsPapiRefreshKeyDto>("/api/v1/admin/oddspapi/account/refresh-api-key", {
      method: "POST",
    }),
  oddsPapiLanguages: () => request<AdminOddsPapiLanguage[]>("/api/v1/admin/oddspapi/languages"),
  syncJobs: (query?: { page?: number; pageSize?: number; status?: string }) =>
    request<AdminPageDto<AdminSyncJobRow>>(withQuery("/api/v1/admin/sync/jobs", query)),
  syncJob: (id: string) => request<AdminSyncJobRow>(`/api/v1/admin/sync/jobs/${id}`),
  syncSport: (id: number) =>
    request<AdminSyncJobRow>(`/api/v1/admin/sync/sports/${id}`, { method: "POST" }),
  syncTournament: (id: number) =>
    request<AdminSyncJobRow>(`/api/v1/admin/sync/tournaments/${id}`, { method: "POST" }),
  syncFixture: (id: string) =>
    request<AdminSyncJobRow>(`/api/v1/admin/sync/fixtures/${encodeURIComponent(id)}`, { method: "POST" }),
  users: (query?: {
    q?: string;
    role?: UserRole;
    roles?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) => request<AdminPageDto<AdminUserRow>>(withQuery("/api/v1/admin/users", query)),
  setStatus: (id: string, status: "ACTIVE" | "SUSPENDED") =>
    request<{ id: string; status: string }>(`/api/v1/admin/users/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  deleteUser: (id: string) =>
    request<{ ok: boolean; deleted: number }>(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  deleteUsers: (query?: { role?: UserRole; roles?: string }) =>
    request<{ ok: boolean; deleted: number }>(withQuery("/api/v1/admin/users", query), {
      method: "DELETE",
    }),
  credit: (id: string, amount: number, note?: string) =>
    request<WalletDto>(`/api/v1/admin/users/${id}/credit`, { method: "POST", body: JSON.stringify({ amount, note }) }),
  bets: (query?: { q?: string; status?: string; page?: number; pageSize?: number }) =>
    request<AdminPageDto<AdminBetRow>>(withQuery("/api/v1/admin/bets", query)),
  deleteBet: (id: string) =>
    request<{ ok: boolean; deleted: number }>(`/api/v1/admin/bets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  deleteAllBets: () => request<{ ok: boolean; deleted: number }>("/api/v1/admin/bets", { method: "DELETE" }),
  voidBet: (code: string) =>
    request<BetReceiptDto>(`/api/v1/admin/bets/${encodeURIComponent(code)}/void`, { method: "POST" }),
  settle: () => request<{ scanned: number; updated: number; finalized: number }>("/api/v1/admin/settle", { method: "POST" }),
  ledger: (query?: { q?: string; type?: string; page?: number; pageSize?: number }) =>
    request<AdminPageDto<AdminLedgerRow>>(withQuery("/api/v1/admin/ledger", query)),
  deleteLedgerEntry: (id: string) =>
    request<{ ok: boolean; deleted: number }>(`/api/v1/admin/ledger/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  deleteAllLedger: (type?: string) =>
    request<{ ok: boolean; deleted: number }>(withQuery("/api/v1/admin/ledger", type ? { type } : undefined), {
      method: "DELETE",
    }),
  agents: (query?: { q?: string; status?: string; page?: number; pageSize?: number }) =>
    request<AdminPageDto<AdminAgentRow>>(withQuery("/api/v1/admin/agents", query)),
  createAgent: (body: {
    username: string;
    password: string;
    displayName: string;
    code?: string;
    phone?: string;
    permissions?: OrgPermissionMap;
    notes?: string;
  }) => request<AdminAgentRow>("/api/v1/admin/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (
    id: string,
    body: {
      displayName?: string;
      code?: string | null;
      phone?: string | null;
      status?: "ACTIVE" | "SUSPENDED";
      permissions?: OrgPermissionMap;
      notes?: string | null;
      password?: string;
    },
  ) => request<AdminAgentRow>(`/api/v1/admin/agents/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAgent: (id: string) => request<{ ok: boolean }>(`/api/v1/admin/agents/${id}`, { method: "DELETE" }),
  deleteAllAgents: () => request<{ ok: boolean; deleted: number }>("/api/v1/admin/agents", { method: "DELETE" }),
  shops: (query?: { q?: string; status?: string; agentId?: string; page?: number; pageSize?: number }) =>
    request<AdminPageDto<AdminShopRow>>(withQuery("/api/v1/admin/shops", query)),
  createShop: (body: {
    agentId: string;
    name: string;
    code?: string;
    address?: string;
    phone?: string;
    permissions?: OrgPermissionMap;
    notes?: string;
  }) => request<AdminShopRow>("/api/v1/admin/shops", { method: "POST", body: JSON.stringify(body) }),
  updateShop: (
    id: string,
    body: {
      agentId?: string;
      name?: string;
      code?: string | null;
      address?: string | null;
      phone?: string | null;
      status?: "ACTIVE" | "SUSPENDED";
      permissions?: OrgPermissionMap;
      notes?: string | null;
    },
  ) => request<AdminShopRow>(`/api/v1/admin/shops/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteShop: (id: string) => request<{ ok: boolean }>(`/api/v1/admin/shops/${id}`, { method: "DELETE" }),
  deleteAllShops: () => request<{ ok: boolean; deleted: number }>("/api/v1/admin/shops", { method: "DELETE" }),
  sales: (query?: {
    q?: string;
    status?: string;
    shopId?: string;
    agentId?: string;
    page?: number;
    pageSize?: number;
  }) => request<AdminPageDto<AdminSaleRow>>(withQuery("/api/v1/admin/sales", query)),
  createSale: (body: {
    shopId: string;
    username: string;
    password: string;
    label: string;
    code?: string;
    permissions?: OrgPermissionMap;
    notes?: string;
  }) => request<AdminSaleRow>("/api/v1/admin/sales", { method: "POST", body: JSON.stringify(body) }),
  updateSale: (
    id: string,
    body: {
      shopId?: string;
      label?: string;
      code?: string | null;
      status?: "ACTIVE" | "SUSPENDED";
      permissions?: OrgPermissionMap;
      notes?: string | null;
      password?: string;
    },
  ) => request<AdminSaleRow>(`/api/v1/admin/sales/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSale: (id: string) => request<{ ok: boolean }>(`/api/v1/admin/sales/${id}`, { method: "DELETE" }),
  deleteAllSales: () => request<{ ok: boolean; deleted: number }>("/api/v1/admin/sales", { method: "DELETE" }),
};
