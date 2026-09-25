import { Router } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/errors.js";
import type { CatalogRepo } from "../catalog/catalog.repo.js";
import type { OddsIngest } from "../odds/odds.ingest.js";
import type { SettlementService } from "../settlement/settlement.service.js";

export function systemRoutes(
  repo: CatalogRepo,
  ingest: OddsIngest,
  runSync: (force?: boolean) => Promise<unknown>,
  settlement: SettlementService,
) {
  const router = Router();

  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      res.json({ ok: true, service: "maraki-api" });
    }),
  );

  router.get(
    "/api/v1/meta",
    asyncHandler(async (_req, res) => {
      const lastCatalog = await repo.getState("catalogSyncedAt");
      const lastOdds = await repo.getState("oddsSyncedAt");
      res.json({
        data: {
          sourceBookmaker: ingest.activeBookmaker,
          houseMargin: env.HOUSE_MARGIN,
          sportIds: env.SPORT_IDS,
          providerWsEnabled: ingest.providerWsEnabled,
          lastCatalogSyncAt: lastCatalog ? new Date(Number(lastCatalog)).toISOString() : null,
          lastOddsSyncAt: lastOdds ? new Date(Number(lastOdds)).toISOString() : null,
          pollEnabled: env.ENABLE_ODDSPAPI_POLL,
        },
      });
    }),
  );

  router.post(
    "/api/v1/internal/sync",
    asyncHandler(async (req, res) => {
      const token = req.header("x-internal-token");
      if (token !== env.INTERNAL_TOKEN) throw new HttpError(401, "Unauthorized");
      const result = await runSync(true);
      res.json({ data: result });
    }),
  );

  router.post(
    "/api/v1/internal/settle",
    asyncHandler(async (req, res) => {
      const token = req.header("x-internal-token");
      if (token !== env.INTERNAL_TOKEN) throw new HttpError(401, "Unauthorized");
      res.json({ data: await settlement.settlePending() });
    }),
  );

  return router;
}
