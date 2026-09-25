import { env } from "../../config/env.js";
import { ProviderError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { redis } from "../../lib/redis.js";
import type { CatalogRepo } from "../catalog/catalog.repo.js";
import type { OddsPapiHttpClient } from "../oddspapi/http-client.js";
import type { OddsPapiFixture, OddsPapiQuote, OddsPapiWsEnvelope } from "../oddspapi/types.js";
import type { PricingService } from "../pricing/pricing.service.js";
import { CHANNELS, OddsCache, type CachedQuote } from "./odds.cache.js";

export type OddsSyncProgress = {
  index: number;
  total: number;
  tournamentId: number;
  priced: number;
  skipped: number;
  failed: number;
};

export type OddsSyncSummary = {
  priced: number;
  tournamentsTried: number;
  tournamentsSkipped: number;
  tournamentsFailed: number;
  bookmaker: string;
  stoppedReason?: string | null;
};

export class OddsIngest {
  private providerWsUp = false;
  private sourceBookmaker = env.SOURCE_BOOKMAKER;

  constructor(
    private readonly provider: OddsPapiHttpClient,
    private readonly repo: CatalogRepo,
    private readonly cache: OddsCache,
    private readonly pricing: PricingService,
  ) {}

  get providerWsEnabled() {
    return this.providerWsUp;
  }

  get activeBookmaker() {
    return this.sourceBookmaker;
  }

  setProviderWs(up: boolean) {
    this.providerWsUp = up;
  }

  async ingestFixtures(fixtures: OddsPapiFixture[]) {
    const withOdds = fixtures.filter((fixture) => fixture.odds && Object.keys(fixture.odds).length > 0);
    for (const fixture of withOdds) {
      const quotes = this.extractQuotes(fixture);
      await this.cache.write(fixture.fixtureId, quotes);
      await redis.publish(
        CHANNELS.odds,
        JSON.stringify({ fixtureId: fixture.fixtureId, quotes }),
      );
    }
    if (withOdds.length > 0) {
      await this.repo.setState("oddsSyncedAt", String(Date.now()));
    }
    return withOdds.length;
  }

  /**
   * Cloudflare-safe odds sync: small tournament batches, soft-skip empty/404s,
   * never abort the whole job because one tournament has no bookmaker odds.
   */
  async syncMainOdds(
    fixtures: OddsPapiFixture[],
    options: { onProgress?: (progress: OddsSyncProgress) => Promise<void> | void } = {},
  ): Promise<OddsSyncSummary> {
    const selected = pickTournamentsForOdds(fixtures, env.MAX_ODDS_TOURNAMENTS);
    return this.syncOddsForTournaments(selected, options);
  }

  /** Price odds for known tournament IDs (used by board hydrate + sync). */
  async syncOddsForTournaments(
    tournamentIds: number[],
    options: { onProgress?: (progress: OddsSyncProgress) => Promise<void> | void; limit?: number } = {},
  ): Promise<OddsSyncSummary> {
    const unique = [...new Set(tournamentIds.filter((id) => Number.isInteger(id) && id > 0))];
    const cap = options.limit ?? env.MAX_ODDS_TOURNAMENTS;
    const selected = cap > 0 ? unique.slice(0, cap) : unique;
    if (selected.length === 0) {
      return {
        priced: 0,
        tournamentsTried: 0,
        tournamentsSkipped: 0,
        tournamentsFailed: 0,
        bookmaker: this.sourceBookmaker,
        stoppedReason: "no-tournaments",
      };
    }

    const batchSize = Math.max(1, env.ODDS_TOURNAMENT_BATCH_SIZE);
    const batches = chunk(selected, batchSize);
    let priced = 0;
    let skipped = 0;
    let failed = 0;
    let index = 0;
    let consecutiveEmpty = 0;
    const emptyStopAfter = Math.max(2, env.ODDS_EMPTY_STOP_AFTER);
    let stoppedReason: string | null = null;

    logger.info("Odds sync starting", {
      tournaments: selected.length,
      batches: batches.length,
      bookmaker: this.sourceBookmaker,
      cap,
    });

    for (const batch of batches) {
      index += 1;
      const result = await this.fetchOddsBatch(batch);
      if (result.kind === "ok") {
        consecutiveEmpty = 0;
        await this.repo.upsertFixtures(result.rows);
        priced += await this.ingestFixtures(result.rows);
      } else if (result.kind === "restricted") {
        skipped += batch.length;
        stoppedReason = `Bookmaker "${this.sourceBookmaker}" is restricted on your OddsPapi plan — ${result.error}`;
        logger.warn("Odds sync stopped: bookmaker restricted", {
          bookmaker: this.sourceBookmaker,
          error: result.error,
        });
        await options.onProgress?.({
          index,
          total: batches.length,
          tournamentId: batch[0]!,
          priced,
          skipped,
          failed,
        });
        break;
      } else if (result.kind === "empty") {
        skipped += batch.length;
        consecutiveEmpty += 1;
        logger.warn("Odds batch skipped (no fixtures/odds for bookmaker)", {
          tournamentIds: batch,
          bookmaker: this.sourceBookmaker,
          consecutiveEmpty,
        });
      } else if (batch.length > 1) {
        consecutiveEmpty = 0;
        for (const tournamentId of batch) {
          const single = await this.fetchOddsBatch([tournamentId]);
          if (single.kind === "ok") {
            await this.repo.upsertFixtures(single.rows);
            priced += await this.ingestFixtures(single.rows);
          } else if (single.kind === "restricted") {
            skipped += 1;
            stoppedReason = `Bookmaker "${this.sourceBookmaker}" is restricted on your OddsPapi plan — ${single.error}`;
            break;
          } else if (single.kind === "empty") {
            skipped += 1;
            consecutiveEmpty += 1;
          } else {
            failed += 1;
            logger.warn("Odds tournament failed; continuing", {
              tournamentId,
              error: single.error,
            });
          }
        }
        if (stoppedReason) break;
      } else {
        failed += 1;
        consecutiveEmpty = 0;
        logger.warn("Odds tournament failed; continuing", {
          tournamentId: batch[0],
          error: result.error,
        });
      }

      await options.onProgress?.({
        index,
        total: batches.length,
        tournamentId: batch[0]!,
        priced,
        skipped,
        failed,
      });

      if (stoppedReason) break;

      // Stop burning quota when the bookmaker keeps returning empty for this window.
      if (priced === 0 && consecutiveEmpty >= emptyStopAfter) {
        stoppedReason = `No odds from "${this.sourceBookmaker}" after ${consecutiveEmpty} empty tournament pulls — check SOURCE_BOOKMAKER on your OddsPapi plan`;
        logger.warn("Stopping odds sync early (repeated empty bookmaker responses)", {
          bookmaker: this.sourceBookmaker,
          tried: index,
          emptyStopAfter,
        });
        break;
      }
    }

    logger.info("Main odds sync complete", {
      tournaments: selected.length,
      batches: index,
      priced,
      skipped,
      failed,
      stoppedReason,
      bookmaker: this.sourceBookmaker,
      providerRequests: this.provider.requestsThisProcess,
    });

    return {
      priced,
      tournamentsTried: index,
      tournamentsSkipped: skipped,
      tournamentsFailed: failed,
      bookmaker: this.sourceBookmaker,
      stoppedReason,
    };
  }

  async refreshFixtureOdds(fixtureIds: string[]) {
    if (fixtureIds.length === 0) return 0;
    const rows = await this.provider.getMainOdds({
      fixtureIds: fixtureIds.join(","),
      bookmakers: this.sourceBookmaker,
    });
    await this.repo.upsertFixtures(rows);
    return this.ingestFixtures(rows);
  }

  async handleWsMessage(message: OddsPapiWsEnvelope) {
    if (message.type === "snapshot_required") {
      logger.warn("OddsPapi requested REST snapshot");
      return;
    }
    if (message.channel === "odds") {
      const payload = message.payload as { fixtureId?: string; odds?: OddsPapiFixture["odds"] } | undefined;
      if (!payload?.fixtureId || !payload.odds) return;
      const quotes = this.quotesFromBookmakerMap(payload.odds);
      await this.cache.write(payload.fixtureId, quotes);
      await redis.publish(CHANNELS.odds, JSON.stringify({ fixtureId: payload.fixtureId, quotes }));
    }
  }

  private async fetchOddsBatch(
    tournamentIds: number[],
  ): Promise<
    | { kind: "ok"; rows: OddsPapiFixture[] }
    | { kind: "empty" }
    | { kind: "restricted"; error: string }
    | { kind: "error"; error: string }
  > {
    try {
      const rows = await this.provider.getOddsByTournaments(tournamentIds, this.sourceBookmaker);
      if (!hasAnyOdds(rows)) return { kind: "empty" };
      return { kind: "ok", rows };
    } catch (error) {
      if (isRestrictedBookmaker(error)) {
        return {
          kind: "restricted",
          error: error instanceof Error ? error.message : "Bookmaker restricted",
        };
      }
      if (isEmptyTournamentError(error) || isInvalidBookmaker(error)) {
        return { kind: "empty" };
      }
      return {
        kind: "error",
        error: error instanceof Error ? error.message : "Odds request failed",
      };
    }
  }

  private extractQuotes(fixture: OddsPapiFixture) {
    const stale = fixture.bookmakers?.[this.sourceBookmaker]?.staleOdds === true;
    const suspended = fixture.bookmakers?.[this.sourceBookmaker]?.suspended === true;
    return this.quotesFromBookmakerMap(fixture.odds ?? {}, { stale, suspended });
  }

  private quotesFromBookmakerMap(
    odds: NonNullable<OddsPapiFixture["odds"]>,
    flags: { stale?: boolean; suspended?: boolean } = {},
  ): CachedQuote[] {
    const book = odds[this.sourceBookmaker] ?? firstBook(odds);
    if (!book) return [];
    return Object.values(book).map((quote) => this.toCachedQuote(quote, flags));
  }

  private toCachedQuote(quote: OddsPapiQuote, flags: { stale?: boolean; suspended?: boolean }): CachedQuote {
    const priced = this.pricing.price(quote.price, quote.active && !flags.suspended, {
      stale: flags.stale,
      marketActive: quote.marketActive,
    });
    return {
      outcomeId: quote.outcomeId,
      playerId: quote.playerId ?? 0,
      marketId: quote.marketId,
      sourcePrice: quote.price,
      housePrice: priced.housePrice,
      active: priced.active,
      changedAt: quote.changedAt,
    };
  }
}

function pickTournamentsForOdds(fixtures: OddsPapiFixture[], limit: number) {
  const byTournament = new Map<number, OddsPapiFixture[]>();
  for (const fixture of fixtures) {
    // Prefer pregame/live fixtures; skip finished/cancelled for odds pulls.
    if (fixture.status.statusId >= 2) continue;
    const list = byTournament.get(fixture.tournament.tournamentId) ?? [];
    list.push(fixture);
    byTournament.set(fixture.tournament.tournamentId, list);
  }

  const ranked = [...byTournament.entries()].sort((a, b) => {
    const aRank = tournamentPriority(a[1][0]!);
    const bRank = tournamentPriority(b[1][0]!);
    if (aRank !== bRank) return aRank - bRank;
    const aHas = a[1].filter((row) => row.hasOdds).length;
    const bHas = b[1].filter((row) => row.hasOdds).length;
    if (bHas !== aHas) return bHas - aHas;
    return b[1].length - a[1].length;
  });

  const withFlag = ranked.filter(([, rows]) => rows.some((row) => row.hasOdds));
  // Prefer hasOdds tournaments; if none flagged, still take the ranked pool (priority majors first).
  const pool = withFlag.length > 0 ? withFlag : ranked;
  const cap = limit > 0 ? limit : pool.length;
  return pool.slice(0, Math.max(1, cap)).map(([tournamentId]) => tournamentId);
}

/** Lower = higher priority for odds pulls. */
function tournamentPriority(fixture: OddsPapiFixture) {
  const name = `${fixture.tournament.categoryName ?? ""} ${fixture.tournament.tournamentName}`.toLowerCase();
  if (name.includes("england") && name.includes("premier league")) return 0;
  if (name.includes("champions league") || name.includes("europa league")) return 1;
  if (
    (name.includes("spain") && name.includes("laliga")) ||
    (name.includes("italy") && name.includes("serie a")) ||
    (name.includes("germany") && name.includes("bundesliga")) ||
    (name.includes("france") && name.includes("ligue 1"))
  ) {
    return 2;
  }
  return 10;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function firstBook(odds: NonNullable<OddsPapiFixture["odds"]>) {
  return Object.values(odds)[0];
}

function hasAnyOdds(fixtures: OddsPapiFixture[]) {
  return fixtures.some((fixture) => fixture.odds && Object.keys(fixture.odds).length > 0);
}

function isRestrictedBookmaker(error: unknown) {
  if (!(error instanceof ProviderError) || error.status !== 403) return false;
  const text = `${error.message} ${JSON.stringify(error.details ?? "")}`.toLowerCase();
  return text.includes("restricted") || text.includes("bookmaker");
}

function isInvalidBookmaker(error: unknown) {
  if (!(error instanceof ProviderError)) return false;
  if (error.status !== 400) return false;
  const text = `${error.message} ${JSON.stringify(error.details ?? "")}`.toLowerCase();
  return text.includes("bookmaker");
}

function isEmptyTournamentError(error: unknown) {
  if (!(error instanceof ProviderError)) return false;
  if (error.status !== 404) return false;
  const text = `${error.message} ${JSON.stringify(error.details ?? "")}`.toLowerCase();
  return (
    text.includes("no fixtures") ||
    text.includes("tournament") ||
    text.includes("not found") ||
    text.includes("bookmaker")
  );
}
