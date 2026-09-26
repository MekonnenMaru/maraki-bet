import { prisma } from "../../lib/prisma.js";
import { redis } from "../../lib/redis.js";
import type { PricedQuote } from "../pricing/pricing.service.js";

export const CHANNELS = {
  odds: "maraki:odds",
  fixture: "maraki:fixture",
};

export type CachedQuote = PricedQuote;

const PRICED_INDEX = "odds:priced-ids";
/** Hot cache TTL — MySQL OddsSnapshot keeps last-known quotes after Redis expiry. */
const QUOTE_TTL_SEC = 60 * 60 * 48;

export class OddsCache {
  key(fixtureId: string) {
    return `odds:fixture:${fixtureId}`;
  }

  field(outcomeId: number, playerId: number) {
    return `${outcomeId}:${playerId}`;
  }

  async write(fixtureId: string, quotes: CachedQuote[]) {
    if (quotes.length === 0) return;
    await this.writeRedis(fixtureId, quotes);
    await this.persistSnapshot(fixtureId, quotes);
  }

  async read(fixtureId: string): Promise<CachedQuote[]> {
    const hot = await this.readRedis(fixtureId);
    if (hot.length > 0) return hot;

    const snapshot = await this.loadSnapshot(fixtureId);
    if (snapshot.length > 0) {
      await this.writeRedis(fixtureId, snapshot);
    }
    return snapshot;
  }

  async clearFixture(fixtureId: string) {
    await redis.pipeline().del(this.key(fixtureId)).srem(PRICED_INDEX, fixtureId).exec();
    await prisma.oddsSnapshot.deleteMany({ where: { fixtureId } });
  }

  async clearQuote(fixtureId: string, outcomeId: number, playerId = 0) {
    await redis.hdel(this.key(fixtureId), this.field(outcomeId, playerId));
    const remaining = await this.readRedis(fixtureId);
    if (remaining.length === 0) {
      // Prefer full snapshot reload + remove one field for admin single-quote delete.
      const snapshot = (await this.loadSnapshot(fixtureId)).filter(
        (quote) => !(quote.outcomeId === outcomeId && quote.playerId === playerId),
      );
      if (snapshot.length === 0) {
        await prisma.oddsSnapshot.deleteMany({ where: { fixtureId } });
        await redis.srem(PRICED_INDEX, fixtureId);
      } else {
        await this.write(fixtureId, snapshot);
      }
      return;
    }
    await this.persistSnapshot(fixtureId, remaining);
  }

  async clearAll() {
    const keys = await redis.keys("odds:fixture:*");
    if (keys.length === 0) {
      await redis.del(PRICED_INDEX);
    } else {
      await redis.del(...keys, PRICED_INDEX);
    }
    const deleted = await prisma.oddsSnapshot.deleteMany({});
    return Math.max(keys.length, deleted.count);
  }

  /**
   * Fixture IDs that currently have odds (Redis and/or durable snapshot).
   */
  async listPricedFixtureIds(): Promise<string[]> {
    const fromSet = await redis.smembers(PRICED_INDEX);
    if (fromSet.length > 0) return fromSet;

    const keys = await redis.keys("odds:fixture:*");
    const fromRedis = keys
      .map((key) => key.replace(/^odds:fixture:/, ""))
      .filter((id) => id.length > 0);
    if (fromRedis.length > 0) {
      const pipeline = redis.pipeline();
      for (let i = 0; i < fromRedis.length; i += 500) {
        pipeline.sadd(PRICED_INDEX, ...fromRedis.slice(i, i + 500));
      }
      await pipeline.exec();
      return fromRedis;
    }

    const snapshots = await prisma.oddsSnapshot.findMany({ select: { fixtureId: true } });
    const fromDb = snapshots.map((row) => row.fixtureId);
    if (fromDb.length > 0) {
      const pipeline = redis.pipeline();
      for (let i = 0; i < fromDb.length; i += 500) {
        pipeline.sadd(PRICED_INDEX, ...fromDb.slice(i, i + 500));
      }
      await pipeline.exec();
    }
    return fromDb;
  }

  async readMany(fixtureIds: string[]) {
    const result = new Map<string, CachedQuote[]>();
    if (fixtureIds.length === 0) return result;

    const pipeline = redis.pipeline();
    for (const id of fixtureIds) pipeline.hgetall(this.key(id));
    const rows = await pipeline.exec();
    const missing: string[] = [];

    fixtureIds.forEach((id, index) => {
      const [error, value] = rows?.[index] ?? [];
      if (error || !value || typeof value !== "object") {
        result.set(id, []);
        missing.push(id);
        return;
      }
      const quotes = Object.values(value as Record<string, string>).map(
        (item) => JSON.parse(item) as CachedQuote,
      );
      if (quotes.length === 0) missing.push(id);
      result.set(id, quotes);
    });

    if (missing.length === 0) return result;

    const snapshots = await prisma.oddsSnapshot.findMany({
      where: { fixtureId: { in: missing } },
    });
    for (const row of snapshots) {
      const quotes = parseQuotesJson(row.quotesJson);
      if (quotes.length === 0) continue;
      result.set(row.fixtureId, quotes);
      await this.writeRedis(row.fixtureId, quotes);
    }
    return result;
  }

  private async writeRedis(fixtureId: string, quotes: CachedQuote[]) {
    if (quotes.length === 0) return;
    const key = this.key(fixtureId);
    const pipeline = redis.pipeline();
    for (const quote of quotes) {
      pipeline.hset(key, this.field(quote.outcomeId, quote.playerId), JSON.stringify(quote));
    }
    pipeline.expire(key, QUOTE_TTL_SEC);
    pipeline.sadd(PRICED_INDEX, fixtureId);
    await pipeline.exec();
  }

  private async readRedis(fixtureId: string): Promise<CachedQuote[]> {
    const raw = await redis.hgetall(this.key(fixtureId));
    return Object.values(raw).map((value) => JSON.parse(value) as CachedQuote);
  }

  private async persistSnapshot(fixtureId: string, quotes: CachedQuote[]) {
    await prisma.oddsSnapshot.upsert({
      where: { fixtureId },
      create: { fixtureId, quotesJson: quotes },
      update: { quotesJson: quotes },
    });
  }

  private async loadSnapshot(fixtureId: string): Promise<CachedQuote[]> {
    const row = await prisma.oddsSnapshot.findUnique({ where: { fixtureId } });
    if (!row) return [];
    return parseQuotesJson(row.quotesJson);
  }
}

function parseQuotesJson(value: unknown): CachedQuote[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CachedQuote =>
      !!item &&
      typeof item === "object" &&
      typeof (item as CachedQuote).outcomeId === "number" &&
      typeof (item as CachedQuote).housePrice === "number",
  );
}
