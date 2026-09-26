import type {
  BetReceiptDto,
  CashierBetListDto,
  CashierDashboardDto,
  CashierDeskDto,
  SessionDto,
} from "@maraki/shared";

export type CashierSession = SessionDto & { desk: CashierDeskDto };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const FETCH_TIMEOUT_MS = 8_000;

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

export const cashierApi = {
  login: (body: { username: string; password: string }) =>
    request<CashierSession>("/api/v1/cashier/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: () => request<{ ok: boolean }>("/api/v1/cashier/auth/logout", { method: "POST" }),
  me: () => request<CashierSession>("/api/v1/cashier/auth/me"),
  dashboard: () => request<CashierDashboardDto>("/api/v1/cashier/dashboard"),
  bets: (limit = 50) => request<CashierBetListDto>(`/api/v1/cashier/bets?limit=${limit}`),
  lookup: (code: string) =>
    request<BetReceiptDto>(`/api/v1/cashier/coupons/${encodeURIComponent(code.trim())}`),
  place: (code: string, acceptChanges = true) =>
    request<BetReceiptDto>(`/api/v1/cashier/coupons/${encodeURIComponent(code.trim())}/place`, {
      method: "POST",
      body: JSON.stringify({ acceptChanges }),
    }),
};
