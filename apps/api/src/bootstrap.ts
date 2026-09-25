import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { CatalogRepo } from "./modules/catalog/catalog.repo.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { CatalogSync } from "./modules/catalog/catalog.sync.js";
import { OddsPapiHttpClient, OddsPapiWsClient } from "./modules/oddspapi/index.js";
import { OddsCache } from "./modules/odds/odds.cache.js";
import { OddsIngest } from "./modules/odds/odds.ingest.js";
import { OddsService } from "./modules/odds/odds.service.js";
import { PricingService } from "./modules/pricing/pricing.service.js";
import { SettlementService } from "./modules/settlement/settlement.service.js";
import { SyncScheduler } from "./modules/sync/sync.scheduler.js";
import { SyncService } from "./modules/sync/sync.service.js";

export function createServices() {
  const provider = new OddsPapiHttpClient();
  const repo = new CatalogRepo();
  const catalog = new CatalogService(repo);
  const sync = new CatalogSync(provider, repo);
  const cache = new OddsCache();
  const pricing = new PricingService();
  const ingest = new OddsIngest(provider, repo, cache, pricing);
  const odds = new OddsService(cache, catalog, repo, ingest);
  const settlement = new SettlementService(prisma);
  const syncService = new SyncService(prisma, provider, sync, ingest, settlement);
  const syncScheduler = new SyncScheduler(syncService);

  const runSync = async (force = false) => {
    // Startup/system sync only when explicitly allowed — never bypasses master switch.
    const job = await syncService.start({
      trigger: "SYSTEM",
      scope: "EVERYTHING",
      force,
      wait: true,
    });
    return job;
  };

  const startProviderFeed = () => {
    void syncService.reconcileOrphans().catch(() => undefined);

    if (env.ODDSPAPI_ENABLE_WS) {
      const ws = new OddsPapiWsClient({
        onStatus: (connected, reason) => {
          ingest.setProviderWs(connected);
          if (!connected) {
            logger.warn("OddsPapi WS unavailable; REST snapshots remain the source", { reason });
          }
        },
        onMessage: (message) => {
          void ingest.handleWsMessage(message);
        },
      });
      ws.start();
    } else {
      logger.info("OddsPapi WebSocket disabled; using REST snapshots only");
    }

    void syncScheduler.start().catch((error) => {
      logger.error("Sync scheduler failed to start", {
        message: error instanceof Error ? error.message : error,
      });
    });
  };

  return {
    provider,
    repo,
    catalog,
    sync,
    ingest,
    odds,
    settlement,
    syncService,
    syncScheduler,
    runSync,
    startProviderFeed,
  };
}
