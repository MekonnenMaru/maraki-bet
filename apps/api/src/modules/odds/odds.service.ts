import type { FixtureCardDto, FixtureDetailDto, MarketOddsDto, OutcomeQuoteDto } from "@maraki/shared";
import { prisma } from "../../lib/prisma.js";
import { toFixtureCard } from "../catalog/catalog.mapper.js";
import type { CatalogRepo } from "../catalog/catalog.repo.js";
import type { CatalogService } from "../catalog/catalog.service.js";
import type { OddsIngest } from "./odds.ingest.js";
import type { CachedQuote, OddsCache } from "./odds.cache.js";

/** Local Double Chance market (derived from FT 1X2 when provider has no DC quotes). */
export const DOUBLE_CHANCE_MARKET_ID = 10200;
const DC_OUTCOMES = {
  "1X": 10201,
  X2: 10202,
  "12": 10203,
} as const;

type OutcomeMeta = {
  id: number;
  name: string;
  market: { id: number; name: string; marketType: string; period: string | null };
};

export class OddsService {
  constructor(
    private readonly cache: OddsCache,
    private readonly catalog: CatalogService,
    private readonly repo: CatalogRepo,
    private readonly ingest?: OddsIngest,
  ) {}

  async attachMainMarkets(cards: FixtureCardDto[]): Promise<FixtureCardDto[]> {
    const quotes = await this.cache.readMany(cards.map((card) => card.id));
    const outcomeIds = [...quotes.values()].flat().map((quote) => quote.outcomeId);
    const outcomes = await this.repo.getOutcomesByIds([...new Set(outcomeIds)]);
    const names = new Map(outcomes.map((row) => [row.id, row]));

    const derivedToCache: Array<{ fixtureId: string; quotes: CachedQuote[] }> = [];

    const attached = cards.map((card) => {
      const priced = quotes.get(card.id) ?? [];
      const mainMarket = orderBoardOutcomes(pickMainMarket(card.sportId, priced, names));
      let doubleChance = normalizeDoubleChance(orderDoubleChance(pickDoubleChance(priced, names)));
      let derivedQuotes: CachedQuote[] = [];
      // Fill from 1X2 when provider DC is missing or incomplete (common: only "12", or "2X" naming).
      if (mainMarket && !isCompleteDoubleChance(doubleChance)) {
        const derived = deriveDoubleChanceFromMain(mainMarket);
        if (derived) {
          const before = new Set(
            (doubleChance?.outcomes ?? [])
              .filter((o) => o.active && o.housePrice > 1)
              .map((o) => normalizeDcCode(o.name)),
          );
          doubleChance = mergeDoubleChance(doubleChance, derived.market);
          derivedQuotes = derived.quotes.filter((quote) => {
            const name = Object.entries(DC_OUTCOMES).find(([, id]) => id === quote.outcomeId)?.[0];
            return name ? !before.has(name) : true;
          });
          if (derivedQuotes.length > 0) {
            derivedToCache.push({ fixtureId: card.id, quotes: derivedQuotes });
          }
        }
      }
      const activeLines = [...priced, ...derivedQuotes].filter(
        (quote) => quote.active && quote.housePrice > 1,
      ).length;
      return {
        ...card,
        mainMarket,
        doubleChance,
        // Abol-style badge: count priced outcome lines, not unique market IDs.
        extraMarkets: activeLines,
      };
    });

    if (derivedToCache.length > 0) {
      await this.ensureDoubleChanceMarket();
      await Promise.all(
        derivedToCache.map(async ({ fixtureId, quotes: dcQuotes }) => {
          const existing = quotes.get(fixtureId) ?? [];
          // Keep provider DC + any previously derived lines; upsert by outcomeId.
          const byOutcome = new Map<number, CachedQuote>();
          for (const quote of existing) byOutcome.set(quote.outcomeId, quote);
          for (const quote of dcQuotes) byOutcome.set(quote.outcomeId, quote);
          await this.cache.write(fixtureId, [...byOutcome.values()]);
        }),
      );
    }

    return attached.sort((a, b) => Number(Boolean(b.mainMarket)) - Number(Boolean(a.mainMarket)));
  }

  async listPricedFixtureIds() {
    return this.cache.listPricedFixtureIds();
  }

  /**
   * Read cached board odds only. Never calls OddsPapi — sync is admin-dashboard only.
   */
  async hydrateBoardOdds(fixtureIds: string[]): Promise<FixtureCardDto[]> {
    const unique = [...new Set(fixtureIds.filter(Boolean))].slice(0, 120);
    if (unique.length === 0) return [];

    const fixtures = await prisma.fixture.findMany({
      where: { id: { in: unique } },
      include: {
        sport: true,
        tournament: true,
        home: true,
        away: true,
      },
    });
    const cards = fixtures.map((row) => toFixtureCard(row));
    const attached = await this.attachMainMarkets(cards);
    return attached.filter((card) => card.mainMarket || card.status === "live");
  }

  async getFixtureDetail(id: string): Promise<FixtureDetailDto> {
    const row = await this.catalog.getFixtureRow(id);
    const card = toFixtureCard(row);
    const priced = await this.cache.read(id);
    const [withMain] = await this.attachMainMarkets([card]);
    const markets = await this.groupMarkets(await this.cache.read(id));
    const scores = Array.isArray(row.scoresJson)
      ? (row.scoresJson as { period: string; home: number; away: number }[])
      : [];

    return {
      ...withMain,
      scores,
      markets,
    };
  }

  async quotesForFixture(fixtureId: string) {
    return this.enrichQuotes(await this.cache.read(fixtureId));
  }

  private async ensureDoubleChanceMarket() {
    await prisma.market.upsert({
      where: { id: DOUBLE_CHANCE_MARKET_ID },
      create: {
        id: DOUBLE_CHANCE_MARKET_ID,
        sportId: 10,
        name: "Double Chance",
        nameShort: "DC",
        marketType: "doublechance",
        period: "fulltime",
        handicap: 0,
        marketLength: 3,
        playerProp: false,
      },
      update: {
        name: "Double Chance",
        marketType: "doublechance",
        period: "fulltime",
      },
    });
    for (const [name, id] of Object.entries(DC_OUTCOMES)) {
      await prisma.outcome.upsert({
        where: { id },
        create: { id, marketId: DOUBLE_CHANCE_MARKET_ID, name },
        update: { name, marketId: DOUBLE_CHANCE_MARKET_ID },
      });
    }
  }

  private async groupMarkets(quotes: CachedQuote[]): Promise<MarketOddsDto[]> {
    const enriched = await this.enrichQuotes(quotes);
    const groups = new Map<number, MarketOddsDto>();
    const markets = await this.repo.getMarketsByIds([...new Set(quotes.map((quote) => quote.marketId))]);
    const marketMap = new Map(markets.map((market) => [market.id, market]));

    for (const quote of enriched) {
      const market = marketMap.get(quote.marketId);
      const current = groups.get(quote.marketId) ?? {
        marketId: quote.marketId,
        name: market?.name ?? `Market ${quote.marketId}`,
        nameShort: market?.nameShort ?? null,
        marketType: market?.marketType ?? "unknown",
        period: market?.period ?? null,
        handicap: market?.handicap != null ? Number(market.handicap) : null,
        playerProp: market?.playerProp ?? false,
        outcomes: [],
      };
      current.outcomes.push(quote);
      groups.set(quote.marketId, current);
    }

    return [...groups.values()].sort((a, b) => preferredMarketRank(a) - preferredMarketRank(b));
  }

  private async enrichQuotes(quotes: CachedQuote[]): Promise<OutcomeQuoteDto[]> {
    const outcomes = await this.repo.getOutcomesByIds([...new Set(quotes.map((quote) => quote.outcomeId))]);
    const names = new Map(outcomes.map((row) => [row.id, row.name]));
    return quotes.map((quote) => ({
      ...quote,
      name:
        names.get(quote.outcomeId) ??
        (quote.marketId === DOUBLE_CHANCE_MARKET_ID
          ? Object.entries(DC_OUTCOMES).find(([, id]) => id === quote.outcomeId)?.[0] ?? String(quote.outcomeId)
          : String(quote.outcomeId)),
    }));
  }
}

function pickMainMarket(
  sportId: number,
  quotes: CachedQuote[],
  names: Map<number, OutcomeMeta>,
): FixtureCardDto["mainMarket"] {
  if (quotes.length === 0) return null;
  const grouped = new Map<number, CachedQuote[]>();
  for (const quote of quotes) {
    if (quote.marketId === DOUBLE_CHANCE_MARKET_ID) continue;
    const list = grouped.get(quote.marketId) ?? [];
    list.push(quote);
    grouped.set(quote.marketId, list);
  }

  const ranked = [...grouped.entries()].sort((a, b) => {
    const aMeta = names.get(a[1][0]?.outcomeId ?? 0)?.market;
    const bMeta = names.get(b[1][0]?.outcomeId ?? 0)?.market;
    return (
      marketScore(sportId, aMeta?.marketType, aMeta?.period, a[1].length) -
      marketScore(sportId, bMeta?.marketType, bMeta?.period, b[1].length)
    );
  });

  const [marketId, outcomes] = ranked[0] ?? [];
  if (!marketId || !outcomes) return null;
  const meta = names.get(outcomes[0].outcomeId)?.market;
  return {
    marketId,
    name: meta?.name ?? (sportId === 10 ? "1X2" : "Winner"),
    marketType: meta?.marketType ?? "unknown",
    outcomes: outcomes.map((quote) => ({
      ...quote,
      name: names.get(quote.outcomeId)?.name ?? String(quote.outcomeId),
    })),
  };
}

function pickDoubleChance(
  quotes: CachedQuote[],
  names: Map<number, OutcomeMeta>,
): FixtureCardDto["doubleChance"] {
  const grouped = new Map<number, CachedQuote[]>();
  for (const quote of quotes) {
    const meta = names.get(quote.outcomeId)?.market;
    const label = `${meta?.marketType ?? ""} ${meta?.name ?? ""}`.toLowerCase();
    const isDc =
      quote.marketId === DOUBLE_CHANCE_MARKET_ID ||
      /double\s*chance|doublechance/.test(label);
    if (!isDc) continue;
    if (meta?.period && meta.period !== "fulltime" && meta.period !== "result") continue;
    const list = grouped.get(quote.marketId) ?? [];
    list.push(quote);
    grouped.set(quote.marketId, list);
  }
  const [marketId, outcomes] = [...grouped.entries()].sort((a, b) => {
    const complete = (list: CachedQuote[]) => {
      const codes = new Set(
        list
          .filter((q) => q.active && q.housePrice > 1)
          .map((q) => normalizeDcCode(names.get(q.outcomeId)?.name ?? "")),
      );
      return Number(codes.has("1X") && codes.has("X2") && codes.has("12"));
    };
    const byComplete = complete(b[1]) - complete(a[1]);
    if (byComplete !== 0) return byComplete;
    return b[1].length - a[1].length;
  })[0] ?? [];
  if (!marketId || !outcomes?.length) return null;
  const meta = names.get(outcomes[0].outcomeId)?.market;
  return {
    marketId,
    name: meta?.name ?? "Double Chance",
    marketType: meta?.marketType ?? "doublechance",
    outcomes: outcomes.map((quote) => ({
      ...quote,
      name: names.get(quote.outcomeId)?.name ?? String(quote.outcomeId),
    })),
  };
}

function deriveDoubleChanceFromMain(main: NonNullable<FixtureCardDto["mainMarket"]>) {
  const one = main.outcomes.find((item) => /^1$|^home$/i.test(item.name.trim()));
  const draw = main.outcomes.find((item) => /^x$|^draw$/i.test(item.name.trim()));
  const two = main.outcomes.find((item) => /^2$|^away$/i.test(item.name.trim()));
  if (!one || !draw || !two) return null;
  if (!(one.housePrice > 1 && draw.housePrice > 1 && two.housePrice > 1)) return null;
  if (!(one.active && draw.active && two.active)) return null;

  const p1 = 1 / one.housePrice;
  const px = 1 / draw.housePrice;
  const p2 = 1 / two.housePrice;
  const changedAt = Math.max(one.changedAt, draw.changedAt, two.changedAt, Date.now());

  const mk = (name: keyof typeof DC_OUTCOMES, prob: number): OutcomeQuoteDto => {
    const housePrice = round2(Math.max(1.01, 1 / prob));
    return {
      outcomeId: DC_OUTCOMES[name],
      playerId: 0,
      marketId: DOUBLE_CHANCE_MARKET_ID,
      name,
      sourcePrice: housePrice,
      housePrice,
      active: true,
      changedAt,
    };
  };

  const outcomes = [mk("1X", p1 + px), mk("X2", px + p2), mk("12", p1 + p2)];
  return {
    market: {
      marketId: DOUBLE_CHANCE_MARKET_ID,
      name: "Double Chance",
      marketType: "doublechance",
      outcomes,
    } satisfies NonNullable<FixtureCardDto["doubleChance"]>,
    quotes: outcomes.map(({ name: _name, ...quote }) => quote),
  };
}

function marketScore(sportId: number, type?: string, period?: string | null, length = 0) {
  const soccerMain = sportId === 10 && type === "1x2" && (period === "fulltime" || period === "result");
  const moneyline = type === "moneyline" || type === "1x2";
  if (soccerMain) return 0;
  if (moneyline) return 1;
  return 10 + Math.abs(3 - length);
}

function orderBoardOutcomes(market: FixtureCardDto["mainMarket"]): FixtureCardDto["mainMarket"] {
  if (!market) return null;
  const rank = (name: string) => {
    const key = name.trim().toUpperCase();
    if (key === "1" || key === "HOME") return 0;
    if (key === "X" || key === "DRAW") return 1;
    if (key === "2" || key === "AWAY") return 2;
    return 9;
  };
  return {
    ...market,
    outcomes: [...market.outcomes].sort((a, b) => rank(a.name) - rank(b.name)),
  };
}

function orderDoubleChance(market: FixtureCardDto["doubleChance"]): FixtureCardDto["doubleChance"] {
  if (!market) return null;
  const rank = (name: string) => {
    const key = normalizeDcCode(name);
    if (key === "1X") return 0;
    if (key === "X2") return 1;
    if (key === "12") return 2;
    return 9;
  };
  return {
    ...market,
    outcomes: [...market.outcomes].sort((a, b) => rank(a.name) - rank(b.name)),
  };
}

function normalizeDcCode(name: string) {
  const key = name.trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
  if (key === "1X" || key === "X1" || key === "10" || key.includes("HOMEDRAW") || key.includes("DRAWORHOME")) {
    return "1X";
  }
  if (key === "X2" || key === "2X" || key.includes("DRAWAWAY") || key.includes("AWAYORDRAW")) {
    return "X2";
  }
  if (key === "12" || key === "21" || key.includes("HOMEAWAY") || key.includes("AWAYORHOME")) {
    return "12";
  }
  return key;
}

function normalizeDoubleChance(market: FixtureCardDto["doubleChance"]): FixtureCardDto["doubleChance"] {
  if (!market) return null;
  return {
    ...market,
    outcomes: market.outcomes.map((outcome) => {
      const code = normalizeDcCode(outcome.name);
      return code === "1X" || code === "X2" || code === "12" ? { ...outcome, name: code } : outcome;
    }),
  };
}

function isCompleteDoubleChance(market: FixtureCardDto["doubleChance"]) {
  if (!market?.outcomes?.length) return false;
  const codes = new Set(
    market.outcomes
      .filter((outcome) => outcome.active && outcome.housePrice > 1)
      .map((outcome) => normalizeDcCode(outcome.name)),
  );
  return codes.has("1X") && codes.has("X2") && codes.has("12");
}

function mergeDoubleChance(
  existing: FixtureCardDto["doubleChance"],
  derived: NonNullable<FixtureCardDto["doubleChance"]>,
): NonNullable<FixtureCardDto["doubleChance"]> {
  if (!existing) return derived;
  const byCode = new Map<string, OutcomeQuoteDto>();
  for (const outcome of existing.outcomes) {
    const code = normalizeDcCode(outcome.name);
    if ((code === "1X" || code === "X2" || code === "12") && outcome.active && outcome.housePrice > 1) {
      byCode.set(code, { ...outcome, name: code });
    }
  }
  for (const outcome of derived.outcomes) {
    if (!byCode.has(outcome.name)) byCode.set(outcome.name, outcome);
  }
  return {
    marketId: DOUBLE_CHANCE_MARKET_ID,
    name: "Double Chance",
    marketType: "doublechance",
    outcomes: ["1X", "X2", "12"].map((code) => byCode.get(code)!).filter(Boolean),
  };
}

function preferredMarketRank(market: MarketOddsDto) {
  if (market.marketType === "1x2" && (market.period === "fulltime" || market.period === "result")) return 0;
  if (market.marketType === "doublechance" || /double\s*chance/i.test(market.name)) return 1;
  if (market.marketType === "moneyline") return 2;
  if (market.marketType === "bothteamsscore") return 3;
  if (market.marketType === "totals") return 4;
  if (market.marketType === "drawnobet") return 5;
  return 20;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
