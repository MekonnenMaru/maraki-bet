import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/errors.js";
import { readCookie, SESSION_COOKIE } from "../identity/cookie.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { SettlementService } from "../settlement/settlement.service.js";
import type { BettingService } from "./betting.service.js";

const placeSchema = z.object({
  stake: z.coerce.number().min(1).max(100_000),
  acceptChanges: z.boolean().optional().default(false),
  selections: z
    .array(
      z.object({
        fixtureId: z.string().min(1),
        marketId: z.number().int(),
        outcomeId: z.number().int(),
        playerId: z.number().int().default(0),
        marketName: z.string().min(1),
        selection: z.string().min(1),
        fixtureLabel: z.string().min(1),
        placedOdds: z.number().positive(),
      }),
    )
    .min(1)
    .max(20),
});

const testSettleSchema = z.object({
  outcome: z.enum(["WON", "LOST", "VOID"]),
});

export function bettingRoutes(identity: IdentityService, betting: BettingService, settlement: SettlementService) {
  const router = Router();

  router.post(
    "/bets",
    asyncHandler(async (req, res) => {
      const session = await identity.sessionFor(readCookie(req, SESSION_COOKIE));
      if (!session) throw new HttpError(401, "Login to place a bet");
      const body = placeSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "Invalid bet");
      res.status(201).json({ data: await betting.place(session.user.id, body.data) });
    }),
  );

  router.get(
    "/bets",
    asyncHandler(async (req, res) => {
      const session = await identity.sessionFor(readCookie(req, SESSION_COOKIE));
      if (!session) throw new HttpError(401, "Login to view your bets");
      res.json({ data: await betting.listForUser(session.user.id) });
    }),
  );

  router.get(
    "/coupons/:code",
    asyncHandler(async (req, res) => {
      res.json({ data: await betting.getByCoupon(req.params.code) });
    }),
  );

  router.post(
    "/bets/:code/test-settle",
    asyncHandler(async (req, res) => {
      const session = await identity.sessionFor(readCookie(req, SESSION_COOKIE));
      if (!session) throw new HttpError(401, "Login to settle a test coupon");
      const body = testSettleSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Outcome must be WON, LOST, or VOID");
      await settlement.testSettle(session.user.id, req.params.code, body.data.outcome);
      res.json({ data: await betting.getByCoupon(req.params.code) });
    }),
  );

  return router;
}
