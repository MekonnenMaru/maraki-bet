import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import type { OddsService } from "./odds.service.js";

export function oddsRoutes(odds: OddsService) {
  const router = Router();

  router.get(
    "/fixtures/:id/quotes",
    asyncHandler(async (req, res) => {
      res.json({ data: await odds.quotesForFixture(req.params.id) });
    }),
  );

  router.post(
    "/hydrate",
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          fixtureIds: z.array(z.string().min(1)).max(120),
        })
        .parse(req.body);
      res.json({ data: await odds.hydrateBoardOdds(body.fixtureIds) });
    }),
  );

  return router;
}
