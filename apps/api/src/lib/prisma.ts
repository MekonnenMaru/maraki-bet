import { PrismaClient } from "@prisma/client";

/**
 * Process/DB stay on UTC so DATETIME columns store OddsPapi UTC wall-clock
 * (e.g. 03:00Z stays 03:00). Display conversion to Africa/Addis_Ababa is UI-only.
 */
export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === "true" ? ["query", "error"] : ["error"],
});

let timezoneReady: Promise<void> | null = null;

export async function ensureUtcSession() {
  if (!timezoneReady) {
    timezoneReady = prisma
      .$executeRawUnsafe("SET time_zone = '+00:00'")
      .then(() => undefined)
      .catch(() => {
        timezoneReady = null;
      });
  }
  await timezoneReady;
}
