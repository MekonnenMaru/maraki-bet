import { logger } from "../../lib/logger.js";
import type { IntervalUnit } from "./sync.types.js";
import { intervalToMs, type SyncService } from "./sync.service.js";

export class SyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private readonly sync: SyncService) {}

  async start() {
    await this.resync();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async resync() {
    this.stop();
    const config = await this.sync.ensureConfig();
    if (!config.masterEnabled || !config.automaticEnabled) {
      logger.info("Sync scheduler idle (master or automatic sync disabled)");
      return;
    }

    const ms = intervalToMs(config.intervalValue, config.intervalUnit as IntervalUnit);
    const safeMs = Math.max(15_000, ms);
    this.timer = setInterval(() => {
      void this.tick();
    }, safeMs);

    logger.info("Sync scheduler started", {
      everyMs: safeMs,
      intervalValue: config.intervalValue,
      intervalUnit: config.intervalUnit,
    });
  }

  private async tick() {
    if (this.ticking || this.sync.isRunning) return;
    this.ticking = true;
    try {
      const config = await this.sync.ensureConfig();
      if (!config.masterEnabled || !config.automaticEnabled) return;
      await this.sync.start({
        trigger: "AUTOMATIC",
        scope: "EVERYTHING",
        force: false,
      });
    } catch (error) {
      logger.error("Automatic sync failed", {
        message: error instanceof Error ? error.message : error,
      });
    } finally {
      this.ticking = false;
    }
  }
}
