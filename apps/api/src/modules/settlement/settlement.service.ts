import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { TestSettleOutcome } from "@maraki/shared";
import { evaluateSelection, finalizeBet } from "@maraki/shared";
import { HttpError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

export class SettlementService {
  constructor(private readonly prisma: PrismaClient) {}

  async settlePending() {
    const open = await this.prisma.bet.findMany({
      where: { status: "ACCEPTED" },
      include: { selections: true },
      take: 200,
      orderBy: { createdAt: "asc" },
    });

    let updated = 0;
    let paid = 0;
    for (const bet of open) {
      const next = await this.resolveBet(bet.id);
      if (next) {
        updated += 1;
        if (next !== "ACCEPTED") paid += 1;
      }
    }
    if (updated > 0) {
      logger.info("Settlement pass complete", { scanned: open.length, updated, finalized: paid });
    }
    return { scanned: open.length, updated, finalized: paid };
  }

  async testSettle(userId: string, couponCode: string, outcome: TestSettleOutcome) {
    const bet = await this.openCoupon(couponCode);
    if (bet.userId !== userId) throw new HttpError(403, "This coupon is not yours");
    return this.applyOutcome(bet.id, outcome);
  }

  async adminSettle(couponCode: string, outcome: TestSettleOutcome) {
    const bet = await this.openCoupon(couponCode);
    return this.applyOutcome(bet.id, outcome);
  }

  private async openCoupon(couponCode: string) {
    const bet = await this.prisma.bet.findUnique({
      where: { couponCode: couponCode.trim() },
    });
    if (!bet) throw new HttpError(404, "Coupon not found");
    if (bet.status !== "ACCEPTED") throw new HttpError(409, "Coupon is already settled");
    return bet;
  }

  private async applyOutcome(betId: string, outcome: TestSettleOutcome) {
    await this.prisma.betSelection.updateMany({
      where: { betId },
      data: { status: outcome === "VOID" ? "VOID" : outcome },
    });
    const status = await this.finalizeIfReady(betId);
    if (!status || status === "ACCEPTED") throw new HttpError(500, "Could not settle coupon");
    return status;
  }

  private async resolveBet(betId: string) {
    const bet = await this.prisma.bet.findUnique({
      where: { id: betId },
      include: { selections: true },
    });
    if (!bet || bet.status !== "ACCEPTED") return null;

    const fixtureIds = [...new Set(bet.selections.map((item) => item.fixtureId))];
    const marketIds = [...new Set(bet.selections.map((item) => item.marketId))];
    const [fixtures, markets] = await Promise.all([
      this.prisma.fixture.findMany({ where: { id: { in: fixtureIds } } }),
      this.prisma.market.findMany({ where: { id: { in: marketIds } } }),
    ]);
    const fixtureMap = new Map(fixtures.map((row) => [row.id, row]));
    const marketMap = new Map(markets.map((row) => [row.id, row]));

    let changed = false;
    for (const selection of bet.selections) {
      if (selection.status !== "PENDING") continue;
      const fixture = fixtureMap.get(selection.fixtureId);
      if (!fixture) continue;
      const market = marketMap.get(selection.marketId);
      const result = evaluateSelection(selection.selection, selection.marketName, fixture, {
        marketType: market?.marketType,
        name: market?.name,
        handicap: market?.handicap?.toString() ?? null,
      });
      if (result === "PENDING") continue;
      await this.prisma.betSelection.update({
        where: { id: selection.id },
        data: { status: result },
      });
      changed = true;
    }

    const finalized = await this.finalizeIfReady(betId);
    if (finalized && finalized !== "ACCEPTED") return finalized;
    return changed ? "ACCEPTED" : null;
  }

  private async finalizeIfReady(betId: string) {
    return this.prisma.$transaction(async (tx) => {
      const bet = await tx.bet.findUnique({
        where: { id: betId },
        include: { selections: true },
      });
      if (!bet || bet.status !== "ACCEPTED") return null;

      const verdict = finalizeBet(
        bet.selections.map((item) => ({
          status: item.status as "PENDING" | "WON" | "LOST" | "VOID",
          odds: Number(item.placedOdds.toString()),
        })),
        Number(bet.stake.toString()),
      );
      if (verdict.status === "ACCEPTED") return "ACCEPTED";

      const claimed = await tx.bet.updateMany({
        where: { id: bet.id, status: "ACCEPTED" },
        data: {
          status: verdict.status,
          payout: new Prisma.Decimal(verdict.payout.toFixed(2)),
          settledAt: new Date(),
        },
      });
      if (claimed.count === 0) return null;

      if (verdict.payout > 0) {
        const credit = new Prisma.Decimal(verdict.payout.toFixed(2));
        const wallet = await tx.wallet.update({
          where: { userId: bet.userId },
          data: { available: { increment: credit } },
        });
        await tx.ledgerEntry.create({
          data: {
            userId: bet.userId,
            type: verdict.status === "VOID" ? "BET_REFUND" : "BET_WIN",
            amount: credit,
            balanceAfter: wallet.available,
            ref: bet.couponCode,
            note: verdict.status === "VOID" ? "Void coupon refund" : "Winning coupon",
          },
        });
      }
      return verdict.status;
    });
  }
}
