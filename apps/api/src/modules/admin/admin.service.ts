import type { PrismaClient } from "@prisma/client";
import type {
  AdminBetRow,
  AdminDashboardDto,
  AdminFixtureAdminRow,
  AdminLedgerRow,
  AdminMarketRow,
  AdminOddsRow,
  AdminPageDto,
  AdminSeasonRow,
  AdminSettingsDto,
  AdminSportRow,
  AdminTournamentRow,
  AdminUserRow,
  UserRole,
} from "@maraki/shared";
import { BONUS_MIN_LEGS, BONUS_RATE, VAT_INCLUSIVE } from "@maraki/shared";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/errors.js";
import { BETTING_LIMITS } from "../betting/betting.service.js";
import { toWallet } from "../identity/identity.service.js";
import { OddsCache } from "../odds/odds.cache.js";
import { dashboardRange } from "./dashboard-range.js";
import { pageMeta, toPage } from "./page.js";

export class AdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly oddsCache = new OddsCache(),
  ) {}

  async dashboard(input?: { from?: string; to?: string }): Promise<AdminDashboardDto> {
    const { from, to } = dashboardRange(input?.from, input?.to);
    const inRange = { gte: from, lte: to };

    const [
      totalUsers,
      activePlayers,
      activeAgents,
      openBets,
      liveMatches,
      activeSports,
      activeTournaments,
      upcomingFixtures,
      activeMarkets,
      syncConfig,
      placed,
      settled,
      deposits,
      withdrawals,
      recentBetRows,
      liveBetRows,
      recentLedgerRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: "PLAYER", status: "ACTIVE" } }),
      this.prisma.user.count({ where: { role: "AGENT", status: "ACTIVE" } }),
      this.prisma.bet.count({ where: { status: "ACCEPTED" } }),
      this.prisma.fixture.count({ where: { statusId: 1 } }),
      this.prisma.sport.count({ where: { enabled: true } }),
      this.prisma.tournament.count({ where: { enabled: true } }),
      this.prisma.fixture.count({ where: { statusId: 0, startTime: { gte: new Date() } } }),
      this.prisma.market.count({ where: { enabled: true } }),
      this.prisma.syncConfiguration.findUnique({ where: { id: 1 } }),
      this.prisma.bet.aggregate({
        where: { createdAt: inRange },
        _count: true,
        _sum: { stake: true },
      }),
      this.prisma.bet.aggregate({
        where: { settledAt: inRange, status: { not: "ACCEPTED" } },
        _sum: { stake: true, payout: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { type: "DEPOSIT", createdAt: inRange },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { type: "WITHDRAWAL", createdAt: inRange },
        _sum: { amount: true },
      }),
      this.prisma.bet.findMany({
        where: { createdAt: inRange },
        include: { selections: true, user: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.prisma.bet.findMany({
        where: { status: "ACCEPTED" },
        include: { selections: true, user: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      this.prisma.ledgerEntry.findMany({
        where: { createdAt: inRange },
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const volume = money(placed._sum.stake);
    const settledStake = Number(settled._sum.stake?.toString() ?? "0");
    const settledPayout = Number(settled._sum.payout?.toString() ?? "0");

    return {
      currency: "ETB",
      from: from.toISOString(),
      to: to.toISOString(),
      snapshot: {
        totalUsers,
        activePlayers,
        activeAgents,
        openBets,
        liveMatches,
        activeSports,
        activeTournaments,
        upcomingFixtures,
        activeMarkets,
        lastSuccessfulSyncAt: syncConfig?.lastSuccessAt?.toISOString() ?? null,
        syncHealthy: Boolean(syncConfig?.lastSuccessAt) && !syncConfig?.lastError,
      },
      period: {
        totalBets: placed._count,
        volume,
        revenue: (settledStake - settledPayout).toFixed(2),
        deposits: money(deposits._sum.amount),
        withdrawals: money(withdrawals._sum.amount),
      },
      recentBets: recentBetRows.map(toAdminBet),
      liveBets: liveBetRows.map(toAdminBet),
      recentLedger: recentLedgerRows.map(toAdminLedger),
    };
  }

  async listUsers(filters?: {
    q?: string;
    role?: UserRole;
    roles?: UserRole[];
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminUserRow>> {
    const q = filters?.q?.trim();
    const status = filters?.status?.trim();
    const where = {
      ...(filters?.role ? { role: filters.role } : {}),
      ...(filters?.roles?.length ? { role: { in: filters.roles } } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [{ username: { contains: q } }, { phone: { contains: q } }],
          }
        : {}),
    };
    const total = await this.prisma.user.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.user.findMany({
      where,
      include: { wallet: true, _count: { select: { bets: true } } },
      orderBy: { createdAt: "desc" },
      skip: meta.skip,
      take: meta.pageSize,
    });
    return toPage(
      rows.map((row) => ({
        id: row.id,
        username: row.username,
        phone: row.phone,
        role: row.role as AdminUserRow["role"],
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        bets: row._count.bets,
        wallet: toWallet(row.wallet),
      })),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async setUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED") {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, "User not found");
    if (user.role === "ADMIN") throw new HttpError(400, "Cannot change an admin from here");
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { status } });
    return { id: updated.id, status: updated.status };
  }

  async deleteUser(userId: string, actorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { agentProfile: { include: { _count: { select: { shops: true } } } }, shopSale: true },
    });
    if (!user) throw new HttpError(404, "User not found");
    if (actorId && user.id === actorId) throw new HttpError(400, "Cannot delete your own account");
    if (user.role === "ADMIN") {
      const adminCount = await this.prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) throw new HttpError(400, "Cannot delete the last admin");
    }
    if (user.agentProfile && user.agentProfile._count.shops > 0) {
      throw new HttpError(400, "Remove or reassign shops before deleting this agent");
    }
    await this.prisma.user.delete({ where: { id: userId } });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "user.delete",
        resource: "User",
        resourceId: userId,
        oldValue: { username: user.username, role: user.role },
      },
    });
    return { ok: true as const, deleted: 1 };
  }

  async deleteUsers(
    filters?: { role?: UserRole; roles?: UserRole[] },
    actorId?: string,
  ) {
    const roleFilter = filters?.role
      ? { role: filters.role }
      : filters?.roles?.length
        ? { role: { in: filters.roles } }
        : {};
    const rows = await this.prisma.user.findMany({
      where: {
        ...roleFilter,
        ...(actorId ? { id: { not: actorId } } : {}),
      },
      select: { id: true, role: true },
    });
    const adminTotal = await this.prisma.user.count({ where: { role: "ADMIN" } });
    const adminDeletes = rows.filter((row) => row.role === "ADMIN").length;
    if (adminTotal - adminDeletes < 1 && adminDeletes > 0) {
      throw new HttpError(400, "Cannot delete every admin account");
    }
    // Agents with shops block cascade; skip those so bulk delete still progresses.
    const agentsWithShops = await this.prisma.agentProfile.findMany({
      where: { shops: { some: {} } },
      select: { userId: true },
    });
    const blocked = new Set(agentsWithShops.map((row) => row.userId));
    const ids = rows.map((row) => row.id).filter((id) => !blocked.has(id));
    if (ids.length === 0) return { ok: true as const, deleted: 0 };
    const result = await this.prisma.user.deleteMany({ where: { id: { in: ids } } });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "user.delete_all",
        resource: "User",
        newValue: { deleted: result.count, role: filters?.role ?? filters?.roles ?? "ALL" },
      },
    });
    return { ok: true as const, deleted: result.count };
  }

  async listFixtures(filters?: {
    q?: string;
    statusId?: number;
    sportId?: number;
    tournamentId?: number;
    seasonId?: number;
    visible?: boolean;
    bettingEnabled?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminFixtureAdminRow>> {
    const q = filters?.q?.trim();
    const where = {
      ...(filters?.statusId != null ? { statusId: filters.statusId } : {}),
      ...(filters?.sportId != null ? { sportId: filters.sportId } : {}),
      ...(filters?.tournamentId != null ? { tournamentId: filters.tournamentId } : {}),
      ...(filters?.seasonId != null ? { seasonId: filters.seasonId } : {}),
      ...(filters?.visible != null ? { visible: filters.visible } : {}),
      ...(filters?.bettingEnabled != null ? { bettingEnabled: filters.bettingEnabled } : {}),
      ...(q
        ? {
            OR: [
              { home: { name: { contains: q } } },
              { away: { name: { contains: q } } },
              { tournament: { name: { contains: q } } },
              { sport: { name: { contains: q } } },
            ],
          }
        : {}),
    };
    const total = await this.prisma.fixture.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.fixture.findMany({
      where,
      include: { sport: true, tournament: true, home: true, away: true },
      orderBy: { startTime: "desc" },
      skip: meta.skip,
      take: meta.pageSize,
    });
    return toPage(
      rows.map((row) => ({
        id: row.id,
        sportId: row.sportId,
        sportName: row.sport.name,
        tournamentId: row.tournamentId,
        tournamentName: row.tournament.name,
        seasonId: row.seasonId,
        seasonName: row.seasonName,
        home: row.home?.name ?? "Home",
        away: row.away?.name ?? "Away",
        startTime: row.startTime.toISOString(),
        statusId: row.statusId,
        statusName: row.statusName,
        providerStatus: row.statusName,
        manualStatusOverride: row.manualStatusOverride,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        visible: row.visible,
        bettingEnabled: row.bettingEnabled,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      })),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async patchFixture(
    id: string,
    patch: { visible?: boolean; bettingEnabled?: boolean; manualStatusOverride?: string | null },
  ) {
    const row = await this.prisma.fixture.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Fixture not found");
    const updated = await this.prisma.fixture.update({
      where: { id },
      data: {
        visible: patch.visible,
        bettingEnabled: patch.bettingEnabled,
        manualStatusOverride: patch.manualStatusOverride,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        action: "fixture.update",
        resource: "Fixture",
        resourceId: id,
        oldValue: {
          visible: row.visible,
          bettingEnabled: row.bettingEnabled,
          manualStatusOverride: row.manualStatusOverride,
        },
        newValue: {
          visible: updated.visible,
          bettingEnabled: updated.bettingEnabled,
          manualStatusOverride: updated.manualStatusOverride,
        },
      },
    });
    return {
      id: updated.id,
      visible: updated.visible,
      bettingEnabled: updated.bettingEnabled,
      manualStatusOverride: updated.manualStatusOverride,
    };
  }

  async listSports(filters?: {
    q?: string;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminSportRow>> {
    const q = filters?.q?.trim();
    const where = {
      ...(filters?.enabled != null ? { enabled: filters.enabled } : {}),
      ...(q
        ? {
            OR: [{ name: { contains: q } }, { slug: { contains: q } }],
          }
        : {}),
    };
    const total = await this.prisma.sport.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.sport.findMany({
      where,
      include: { _count: { select: { fixtures: true, tournaments: true, markets: true } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      skip: meta.skip,
      take: meta.pageSize,
    });
    const sportIds = rows.map((row) => row.id);
    const seasonCountBySport = await this.countDistinctSeasons({ sportIds });
    return toPage(
      rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        name: row.name,
        slug: row.slug,
        enabled: row.enabled,
        visible: row.visible,
        displayOrder: row.displayOrder,
        fixtureCount: row._count.fixtures,
        tournamentCount: row._count.tournaments,
        seasonCount: seasonCountBySport.get(row.id) ?? 0,
        marketCount: row._count.markets,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      })),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async patchSport(
    id: number,
    patch: { enabled?: boolean; visible?: boolean; displayOrder?: number },
  ) {
    const row = await this.prisma.sport.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Sport not found");
    const updated = await this.prisma.sport.update({
      where: { id },
      data: {
        enabled: patch.enabled,
        visible: patch.visible,
        displayOrder: patch.displayOrder,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        action: "sport.update",
        resource: "Sport",
        resourceId: String(id),
        oldValue: { enabled: row.enabled, visible: row.visible, displayOrder: row.displayOrder },
        newValue: {
          enabled: updated.enabled,
          visible: updated.visible,
          displayOrder: updated.displayOrder,
        },
      },
    });
    return {
      id: updated.id,
      enabled: updated.enabled,
      visible: updated.visible,
      displayOrder: updated.displayOrder,
    };
  }

  async listTournaments(filters?: {
    q?: string;
    sportId?: number;
    enabled?: boolean;
    visible?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminTournamentRow>> {
    const q = filters?.q?.trim();
    const where = {
      ...(filters?.sportId != null ? { sportId: filters.sportId } : {}),
      ...(filters?.enabled != null ? { enabled: filters.enabled } : {}),
      ...(filters?.visible != null ? { visible: filters.visible } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { slug: { contains: q } },
              { categoryName: { contains: q } },
            ],
          }
        : {}),
    };
    const total = await this.prisma.tournament.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.tournament.findMany({
      where,
      include: { sport: true, _count: { select: { fixtures: true } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      skip: meta.skip,
      take: meta.pageSize,
    });
    const tournamentIds = rows.map((row) => row.id);
    const seasonCountByTournament = await this.countDistinctSeasons({ tournamentIds });
    return toPage(
      rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        sportId: row.sportId,
        sportName: row.sport.name,
        name: row.name,
        slug: row.slug,
        categoryName: row.categoryName,
        enabled: row.enabled,
        visible: row.visible,
        displayOrder: row.displayOrder,
        fixtureCount: row._count.fixtures,
        seasonCount: seasonCountByTournament.get(row.id) ?? 0,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      })),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async patchTournament(
    id: number,
    patch: { enabled?: boolean; visible?: boolean; displayOrder?: number },
  ) {
    const row = await this.prisma.tournament.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Tournament not found");
    const updated = await this.prisma.tournament.update({
      where: { id },
      data: {
        enabled: patch.enabled,
        visible: patch.visible,
        displayOrder: patch.displayOrder,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        action: "tournament.update",
        resource: "Tournament",
        resourceId: String(id),
        oldValue: { enabled: row.enabled, visible: row.visible, displayOrder: row.displayOrder },
        newValue: {
          enabled: updated.enabled,
          visible: updated.visible,
          displayOrder: updated.displayOrder,
        },
      },
    });
    return {
      id: updated.id,
      enabled: updated.enabled,
      visible: updated.visible,
      displayOrder: updated.displayOrder,
    };
  }

  async listSeasons(filters?: {
    q?: string;
    sportId?: number;
    tournamentId?: number;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminSeasonRow>> {
    const grouped = await this.prisma.fixture.groupBy({
      by: ["seasonId", "seasonName", "sportId", "tournamentId"],
      where: {
        seasonId: { not: null },
        ...(filters?.sportId != null ? { sportId: filters.sportId } : {}),
        ...(filters?.tournamentId != null ? { tournamentId: filters.tournamentId } : {}),
        ...(filters?.q?.trim()
          ? { seasonName: { contains: filters.q.trim() } }
          : {}),
      },
      _count: { _all: true },
      orderBy: { seasonName: "desc" },
    });
    const sportIds = [...new Set(grouped.map((row) => row.sportId))];
    const tournamentIds = [...new Set(grouped.map((row) => row.tournamentId))];
    const [sports, tournaments] = await Promise.all([
      this.prisma.sport.findMany({ where: { id: { in: sportIds } } }),
      this.prisma.tournament.findMany({ where: { id: { in: tournamentIds } } }),
    ]);
    const sportMap = new Map(sports.map((row) => [row.id, row.name]));
    const tournamentMap = new Map(tournaments.map((row) => [row.id, row.name]));
    const items = grouped
      .filter((row) => row.seasonId != null)
      .map((row) => ({
        seasonId: row.seasonId as number,
        seasonName: row.seasonName ?? `Season ${row.seasonId}`,
        sportId: row.sportId,
        sportName: sportMap.get(row.sportId) ?? `Sport ${row.sportId}`,
        tournamentId: row.tournamentId,
        tournamentName: tournamentMap.get(row.tournamentId) ?? `Tournament ${row.tournamentId}`,
        fixtureCount: row._count._all,
      }));
    const total = items.length;
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    return toPage(items.slice(meta.skip, meta.skip + meta.pageSize), total, meta.page, meta.pageSize);
  }

  async listMarkets(filters?: {
    q?: string;
    sportId?: number;
    enabled?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminMarketRow>> {
    const q = filters?.q?.trim();
    const where = {
      ...(filters?.sportId != null ? { sportId: filters.sportId } : {}),
      ...(filters?.enabled != null ? { enabled: filters.enabled } : {}),
      ...(q
        ? {
            OR: [{ name: { contains: q } }, { nameShort: { contains: q } }, { marketType: { contains: q } }],
          }
        : {}),
    };
    const total = await this.prisma.market.count({ where });
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 20);
    const rows = await this.prisma.market.findMany({
      where,
      include: { sport: true, _count: { select: { outcomes: true } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      skip: meta.skip,
      take: meta.pageSize,
    });
    return toPage(
      rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        sportId: row.sportId,
        sportName: row.sport.name,
        name: row.name,
        nameShort: row.nameShort,
        marketType: row.marketType,
        period: row.period,
        enabled: row.enabled,
        visible: row.visible,
        bettingEnabled: row.bettingEnabled,
        displayOrder: row.displayOrder,
        outcomeCount: row._count.outcomes,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      })),
      total,
      meta.page,
      meta.pageSize,
    );
  }

  async patchMarket(
    id: number,
    patch: {
      enabled?: boolean;
      visible?: boolean;
      bettingEnabled?: boolean;
      displayOrder?: number;
    },
  ) {
    const row = await this.prisma.market.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Market not found");
    const updated = await this.prisma.market.update({
      where: { id },
      data: {
        enabled: patch.enabled,
        visible: patch.visible,
        bettingEnabled: patch.bettingEnabled,
        displayOrder: patch.displayOrder,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        action: "market.update",
        resource: "Market",
        resourceId: String(id),
        oldValue: {
          enabled: row.enabled,
          visible: row.visible,
          bettingEnabled: row.bettingEnabled,
          displayOrder: row.displayOrder,
        },
        newValue: {
          enabled: updated.enabled,
          visible: updated.visible,
          bettingEnabled: updated.bettingEnabled,
          displayOrder: updated.displayOrder,
        },
      },
    });
    return {
      id: updated.id,
      enabled: updated.enabled,
      visible: updated.visible,
      bettingEnabled: updated.bettingEnabled,
      displayOrder: updated.displayOrder,
    };
  }

  async listOdds(filters?: {
    fixtureId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AdminPageDto<AdminOddsRow>> {
    const fixtureId = filters?.fixtureId?.trim();
    if (!fixtureId) {
      return toPage([], 0, 1, filters?.pageSize ?? 20);
    }
    const quotes = await this.oddsCache.read(fixtureId);
    const marketIds = [...new Set(quotes.map((q) => q.marketId))];
    const outcomeIds = [...new Set(quotes.map((q) => q.outcomeId))];
    const [markets, outcomes] = await Promise.all([
      this.prisma.market.findMany({ where: { id: { in: marketIds } } }),
      this.prisma.outcome.findMany({ where: { id: { in: outcomeIds } } }),
    ]);
    const marketMap = new Map(markets.map((row) => [row.id, row.name]));
    const outcomeMap = new Map(outcomes.map((row) => [row.id, row.name]));
    const items = quotes.map((quote) => ({
      fixtureId,
      marketId: quote.marketId,
      marketName: marketMap.get(quote.marketId) ?? `Market ${quote.marketId}`,
      outcomeId: quote.outcomeId,
      outcomeName: outcomeMap.get(quote.outcomeId) ?? String(quote.outcomeId),
      sourceOdds: quote.sourcePrice,
      finalOdds: quote.housePrice,
      active: quote.active,
      updatedAt: quote.changedAt ? new Date(quote.changedAt).toISOString() : null,
    }));
    const total = items.length;
    const meta = pageMeta(total, filters?.page ?? 1, filters?.pageSize ?? 50);
    return toPage(items.slice(meta.skip, meta.skip + meta.pageSize), total, meta.page, meta.pageSize);
  }

  async deleteSport(id: number) {
    const row = await this.prisma.sport.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Sport not found");
    const fixtures = await this.prisma.fixture.findMany({
      where: { sportId: id },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.fixture.deleteMany({ where: { sportId: id } }),
      this.prisma.tournament.deleteMany({ where: { sportId: id } }),
      this.prisma.market.deleteMany({ where: { sportId: id } }),
      this.prisma.sport.delete({ where: { id } }),
    ]);
    await Promise.all(fixtures.map((fixture) => this.oddsCache.clearFixture(fixture.id)));
    await this.prisma.auditLog.create({
      data: {
        action: "sport.delete",
        resource: "Sport",
        resourceId: String(id),
        oldValue: { name: row.name, slug: row.slug },
      },
    });
    return { ok: true as const, deleted: 1 };
  }

  async deleteAllSports() {
    const fixtures = await this.prisma.fixture.findMany({ select: { id: true } });
    const count = await this.prisma.sport.count();
    await this.prisma.$transaction([
      this.prisma.fixture.deleteMany({}),
      this.prisma.tournament.deleteMany({}),
      this.prisma.market.deleteMany({}),
      this.prisma.sport.deleteMany({}),
    ]);
    await Promise.all(fixtures.map((fixture) => this.oddsCache.clearFixture(fixture.id)));
    await this.prisma.auditLog.create({
      data: { action: "sport.delete_all", resource: "Sport", newValue: { deleted: count } },
    });
    return { ok: true as const, deleted: count };
  }

  async deleteTournament(id: number) {
    const row = await this.prisma.tournament.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Tournament not found");
    const fixtures = await this.prisma.fixture.findMany({
      where: { tournamentId: id },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.fixture.deleteMany({ where: { tournamentId: id } }),
      this.prisma.tournament.delete({ where: { id } }),
    ]);
    await Promise.all(fixtures.map((fixture) => this.oddsCache.clearFixture(fixture.id)));
    await this.prisma.auditLog.create({
      data: {
        action: "tournament.delete",
        resource: "Tournament",
        resourceId: String(id),
        oldValue: { name: row.name },
      },
    });
    return { ok: true as const, deleted: 1 };
  }

  async deleteAllTournaments() {
    const fixtures = await this.prisma.fixture.findMany({ select: { id: true } });
    const count = await this.prisma.tournament.count();
    await this.prisma.$transaction([
      this.prisma.fixture.deleteMany({}),
      this.prisma.tournament.deleteMany({}),
    ]);
    await Promise.all(fixtures.map((fixture) => this.oddsCache.clearFixture(fixture.id)));
    await this.prisma.auditLog.create({
      data: { action: "tournament.delete_all", resource: "Tournament", newValue: { deleted: count } },
    });
    return { ok: true as const, deleted: count };
  }

  async deleteFixture(id: string) {
    const row = await this.prisma.fixture.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Fixture not found");
    await this.prisma.fixture.delete({ where: { id } });
    await this.oddsCache.clearFixture(id);
    await this.prisma.auditLog.create({
      data: {
        action: "fixture.delete",
        resource: "Fixture",
        resourceId: id,
        oldValue: { sportId: row.sportId, tournamentId: row.tournamentId },
      },
    });
    return { ok: true as const, deleted: 1 };
  }

  async deleteAllFixtures() {
    const fixtures = await this.prisma.fixture.findMany({ select: { id: true } });
    const count = fixtures.length;
    await this.prisma.fixture.deleteMany({});
    await Promise.all(fixtures.map((fixture) => this.oddsCache.clearFixture(fixture.id)));
    await this.prisma.auditLog.create({
      data: { action: "fixture.delete_all", resource: "Fixture", newValue: { deleted: count } },
    });
    return { ok: true as const, deleted: count };
  }

  async deleteMarket(id: number) {
    const row = await this.prisma.market.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, "Market not found");
    await this.prisma.market.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        action: "market.delete",
        resource: "Market",
        resourceId: String(id),
        oldValue: { name: row.name, sportId: row.sportId },
      },
    });
    return { ok: true as const, deleted: 1 };
  }

  async deleteAllMarkets() {
    const count = await this.prisma.market.count();
    await this.prisma.market.deleteMany({});
    await this.prisma.auditLog.create({
      data: { action: "market.delete_all", resource: "Market", newValue: { deleted: count } },
    });
    return { ok: true as const, deleted: count };
  }

  async deleteSeason(seasonId: number, tournamentId: number) {
    const result = await this.prisma.fixture.updateMany({
      where: { seasonId, tournamentId },
      data: { seasonId: null, seasonName: null },
    });
    await this.prisma.auditLog.create({
      data: {
        action: "season.delete",
        resource: "Season",
        resourceId: `${tournamentId}:${seasonId}`,
        newValue: { cleared: result.count },
      },
    });
    return { ok: true as const, deleted: result.count };
  }

  async deleteAllSeasons() {
    const result = await this.prisma.fixture.updateMany({
      where: { seasonId: { not: null } },
      data: { seasonId: null, seasonName: null },
    });
    await this.prisma.auditLog.create({
      data: { action: "season.delete_all", resource: "Season", newValue: { cleared: result.count } },
    });
    return { ok: true as const, deleted: result.count };
  }

  /** Distinct provider seasons on fixtures, keyed by sportId or tournamentId. */
  private async countDistinctSeasons(scope: { sportIds?: number[]; tournamentIds?: number[] }) {
    const sportIds = scope.sportIds?.filter((id) => Number.isInteger(id)) ?? [];
    const tournamentIds = scope.tournamentIds?.filter((id) => Number.isInteger(id)) ?? [];
    if (sportIds.length === 0 && tournamentIds.length === 0) return new Map<number, number>();

    const rows = await this.prisma.fixture.findMany({
      where: {
        seasonId: { not: null },
        ...(sportIds.length ? { sportId: { in: sportIds } } : {}),
        ...(tournamentIds.length ? { tournamentId: { in: tournamentIds } } : {}),
      },
      select: { sportId: true, tournamentId: true, seasonId: true },
      distinct: ["sportId", "tournamentId", "seasonId"],
    });

    const counts = new Map<number, number>();
    for (const row of rows) {
      const key = tournamentIds.length ? row.tournamentId : row.sportId;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  async deleteOddsQuote(fixtureId: string, outcomeId: number, playerId = 0) {
    await this.oddsCache.clearQuote(fixtureId, outcomeId, playerId);
    return { ok: true as const, deleted: 1 };
  }

  async deleteFixtureOdds(fixtureId: string) {
    await this.oddsCache.clearFixture(fixtureId);
    return { ok: true as const, deleted: 1 };
  }

  async deleteAllOdds() {
    const deleted = await this.oddsCache.clearAll();
    await this.prisma.auditLog.create({
      data: { action: "odds.delete_all", resource: "Odds", newValue: { deleted } },
    });
    return { ok: true as const, deleted };
  }

  async settings(): Promise<AdminSettingsDto> {
    const [lastCatalog, lastOdds] = await Promise.all([
      this.prisma.syncState.findUnique({ where: { key: "catalogSyncedAt" } }),
      this.prisma.syncState.findUnique({ where: { key: "oddsSyncedAt" } }),
    ]);
    return {
      currency: "ETB",
      sourceBookmaker: env.SOURCE_BOOKMAKER,
      houseMargin: env.HOUSE_MARGIN,
      sportIds: env.SPORT_IDS,
      lastCatalogSyncAt: lastCatalog ? new Date(Number(lastCatalog.value)).toISOString() : null,
      lastOddsSyncAt: lastOdds ? new Date(Number(lastOdds.value)).toISOString() : null,
      pollEnabled: env.ENABLE_ODDSPAPI_POLL,
      providerWsEnabled: env.ODDSPAPI_ENABLE_WS,
      minStake: BETTING_LIMITS.minStake,
      maxStake: BETTING_LIMITS.maxStake,
      oddsTolerance: BETTING_LIMITS.oddsTolerance,
      vatInclusive: VAT_INCLUSIVE,
      bonusMinLegs: BONUS_MIN_LEGS,
      bonusRate: BONUS_RATE,
    };
  }
}

function money(value?: { toString(): string } | null) {
  return Number(value?.toString() ?? "0").toFixed(2);
}

function toAdminBet(row: {
  id: string;
  userId: string;
  couponCode: string;
  type: string;
  status: string;
  stake: { toString(): string };
  vat: { toString(): string };
  netStake: { toString(): string };
  combinedOdds: { toString(): string };
  bonus: { toString(): string };
  possibleWin: { toString(): string };
  payout: { toString(): string } | null;
  settledAt: Date | null;
  createdAt: Date;
  user: { username: string };
  selections: Array<{
    fixtureLabel: string;
    marketName: string;
    selection: string;
    placedOdds: { toString(): string };
    status: string;
  }>;
}): AdminBetRow {
  return {
    id: row.id,
    couponCode: row.couponCode,
    type: row.type,
    status: row.status,
    stake: money(row.stake),
    vat: money(row.vat),
    netStake: money(row.netStake),
    combinedOdds: Number(row.combinedOdds.toString()).toFixed(2),
    bonus: money(row.bonus),
    possibleWin: money(row.possibleWin),
    payout: money(row.payout),
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    selections: row.selections.map((item) => ({
      fixtureLabel: item.fixtureLabel,
      marketName: item.marketName,
      selection: item.selection,
      placedOdds: Number(item.placedOdds.toString()).toFixed(2),
      status: item.status,
    })),
    username: row.user.username,
    userId: row.userId,
  };
}

function toAdminLedger(row: {
  id: string;
  userId: string;
  type: string;
  amount: { toString(): string };
  balanceAfter: { toString(): string };
  ref: string | null;
  note: string | null;
  createdAt: Date;
  user: { username: string };
}): AdminLedgerRow {
  return {
    id: row.id,
    userId: row.userId,
    username: row.user.username,
    type: row.type,
    amount: money(row.amount),
    balanceAfter: money(row.balanceAfter),
    ref: row.ref,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
