import type { PrismaClient } from "@prisma/client";
import type { BetReceiptDto, CashierDashboardDto, CashierDeskDto } from "@maraki/shared";
import { HttpError } from "../../lib/errors.js";

function startOfLocalDay(d = new Date()) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function money(value: { toString(): string } | number | null | undefined) {
  return Number((value ?? 0).toString()).toFixed(2);
}

function toReceipt(
  bet: {
    id: string;
    couponCode: string;
    type: string;
    status: string;
    channel?: string | null;
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
      fixtureId: string;
      marketId: number;
      outcomeId: number;
      playerId: number;
      fixtureLabel: string;
      marketName: string;
      selection: string;
      placedOdds: { toString(): string };
      status: string;
    }>;
  },
): BetReceiptDto {
  return {
    id: bet.id,
    couponCode: bet.couponCode,
    type: bet.type,
    status: bet.status,
    kind: "PLACED",
    channel: bet.channel === "CASH" ? "CASH" : "ONLINE",
    stake: money(bet.stake),
    vat: money(bet.vat),
    netStake: money(bet.netStake),
    combinedOdds: Number(bet.combinedOdds.toString()).toFixed(2),
    bonus: money(bet.bonus),
    possibleWin: money(bet.possibleWin),
    payout: money(bet.payout ?? 0),
    settledAt: bet.settledAt ? bet.settledAt.toISOString() : null,
    createdAt: bet.createdAt.toISOString(),
    expiresAt: null,
    selections: bet.selections.map((item) => ({
      fixtureId: item.fixtureId,
      marketId: item.marketId,
      outcomeId: item.outcomeId,
      playerId: item.playerId,
      fixtureLabel: item.fixtureLabel,
      marketName: item.marketName,
      selection: item.selection,
      placedOdds: Number(item.placedOdds.toString()).toFixed(2),
      status: item.status,
    })),
  };
}

export class CashierService {
  constructor(private readonly prisma: PrismaClient) {}

  async loadDesk(userId: string): Promise<CashierDeskDto | null> {
    const sale = await this.prisma.shopSale.findUnique({
      where: { userId },
      include: { shop: { include: { agent: true } } },
    });
    if (!sale || sale.status !== "ACTIVE" || sale.shop.status !== "ACTIVE") return null;
    return {
      saleId: sale.id,
      label: sale.label,
      shopId: sale.shopId,
      shopName: sale.shop.name,
      agentName: sale.shop.agent.displayName,
    };
  }

  async dashboard(cashierUserId: string): Promise<CashierDashboardDto> {
    const desk = await this.loadDesk(cashierUserId);
    if (!desk) throw new HttpError(403, "No active shop desk for this cashier");

    const from = startOfLocalDay();
    const to = new Date();
    const cashMine = { userId: cashierUserId, channel: "CASH" as const };

    const [placedToday, cashTaken, openTickets, pendingRows, recentRows] = await Promise.all([
      this.prisma.bet.count({
        where: { ...cashMine, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.bet.aggregate({
        where: { ...cashMine, createdAt: { gte: from, lte: to } },
        _sum: { stake: true },
      }),
      this.prisma.bet.count({
        where: { ...cashMine, status: "ACCEPTED" },
      }),
      this.prisma.bet.findMany({
        where: { ...cashMine, status: "WON", payout: { gt: 0 } },
        select: { payout: true },
      }),
      this.prisma.bet.findMany({
        where: cashMine,
        include: { selections: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const pendingPayout = pendingRows.reduce((sum, row) => sum + Number(row.payout.toString()), 0);

    return {
      currency: "ETB",
      from: from.toISOString(),
      to: to.toISOString(),
      desk,
      today: {
        ticketsPlaced: placedToday,
        cashTaken: money(cashTaken._sum.stake),
        openTickets,
        pendingPayout: pendingPayout.toFixed(2),
        pendingPayoutCount: pendingRows.length,
      },
      recent: recentRows.map(toReceipt),
    };
  }

  async listBets(cashierUserId: string, opts?: { limit?: number }) {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
    const [total, rows] = await Promise.all([
      this.prisma.bet.count({ where: { userId: cashierUserId, channel: "CASH" } }),
      this.prisma.bet.findMany({
        where: { userId: cashierUserId, channel: "CASH" },
        include: { selections: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);
    return { items: rows.map(toReceipt), total };
  }
}
