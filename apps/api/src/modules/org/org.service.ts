import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdminAgentRow,
  AdminPageDto,
  AdminSaleRow,
  AdminShopRow,
  OrgPermissionMap,
} from "@maraki/shared";
import {
  AGENT_PERMISSION_KEYS,
  SALE_PERMISSION_KEYS,
  SHOP_PERMISSION_KEYS,
} from "@maraki/shared";
import { HttpError } from "../../lib/errors.js";
import { hashPassword } from "../identity/password.js";
import { toWallet } from "../identity/identity.service.js";
import { pageMeta, toPage } from "../admin/page.js";

function asPermissions(value: Prisma.JsonValue | null | undefined, keys: readonly string[]): OrgPermissionMap {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const map: OrgPermissionMap = {};
  for (const key of keys) {
    map[key] = source[key] === true;
  }
  return map;
}

function mergePermissions(keys: readonly string[], input?: OrgPermissionMap | null, fallbackTrue = true): OrgPermissionMap {
  const map: OrgPermissionMap = {};
  for (const key of keys) {
    if (input && typeof input[key] === "boolean") map[key] = input[key];
    else map[key] = fallbackTrue;
  }
  return map;
}

function cleanCode(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

export class OrgService {
  constructor(private readonly prisma: PrismaClient) {}

  async listAgents(filters?: {
    q?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminAgentRow>> {
    await this.ensureProfilesForAgents();
    const q = filters?.q?.trim();
    const where = {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q } },
              { code: { contains: q } },
              { phone: { contains: q } },
              { user: { username: { contains: q } } },
            ],
          }
        : {}),
    };
    const total = await this.prisma.agentProfile.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.agentProfile.findMany({
      where,
      include: {
        user: { include: { wallet: true } },
        shops: { include: { _count: { select: { sales: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: meta.skip,
      take: meta.pageSize,
    });
    return toPage(
      rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        username: row.user.username,
        displayName: row.displayName,
        code: row.code,
        phone: row.phone ?? row.user.phone,
        status: row.status,
        shopCount: row.shops.length,
        saleCount: row.shops.reduce((sum, shop) => sum + shop._count.sales, 0),
        permissions: asPermissions(row.permissionsJson, AGENT_PERMISSION_KEYS),
        notes: row.notes,
        wallet: toWallet(row.user.wallet),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async createAgent(input: {
    username: string;
    password: string;
    displayName: string;
    code?: string;
    phone?: string;
    permissions?: OrgPermissionMap;
    notes?: string;
  }) {
    const username = input.username.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!username || !displayName || input.password.length < 6) {
      throw new HttpError(400, "Username, display name, and password (6+) are required");
    }
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, ...(input.phone ? [{ phone: input.phone.trim() }] : [])],
      },
    });
    if (existing) throw new HttpError(409, "Username or phone already exists");

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash: await hashPassword(input.password),
          phone: input.phone?.trim() || null,
          role: "AGENT",
          status: "ACTIVE",
          wallet: { create: { currency: "ETB" } },
        },
        include: { wallet: true },
      });
      const profile = await tx.agentProfile.create({
        data: {
          userId: user.id,
          displayName,
          code: cleanCode(input.code),
          phone: input.phone?.trim() || null,
          permissionsJson: mergePermissions(AGENT_PERMISSION_KEYS, input.permissions),
          notes: input.notes?.trim() || null,
        },
      });
      return { user, profile };
    });

    return this.getAgent(created.profile.id);
  }

  async getAgent(id: string): Promise<AdminAgentRow> {
    const row = await this.prisma.agentProfile.findUnique({
      where: { id },
      include: {
        user: { include: { wallet: true } },
        shops: { include: { _count: { select: { sales: true } } } },
      },
    });
    if (!row) throw new HttpError(404, "Agent not found");
    return {
      id: row.id,
      userId: row.userId,
      username: row.user.username,
      displayName: row.displayName,
      code: row.code,
      phone: row.phone ?? row.user.phone,
      status: row.status,
      shopCount: row.shops.length,
      saleCount: row.shops.reduce((sum, shop) => sum + shop._count.sales, 0),
      permissions: asPermissions(row.permissionsJson, AGENT_PERMISSION_KEYS),
      notes: row.notes,
      wallet: toWallet(row.user.wallet),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updateAgent(
    id: string,
    input: {
      displayName?: string;
      code?: string | null;
      phone?: string | null;
      status?: "ACTIVE" | "SUSPENDED";
      permissions?: OrgPermissionMap;
      notes?: string | null;
      password?: string;
    },
  ) {
    const row = await this.prisma.agentProfile.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Agent not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.agentProfile.update({
        where: { id },
        data: {
          displayName: input.displayName?.trim() || undefined,
          code: input.code === undefined ? undefined : cleanCode(input.code),
          phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
          status: input.status,
          permissionsJson:
            input.permissions != null
              ? mergePermissions(AGENT_PERMISSION_KEYS, input.permissions, false)
              : undefined,
          notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
        },
      });
      const userPatch: Prisma.UserUpdateInput = {};
      if (input.status) userPatch.status = input.status;
      if (input.phone !== undefined) userPatch.phone = input.phone?.trim() || null;
      if (input.password && input.password.length >= 6) {
        userPatch.passwordHash = await hashPassword(input.password);
      }
      if (Object.keys(userPatch).length > 0) {
        await tx.user.update({ where: { id: row.userId }, data: userPatch });
      }
    });

    await this.audit("agent.update", "AgentProfile", id, row, input);
    return this.getAgent(id);
  }

  async deleteAgent(id: string) {
    const row = await this.prisma.agentProfile.findUnique({
      where: { id },
      include: { _count: { select: { shops: true } } },
    });
    if (!row) throw new HttpError(404, "Agent not found");
    if (row._count.shops > 0) {
      throw new HttpError(400, "Remove or reassign shops before deleting this agent");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.agentProfile.delete({ where: { id } });
      await tx.user.delete({ where: { id: row.userId } });
    });
    await this.audit("agent.delete", "AgentProfile", id, row, null);
    return { ok: true };
  }

  async deleteAllAgents() {
    const sales = await this.prisma.shopSale.findMany({ select: { id: true, userId: true } });
    const agents = await this.prisma.agentProfile.findMany({ select: { id: true, userId: true } });
    const saleUserIds = sales.map((row) => row.userId);
    const agentUserIds = agents.map((row) => row.userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.shopSale.deleteMany({});
      await tx.shop.deleteMany({});
      await tx.agentProfile.deleteMany({});
      if (saleUserIds.length + agentUserIds.length > 0) {
        await tx.user.deleteMany({ where: { id: { in: [...saleUserIds, ...agentUserIds] } } });
      }
    });
    await this.audit("agent.delete_all", "AgentProfile", "all", null, { deleted: agents.length });
    return { ok: true, deleted: agents.length };
  }

  async listShops(filters?: {
    q?: string;
    status?: string;
    agentId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminShopRow>> {
    const q = filters?.q?.trim();
    const where = {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.agentId ? { agentId: filters.agentId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { code: { contains: q } },
              { address: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };
    const total = await this.prisma.shop.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.shop.findMany({
      where,
      include: {
        agent: true,
        _count: { select: { sales: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: meta.skip,
      take: meta.pageSize,
    });
    return toPage(
      rows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        agentName: row.agent.displayName,
        agentCode: row.agent.code,
        name: row.name,
        code: row.code,
        address: row.address,
        phone: row.phone,
        status: row.status,
        saleCount: row._count.sales,
        permissions: asPermissions(row.permissionsJson, SHOP_PERMISSION_KEYS),
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async createShop(input: {
    agentId: string;
    name: string;
    code?: string;
    address?: string;
    phone?: string;
    permissions?: OrgPermissionMap;
    notes?: string;
  }) {
    const agent = await this.prisma.agentProfile.findUnique({ where: { id: input.agentId } });
    if (!agent) throw new HttpError(404, "Agent not found");
    const name = input.name.trim();
    if (!name) throw new HttpError(400, "Shop name is required");

    const shop = await this.prisma.shop.create({
      data: {
        agentId: input.agentId,
        name,
        code: cleanCode(input.code),
        address: input.address?.trim() || null,
        phone: input.phone?.trim() || null,
        permissionsJson: mergePermissions(SHOP_PERMISSION_KEYS, input.permissions),
        notes: input.notes?.trim() || null,
      },
    });
    await this.audit("shop.create", "Shop", shop.id, null, shop);
    return this.getShop(shop.id);
  }

  async getShop(id: string): Promise<AdminShopRow> {
    const row = await this.prisma.shop.findUnique({
      where: { id },
      include: { agent: true, _count: { select: { sales: true } } },
    });
    if (!row) throw new HttpError(404, "Shop not found");
    return {
      id: row.id,
      agentId: row.agentId,
      agentName: row.agent.displayName,
      agentCode: row.agent.code,
      name: row.name,
      code: row.code,
      address: row.address,
      phone: row.phone,
      status: row.status,
      saleCount: row._count.sales,
      permissions: asPermissions(row.permissionsJson, SHOP_PERMISSION_KEYS),
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updateShop(
    id: string,
    input: {
      name?: string;
      code?: string | null;
      address?: string | null;
      phone?: string | null;
      status?: "ACTIVE" | "SUSPENDED";
      permissions?: OrgPermissionMap;
      notes?: string | null;
      agentId?: string;
    },
  ) {
    const row = await this.prisma.shop.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Shop not found");
    if (input.agentId) {
      const agent = await this.prisma.agentProfile.findUnique({ where: { id: input.agentId } });
      if (!agent) throw new HttpError(404, "Agent not found");
    }
    await this.prisma.shop.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        code: input.code === undefined ? undefined : cleanCode(input.code),
        address: input.address === undefined ? undefined : input.address?.trim() || null,
        phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
        status: input.status,
        agentId: input.agentId,
        permissionsJson:
          input.permissions != null
            ? mergePermissions(SHOP_PERMISSION_KEYS, input.permissions, false)
            : undefined,
        notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
      },
    });
    await this.audit("shop.update", "Shop", id, row, input);
    return this.getShop(id);
  }

  async deleteShop(id: string) {
    const row = await this.prisma.shop.findUnique({
      where: { id },
      include: { _count: { select: { sales: true } } },
    });
    if (!row) throw new HttpError(404, "Shop not found");
    if (row._count.sales > 0) {
      throw new HttpError(400, "Remove sales desks before deleting this shop");
    }
    await this.prisma.shop.delete({ where: { id } });
    await this.audit("shop.delete", "Shop", id, row, null);
    return { ok: true };
  }

  async deleteAllShops() {
    const sales = await this.prisma.shopSale.findMany({ select: { userId: true } });
    const count = await this.prisma.shop.count();
    await this.prisma.$transaction(async (tx) => {
      await tx.shopSale.deleteMany({});
      await tx.shop.deleteMany({});
      if (sales.length > 0) {
        await tx.user.deleteMany({ where: { id: { in: sales.map((row) => row.userId) } } });
      }
    });
    await this.audit("shop.delete_all", "Shop", "all", null, { deleted: count });
    return { ok: true, deleted: count };
  }

  async listSales(filters?: {
    q?: string;
    status?: string;
    shopId?: string;
    agentId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminSaleRow>> {
    const q = filters?.q?.trim();
    const where = {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.shopId ? { shopId: filters.shopId } : {}),
      ...(filters?.agentId ? { shop: { agentId: filters.agentId } } : {}),
      ...(q
        ? {
            OR: [
              { label: { contains: q } },
              { code: { contains: q } },
              { user: { username: { contains: q } } },
              { shop: { name: { contains: q } } },
            ],
          }
        : {}),
    };
    const total = await this.prisma.shopSale.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.shopSale.findMany({
      where,
      include: {
        user: { include: { wallet: true } },
        shop: { include: { agent: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: meta.skip,
      take: meta.pageSize,
    });
    return toPage(
      rows.map((row) => mapSale(row)),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async createSale(input: {
    shopId: string;
    username: string;
    password: string;
    label: string;
    code?: string;
    permissions?: OrgPermissionMap;
    notes?: string;
  }) {
    const shop = await this.prisma.shop.findUnique({ where: { id: input.shopId } });
    if (!shop) throw new HttpError(404, "Shop not found");
    const username = input.username.trim().toLowerCase();
    const label = input.label.trim();
    if (!username || !label || input.password.length < 6) {
      throw new HttpError(400, "Username, label, and password (6+) are required");
    }
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) throw new HttpError(409, "Username already exists");

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash: await hashPassword(input.password),
          role: "CASHIER",
          status: "ACTIVE",
          wallet: { create: { currency: "ETB" } },
        },
      });
      const sale = await tx.shopSale.create({
        data: {
          shopId: input.shopId,
          userId: user.id,
          label,
          code: cleanCode(input.code),
          permissionsJson: mergePermissions(SALE_PERMISSION_KEYS, input.permissions),
          notes: input.notes?.trim() || null,
        },
      });
      return sale;
    });

    await this.audit("sale.create", "ShopSale", created.id, null, created);
    return this.getSale(created.id);
  }

  async getSale(id: string): Promise<AdminSaleRow> {
    const row = await this.prisma.shopSale.findUnique({
      where: { id },
      include: {
        user: { include: { wallet: true } },
        shop: { include: { agent: true } },
      },
    });
    if (!row) throw new HttpError(404, "Sale desk not found");
    return mapSale(row);
  }

  async updateSale(
    id: string,
    input: {
      label?: string;
      code?: string | null;
      status?: "ACTIVE" | "SUSPENDED";
      permissions?: OrgPermissionMap;
      notes?: string | null;
      shopId?: string;
      password?: string;
    },
  ) {
    const row = await this.prisma.shopSale.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Sale desk not found");
    if (input.shopId) {
      const shop = await this.prisma.shop.findUnique({ where: { id: input.shopId } });
      if (!shop) throw new HttpError(404, "Shop not found");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shopSale.update({
        where: { id },
        data: {
          label: input.label?.trim() || undefined,
          code: input.code === undefined ? undefined : cleanCode(input.code),
          status: input.status,
          shopId: input.shopId,
          permissionsJson:
            input.permissions != null
              ? mergePermissions(SALE_PERMISSION_KEYS, input.permissions, false)
              : undefined,
          notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
        },
      });
      const userPatch: Prisma.UserUpdateInput = {};
      if (input.status) userPatch.status = input.status;
      if (input.password && input.password.length >= 6) {
        userPatch.passwordHash = await hashPassword(input.password);
      }
      if (Object.keys(userPatch).length > 0) {
        await tx.user.update({ where: { id: row.userId }, data: userPatch });
      }
    });

    await this.audit("sale.update", "ShopSale", id, row, input);
    return this.getSale(id);
  }

  async deleteSale(id: string) {
    const row = await this.prisma.shopSale.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Sale desk not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.shopSale.delete({ where: { id } });
      await tx.user.delete({ where: { id: row.userId } });
    });
    await this.audit("sale.delete", "ShopSale", id, row, null);
    return { ok: true };
  }

  async deleteAllSales() {
    const sales = await this.prisma.shopSale.findMany({ select: { userId: true } });
    const count = sales.length;
    await this.prisma.$transaction(async (tx) => {
      await tx.shopSale.deleteMany({});
      if (sales.length > 0) {
        await tx.user.deleteMany({ where: { id: { in: sales.map((row) => row.userId) } } });
      }
    });
    await this.audit("sale.delete_all", "ShopSale", "all", null, { deleted: count });
    return { ok: true, deleted: count };
  }

  private async ensureProfilesForAgents() {
    const orphans = await this.prisma.user.findMany({
      where: { role: "AGENT", agentProfile: null },
      take: 100,
    });
    for (const user of orphans) {
      await this.prisma.agentProfile.create({
        data: {
          userId: user.id,
          displayName: user.username,
          phone: user.phone,
          status: user.status,
          permissionsJson: mergePermissions(AGENT_PERMISSION_KEYS),
        },
      });
    }
  }

  private async audit(
    action: string,
    resource: string,
    resourceId: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        action,
        resource,
        resourceId,
        oldValue: oldValue as Prisma.InputJsonValue | undefined,
        newValue: newValue as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

function mapSale(row: {
  id: string;
  shopId: string;
  userId: string;
  label: string;
  code: string | null;
  status: string;
  permissionsJson: Prisma.JsonValue;
  notes: string | null;
  createdAt: Date;
  user: { username: string; wallet: { currency: string; available: { toString(): string }; locked: { toString(): string } } | null };
  shop: { name: string; agentId: string; agent: { displayName: string } };
}): AdminSaleRow {
  return {
    id: row.id,
    shopId: row.shopId,
    shopName: row.shop.name,
    agentId: row.shop.agentId,
    agentName: row.shop.agent.displayName,
    userId: row.userId,
    username: row.user.username,
    label: row.label,
    code: row.code,
    status: row.status,
    permissions: asPermissions(row.permissionsJson, SALE_PERMISSION_KEYS),
    notes: row.notes,
    wallet: toWallet(row.user.wallet),
    createdAt: row.createdAt.toISOString(),
  };
}
