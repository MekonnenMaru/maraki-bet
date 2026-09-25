import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/errors.js";
import { ADMIN_COOKIE, clearAdminCookie, readCookie, setAdminCookie } from "../identity/cookie.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { BettingService } from "../betting/betting.service.js";
import type { SettlementService } from "../settlement/settlement.service.js";
import type { WalletService } from "../wallet/wallet.service.js";
import type { AdminService } from "./admin.service.js";
import { parsePage, parsePageSize } from "./page.js";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const creditSchema = z.object({
  amount: z.coerce.number().min(1).max(1_000_000),
  note: z.string().trim().max(120).optional(),
});

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

const settleSchema = z.object({
  outcome: z.enum(["WON", "LOST", "VOID"]),
});

const boolPatch = z.object({
  enabled: z.boolean().optional(),
  visible: z.boolean().optional(),
  bettingEnabled: z.boolean().optional(),
  displayOrder: z.coerce.number().int().optional(),
  manualStatusOverride: z.string().trim().max(32).nullable().optional(),
});

const roles = ["PLAYER", "AGENT", "CASHIER", "ADMIN"] as const;

function queryString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function queryBool(value: unknown) {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function queryInt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

function paging(req: { query: Record<string, unknown> }) {
  return {
    page: parsePage(queryString(req.query.page)),
    pageSize: parsePageSize(queryString(req.query.pageSize)),
  };
}

function cachePrivate(res: import("express").Response, seconds = 5) {
  res.setHeader("Cache-Control", `private, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
}

export function adminRoutes(
  identity: IdentityService,
  admin: AdminService,
  betting: BettingService,
  wallet: WalletService,
  settlement: SettlementService,
) {
  const router = Router();

  router.post(
    "/admin/auth/login",
    asyncHandler(async (req, res) => {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Username and password required");
      const { token, session } = await identity.login({ ...body.data, portal: "ADMIN" });
      setAdminCookie(res, token);
      res.json({ data: session });
    }),
  );

  router.post(
    "/admin/auth/logout",
    asyncHandler(async (req, res) => {
      await identity.logout(readCookie(req, ADMIN_COOKIE));
      clearAdminCookie(res);
      res.json({ data: { ok: true } });
    }),
  );

  router.get(
    "/admin/auth/me",
    asyncHandler(async (req, res) => {
      res.json({ data: await requireAdmin(identity, req) });
    }),
  );

  router.get(
    "/admin/dashboard",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      cachePrivate(res, 5);
      res.json({
        data: await admin.dashboard({ from: queryString(req.query.from), to: queryString(req.query.to) }),
      });
    }),
  );

  router.get(
    "/admin/settings",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      cachePrivate(res, 30);
      res.json({ data: await admin.settings() });
    }),
  );

  router.get(
    "/admin/fixtures",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const statusRaw = queryString(req.query.statusId);
      const statusId = statusRaw != null ? Number(statusRaw) : undefined;
      cachePrivate(res, 5);
      res.json({
        data: await admin.listFixtures({
          q: queryString(req.query.q),
          statusId: Number.isInteger(statusId) ? statusId : undefined,
          sportId: queryInt(req.query.sportId),
          tournamentId: queryInt(req.query.tournamentId),
          seasonId: queryInt(req.query.seasonId),
          visible: queryBool(req.query.visible),
          bettingEnabled: queryBool(req.query.bettingEnabled),
          ...paging(req),
        }),
      });
    }),
  );

  router.patch(
    "/admin/fixtures/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = boolPatch.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid fixture patch");
      res.json({
        data: await admin.patchFixture(req.params.id, {
          visible: body.data.visible,
          bettingEnabled: body.data.bettingEnabled,
          manualStatusOverride: body.data.manualStatusOverride,
        }),
      });
    }),
  );

  router.delete(
    "/admin/fixtures",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await admin.deleteAllFixtures() });
    }),
  );

  router.delete(
    "/admin/fixtures/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await admin.deleteFixture(req.params.id) });
    }),
  );

  router.get(
    "/admin/sports",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      cachePrivate(res, 5);
      res.json({
        data: await admin.listSports({
          q: queryString(req.query.q),
          enabled: queryBool(req.query.enabled),
          ...paging(req),
        }),
      });
    }),
  );

  router.patch(
    "/admin/sports/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid sport id");
      const body = boolPatch.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid sport patch");
      res.json({
        data: await admin.patchSport(id, {
          enabled: body.data.enabled,
          visible: body.data.visible,
          displayOrder: body.data.displayOrder,
        }),
      });
    }),
  );

  router.delete(
    "/admin/sports",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await admin.deleteAllSports() });
    }),
  );

  router.delete(
    "/admin/sports/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid sport id");
      res.json({ data: await admin.deleteSport(id) });
    }),
  );

  router.get(
    "/admin/tournaments",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      cachePrivate(res, 5);
      res.json({
        data: await admin.listTournaments({
          q: queryString(req.query.q),
          sportId: queryInt(req.query.sportId),
          enabled: queryBool(req.query.enabled),
          visible: queryBool(req.query.visible),
          ...paging(req),
        }),
      });
    }),
  );

  router.patch(
    "/admin/tournaments/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid tournament id");
      const body = boolPatch.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid tournament patch");
      res.json({
        data: await admin.patchTournament(id, {
          enabled: body.data.enabled,
          visible: body.data.visible,
          displayOrder: body.data.displayOrder,
        }),
      });
    }),
  );

  router.delete(
    "/admin/tournaments",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await admin.deleteAllTournaments() });
    }),
  );

  router.delete(
    "/admin/tournaments/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid tournament id");
      res.json({ data: await admin.deleteTournament(id) });
    }),
  );

  router.get(
    "/admin/seasons",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      cachePrivate(res, 5);
      res.json({
        data: await admin.listSeasons({
          q: queryString(req.query.q),
          sportId: queryInt(req.query.sportId),
          tournamentId: queryInt(req.query.tournamentId),
          ...paging(req),
        }),
      });
    }),
  );

  router.delete(
    "/admin/seasons",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await admin.deleteAllSeasons() });
    }),
  );

  router.delete(
    "/admin/seasons/:tournamentId/:seasonId",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const tournamentId = Number(req.params.tournamentId);
      const seasonId = Number(req.params.seasonId);
      if (!Number.isInteger(tournamentId) || !Number.isInteger(seasonId)) {
        throw new HttpError(400, "Invalid season id");
      }
      res.json({ data: await admin.deleteSeason(seasonId, tournamentId) });
    }),
  );

  router.get(
    "/admin/markets",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      cachePrivate(res, 5);
      res.json({
        data: await admin.listMarkets({
          q: queryString(req.query.q),
          sportId: queryInt(req.query.sportId),
          enabled: queryBool(req.query.enabled),
          ...paging(req),
        }),
      });
    }),
  );

  router.patch(
    "/admin/markets/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid market id");
      const body = boolPatch.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid market patch");
      res.json({
        data: await admin.patchMarket(id, {
          enabled: body.data.enabled,
          visible: body.data.visible,
          bettingEnabled: body.data.bettingEnabled,
          displayOrder: body.data.displayOrder,
        }),
      });
    }),
  );

  router.delete(
    "/admin/markets",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await admin.deleteAllMarkets() });
    }),
  );

  router.delete(
    "/admin/markets/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) throw new HttpError(400, "Invalid market id");
      res.json({ data: await admin.deleteMarket(id) });
    }),
  );

  router.get(
    "/admin/odds",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({
        data: await admin.listOdds({
          fixtureId: queryString(req.query.fixtureId),
          ...paging(req),
        }),
      });
    }),
  );

  router.delete(
    "/admin/odds",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const fixtureId = queryString(req.query.fixtureId);
      if (fixtureId) {
        res.json({ data: await admin.deleteFixtureOdds(fixtureId) });
        return;
      }
      res.json({ data: await admin.deleteAllOdds() });
    }),
  );

  router.delete(
    "/admin/odds/:fixtureId/:outcomeId",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const outcomeId = Number(req.params.outcomeId);
      if (!Number.isInteger(outcomeId)) throw new HttpError(400, "Invalid outcome id");
      res.json({
        data: await admin.deleteOddsQuote(req.params.fixtureId, outcomeId),
      });
    }),
  );

  router.get(
    "/admin/users",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const role = queryString(req.query.role);
      if (role && !roles.includes(role as (typeof roles)[number])) {
        throw new HttpError(400, "Unknown role");
      }
      const rolesRaw = queryString(req.query.roles);
      const roleList = rolesRaw
        ?.split(",")
        .map((item) => item.trim())
        .filter((item): item is (typeof roles)[number] => roles.includes(item as (typeof roles)[number]));
      res.json({
        data: await admin.listUsers({
          q: queryString(req.query.q),
          role: role as (typeof roles)[number] | undefined,
          roles: roleList,
          status: queryString(req.query.status),
          ...paging(req),
        }),
      });
    }),
  );

  router.post(
    "/admin/users/:id/status",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = statusSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Status must be ACTIVE or SUSPENDED");
      res.json({ data: await admin.setUserStatus(req.params.id, body.data.status) });
    }),
  );

  router.post(
    "/admin/users/:id/credit",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = creditSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Credit amount is invalid");
      res.json({ data: await wallet.credit(req.params.id, body.data.amount, body.data.note ?? "Admin credit") });
    }),
  );

  router.delete(
    "/admin/users",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      const role = queryString(req.query.role);
      if (role && !roles.includes(role as (typeof roles)[number])) {
        throw new HttpError(400, "Unknown role");
      }
      const rolesRaw = queryString(req.query.roles);
      const roleList = rolesRaw
        ?.split(",")
        .map((item) => item.trim())
        .filter((item): item is (typeof roles)[number] => roles.includes(item as (typeof roles)[number]));
      res.json({
        data: await admin.deleteUsers(
          {
            role: role as (typeof roles)[number] | undefined,
            roles: roleList,
          },
          session.user.id,
        ),
      });
    }),
  );

  router.delete(
    "/admin/users/:id",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      res.json({ data: await admin.deleteUser(req.params.id, session.user.id) });
    }),
  );

  router.get(
    "/admin/bets",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({
        data: await betting.listAll({
          q: queryString(req.query.q),
          status: queryString(req.query.status),
          ...paging(req),
        }),
      });
    }),
  );

  router.delete(
    "/admin/bets",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await betting.deleteAllBets() });
    }),
  );

  router.delete(
    "/admin/bets/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await betting.deleteBet(req.params.id) });
    }),
  );

  router.post(
    "/admin/bets/:code/void",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      await settlement.adminSettle(req.params.code, "VOID");
      res.json({ data: await betting.getByCoupon(req.params.code) });
    }),
  );

  router.post(
    "/admin/bets/:code/settle",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = settleSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Outcome must be WON, LOST, or VOID");
      await settlement.adminSettle(req.params.code, body.data.outcome);
      res.json({ data: await betting.getByCoupon(req.params.code) });
    }),
  );

  router.post(
    "/admin/settle",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await settlement.settlePending() });
    }),
  );

  router.get(
    "/admin/ledger",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({
        data: await wallet.listAllLedger({
          q: queryString(req.query.q),
          type: queryString(req.query.type),
          ...paging(req),
        }),
      });
    }),
  );

  router.delete(
    "/admin/ledger",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await wallet.deleteAllLedger(queryString(req.query.type)) });
    }),
  );

  router.delete(
    "/admin/ledger/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await wallet.deleteLedgerEntry(req.params.id) });
    }),
  );

  return router;
}

async function requireAdmin(identity: IdentityService, req: import("express").Request) {
  const session = await identity.sessionFor(readCookie(req, ADMIN_COOKIE));
  if (!session) throw new HttpError(401, "Not signed in");
  if (session.user.role !== "ADMIN") throw new HttpError(403, "Admin portal only");
  return session;
}
