import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { ProviderError } from "../../lib/errors.js";
import { mapV4Fixture } from "./v4.mapper.js";
import type {
  OddsPapiAccount,
  OddsPapiBookmaker,
  OddsPapiFixture,
  OddsPapiLanguage,
  OddsPapiMarket,
  OddsPapiSport,
  OddsPapiTournament,
  V4Fixture,
} from "./types.js";

type Query = Record<string, string | number | boolean | undefined>;

export class OddsPapiHttpClient {
  private requestCount = 0;
  private lastRequestAt = 0;
  private apiKey: string;

  constructor(
    private readonly baseUrl = env.ODDSPAPI_BASE_URL,
    private readonly lang = env.ODDSPAPI_LANG,
    apiKey = env.ODDSPAPI_API_KEY,
  ) {
    this.apiKey = apiKey;
  }

  get requestsThisProcess() {
    return this.requestCount;
  }

  get lastSuccessfulRequestAt() {
    return this.lastRequestAt || null;
  }

  get currentApiKey() {
    return this.apiKey;
  }

  /** Keep the in-process client usable after OddsPapi rotates the key. */
  replaceApiKey(apiKey: string) {
    if (!apiKey.trim()) throw new Error("API key cannot be empty");
    this.apiKey = apiKey.trim();
  }

  async testConnection() {
    const started = Date.now();
    const sports = await this.getSports();
    return {
      ok: true,
      latencyMs: Date.now() - started,
      sportsVisible: sports.length,
      lastRequestAt: this.lastRequestAt ? new Date(this.lastRequestAt).toISOString() : null,
    };
  }

  async getAccount() {
    return this.get<OddsPapiAccount>("/account");
  }

  async updateAccountLanguage(language: string) {
    return this.post<OddsPapiAccount | { message?: string }>("/account", { language });
  }

  async refreshApiKey() {
    return this.post<{ api_key: string }>("/account/refresh-api-key");
  }

  async getLanguages() {
    const rows = await this.get<OddsPapiLanguage[] | OddsPapiLanguage>("/languages");
    return asArray(rows);
  }

  async getSports(_sportIds?: number[]) {
    return this.get<OddsPapiSport[]>("/sports", { language: this.lang });
  }

  async getTournaments(sportId: number) {
    const rows = await this.get<Array<OddsPapiTournament & { sportId?: number }>>("/tournaments", {
      sportId,
      language: this.lang,
    });
    return rows.map((row) => ({ ...row, sportId: row.sportId ?? sportId }));
  }

  async getMarkets(sportId?: number) {
    const rows = await this.get<OddsPapiMarket[]>("/markets", { language: this.lang });
    if (sportId == null) return rows;
    return rows.filter((market) => !market.sportId || market.sportId === sportId);
  }

  async getBookmakers(bookmakers?: string[]) {
    const rows = await this.get<Array<{ slug: string; bookmakerName: string; liveOdds?: boolean | null }>>(
      "/bookmakers",
      { language: this.lang },
    );
    const mapped: OddsPapiBookmaker[] = rows.map((row) => ({
      slug: row.slug,
      bookmakerName: row.bookmakerName,
      active: true,
      websocketLive: row.liveOdds ?? null,
    }));
    if (!bookmakers?.length) return mapped;
    return mapped.filter((row) => bookmakers.includes(row.slug));
  }

  async getFixturesToday(filters: { sportId?: number; tournamentId?: number; bookmakers?: string }) {
    return this.getFixturesUpcoming(filters, env.FIXTURE_SYNC_DAYS);
  }

  /**
   * OddsPapi allows sportId+from+to only when the span is under 10 days.
   * Longer horizons are pulled in 8-day chunks (see FIXTURE_SYNC_DAYS).
   * Docs: https://oddspapi.io/en/docs/get-fixtures
   */
  async getFixturesUpcoming(
    filters: { sportId?: number; tournamentId?: number; bookmakers?: string },
    totalDays = env.FIXTURE_SYNC_DAYS,
  ) {
    // tournamentId alone is allowed without dates — use for scoped sync.
    if (filters.tournamentId != null && filters.sportId == null) {
      return this.getFixtures({
        tournamentId: filters.tournamentId,
        bookmakers: filters.bookmakers,
      });
    }

    const days = Math.min(60, Math.max(1, totalDays));
    const chunkDays = 8; // from day N to day N+9 midnight = 9-day span (< 10)
    const fixtures: OddsPapiFixture[] = [];

    for (let start = 0; start < days; start += chunkDays) {
      const span = Math.min(chunkDays, days - start);
      const from = isoDaysFromNow(start);
      // `to` is a midnight boundary — use day after last included day.
      const to = isoDaysFromNow(start + span + 1);
      const rows = await this.getFixtures({
        ...filters,
        startTimeFrom: Math.floor(Date.parse(from) / 1000),
        startTimeTo: Math.floor(Date.parse(to) / 1000),
      });
      fixtures.push(...rows);
      logger.info("Fixture chunk", {
        sportId: filters.sportId,
        tournamentId: filters.tournamentId,
        from,
        to,
        count: rows.length,
      });
    }

    return fixtures;
  }

  async getFixturesLive(filters: { sportId?: number; tournamentId?: number; bookmakers?: string }) {
    const from = isoDaysFromNow(-1);
    const to = isoDaysFromNow(2);
    return this.getFixtures({
      ...filters,
      startTimeFrom: Math.floor(Date.parse(from) / 1000),
      startTimeTo: Math.floor(Date.parse(to) / 1000),
    }).then((rows) => rows.filter((row) => row.status.statusId === 1));
  }

  async getFixtures(filters: {
    sportId?: number;
    tournamentId?: number;
    fixtureIds?: string;
    startTimeFrom?: number;
    startTimeTo?: number;
    bookmakers?: string;
  }) {
    const query: Query = {
      language: this.lang,
      sportId: filters.sportId,
      tournamentId: filters.tournamentId,
      // Fixtures docs use plural `bookmakers` (odds endpoints use singular `bookmaker`).
      bookmakers: filters.bookmakers,
      fixtureIds: filters.fixtureIds,
    };
    if (filters.startTimeFrom) query.from = new Date(filters.startTimeFrom * 1000).toISOString();
    if (filters.startTimeTo) query.to = new Date(filters.startTimeTo * 1000).toISOString();
    const rows = await this.get<V4Fixture[]>("/fixtures", query);
    return asArray(rows).map(mapV4Fixture);
  }

  async getMainOdds(filters: { tournamentId?: number; fixtureIds?: string; bookmakers?: string; since?: number }) {
    if (filters.tournamentId) {
      const rows = await this.get<V4Fixture[] | V4Fixture>("/odds-by-tournaments", {
        tournamentIds: String(filters.tournamentId),
        bookmaker: filters.bookmakers,
        language: this.lang,
        verbosity: env.ODDS_VERBOSITY,
      });
      return asArray(rows).map(mapV4Fixture);
    }

    if (!filters.fixtureIds) return [];
    const ids = filters.fixtureIds.split(",").map((id) => id.trim()).filter(Boolean);
    const fixtures: OddsPapiFixture[] = [];
    for (const fixtureId of ids.slice(0, 8)) {
      const row = await this.get<V4Fixture>("/odds", {
        fixtureId,
        bookmaker: filters.bookmakers,
        language: this.lang,
        verbosity: env.ODDS_VERBOSITY,
      });
      fixtures.push(mapV4Fixture(row));
    }
    return fixtures;
  }

  async getOddsByTournaments(tournamentIds: number[], bookmakers?: string) {
    if (tournamentIds.length === 0) return [];
    const rows = await this.get<V4Fixture[] | V4Fixture>("/odds-by-tournaments", {
      tournamentIds: tournamentIds.join(","),
      // OddsPapi v4 requires exactly one `bookmaker` (singular).
      bookmaker: bookmakers,
      language: this.lang,
      verbosity: env.ODDS_VERBOSITY,
    });
    return asArray(rows).map(mapV4Fixture);
  }

  private async get<T>(path: string, query: Query = {}, attempt = 0): Promise<T> {
    return this.request<T>("GET", path, query, attempt);
  }

  private async post<T>(path: string, query: Query = {}, attempt = 0): Promise<T> {
    return this.request<T>("POST", path, query, attempt);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    query: Query = {},
    attempt = 0,
  ): Promise<T> {
    await this.throttle();
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/v4${path}`);
    url.searchParams.set("apiKey", this.apiKey);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    this.requestCount += 1;
    const started = Date.now();
    const response = await fetch(url, { method, signal: AbortSignal.timeout(25_000) });
    const remaining = response.headers.get("x-ratelimit-remaining");
    logger.info("OddsPapi REST", {
      method,
      path,
      status: response.status,
      ms: Date.now() - started,
      remaining,
      processRequests: this.requestCount,
    });

    if (response.status === 429) {
      const body = await safeJson(response);
      // Daily quota — stop immediately (retries only burn more).
      if (isDailyRequestLimit(body)) {
        throw new ProviderError(429, formatProviderMessage(path, 429, body), body);
      }
      // Short endpoint cooldown (often <1s) — wait and retry a few times for admin sync.
      if (attempt >= 4) {
        throw new ProviderError(429, formatProviderMessage(path, 429, body), body);
      }
      const retryMs = Math.max(250, retryDelayMs(response, body));
      logger.warn("OddsPapi cooldown; waiting before retry", {
        path,
        retryMs,
        attempt: attempt + 1,
      });
      await sleep(retryMs);
      this.lastRequestAt = Date.now();
      return this.request<T>(method, path, query, attempt + 1);
    }

    if (!response.ok) {
      const body = await safeJson(response);
      throw new ProviderError(response.status, formatProviderMessage(path, response.status, body), body);
    }

    return (await response.json()) as T;
  }

  private async throttle() {
    // OddsPapi typically wants ~1s between calls; keep a safer gap for multi-sport sync.
    const wait = 1200 - (Date.now() - this.lastRequestAt);
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }
}

function asArray<T>(value: T | T[]) {
  return Array.isArray(value) ? value : [value];
}

function isoDaysFromNow(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return await response.text();
  }
}

function formatProviderMessage(path: string, status: number, body: unknown) {
  const err = extractProviderError(body);
  if (err) return `OddsPapi ${path} failed (${status}): ${err}`;
  return `OddsPapi ${path} failed (${status})`;
}

function extractProviderError(body: unknown) {
  if (!body || typeof body !== "object") return typeof body === "string" ? body.slice(0, 240) : null;
  const root = body as Record<string, unknown>;
  const nested = (root.error && typeof root.error === "object" ? root.error : root) as Record<string, unknown>;
  const message = typeof nested.message === "string" ? nested.message : null;
  const details = typeof nested.details === "string" ? nested.details : null;
  if (message && details) return `${message} ${details}`.slice(0, 400);
  return (message ?? details)?.slice(0, 400) ?? null;
}

function isDailyRequestLimit(body: unknown) {
  const text = `${extractProviderError(body) ?? ""}`.toLowerCase();
  return text.includes("request limit exceeded") || text.includes("exceeded your request limit");
}

function retryDelayMs(response: Response, body: unknown) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000);
  if (body && typeof body === "object") {
    const root = body as Record<string, unknown>;
    const nested = (root.error && typeof root.error === "object" ? root.error : root) as Record<string, unknown>;
    const retryMs = Number(nested.retryMs);
    if (Number.isFinite(retryMs) && retryMs > 0) return Math.ceil(retryMs);
    const retryAfter = nested.retryAfter;
    if (typeof retryAfter === "string") {
      const seconds = Number.parseFloat(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
    }
  }
  return 1000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
