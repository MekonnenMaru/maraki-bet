import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { OddsPapiHttpClient } from "../oddspapi/http-client.js";
import type { OddsPapiFixture } from "../oddspapi/types.js";
import type { CatalogRepo } from "./catalog.repo.js";

export type CatalogSyncOptions = {
  force?: boolean;
  sportIds?: number[];
  tournamentId?: number;
  fixtureId?: string;
  /** When set, only these catalog slices hit OddsPapi. */
  include?: {
    sports?: boolean;
    tournaments?: boolean;
    markets?: boolean;
  };
};

export class CatalogSync {
  constructor(
    private readonly provider: OddsPapiHttpClient,
    private readonly repo: CatalogRepo,
  ) {}

  async syncCatalog(options: CatalogSyncOptions = {}) {
    const sportIds = options.sportIds?.length ? options.sportIds : env.SPORT_IDS;
    const include = options.include
      ? {
          sports: Boolean(options.include.sports),
          tournaments: Boolean(options.include.tournaments),
          markets: Boolean(options.include.markets),
        }
      : { sports: true, tournaments: true, markets: true };

    if (!include.sports && !include.tournaments && !include.markets) {
      return { skipped: true as const, reason: "nothing-selected" as const, sports: 0, tournaments: 0, markets: 0 };
    }

    const last = await this.repo.getState("catalogSyncedAt");
    if (!options.force && last && Date.now() - Number(last) < 6 * 60 * 60 * 1000) {
      logger.info("Skipping catalog sync; still fresh", { last });
      return { skipped: true as const, reason: "fresh" as const, sports: 0, tournaments: 0, markets: 0 };
    }

    let sportsCount = 0;
    let tournamentCount = 0;
    let marketCount = 0;

    if (include.sports) {
      const sports = await this.provider.getSports(sportIds);
      const tracked = sports.filter((sport) => sportIds.includes(sport.sportId));
      await this.repo.upsertSports(tracked);
      sportsCount = tracked.length || sportIds.length;
    }

    if (include.markets) {
      // One /markets call for all sports (Cloudflare-friendly), then filter per sport.
      const providerMarkets = await this.provider.getMarkets();
      for (const sportId of sportIds) {
        const markets = providerMarkets.filter((market) => !market.sportId || market.sportId === sportId);
        if (markets.length > 0) {
          await this.repo.upsertMarkets(markets);
          marketCount += markets.length;
        } else {
          await this.repo.seedCoreMarkets(sportId);
          if (sportId === 10) marketCount += 3;
        }
      }
    }

    if (include.tournaments) {
      for (const sportId of sportIds) {
        try {
          const tournaments = await this.provider.getTournaments(sportId);
          // Persist the full list from this already-paid /tournaments call.
          // Filtering to "live/soon only" previously dropped major leagues
          // (e.g. England Premier League) whenever they had no match that day.
          const selected = options.tournamentId
            ? tournaments.filter((row) => row.tournamentId === options.tournamentId)
            : tournaments;
          await this.repo.upsertTournaments(selected);
          tournamentCount += selected.length;
        } catch (error) {
          logger.warn("Tournament sync failed for sport; continuing", {
            sportId,
            message: error instanceof Error ? error.message : error,
          });
        }
      }
    }

    if (include.sports || include.tournaments || include.markets) {
      await this.repo.upsertBookmakers([
        { slug: env.SOURCE_BOOKMAKER, bookmakerName: env.SOURCE_BOOKMAKER, active: true },
      ]);
    }

    // Only stamp full-catalog freshness when the full catalog was pulled.
    if (include.sports && include.tournaments && include.markets) {
      await this.repo.setState("catalogSyncedAt", String(Date.now()));
    }

    logger.info("Catalog sync complete", {
      sports: sportsCount,
      tournaments: tournamentCount,
      markets: marketCount,
      include,
      providerRequests: this.provider.requestsThisProcess,
    });

    return {
      skipped: false as const,
      sports: sportsCount,
      tournaments: tournamentCount,
      markets: marketCount,
    };
  }

  async syncFixtures(options: CatalogSyncOptions = {}) {
    const sportIds = options.sportIds?.length ? options.sportIds : env.SPORT_IDS;
    const last = await this.repo.getState("fixturesSyncedAt");
    if (!options.force && !options.fixtureId && !options.tournamentId && last && Date.now() - Number(last) < 15 * 60 * 1000) {
      logger.info("Skipping fixture provider sync; catalog already loaded");
      return [];
    }

    const fixtures: OddsPapiFixture[] = [];
    const days = Math.min(60, Math.max(1, env.FIXTURE_SYNC_DAYS));

    if (options.fixtureId) {
      const rows = await this.provider.getMainOdds({
        fixtureIds: options.fixtureId,
        bookmakers: env.SOURCE_BOOKMAKER,
      });
      fixtures.push(...rows);
    } else if (options.tournamentId) {
      // tournamentId alone returns that league's fixtures (no date cap).
      const rows = await this.provider.getFixturesUpcoming({
        tournamentId: options.tournamentId,
      });
      fixtures.push(...rows);
    } else {
      for (const sportId of sportIds) {
        try {
          const upcoming = await this.provider.getFixturesUpcoming({ sportId }, days);
          fixtures.push(...upcoming);
          const byTournament = new Map<string, number>();
          for (const row of upcoming) {
            const key = `${row.tournament.tournamentName} (${row.tournament.categoryName ?? "?"})`;
            byTournament.set(key, (byTournament.get(key) ?? 0) + 1);
          }
          const top = [...byTournament.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
          const englandPl = upcoming.filter(
            (row) =>
              /premier league/i.test(row.tournament.tournamentName) &&
              /england/i.test(row.tournament.categoryName ?? ""),
          );
          logger.info("Fixture pull for sport", {
            sportId,
            days,
            chunks: Math.ceil(days / 8),
            count: upcoming.length,
            englandPremierLeague: englandPl.length,
            withSeason: upcoming.filter((row) => row.season?.seasonId != null).length,
            withHasOdds: upcoming.filter((row) => row.hasOdds).length,
            topTournaments: top.map(([name, count]) => `${count}× ${name}`),
          });
        } catch (error) {
          logger.warn("Fixture sync failed for sport; continuing", {
            sportId,
            message: error instanceof Error ? error.message : error,
          });
        }
      }
    }

    const unique = dedupeFixtures(fixtures);
    await this.repo.upsertFixtures(unique);
    if (!options.fixtureId && !options.tournamentId) {
      await this.repo.setState("fixturesSyncedAt", String(Date.now()));
    }
    logger.info("Fixture sync complete", {
      count: unique.length,
      days,
      seasons: new Set(unique.map((row) => row.season?.seasonId).filter(Boolean)).size,
    });
    return unique;
  }
}

function dedupeFixtures(fixtures: OddsPapiFixture[]) {
  const map = new Map<string, OddsPapiFixture>();
  for (const fixture of fixtures) map.set(fixture.fixtureId, fixture);
  return [...map.values()];
}
