import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { SessionDto, UserDto, UserRole, WalletDto } from "@maraki/shared";
import { HttpError } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "./password.js";

const SESSION_MS = 1000 * 60 * 60 * 24 * 30;

export class IdentityService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(input: { username: string; password: string; phone?: string }) {
    const username = input.username.trim().toLowerCase();
    const phone = input.phone?.trim() || null;
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username }, ...(phone ? [{ phone }] : [])] },
    });
    if (existing) throw new HttpError(409, "Username or phone already registered");

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          passwordHash: await hashPassword(input.password),
          phone,
        },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      return created;
    });

    return this.createSession(user.id);
  }

  async login(input: { username: string; password: string; portal?: UserRole }) {
    const username = input.username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || user.status !== "ACTIVE") throw new HttpError(401, "Invalid username or password");
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid username or password");
    if (input.portal && user.role !== input.portal) {
      throw new HttpError(403, `${input.portal} portal only`);
    }
    return this.createSession(user.id);
  }

  async logout(token?: string) {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { token } });
  }

  async sessionFor(token?: string): Promise<SessionDto | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: { include: { wallet: true } } },
    });
    if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") {
      if (session) await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    return toSession(session.user);
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString("hex");
    await this.prisma.session.create({
      data: {
        token,
        userId,
        expiresAt: new Date(Date.now() + SESSION_MS),
      },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { wallet: true },
    });
    return { token, session: toSession(user) };
  }
}

function toSession(user: {
  id: string;
  username: string;
  phone: string | null;
  role: string;
  wallet: { currency: string; available: { toString(): string }; locked: { toString(): string } } | null;
}): SessionDto {
  return {
    user: toUser(user),
    wallet: toWallet(user.wallet),
  };
}

export function toUser(user: { id: string; username: string; phone: string | null; role: string }): UserDto {
  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    role: user.role as UserDto["role"],
  };
}

export function toWallet(
  wallet: { currency: string; available: { toString(): string }; locked: { toString(): string } } | null,
): WalletDto {
  return {
    currency: wallet?.currency ?? "ETB",
    available: wallet ? Number(wallet.available.toString()).toFixed(2) : "0.00",
    locked: wallet ? Number(wallet.locked.toString()).toFixed(2) : "0.00",
  };
}
