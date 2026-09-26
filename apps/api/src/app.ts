import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { HttpError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import type { CatalogService } from "./modules/catalog/catalog.service.js";
import { identityRoutes } from "./modules/identity/identity.routes.js";
import { IdentityService } from "./modules/identity/identity.service.js";
import { oddsRoutes } from "./modules/odds/odds.routes.js";
import type { OddsService } from "./modules/odds/odds.service.js";
import { systemRoutes } from "./modules/system/system.routes.js";
import type { CatalogRepo } from "./modules/catalog/catalog.repo.js";
import type { OddsIngest } from "./modules/odds/odds.ingest.js";
import { BettingService } from "./modules/betting/betting.service.js";
import { bettingRoutes } from "./modules/betting/betting.routes.js";
import { OddsCache } from "./modules/odds/odds.cache.js";
import { AdminService } from "./modules/admin/admin.service.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import type { SettlementService } from "./modules/settlement/settlement.service.js";
import { walletRoutes } from "./modules/wallet/wallet.routes.js";
import { WalletService } from "./modules/wallet/wallet.service.js";
import { syncRoutes } from "./modules/sync/sync.routes.js";
import type { SyncScheduler } from "./modules/sync/sync.scheduler.js";
import type { SyncService } from "./modules/sync/sync.service.js";
import { OrgService } from "./modules/org/org.service.js";
import { orgRoutes } from "./modules/org/org.routes.js";
import { cashierRoutes } from "./modules/cashier/cashier.routes.js";

export function createApp(deps: {
  catalog: CatalogService;
  odds: OddsService;
  repo: CatalogRepo;
  ingest: OddsIngest;
  settlement: SettlementService;
  runSync: (force?: boolean) => Promise<unknown>;
  syncService: SyncService;
  syncScheduler: SyncScheduler;
}) {
  const app = express();
  const identity = new IdentityService(prisma);
  const wallet = new WalletService(prisma);
  const betting = new BettingService(prisma, new OddsCache());
  const admin = new AdminService(prisma);
  const org = new OrgService(prisma);
  app.use(
    cors({
      origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN, env.CASHIER_ORIGIN, env.AGENT_ORIGIN],
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use(systemRoutes(deps.repo, deps.ingest, deps.runSync, deps.settlement));
  app.use("/api/v1", catalogRoutes(deps.catalog, deps.odds));
  app.use("/api/v1", identityRoutes(identity));
  app.use("/api/v1", walletRoutes(identity, wallet));
  app.use("/api/v1", bettingRoutes(identity, betting, deps.settlement));
  app.use("/api/v1", adminRoutes(identity, admin, betting, wallet, deps.settlement));
  app.use("/api/v1", orgRoutes(identity, org));
  app.use("/api/v1", cashierRoutes(identity, betting, prisma));
  app.use("/api/v1", syncRoutes(identity, deps.syncService, deps.syncScheduler));
  app.use("/api/v1/odds", oddsRoutes(deps.odds));

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, details: error.details });
      return;
    }
    logger.error("Unhandled API error", {
      message: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
