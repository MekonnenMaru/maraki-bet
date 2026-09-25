import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { BetReceiptDto, PlaceBetSelection } from "@maraki/shared";
import { slipTotals } from "@maraki/shared";
import { HttpError } from "../../lib/errors.js";
import type { CatalogRepo } from "../catalog/catalog.repo.js";
import type { OddsCache } from "../odds/odds.cache.js";

export const BETTING_LIMITS = {
  minStake: 1,
  maxStake: 100_000,
  oddsTolerance: 0.03,
};

export class BettingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: OddsCache,
    private readonly repo: CatalogRepo,
  ) {}

  async place(userId: string, input: { stake: number; acceptChanges: boolean; selections: PlaceBetSelection[] }) {
    if (!Number.isFinite(input.stake) || input.stake < BETTING_LIMITS.minStake || input.stake > BETTING_LIMITS.maxStake) {
      throw new HttpError(400, `Stake must be between ${BETTING_LIMITS.minStake} and ${BETTING_LIMITS.maxStake} ETB`);
    }
    if (input.selections.length === 0) throw new HttpError(400, "Add at least one selection");
    const fixtureIds = [...new Set(input.selections.map((item) => item.fixtureId))];
    if (fixtureIds.length !== input.selections.length) {
      throw new HttpError(400, "Only one selection per match is allowed");
    }

    const quotes = await this.cache.readMany(fixtureIds);
    const priced: Array<PlaceBetSelection & { housePrice: number }> = [];
    for (const selection of input.selections) {
      const live = (quotes.get(selection.fixtureId) ?? []).find(
        (quote) => quote.outcomeId === selection.outcomeId && quote.playerId === selection.playerId,
      );
      if (!live || !live.active || live.housePrice <= 1) {
        throw new HttpError(409, `Odds are suspended for ${selection.fixtureLabel}`);
      }
      const moved = Math.abs(live.housePrice - selection.placedOdds) / selection.placedOdds;
      if (moved > BETTING_LIMITS.oddsTolerance && !input.acceptChanges) {
        throw new HttpError(409, "Odds have changed. Accept odd changes and try again.");
      }
      const fixture = await this.repo.getFixture(selection.fixtureId);
      if (fixture && fixture.statusId > 1) {
        throw new HttpError(409, `${selection.fixtureLabel} is no longer open`);
      }
      priced.push({ ...selection, housePrice: live.housePrice, placedOdds: live.housePrice });
    }

    const totals = slipTotals(
      priced.map((item) => item.housePrice),
      input.stake,
    );
    const stake = new Prisma.Decimal(input.stake.toFixed(2));

    const receipt = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || Number(wallet.available.toString()) < input.stake) {
        throw new HttpError(400, "Insufficient balance");
      }
      const updated = await tx.wallet.update({
        where: { userId },
        data: { available: { decrement: stake } },
      });
      const couponCode = await uniqueCoupon(tx);
      const bet = await tx.bet.create({
        data: {
          userId,
          couponCode,
          type: priced.length === 1 ? "SINGLE" : "MULTIPLE",
          status: "ACCEPTED",
          stake,
          vat: new Prisma.Decimal(totals.vat.toFixed(2)),
          netStake: new Prisma.Decimal(totals.netStake.toFixed(2)),
          combinedOdds: new Prisma.Decimal(totals.combined.toFixed(4)),
          bonus: new Prisma.Decimal(totals.bonus.toFixed(2)),
          possibleWin: new Prisma.Decimal(totals.possibleWin.toFixed(2)),
          acceptChanges: input.acceptChanges,
          selections: {
            create: priced.map((item) => ({
              fixtureId: item.fixtureId,
              marketId: item.marketId,
              outcomeId: item.outcomeId,
              playerId: item.playerId,
              marketName: item.marketName.slice(0, 128),
              selection: item.selection.slice(0, 128),
              fixtureLabel: item.fixtureLabel.slice(0, 255),
              placedOdds: new Prisma.Decimal(item.housePrice.toFixed(4)),
            })),
          },
        },
        include: { selections: true },
      });
      await tx.ledgerEntry.create({
        data: {
          userId,
          type: "BET_STAKE",
          amount: stake.negated(),
          balanceAfter: updated.available,
          ref: bet.couponCode,
          note: "Bet stake",
        },
      });
      return bet;
    });

    return toReceipt(receipt);
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.bet.findMany({
      where: { userId },
      include: { selections: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map(toReceipt);
  }

  async getByCoupon(couponCode: string) {
    const normalized = couponCode.trim();
    const bet = await this.prisma.bet.findUnique({
      where: { couponCode: normalized },
      include: { selections: true },
    });
    if (!bet) throw new HttpError(404, "Coupon not found");
    return toReceipt(bet);
  }

  async listAll(filters?: { q?: string; status?: string; page?: number; pageSize?: number }) {
    const q = filters?.q?.trim();
    const status = filters?.status?.trim();
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [{ couponCode: { contains: q } }, { user: { username: { contains: q } } }],
          }
        : {}),
    };
    const total = await this.prisma.bet.count({ where });
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = [10, 20, 50, 100].includes(filters?.pageSize ?? 20) ? (filters?.pageSize ?? 20) : 20;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);
    const rows = await this.prisma.bet.findMany({
      where,
      include: { selections: true, user: true },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: rows.map((row) => ({
        ...toReceipt(row),
        username: row.user.username,
        userId: row.userId,
      })),
      total,
      page: safePage,
      pageSize,
      pageCount,
    };
  }

  async deleteBet(id: string) {
    const bet = await this.prisma.bet.findUnique({ where: { id } });
    if (!bet) throw new HttpError(404, "Bet not found");
    await this.prisma.bet.delete({ where: { id } });
    return { ok: true as const, deleted: 1 };
  }

  async deleteAllBets() {
    const result = await this.prisma.bet.deleteMany({});
    return { ok: true as const, deleted: result.count };
  }
}

async function uniqueCoupon(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}-${String(Math.floor(Math.random() * 100_000)).padStart(5, "0")}`;
    const exists = await tx.bet.findUnique({ where: { couponCode: code } });
    if (!exists) return code;
  }
  throw new HttpError(500, "Could not allocate coupon");
}

function toReceipt(bet: {
  id: string;
  couponCode: string;
  type: string;
  status: string;
  stake: { toString(): string };
  vat: { toString(): string };
  netStake: { toString(): string };
  combinedOdds: { toString(): string };
  bonus: { toString(): string };
  possibleWin: { toString(): string };
  payout?: { toString(): string } | null;
  settledAt?: Date | null;
  createdAt: Date;
  selections: Array<{
    fixtureLabel: string;
    marketName: string;
    selection: string;
    placedOdds: { toString(): string };
    status: string;
  }>;
}): BetReceiptDto {
  return {
    id: bet.id,
    couponCode: bet.couponCode,
    type: bet.type,
    status: bet.status,
    stake: Number(bet.stake.toString()).toFixed(2),
    vat: Number(bet.vat.toString()).toFixed(2),
    netStake: Number(bet.netStake.toString()).toFixed(2),
    combinedOdds: Number(bet.combinedOdds.toString()).toFixed(2),
    bonus: Number(bet.bonus.toString()).toFixed(2),
    possibleWin: Number(bet.possibleWin.toString()).toFixed(2),
    payout: Number((bet.payout ?? 0).toString()).toFixed(2),
    settledAt: bet.settledAt ? bet.settledAt.toISOString() : null,
    createdAt: bet.createdAt.toISOString(),
    selections: bet.selections.map((item) => ({
      fixtureLabel: item.fixtureLabel,
      marketName: item.marketName,
      selection: item.selection,
      placedOdds: Number(item.placedOdds.toString()).toFixed(2),
      status: item.status,
    })),
  };
}
