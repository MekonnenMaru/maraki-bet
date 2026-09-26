import type {
  FixtureCardDto,
  FixtureDetailDto,
  LedgerEntryDto,
  MetaDto,
  SessionDto,
  SportDto,
  TournamentDto,
  WalletDto,
  BetReceiptDto,
  PlaceBetSelection,
  TestSettleOutcome,
} from "@maraki/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const FETCH_TIMEOUT_MS = 8_000;

type NavCache = {
  sports: SportDto[];
  tournaments: TournamentDto[];
  at: number;
};

let navCache: NavCache | null = null;
const NAV_TTL_MS = 60_000;

async function request<T>(path: string, init?: RequestInit, query?: Record<string, string | undefined>) {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `API ${path} failed (${response.status})`);
  }
  return body.data as T;
}

function get<T>(path: string, query?: Record<string, string | undefined>) {
  return request<T>(path, undefined, query);
}

export async function loadNavCatalog(sport = "soccer") {
  if (navCache && Date.now() - navCache.at < NAV_TTL_MS) {
    return navCache;
  }
  const [sports, tournaments] = await Promise.all([
    get<SportDto[]>("/api/v1/sports").catch(() => [] as SportDto[]),
    get<TournamentDto[]>(`/api/v1/sports/${sport}/tournaments`).catch(() => [] as TournamentDto[]),
  ]);
  navCache = { sports, tournaments, at: Date.now() };
  return navCache;
}

export const api = {
  sports: () => get<SportDto[]>("/api/v1/sports"),
  tournaments: (sport: string) => get<TournamentDto[]>(`/api/v1/sports/${sport}/tournaments`),
  fixtures: (query?: {
    sport?: string;
    status?: string;
    window?: string;
    tournamentId?: string;
    tournamentIds?: string;
  }) => get<FixtureCardDto[]>("/api/v1/fixtures", query),
  fixture: (id: string) => get<FixtureDetailDto>(`/api/v1/fixtures/${id}`),
  meta: () => get<MetaDto>("/api/v1/meta"),
  me: () => get<SessionDto>("/api/v1/auth/me"),
  register: (body: { username: string; password: string; phone?: string }) =>
    request<SessionDto>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { username: string; password: string }) =>
    request<SessionDto>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }),
  wallet: () => get<WalletDto>("/api/v1/wallet"),
  ledger: () => get<LedgerEntryDto[]>("/api/v1/wallet/ledger"),
  deposit: (amount: number) =>
    request<WalletDto>("/api/v1/wallet/deposit", { method: "POST", body: JSON.stringify({ amount }) }),
  placeBet: (body: { stake: number; acceptChanges: boolean; selections: PlaceBetSelection[] }) =>
    request<BetReceiptDto>("/api/v1/bets", { method: "POST", body: JSON.stringify(body) }),
  bookCoupon: (body: { stake: number; acceptChanges: boolean; selections: PlaceBetSelection[] }) =>
    request<BetReceiptDto>("/api/v1/bookings", { method: "POST", body: JSON.stringify(body) }),
  myBets: () => get<BetReceiptDto[]>("/api/v1/bets"),
  checkCoupon: (code: string) => get<BetReceiptDto>(`/api/v1/coupons/${encodeURIComponent(code.trim())}`),
  loadCoupon: (code: string) => get<BetReceiptDto>(`/api/v1/coupons/${encodeURIComponent(code.trim())}/load`),
  testSettle: (code: string, outcome: TestSettleOutcome) =>
    request<BetReceiptDto>(`/api/v1/bets/${encodeURIComponent(code)}/test-settle`, {
      method: "POST",
      body: JSON.stringify({ outcome }),
    }),
};
