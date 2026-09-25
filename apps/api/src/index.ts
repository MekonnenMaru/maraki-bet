import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createServices } from "./bootstrap.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { ensureUtcSession, prisma } from "./lib/prisma.js";
import { redis, redisSub } from "./lib/redis.js";
import { RealtimeHub } from "./modules/realtime/hub.js";

async function main() {
  // Keep Node on UTC so Prisma MySQL DATETIME stores provider UTC, not EAT wall-clock.
  process.env.TZ = "UTC";
  const services = createServices();
  const app = createApp(services);
  const server = createServer(app);
  const hub = new RealtimeHub();
  hub.attach(server);

  await redis.connect();
  await redisSub.connect();
  await hub.listenRedis();
  await prisma.$connect();
  await ensureUtcSession();

  server.listen(env.API_PORT, () => {
    logger.info(`API listening on http://localhost:${env.API_PORT}`);
  });

  services.startProviderFeed();
  setInterval(() => {
    void services.settlement.settlePending().catch((error) => {
      logger.error("Scheduled settlement failed", {
        message: error instanceof Error ? error.message : error,
      });
    });
  }, 60_000);

  if (env.CATALOG_SYNC_ON_START) {
    void services.runSync(false).catch((error) => {
      logger.error("Startup OddsPapi sync failed", {
        message: error instanceof Error ? error.message : error,
        details: error instanceof Error ? error.stack : undefined,
      });
    });
  }

  const shutdown = async () => {
    logger.info("Shutting down API");
    server.close();
    await prisma.$disconnect();
    redis.disconnect();
    redisSub.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error("API failed to start", { message: error instanceof Error ? error.message : error });
  process.exit(1);
});
