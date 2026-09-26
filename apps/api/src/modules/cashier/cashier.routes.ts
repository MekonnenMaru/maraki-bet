import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/errors.js";
import {
  CASHIER_COOKIE,
  clearCashierCookie,
  readCookie,
  setCashierCookie,
} from "../identity/cookie.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { BettingService } from "../betting/betting.service.js";
import { CashierService } from "./cashier.service.js";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const placeSchema = z.object({
  acceptChanges: z.boolean().optional(),
});

export function cashierRoutes(identity: IdentityService, betting: BettingService, prisma: PrismaClient) {
  const router = Router();
  const cashier = new CashierService(prisma);

  router.post(
    "/cashier/auth/login",
    asyncHandler(async (req, res) => {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Username and password required");
      const { token, session } = await identity.login({ ...body.data, portal: "CASHIER" });
      const desk = await cashier.loadDesk(session.user.id);
      if (!desk) throw new HttpError(403, "No active shop desk for this cashier");
      setCashierCookie(res, token);
      res.json({ data: { ...session, desk } });
    }),
  );

  router.post(
    "/cashier/auth/logout",
    asyncHandler(async (req, res) => {
      await identity.logout(readCookie(req, CASHIER_COOKIE));
      clearCashierCookie(res);
      res.json({ data: { ok: true } });
    }),
  );

  router.get(
    "/cashier/auth/me",
    asyncHandler(async (req, res) => {
      const { session, desk } = await requireCashier(identity, cashier, req);
      res.json({ data: { ...session, desk } });
    }),
  );

  router.get(
    "/cashier/dashboard",
    asyncHandler(async (req, res) => {
      const { session } = await requireCashier(identity, cashier, req);
      res.setHeader("Cache-Control", "private, max-age=5, stale-while-revalidate=10");
      res.json({ data: await cashier.dashboard(session.user.id) });
    }),
  );

  router.get(
    "/cashier/bets",
    asyncHandler(async (req, res) => {
      const { session } = await requireCashier(identity, cashier, req);
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
      res.json({
        data: await cashier.listBets(session.user.id, {
          limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
        }),
      });
    }),
  );

  router.get(
    "/cashier/coupons/:code",
    asyncHandler(async (req, res) => {
      await requireCashier(identity, cashier, req);
      res.json({ data: await betting.getForLoad(req.params.code) });
    }),
  );

  router.post(
    "/cashier/coupons/:code/place",
    asyncHandler(async (req, res) => {
      const { session } = await requireCashier(identity, cashier, req);
      const body = placeSchema.safeParse(req.body ?? {});
      if (!body.success) throw new HttpError(400, "Invalid place body");
      res.status(201).json({
        data: await betting.placeBooking(session.user.id, req.params.code, {
          acceptChanges: body.data.acceptChanges,
        }),
      });
    }),
  );

  return router;
}

async function requireCashier(
  identity: IdentityService,
  cashier: CashierService,
  req: import("express").Request,
) {
  const session = await identity.sessionFor(readCookie(req, CASHIER_COOKIE));
  if (!session) throw new HttpError(401, "Not signed in");
  if (session.user.role !== "CASHIER") throw new HttpError(403, "Cashier portal only");
  const desk = await cashier.loadDesk(session.user.id);
  if (!desk) throw new HttpError(403, "No active shop desk for this cashier");
  return { session, desk };
}
