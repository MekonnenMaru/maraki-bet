import type { OddsByBookmaker, OddsPapiFixture, OddsPapiQuote, V4BookmakerOdds, V4Fixture } from "./types.js";

export function mapV4Fixture(row: V4Fixture): OddsPapiFixture {
  // Prefer trueStartTime when OddsPapi supplies the actual kickoff; both are UTC.
  const startTime = toEpochSeconds(row.trueStartTime ?? row.startTime);
  return {
    fixtureId: row.fixtureId,
    status: {
      live: row.statusId === 1,
      statusId: row.statusId,
      statusName: row.statusName ?? statusLabel(row.statusId),
    },
    sport: {
      sportId: row.sportId,
      sportName: row.sportName ?? `Sport ${row.sportId}`,
    },
    tournament: {
      tournamentId: row.tournamentId,
      tournamentName: row.tournamentName ?? `Tournament ${row.tournamentId}`,
      tournamentSlug: row.tournamentSlug,
      categoryName: row.categoryName ?? null,
      categorySlug: row.categorySlug ?? null,
    },
    season: { seasonId: row.seasonId ?? null, seasonName: null },
    venue: { venueName: null },
    startTime,
    participants: {
      participant1Id: row.participant1Id,
      participant1Name: row.participant1Name,
      participant1ShortName: row.participant1ShortName,
      participant1Abbr: row.participant1Abbr,
      participant2Id: row.participant2Id,
      participant2Name: row.participant2Name,
      participant2ShortName: row.participant2ShortName,
      participant2Abbr: row.participant2Abbr,
    },
    scores: {},
    clock: null,
    hasOdds: row.hasOdds === true,
    odds: mapV4Odds(row.fixtureId, row.bookmakerOdds),
    bookmakers: mapV4BookmakerMeta(row.bookmakerOdds),
  };
}

export function mapV4Odds(fixtureId: string, bookmakerOdds?: V4BookmakerOdds): OddsByBookmaker {
  const result: OddsByBookmaker = {};
  if (!bookmakerOdds) return result;

  for (const [bookmaker, pack] of Object.entries(bookmakerOdds)) {
    const quotes: Record<string, OddsPapiQuote> = {};
    for (const [marketId, market] of Object.entries(pack.markets ?? {})) {
      for (const [outcomeId, outcome] of Object.entries(market.outcomes ?? {})) {
        for (const [playerId, price] of Object.entries(outcome.players ?? {})) {
          if (price.price == null) continue;
          const quote: OddsPapiQuote = {
            bookmaker,
            outcomeId: Number(outcomeId),
            playerId: Number(playerId) || 0,
            price: price.price,
            active: price.active !== false && pack.suspended !== true,
            marketActive: market.marketActive ?? true,
            mainLine: price.mainLine ?? null,
            marketId: Number(marketId),
            changedAt: price.changedAt ? Date.parse(price.changedAt) : Date.now(),
            limit: price.limit ?? null,
          };
          quotes[`${fixtureId}:${bookmaker}:${quote.outcomeId}:${quote.playerId}`] = quote;
        }
      }
    }
    if (Object.keys(quotes).length > 0) result[bookmaker] = quotes;
  }
  return result;
}

function mapV4BookmakerMeta(bookmakerOdds?: V4BookmakerOdds) {
  if (!bookmakerOdds) return {};
  return Object.fromEntries(
    Object.entries(bookmakerOdds).map(([slug, pack]) => [
      slug,
      {
        bookmaker: slug,
        hasOdds: Boolean(pack.markets && Object.keys(pack.markets).length > 0),
        staleOdds: false,
        suspended: pack.suspended === true,
        participantsRotated: false,
      },
    ]),
  );
}

function toEpochSeconds(value: string | number) {
  if (typeof value === "number") {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : value;
  }
  return Math.floor(Date.parse(value) / 1000);
}

function statusLabel(statusId: number) {
  if (statusId === 1) return "Live";
  if (statusId === 2) return "Finished";
  if (statusId === 3) return "Cancelled";
  return "Pre-Game";
}
