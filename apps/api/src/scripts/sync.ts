import { createServices } from "../bootstrap.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

const services = createServices();

try {
  await redis.connect();
  await prisma.$connect();
  const result = await services.runSync(true);
  logger.info("Manual sync finished", result);
} catch (error) {
  logger.error("Manual sync failed", { message: error instanceof Error ? error.message : error });
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  redis.disconnect();
}
