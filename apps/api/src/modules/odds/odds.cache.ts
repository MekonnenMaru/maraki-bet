import { redis } from "../../lib/redis.js";
import type { PricedQuote } from "../pricing/pricing.service.js";

export const CHANNELS = {
  odds: "maraki:odds",
  fixture: "maraki:fixture",
};

export type CachedQuote = PricedQuote;

const PRICED_INDEX = "odds:priced-ids";
const QUOTE_TTL_SEC = 60 * 60 * 12;

export class OddsCache {
  key(fixtureId: string) {
    return `odds:fixture:${fixtureId}`;
  }

  field(outcomeId: number, playerId: number) {
    return `${outcomeId}:${playerId}`;
  }

  async write(fixtureId: string, quotes: CachedQuote[]) {
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

  async read(fixtureId: string): Promise<CachedQuote[]> {
    const raw = await redis.hgetall(this.key(fixtureId));
    return Object.values(raw).map((value) => JSON.parse(value) as CachedQuote);
  }

  async clearFixture(fixtureId: string) {
    await redis.pipeline().del(this.key(fixtureId)).srem(PRICED_INDEX, fixtureId).exec();
  }

  async clearQuote(fixtureId: string, outcomeId: number, playerId = 0) {
    await redis.hdel(this.key(fixtureId), this.field(outcomeId, playerId));
  }

  async clearAll() {
    const keys = await redis.keys("odds:fixture:*");
    if (keys.length === 0) {
      await redis.del(PRICED_INDEX);
      return 0;
    }
    await redis.del(...keys, PRICED_INDEX);
    return keys.length;
  }

  /**
   * Fixture IDs that currently have cached odds. Used by the public board so
   * "All" is not truncated to the earliest unpriced kickoffs.
   */
  async listPricedFixtureIds(): Promise<string[]> {
    const fromSet = await redis.smembers(PRICED_INDEX);
    if (fromSet.length > 0) return fromSet;

    const keys = await redis.keys("odds:fixture:*");
    const ids = keys
      .map((key) => key.replace(/^odds:fixture:/, ""))
      .filter((id) => id.length > 0);
    if (ids.length > 0) {
      // Bootstrap index for odds written before the set existed.
      const pipeline = redis.pipeline();
      for (let i = 0; i < ids.length; i += 500) {
        pipeline.sadd(PRICED_INDEX, ...ids.slice(i, i + 500));
      }
      await pipeline.exec();
    }
    return ids;
  }

  async readMany(fixtureIds: string[]) {
    const result = new Map<string, CachedQuote[]>();
    if (fixtureIds.length === 0) return result;
    const pipeline = redis.pipeline();
    for (const id of fixtureIds) pipeline.hgetall(this.key(id));
    const rows = await pipeline.exec();
    fixtureIds.forEach((id, index) => {
      const [error, value] = rows?.[index] ?? [];
      if (error || !value || typeof value !== "object") {
        result.set(id, []);
        return;
      }
      result.set(
        id,
        Object.values(value as Record<string, string>).map((item) => JSON.parse(item) as CachedQuote),
      );
    });
    return result;
  }
}
