import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { BetReceiptDto, PlaceBetSelection } from "@maraki/shared";
import { slipTotals, statusIdFromSlug } from "@maraki/shared";
import { HttpError } from "../../lib/errors.js";
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
  ) {}

  async place(userId: string, input: { stake: number; acceptChanges: boolean; selections: PlaceBetSelection[] }) {
    const { priced, totals, stake } = await this.prepareSlip(input);

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

    return toReceipt(receipt, "PLACED");
  }

  /** Guest / unpaid booking — cashier places later with cash. */
  async book(input: { stake: number; acceptChanges: boolean; selections: PlaceBetSelection[] }) {
    const { priced, totals, stake } = await this.prepareSlip(input);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const booking = await this.prisma.$transaction(async (tx) => {
      const couponCode = await uniqueCoupon(tx);
      return tx.bookedCoupon.create({
        data: {
          couponCode,
          status: "BOOKED",
          type: priced.length === 1 ? "SINGLE" : "MULTIPLE",
          stake,
          vat: new Prisma.Decimal(totals.vat.toFixed(2)),
          netStake: new Prisma.Decimal(totals.netStake.toFixed(2)),
          combinedOdds: new Prisma.Decimal(totals.combined.toFixed(4)),
          bonus: new Prisma.Decimal(totals.bonus.toFixed(2)),
          possibleWin: new Prisma.Decimal(totals.possibleWin.toFixed(2)),
          acceptChanges: input.acceptChanges,
          expiresAt,
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
              startTime: item.startTime ?? null,
            })),
          },
        },
        include: { selections: true },
      });
    });

    return toBookedReceipt(booking);
  }

  /** Cash desk: convert unpaid booking → real CASH bet (same coupon code, no wallet debit). */
  async placeBooking(
    cashierUserId: string,
    couponCode: string,
    opts?: { acceptChanges?: boolean },
  ) {
    const normalized = couponCode.trim();
    const booking = await this.prisma.bookedCoupon.findUnique({
      where: { couponCode: normalized },
      include: { selections: true },
    });
    if (!booking) throw new HttpError(404, "Booked coupon not found");
    if (booking.status === "PLACED" || booking.placedBetId) {
      throw new HttpError(409, "Coupon already placed");
    }
    if (booking.status === "CANCELLED") throw new HttpError(409, "Coupon was cancelled");
    if (booking.status === "EXPIRED" || booking.expiresAt.getTime() < Date.now()) {
      if (booking.status === "BOOKED") {
        await this.prisma.bookedCoupon.update({
          where: { id: booking.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new HttpError(409, "Coupon has expired");
    }
    if (booking.status !== "BOOKED") throw new HttpError(409, `Coupon status is ${booking.status}`);

    const acceptChanges = opts?.acceptChanges ?? booking.acceptChanges;
    const selections: PlaceBetSelection[] = booking.selections.map((item) => ({
      fixtureId: item.fixtureId,
      marketId: item.marketId,
      outcomeId: item.outcomeId,
      playerId: item.playerId,
      marketName: item.marketName,
      selection: item.selection,
      fixtureLabel: item.fixtureLabel,
      placedOdds: Number(item.placedOdds.toString()),
    }));

    const { priced, totals, stake } = await this.prepareSlip({
      stake: Number(booking.stake.toString()),
      acceptChanges,
      selections,
    });

    const receipt = await this.prisma.$transaction(async (tx) => {
      const bet = await tx.bet.create({
        data: {
          userId: cashierUserId,
          couponCode: booking.couponCode,
          channel: "CASH",
          type: booking.type,
          status: "ACCEPTED",
          stake,
          vat: new Prisma.Decimal(totals.vat.toFixed(2)),
          netStake: new Prisma.Decimal(totals.netStake.toFixed(2)),
          combinedOdds: new Prisma.Decimal(totals.combined.toFixed(4)),
          bonus: new Prisma.Decimal(totals.bonus.toFixed(2)),
          possibleWin: new Prisma.Decimal(totals.possibleWin.toFixed(2)),
          acceptChanges,
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

      const claimed = await tx.bookedCoupon.updateMany({
        where: { id: booking.id, status: "BOOKED", placedBetId: null },
        data: { status: "PLACED", placedBetId: bet.id },
      });
      if (claimed.count === 0) throw new HttpError(409, "Coupon already placed");

      const wallet = await tx.wallet.findUnique({ where: { userId: cashierUserId } });
      await tx.ledgerEntry.create({
        data: {
          userId: cashierUserId,
          type: "CASH_STAKE",
          amount: stake,
          balanceAfter: wallet?.available ?? new Prisma.Decimal(0),
          ref: bet.couponCode,
          note: "Cash desk stake (no wallet debit)",
        },
      });

      return bet;
    });

    return toReceipt(receipt, "PLACED");
  }

  private async prepareSlip(input: { stake: number; acceptChanges: boolean; selections: PlaceBetSelection[] }) {
    if (!Number.isFinite(input.stake) || input.stake < BETTING_LIMITS.minStake || input.stake > BETTING_LIMITS.maxStake) {
      throw new HttpError(400, `Stake must be between ${BETTING_LIMITS.minStake} and ${BETTING_LIMITS.maxStake} ETB`);
    }
    if (input.selections.length === 0) throw new HttpError(400, "Add at least one selection");
    const fixtureIds = [...new Set(input.selections.map((item) => item.fixtureId))];
    if (fixtureIds.length !== input.selections.length) {
      throw new HttpError(400, "Only one selection per match is allowed");
    }

    // Game status is the primary gate for place, book, and cashier place.
    const fixtures = await this.prisma.fixture.findMany({
      where: { id: { in: fixtureIds } },
      include: { sport: true, tournament: true },
    });
    const byId = new Map(fixtures.map((row) => [row.id, row]));
    for (const selection of input.selections) {
      assertFixtureOpenForBetting(byId.get(selection.fixtureId), selection.fixtureLabel);
    }

    const quotes = await this.cache.readMany(fixtureIds);
    const priced: Array<PlaceBetSelection & { housePrice: number; startTime: Date | null }> = [];
    for (const selection of input.selections) {
      const fixture = byId.get(selection.fixtureId)!;
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
      priced.push({
        ...selection,
        housePrice: live.housePrice,
        placedOdds: live.housePrice,
        startTime: fixture.startTime,
      });
    }

    const totals = slipTotals(
      priced.map((item) => item.housePrice),
      input.stake,
    );
    const stake = new Prisma.Decimal(input.stake.toFixed(2));
    return { priced, totals, stake };
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.bet.findMany({
      where: { userId },
      include: { selections: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => toReceipt(row, "PLACED"));
  }

  async getByCoupon(couponCode: string) {
    const normalized = couponCode.trim();
    const bet = await this.prisma.bet.findUnique({
      where: { couponCode: normalized },
      include: { selections: true },
    });
    if (!bet) throw new HttpError(404, "Coupon not found");
    return toReceipt(bet, "PLACED");
  }

  /** Load Coupon: restore picks from a placed bet or an unpaid booking. */
  async getForLoad(couponCode: string) {
    const normalized = couponCode.trim();
    const bet = await this.prisma.bet.findUnique({
      where: { couponCode: normalized },
      include: { selections: true },
    });
    if (bet) return toReceipt(bet, "PLACED");

    const booking = await this.prisma.bookedCoupon.findUnique({
      where: { couponCode: normalized },
      include: { selections: true },
    });
    if (!booking) throw new HttpError(404, "Coupon not found");
    if (booking.status === "BOOKED" && booking.expiresAt.getTime() < Date.now()) {
      await this.prisma.bookedCoupon.update({
        where: { id: booking.id },
        data: { status: "EXPIRED" },
      });
      booking.status = "EXPIRED";
    }
    return toBookedReceipt(booking);
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
        ...toReceipt(row, "PLACED"),
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
    const [bet, booking] = await Promise.all([
      tx.bet.findUnique({ where: { couponCode: code }, select: { id: true } }),
      tx.bookedCoupon.findUnique({ where: { couponCode: code }, select: { id: true } }),
    ]);
    if (!bet && !booking) return code;
  }
  throw new HttpError(500, "Could not allocate coupon");
}

function toReceipt(
  bet: {
    id: string;
    couponCode: string;
    type: string;
    status: string;
    channel?: string;
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
  kind: "PLACED" | "BOOKED" = "PLACED",
): BetReceiptDto {
  return {
    id: bet.id,
    couponCode: bet.couponCode,
    type: bet.type,
    status: bet.status,
    kind,
    channel: bet.channel === "CASH" ? "CASH" : "ONLINE",
    stake: Number(bet.stake.toString()).toFixed(2),
    vat: Number(bet.vat.toString()).toFixed(2),
    netStake: Number(bet.netStake.toString()).toFixed(2),
    combinedOdds: Number(bet.combinedOdds.toString()).toFixed(2),
    bonus: Number(bet.bonus.toString()).toFixed(2),
    possibleWin: Number(bet.possibleWin.toString()).toFixed(2),
    payout: Number((bet.payout ?? 0).toString()).toFixed(2),
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

function toBookedReceipt(booking: {
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
  expiresAt: Date;
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
    startTime: Date | null;
  }>;
}): BetReceiptDto {
  return {
    id: booking.id,
    couponCode: booking.couponCode,
    type: booking.type,
    status: booking.status,
    kind: "BOOKED",
    stake: Number(booking.stake.toString()).toFixed(2),
    vat: Number(booking.vat.toString()).toFixed(2),
    netStake: Number(booking.netStake.toString()).toFixed(2),
    combinedOdds: Number(booking.combinedOdds.toString()).toFixed(2),
    bonus: Number(booking.bonus.toString()).toFixed(2),
    possibleWin: Number(booking.possibleWin.toString()).toFixed(2),
    payout: "0.00",
    settledAt: null,
    createdAt: booking.createdAt.toISOString(),
    expiresAt: booking.expiresAt.toISOString(),
    selections: booking.selections.map((item) => ({
      fixtureId: item.fixtureId,
      marketId: item.marketId,
      outcomeId: item.outcomeId,
      playerId: item.playerId,
      fixtureLabel: item.fixtureLabel,
      marketName: item.marketName,
      selection: item.selection,
      placedOdds: Number(item.placedOdds.toString()).toFixed(2),
      status: "BOOKED",
      startTime: item.startTime ? item.startTime.toISOString() : null,
    })),
  };
}

type BettableFixture = {
  id: string;
  statusId: number;
  manualStatusOverride: string | null;
  startTime: Date;
  visible: boolean;
  bettingEnabled: boolean;
  sport: { enabled: boolean; visible: boolean; name: string };
  tournament: { enabled: boolean; visible: boolean; name: string };
};

/** Primary gate for place / book / cashier place — status before odds. */
function assertFixtureOpenForBetting(fixture: BettableFixture | undefined, label: string) {
  const name = label.trim() || "Match";
  if (!fixture) {
    throw new HttpError(409, `${name} is unavailable`);
  }
  if (!fixture.visible) {
    throw new HttpError(409, `${name} is not available for betting`);
  }
  if (!fixture.bettingEnabled) {
    throw new HttpError(409, `Betting is disabled for ${name}`);
  }
  if (!fixture.sport.enabled || !fixture.sport.visible) {
    throw new HttpError(409, `${fixture.sport.name} is not open for betting`);
  }
  if (!fixture.tournament.enabled || !fixture.tournament.visible) {
    throw new HttpError(409, `${fixture.tournament.name} is not open for betting`);
  }

  const overrideId =
    fixture.manualStatusOverride != null && fixture.manualStatusOverride.trim()
      ? statusIdFromSlug(fixture.manualStatusOverride.trim())
      : undefined;
  const statusId = overrideId ?? fixture.statusId;

  if (statusId >= 3) {
    throw new HttpError(409, `${name} was cancelled`);
  }
  if (statusId >= 2) {
    throw new HttpError(409, `${name} has already finished`);
  }
  // Pregame must still be before kickoff (covers provider lag on status updates).
  if (statusId === 0 && fixture.startTime.getTime() <= Date.now()) {
    throw new HttpError(409, `${name} has already kicked off`);
  }
}
