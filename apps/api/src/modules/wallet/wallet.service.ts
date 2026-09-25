import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { AdminLedgerRow, AdminPageDto, LedgerEntryDto, WalletDto } from "@maraki/shared";
import { HttpError } from "../../lib/errors.js";
import { toWallet } from "../identity/identity.service.js";
import { pageMeta, toPage } from "../admin/page.js";

export class WalletService {
  constructor(private readonly prisma: PrismaClient) {}

  async getWallet(userId: string): Promise<WalletDto> {
    const wallet = await this.ensureWallet(userId);
    return toWallet(wallet);
  }

  async listLedger(userId: string): Promise<LedgerEntryDto[]> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount.toString()).toFixed(2),
      balanceAfter: Number(row.balanceAfter.toString()).toFixed(2),
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listAllLedger(filters?: {
    q?: string;
    type?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminLedgerRow>> {
    const q = filters?.q?.trim();
    const type = filters?.type?.trim();
    const where = {
      ...(type ? { type } : {}),
      ...(q
        ? {
            OR: [
              { user: { username: { contains: q } } },
              { ref: { contains: q } },
              { note: { contains: q } },
            ],
          }
        : {}),
    };
    const total = await this.prisma.ledgerEntry.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.ledgerEntry.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      skip: meta.skip,
      take: meta.pageSize,
    });
    return toPage(
      rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        username: row.user.username,
        type: row.type,
        amount: Number(row.amount.toString()).toFixed(2),
        balanceAfter: Number(row.balanceAfter.toString()).toFixed(2),
        ref: row.ref,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async deposit(userId: string, amount: number) {
    if (!Number.isFinite(amount) || amount < 1 || amount > 10_000) {
      throw new HttpError(400, "Deposit must be between 1 and 10000 ETB");
    }
    const value = new Prisma.Decimal(amount.toFixed(2));
    const wallet = await this.prisma.$transaction(async (tx) => {
      await this.ensureWallet(userId, tx);
      const updated = await tx.wallet.update({
        where: { userId },
        data: { available: { increment: value } },
      });
      await tx.ledgerEntry.create({
        data: {
          userId,
          type: "DEPOSIT",
          amount: value,
          balanceAfter: updated.available,
          note: "Test deposit",
        },
      });
      return updated;
    });
    return toWallet(wallet);
  }

  async deleteLedgerEntry(id: string) {
    const row = await this.prisma.ledgerEntry.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Ledger entry not found");
    await this.prisma.ledgerEntry.delete({ where: { id } });
    return { ok: true as const, deleted: 1 };
  }

  async deleteAllLedger(type?: string) {
    const result = await this.prisma.ledgerEntry.deleteMany({
      where: type ? { type } : {},
    });
    return { ok: true as const, deleted: result.count };
  }

  async credit(userId: string, amount: number, note = "Admin credit") {
    if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) {
      throw new HttpError(400, "Credit must be between 1 and 1000000 ETB");
    }
    const value = new Prisma.Decimal(amount.toFixed(2));
    const wallet = await this.prisma.$transaction(async (tx) => {
      await this.ensureWallet(userId, tx);
      const updated = await tx.wallet.update({
        where: { userId },
        data: { available: { increment: value } },
      });
      await tx.ledgerEntry.create({
        data: {
          userId,
          type: "ADMIN_CREDIT",
          amount: value,
          balanceAfter: updated.available,
          note,
        },
      });
      return updated;
    });
    return toWallet(wallet);
  }

  private async ensureWallet(userId: string, client: PrismaClient | Prisma.TransactionClient = this.prisma) {
    const existing = await client.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return client.wallet.create({ data: { userId } });
  }
}
