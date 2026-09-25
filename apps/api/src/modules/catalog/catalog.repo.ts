import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type {
  OddsPapiBookmaker,
  OddsPapiFixture,
  OddsPapiMarket,
  OddsPapiSport,
  OddsPapiTournament,
} from "../oddspapi/types.js";
import {
  extractClock,
  extractScores,
  participantsFromFixture,
  slugify,
  startTimeFromEpoch,
} from "./catalog.mapper.js";

export class CatalogRepo {
  async upsertSports(sports: OddsPapiSport[]) {
    const now = new Date();
    for (const sport of sports) {
      await prisma.sport.upsert({
        where: { id: sport.sportId },
        create: {
          id: sport.sportId,
          slug: sport.slug ?? sport.sportSlug ?? slugify(sport.sportName),
          name: sport.sportName,
          provider: "oddspapi",
          lastSyncedAt: now,
        },
        update: {
          slug: sport.slug ?? sport.sportSlug ?? slugify(sport.sportName),
          name: sport.sportName,
          lastSyncedAt: now,
        },
      });
    }
  }

  async upsertTournaments(tournaments: OddsPapiTournament[]) {
    const now = new Date();
    for (const tournament of tournaments) {
      const slug = `${tournament.tournamentSlug ?? slugify(tournament.tournamentName)}-${tournament.tournamentId}`;
      await prisma.tournament.upsert({
        where: { id: tournament.tournamentId },
        create: {
          id: tournament.tournamentId,
          sportId: tournament.sportId,
          slug,
          name: tournament.tournamentName,
          categorySlug: tournament.categorySlug ?? null,
          categoryName: tournament.categoryName ?? null,
          provider: "oddspapi",
          lastSyncedAt: now,
        },
        update: {
          sportId: tournament.sportId,
          slug,
          name: tournament.tournamentName,
          categorySlug: tournament.categorySlug ?? null,
          categoryName: tournament.categoryName ?? null,
          lastSyncedAt: now,
        },
      });
    }
  }

  async upsertMarkets(markets: OddsPapiMarket[]) {
    const now = new Date();
    for (const chunk of chunked(markets, 50)) {
      await prisma.$transaction(
        chunk.map((market) =>
          prisma.market.upsert({
            where: { id: market.marketId },
            create: {
              id: market.marketId,
              provider: "oddspapi",
              sportId: market.sportId ?? inferSportId(market.marketId),
              name: market.marketName ?? `Market ${market.marketId}`,
              nameShort: market.marketNameShort ?? null,
              marketType: market.marketType ?? "unknown",
              period: market.period ?? null,
              handicap: market.handicap ?? null,
              marketLength: market.marketLength ?? null,
              playerProp: market.playerProp ?? false,
              lastSyncedAt: now,
            },
            update: {
              name: market.marketName ?? `Market ${market.marketId}`,
              nameShort: market.marketNameShort ?? null,
              marketType: market.marketType ?? "unknown",
              period: market.period ?? null,
              handicap: market.handicap ?? null,
              marketLength: market.marketLength ?? null,
              playerProp: market.playerProp ?? false,
              lastSyncedAt: now,
            },
          }),
        ),
      );

      const outcomes = chunk.flatMap(
        (market) =>
          market.outcomes?.map((outcome) => ({
            id: outcome.outcomeId,
            marketId: market.marketId,
            name: outcome.outcomeName ?? String(outcome.outcomeId),
            provider: "oddspapi" as const,
            lastSyncedAt: now,
          })) ?? [],
      );

      for (const piece of chunked(outcomes, 80)) {
        await prisma.$transaction(
          piece.map((outcome) =>
            prisma.outcome.upsert({
              where: { id: outcome.id },
              create: outcome,
              update: {
                name: outcome.name,
                marketId: outcome.marketId,
                lastSyncedAt: now,
              },
            }),
          ),
        );
      }
    }
  }

  async seedCoreMarkets(sportId: number) {
    if (sportId !== 10) return;
    await this.upsertMarkets(SOCCER_CORE_MARKETS);
  }

  async upsertBookmakers(bookmakers: OddsPapiBookmaker[]) {
    for (const bookmaker of bookmakers) {
      await prisma.bookmaker.upsert({
        where: { slug: bookmaker.slug },
        create: {
          slug: bookmaker.slug,
          name: bookmaker.bookmakerName,
          active: bookmaker.active,
          wsPregame: bookmaker.websocketPregame ?? null,
          wsLive: bookmaker.websocketLive ?? null,
        },
        update: {
          name: bookmaker.bookmakerName,
          active: bookmaker.active,
          wsPregame: bookmaker.websocketPregame ?? null,
          wsLive: bookmaker.websocketLive ?? null,
        },
      });
    }
  }

  async upsertFixtures(fixtures: OddsPapiFixture[]) {
    const now = new Date();
    for (const fixture of fixtures) {
      await this.ensureSportAndTournament(fixture);
      const people = participantsFromFixture(fixture.participants);
      for (const person of people) {
        await prisma.participant.upsert({
          where: { id: person.id },
          create: { ...person, provider: "oddspapi", lastSyncedAt: now },
          update: isPlaceholderName(person.name)
            ? { shortName: person.shortName, abbr: person.abbr, lastSyncedAt: now }
            : {
                name: person.name,
                shortName: person.shortName,
                abbr: person.abbr,
                lastSyncedAt: now,
              },
        });
      }

      const scores = extractScores(fixture.scores);
      const statusId = Number.isFinite(fixture.status?.statusId) ? Number(fixture.status.statusId) : 0;
      await prisma.fixture.upsert({
        where: { id: fixture.fixtureId },
        create: {
          id: fixture.fixtureId,
          provider: "oddspapi",
          sportId: fixture.sport.sportId,
          tournamentId: fixture.tournament.tournamentId,
          seasonId: fixture.season?.seasonId ?? null,
          seasonName: fixture.season?.seasonName ?? null,
          homeId: fixture.participants.participant1Id,
          awayId: fixture.participants.participant2Id,
          startTime: startTimeFromEpoch(fixture.startTime),
          statusId,
          statusName: fixture.status?.statusName ?? null,
          venueName: fixture.venue?.venueName ?? null,
          homeScore: scores.homeScore,
          awayScore: scores.awayScore,
          scoresJson: scores.scoresJson as Prisma.InputJsonValue,
          clockJson: extractClock(fixture.clock) as Prisma.InputJsonValue,
          lastSyncedAt: now,
        },
        update: {
          statusId,
          statusName: fixture.status?.statusName ?? null,
          startTime: startTimeFromEpoch(fixture.startTime),
          venueName: fixture.venue?.venueName ?? null,
          homeScore: scores.homeScore,
          awayScore: scores.awayScore,
          scoresJson: scores.scoresJson as Prisma.InputJsonValue,
          clockJson: extractClock(fixture.clock) as Prisma.InputJsonValue,
          seasonName: fixture.season?.seasonName ?? null,
          lastSyncedAt: now,
        },
      });
    }
  }

  async setState(key: string, value: string) {
    await prisma.syncState.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  async getState(key: string) {
    const row = await prisma.syncState.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async listSports() {
    return prisma.sport.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
    });
  }

  async getSport(idOrSlug: string) {
    const numeric = Number(idOrSlug);
    return prisma.sport.findFirst({
      where: Number.isInteger(numeric)
        ? { OR: [{ id: numeric }, { slug: idOrSlug }] }
        : { slug: idOrSlug },
    });
  }

  async listTournaments(sportId: number) {
    return prisma.tournament.findMany({
      where: { sportId, enabled: true },
      orderBy: [{ categoryName: "asc" }, { name: "asc" }],
    });
  }

  async listFixtures(filters: {
    sportId?: number;
    tournamentId?: number;
    tournamentIds?: number[];
    statusId?: number;
    excludeSettled?: boolean;
    upcomingOnly?: boolean;
    liveOnly?: boolean;
    boardVisibleOnly?: boolean;
    /** When set, only these fixture IDs (e.g. Redis-priced) are considered. */
    fixtureIds?: string[];
    from?: Date;
    to?: Date;
    take?: number;
  }) {
    const now = new Date();
    let statusFilter: number | { in: number[] } | undefined = filters.statusId;
    let from = filters.from;

    if (filters.upcomingOnly) {
      // Pregame only, kickoff still in the future.
      statusFilter = 0;
      from = !from || from < now ? now : from;
    } else if (filters.liveOnly) {
      statusFilter = 1;
    } else if (filters.excludeSettled && statusFilter == null) {
      statusFilter = { in: [0, 1] };
    }

    const pricedIds = filters.fixtureIds?.filter(Boolean);
    if (pricedIds && pricedIds.length === 0) {
      return [];
    }

    const tournamentIds = [...new Set((filters.tournamentIds ?? []).filter((id) => Number.isFinite(id) && id > 0))];
    if (filters.tournamentId && !tournamentIds.includes(filters.tournamentId)) {
      tournamentIds.push(filters.tournamentId);
    }
    const tournamentFilter =
      tournamentIds.length === 0 ? undefined : tournamentIds.length === 1 ? tournamentIds[0] : { in: tournamentIds };

    // Prefer priced IDs for the public board; otherwise keep a high ceiling so
    // later leagues are not truncated by early unpriced kickoffs.
    const take =
      filters.take ??
      (pricedIds ? Math.min(pricedIds.length, 2500) : tournamentFilter != null ? 500 : 1500);

    return prisma.fixture.findMany({
      where: {
        id: pricedIds ? { in: pricedIds } : undefined,
        sportId: filters.sportId,
        tournamentId: tournamentFilter,
        statusId: statusFilter,
        startTime: {
          gte: from,
          lte: filters.to,
        },
        ...(filters.boardVisibleOnly
          ? {
              visible: true,
              bettingEnabled: true,
              sport: { enabled: true, visible: true },
              tournament: { enabled: true, visible: true },
            }
          : {}),
      },
      include: {
        sport: true,
        tournament: true,
        home: true,
        away: true,
      },
      orderBy: [{ startTime: "asc" }],
      take,
    });
  }

  async getFixture(id: string) {
    return prisma.fixture.findUnique({
      where: { id },
      include: {
        sport: true,
        tournament: true,
        home: true,
        away: true,
      },
    });
  }

  async getOutcomesByIds(ids: number[]) {
    if (ids.length === 0) return [];
    return prisma.outcome.findMany({
      where: { id: { in: ids } },
      include: { market: true },
    });
  }

  async getMarketsByIds(ids: number[]) {
    if (ids.length === 0) return [];
    return prisma.market.findMany({
      where: { id: { in: ids } },
      include: { outcomes: true },
    });
  }

  private async ensureSportAndTournament(fixture: OddsPapiFixture) {
    const now = new Date();
    await prisma.sport.upsert({
      where: { id: fixture.sport.sportId },
      create: {
        id: fixture.sport.sportId,
        provider: "oddspapi",
        slug: fixture.sport.slug ?? slugify(fixture.sport.sportName),
        name: fixture.sport.sportName,
        lastSyncedAt: now,
      },
      update: { name: fixture.sport.sportName, lastSyncedAt: now },
    });

    await prisma.tournament.upsert({
      where: { id: fixture.tournament.tournamentId },
      create: {
        id: fixture.tournament.tournamentId,
        provider: "oddspapi",
        sportId: fixture.sport.sportId,
        slug: `${fixture.tournament.tournamentSlug ?? slugify(fixture.tournament.tournamentName)}-${fixture.tournament.tournamentId}`,
        name: fixture.tournament.tournamentName,
        categorySlug: fixture.tournament.categorySlug ?? null,
        lastSyncedAt: now,
        categoryName: fixture.tournament.categoryName ?? null,
      },
      update: {
        name: fixture.tournament.tournamentName,
        categoryName: fixture.tournament.categoryName ?? null,
        lastSyncedAt: now,
      },
    });
  }
}

function inferSportId(marketId: number) {
  return Number(String(marketId).slice(0, 2));
}

const SOCCER_CORE_MARKETS: OddsPapiMarket[] = [
  {
    marketId: 101,
    sportId: 10,
    marketName: "Full Time Result",
    marketNameShort: "1X2",
    marketType: "1x2",
    period: "fulltime",
    handicap: 0,
    marketLength: 3,
    playerProp: false,
    outcomes: [
      { outcomeId: 101, outcomeName: "1" },
      { outcomeId: 102, outcomeName: "X" },
      { outcomeId: 103, outcomeName: "2" },
    ],
  },
  {
    marketId: 10200,
    sportId: 10,
    marketName: "Double Chance",
    marketNameShort: "DC",
    marketType: "doublechance",
    period: "fulltime",
    handicap: 0,
    marketLength: 3,
    playerProp: false,
    outcomes: [
      { outcomeId: 10201, outcomeName: "1X" },
      { outcomeId: 10202, outcomeName: "X2" },
      { outcomeId: 10203, outcomeName: "12" },
    ],
  },
  {
    marketId: 104,
    sportId: 10,
    marketName: "Both Teams To Score",
    marketNameShort: "BTTS",
    marketType: "bothteamsscore",
    period: "fulltime",
    handicap: 0,
    marketLength: 2,
    playerProp: false,
    outcomes: [
      { outcomeId: 104, outcomeName: "Yes" },
      { outcomeId: 105, outcomeName: "No" },
    ],
  },
  {
    marketId: 1010,
    sportId: 10,
    marketName: "Over Under 2.5",
    marketNameShort: "O/U 2.5",
    marketType: "totals",
    period: "fulltime",
    handicap: 2.5,
    marketLength: 2,
    playerProp: false,
    outcomes: [
      { outcomeId: 1010, outcomeName: "Over" },
      { outcomeId: 1011, outcomeName: "Under" },
    ],
  },
];

function isPlaceholderName(name: string) {
  return /^Team \d+$/.test(name);
}

function chunked<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
