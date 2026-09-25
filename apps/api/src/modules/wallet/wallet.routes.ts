import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/errors.js";
import { readCookie, SESSION_COOKIE } from "../identity/cookie.js";
import type { IdentityService } from "../identity/identity.service.js";
import type { WalletService } from "./wallet.service.js";

const depositSchema = z.object({
  amount: z.coerce.number().min(1).max(10_000),
});

export function walletRoutes(identity: IdentityService, wallet: WalletService) {
  const router = Router();

  router.get(
    "/wallet",
    asyncHandler(async (req, res) => {
      const userId = await requireUserId(identity, req);
      res.json({ data: await wallet.getWallet(userId) });
    }),
  );

  router.get(
    "/wallet/ledger",
    asyncHandler(async (req, res) => {
      const userId = await requireUserId(identity, req);
      res.json({ data: await wallet.listLedger(userId) });
    }),
  );

  router.post(
    "/wallet/deposit",
    asyncHandler(async (req, res) => {
      const userId = await requireUserId(identity, req);
      const body = depositSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Deposit must be between 1 and 10000 ETB");
      res.json({ data: await wallet.deposit(userId, body.data.amount) });
    }),
  );

  return router;
}

async function requireUserId(identity: IdentityService, req: import("express").Request) {
  const session = await identity.sessionFor(readCookie(req, SESSION_COOKIE));
  if (!session) throw new HttpError(401, "Not signed in");
  return session.user.id;
}
