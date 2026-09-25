import { hashPassword } from "../modules/identity/password.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

const username = (process.env.ADMIN_USERNAME ?? "admin").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "maraki-admin-1";

try {
  await prisma.$connect();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN", status: "ACTIVE", passwordHash: await hashPassword(password) },
    });
    logger.info("Admin user updated", { username });
  } else {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash: await hashPassword(password),
          role: "ADMIN",
        },
      });
      await tx.wallet.create({ data: { userId: user.id } });
    });
    logger.info("Admin user created", { username });
  }
} catch (error) {
  logger.error("Admin seed failed", { message: error instanceof Error ? error.message : error });
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
