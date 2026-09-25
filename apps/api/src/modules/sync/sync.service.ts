import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { CatalogSync } from "../catalog/catalog.sync.js";
import type { OddsIngest } from "../odds/odds.ingest.js";
import type { OddsPapiHttpClient } from "../oddspapi/http-client.js";
import type { SettlementService } from "../settlement/settlement.service.js";
import {
  DEFAULT_RESOURCES,
  type IntervalUnit,
  type SyncJobResult,
  type SyncResource,
  type SyncResourceCounts,
  type SyncScope,
  type SyncStartInput,
} from "./sync.types.js";

class SyncControlError extends Error {
  constructor(
    message: string,
    readonly kind: "CANCELLED" | "PAUSED",
  ) {
    super(message);
  }
}

export class SyncService {
  private runningJobId: string | null = null;
  private bootstrapped = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly provider: OddsPapiHttpClient,
    private readonly catalogSync: CatalogSync,
    private readonly ingest: OddsIngest,
    private readonly settlement: SettlementService,
  ) {}

  get isRunning() {
    return this.runningJobId != null;
  }

  get currentJobId() {
    return this.runningJobId;
  }

  /** Mark orphaned RUNNING/PAUSED jobs after API restart. */
  async reconcileOrphans() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    const result = await this.prisma.syncJob.updateMany({
      where: { status: { in: ["RUNNING", "PAUSED"] } },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: "Interrupted by server restart",
        progressMessage: "Server restarted — restart sync to continue",
        pauseRequested: false,
        cancelRequested: false,
      },
    });
    if (result.count > 0) {
      logger.warn("Reconciled orphaned sync jobs", { count: result.count });
    }
  }

  async ensureConfig() {
    const existing = await this.prisma.syncConfiguration.findUnique({ where: { id: 1 } });
    if (!existing) {
      return this.prisma.syncConfiguration.create({
        data: {
          id: 1,
          masterEnabled: true,
          automaticEnabled: false,
          scheduleType: "INTERVAL",
          intervalValue: Math.max(1, Math.round(env.ODDSPAPI_POLL_INTERVAL_MS / 60_000)) || 5,
          intervalUnit: "MINUTES",
          timezone: "Africa/Addis_Ababa",
        },
      });
    }
    // Env kill-switch: never leave auto-poll on when ENABLE_ODDSPAPI_POLL=false.
    if (!env.ENABLE_ODDSPAPI_POLL && existing.automaticEnabled) {
      return this.prisma.syncConfiguration.update({
        where: { id: 1 },
        data: { automaticEnabled: false, nextRunAt: null },
      });
    }
    return existing;
  }

  async getStatus() {
    await this.reconcileOrphans();
    const config = await this.ensureConfig();
    const running = this.runningJobId
      ? await this.prisma.syncJob.findUnique({ where: { id: this.runningJobId } })
      : await this.prisma.syncJob.findFirst({
          where: { status: { in: ["RUNNING", "PAUSED"] } },
          orderBy: { startedAt: "desc" },
        });

    const providerConnected = Boolean(this.provider.lastSuccessfulRequestAt);
    const providerError = config.lastError;

    const recentFailures = await this.prisma.syncJob.count({
      where: {
        status: "FAILED",
        startedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    return {
      masterEnabled: config.masterEnabled,
      automaticEnabled: config.automaticEnabled,
      scheduleType: config.scheduleType,
      intervalValue: config.intervalValue,
      intervalUnit: config.intervalUnit,
      timezone: config.timezone,
      retryEnabled: config.retryEnabled,
      maxRetries: config.maxRetries,
      lastRunAt: config.lastRunAt?.toISOString() ?? null,
      nextRunAt: config.nextRunAt?.toISOString() ?? null,
      lastSuccessAt: config.lastSuccessAt?.toISOString() ?? null,
      lastError: config.lastError,
      schedulerRunning: config.masterEnabled && config.automaticEnabled,
      provider: {
        connected: providerConnected,
        lastRequestAt: this.provider.lastSuccessfulRequestAt
          ? new Date(this.provider.lastSuccessfulRequestAt).toISOString()
          : null,
        requestsThisProcess: this.provider.requestsThisProcess,
        apiKeyMasked: maskKey(this.provider.currentApiKey),
        baseUrl: env.ODDSPAPI_BASE_URL,
        lastError: providerError,
      },
      runningJob: running ? mapJob(running) : null,
      health: {
        apiConnection: providerConnected ? "CONNECTED" : "UNKNOWN",
        scheduler: config.masterEnabled && config.automaticEnabled ? "RUNNING" : "STOPPED",
        lastSync: config.lastSuccessAt ? "SUCCESS" : config.lastError ? "FAILED" : "UNKNOWN",
        recentFailures,
      },
    };
  }

  async updateConfig(input: {
    masterEnabled?: boolean;
    automaticEnabled?: boolean;
    scheduleType?: string;
    intervalValue?: number;
    intervalUnit?: IntervalUnit;
    timezone?: string;
    retryEnabled?: boolean;
    maxRetries?: number;
    actorId?: string;
    actorName?: string;
    ip?: string;
  }) {
    const before = await this.ensureConfig();
    const intervalValue = input.intervalValue ?? before.intervalValue;
    const intervalUnit = (input.intervalUnit ?? before.intervalUnit) as IntervalUnit;
    const nextRunAt =
      (input.automaticEnabled ?? before.automaticEnabled) && (input.masterEnabled ?? before.masterEnabled)
        ? new Date(Date.now() + intervalToMs(intervalValue, intervalUnit))
        : null;

    const updated = await this.prisma.syncConfiguration.update({
      where: { id: 1 },
      data: {
        masterEnabled: input.masterEnabled ?? undefined,
        automaticEnabled: input.automaticEnabled ?? undefined,
        scheduleType: input.scheduleType ?? undefined,
        intervalValue: input.intervalValue ?? undefined,
        intervalUnit: input.intervalUnit ?? undefined,
        timezone: input.timezone ?? undefined,
        retryEnabled: input.retryEnabled ?? undefined,
        maxRetries: input.maxRetries ?? undefined,
        nextRunAt,
      },
    });

    await this.audit({
      actorId: input.actorId,
      actorName: input.actorName,
      action: "sync.config.update",
      resource: "SyncConfiguration",
      resourceId: "1",
      oldValue: before,
      newValue: updated,
      ip: input.ip,
    });

    return updated;
  }

  async testProvider() {
    try {
      const result = await this.provider.testConnection();
      return { ...result, apiKeyMasked: maskKey(this.provider.currentApiKey) };
    } catch (error) {
      throw new HttpError(502, error instanceof Error ? error.message : "OddsPapi connection failed");
    }
  }

  async getProviderAccount() {
    try {
      const account = await this.provider.getAccount();
      return mapAccountDto(account, this.provider.currentApiKey);
    } catch (error) {
      throw new HttpError(502, error instanceof Error ? error.message : "OddsPapi account failed");
    }
  }

  async updateProviderAccountLanguage(
    language: string,
    meta?: { actorId?: string; actorName?: string; ip?: string },
  ) {
    const code = language.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(code)) {
      throw new HttpError(400, "language must be a 2-letter code from GET languages");
    }
    try {
      const updated = await this.provider.updateAccountLanguage(code);
      const account =
        updated && typeof updated === "object" && "language_code" in updated
          ? (updated as import("../oddspapi/types.js").OddsPapiAccount)
          : await this.provider.getAccount();
      await this.audit({
        actorId: meta?.actorId,
        actorName: meta?.actorName,
        action: "oddspapi.account.language",
        resource: "OddsPapiAccount",
        resourceId: "account",
        newValue: { language: code },
        ip: meta?.ip,
      });
      return mapAccountDto(account, this.provider.currentApiKey);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, error instanceof Error ? error.message : "OddsPapi account update failed");
    }
  }

  async refreshProviderApiKey(meta?: { actorId?: string; actorName?: string; ip?: string }) {
    try {
      const result = await this.provider.refreshApiKey();
      const apiKey = result.api_key?.trim();
      if (!apiKey) {
        throw new HttpError(502, "OddsPapi refresh did not return an api_key");
      }
      this.provider.replaceApiKey(apiKey);
      await this.audit({
        actorId: meta?.actorId,
        actorName: meta?.actorName,
        action: "oddspapi.account.refresh_api_key",
        resource: "OddsPapiAccount",
        resourceId: "account",
        newValue: { apiKeyMasked: maskKey(apiKey) },
        ip: meta?.ip,
      });
      return {
        apiKey,
        apiKeyMasked: maskKey(apiKey),
        updatedInProcess: true,
        note: "New key is active for this API process. Copy it into ODDSPAPI_API_KEY in .env and restart so it survives restarts.",
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, error instanceof Error ? error.message : "OddsPapi key refresh failed");
    }
  }

  async getProviderLanguages() {
    try {
      const rows = await this.provider.getLanguages();
      return rows
        .map((row) => ({
          a2: String(row.a2 ?? "").trim().toLowerCase(),
          name: String(row.name ?? row.a2 ?? "").trim(),
        }))
        .filter((row) => row.a2.length === 2);
    } catch (error) {
      throw new HttpError(502, error instanceof Error ? error.message : "OddsPapi languages failed");
    }
  }

  async listJobs(filters?: { page?: number; pageSize?: number; status?: string }) {
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 20;
    const where = filters?.status ? { status: filters.status } : {};
    const total = await this.prisma.syncJob.count({ where });
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);
    const items = await this.prisma.syncJob.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: items.map(mapJob),
      total,
      page: safePage,
      pageSize,
      pageCount,
    };
  }

  async getJob(id: string) {
    const job = await this.prisma.syncJob.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, "Sync job not found");
    return mapJob(job);
  }

  /**
   * Starts a sync job. Returns immediately with RUNNING status; work continues in background.
   * Pass wait:true to await completion (startup / internal scripts).
   */
  async start(input: SyncStartInput & { wait?: boolean }) {
    await this.reconcileOrphans();
    const config = await this.ensureConfig();
    if (!config.masterEnabled && !input.allowWhenMasterOff) {
      throw new HttpError(409, "Master sync is disabled");
    }
    if (this.runningJobId) {
      throw new HttpError(409, "A synchronization job is already running", {
        jobId: this.runningJobId,
      });
    }

    const active = await this.prisma.syncJob.findFirst({
      where: { status: { in: ["RUNNING", "PAUSED"] } },
      orderBy: { startedAt: "desc" },
    });
    if (active) {
      throw new HttpError(409, "A synchronization job is already running", { jobId: active.id });
    }

    const scope = input.scope ?? "EVERYTHING";
    const resources = normalizeResources(input.resources);
    const job = await this.prisma.syncJob.create({
      data: {
        type: input.trigger === "AUTOMATIC" ? "AUTOMATIC" : input.trigger === "SYSTEM" ? "SYSTEM" : "MANUAL",
        trigger: input.trigger,
        scope,
        scopeId: input.scopeId ?? null,
        status: "RUNNING",
        resourcesJson: resources,
        progressPct: 0,
        currentStep: "starting",
        progressMessage: "Sync job queued",
        progressLog: [
          {
            at: new Date().toISOString(),
            level: "info",
            cmd: "queue",
            detail: `Job queued · ${input.trigger} · ${scope}${input.scopeId ? ` #${input.scopeId}` : ""} · resources [${resources.join(", ")}]`,
          },
        ],
        startedBy: input.startedBy ?? null,
      },
    });

    this.runningJobId = job.id;
    const work = this.runJob(job.id, {
      scope,
      scopeId: input.scopeId,
      resources,
      force: input.force ?? input.trigger === "MANUAL",
    });

    if (input.wait) {
      await work;
      return this.getJob(job.id);
    }

    void work.catch((error) => {
      logger.error("Background sync failed", {
        jobId: job.id,
        message: error instanceof Error ? error.message : error,
      });
    });

    return mapJob(job);
  }

  async pauseJob(jobId?: string): Promise<ReturnType<typeof mapJob>> {
    const id = jobId ?? this.runningJobId;
    if (!id) {
      const active = await this.prisma.syncJob.findFirst({
        where: { status: "RUNNING" },
        orderBy: { startedAt: "desc" },
      });
      if (!active) throw new HttpError(404, "No running sync job");
      return this.pauseJob(active.id);
    }
    const job = await this.prisma.syncJob.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, "Sync job not found");
    if (job.status !== "RUNNING") throw new HttpError(409, "Only a running job can be paused");
    await this.prisma.syncJob.update({
      where: { id },
      data: {
        pauseRequested: true,
        progressMessage: "Pause requested…",
      },
    });
    await this.appendLog(id, { level: "warn", cmd: "pause", detail: "Pause requested by admin" });
    return this.getJob(id);
  }

  async resumeJob(jobId?: string) {
    const id = jobId ?? (await this.findActiveJobId());
    if (!id) throw new HttpError(404, "No paused sync job");
    const job = await this.prisma.syncJob.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, "Sync job not found");
    if (job.status !== "PAUSED") throw new HttpError(409, "Only a paused job can be resumed");
    if (this.runningJobId && this.runningJobId !== id) {
      throw new HttpError(409, "Another sync job is already active");
    }

    await this.prisma.syncJob.update({
      where: { id },
      data: {
        status: "RUNNING",
        pauseRequested: false,
        progressMessage: "Resuming…",
      },
    });
    await this.appendLog(id, { level: "info", cmd: "resume", detail: "Resumed by admin" });

    // Paused jobs keep the same runner waiting in waitIfPaused — clear flag only.
    // If process restarted, orphan was marked FAILED; resume only works while runner lives.
    if (!this.runningJobId) {
      throw new HttpError(
        409,
        "This paused job is no longer attached to the server process. Cancel it and start a new sync.",
      );
    }
    return this.getJob(id);
  }

  async cancelJob(jobId?: string) {
    const id = jobId ?? (await this.findActiveJobId());
    if (!id) throw new HttpError(404, "No active sync job");
    const job = await this.prisma.syncJob.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, "Sync job not found");
    if (!["RUNNING", "PAUSED"].includes(job.status)) {
      throw new HttpError(409, "Job is not active");
    }
    await this.prisma.syncJob.update({
      where: { id },
      data: {
        cancelRequested: true,
        pauseRequested: false,
        progressMessage: "Stop requested…",
      },
    });
    // If paused with no live runner, finalize immediately
    if (job.status === "PAUSED" && this.runningJobId !== id) {
      await this.prisma.syncJob.update({
        where: { id },
        data: {
          status: "CANCELLED",
          finishedAt: new Date(),
          progressMessage: "Cancelled",
          cancelRequested: false,
        },
      });
    }
    return this.getJob(id);
  }

  async retryJob(id: string, startedBy?: string) {
    const job = await this.prisma.syncJob.findUnique({ where: { id } });
    if (!job) throw new HttpError(404, "Sync job not found");
    return this.start({
      trigger: "MANUAL",
      scope: job.scope as SyncScope,
      scopeId: job.scopeId ?? undefined,
      resources: Array.isArray(job.resourcesJson) ? (job.resourcesJson as SyncResource[]) : undefined,
      force: true,
      startedBy,
    });
  }

  private async findActiveJobId() {
    if (this.runningJobId) return this.runningJobId;
    const active = await this.prisma.syncJob.findFirst({
      where: { status: { in: ["RUNNING", "PAUSED"] } },
      orderBy: { startedAt: "desc" },
    });
    return active?.id ?? null;
  }

  private async runJob(
    jobId: string,
    input: {
      scope: SyncScope;
      scopeId?: string;
      resources: SyncResource[];
      force: boolean;
    },
  ) {
    const started = Date.now();
    const apiCallsBefore = this.provider.requestsThisProcess;
    try {
      const result = await this.execute(jobId, input);
      const config = await this.ensureConfig();
      const durationMs = Date.now() - started;
      const apiCalls = Math.max(0, this.provider.requestsThisProcess - apiCallsBefore);
      const totalCalls = this.provider.requestsThisProcess;
      await this.prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          durationMs,
          progressPct: 100,
          currentStep: "done",
          progressMessage: "Sync completed",
          createdCount: sumCounts(result, "created"),
          updatedCount: sumCounts(result, "updated"),
          skippedCount: sumCounts(result, "skipped"),
          failedCount: sumCounts(result, "failed"),
          resultJson: {
            ...result,
            apiCalls,
            durationMs,
            totalApiCallsThisProcess: totalCalls,
          } as unknown as Prisma.InputJsonValue,
          pauseRequested: false,
          cancelRequested: false,
        },
      });
      await this.appendLog(jobId, {
        level: "ok",
        cmd: "done",
        detail: `+${sumCounts(result, "created")} created · ~${sumCounts(result, "updated")} updated · !${sumCounts(result, "failed")} failed`,
      });
      await this.appendUsageSummary(jobId, { apiCalls, durationMs, totalCalls, level: "ok" });
      await this.prisma.syncConfiguration.update({
        where: { id: 1 },
        data: {
          lastRunAt: new Date(),
          lastSuccessAt: new Date(),
          lastError: null,
          nextRunAt: config.automaticEnabled
            ? new Date(Date.now() + intervalToMs(config.intervalValue, config.intervalUnit as IntervalUnit))
            : null,
        },
      });
    } catch (error) {
      const durationMs = Date.now() - started;
      const apiCalls = Math.max(0, this.provider.requestsThisProcess - apiCallsBefore);
      const totalCalls = this.provider.requestsThisProcess;
      if (error instanceof SyncControlError && error.kind === "CANCELLED") {
        await this.prisma.syncJob.update({
          where: { id: jobId },
          data: {
            status: "CANCELLED",
            finishedAt: new Date(),
            durationMs,
            progressMessage: "Cancelled by admin",
            pauseRequested: false,
            cancelRequested: false,
          },
        });
        await this.appendLog(jobId, { level: "warn", cmd: "cancel", detail: "Cancelled by admin" });
        await this.appendUsageSummary(jobId, { apiCalls, durationMs, totalCalls, level: "warn" });
        return;
      }
      if (error instanceof SyncControlError && error.kind === "PAUSED") {
        // Should not escape execute — handled inside waitIfPaused
        return;
      }
      const message = error instanceof Error ? error.message : "Sync failed";
      await this.prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          durationMs,
          failedCount: 1,
          errorMessage: message,
          progressMessage: message.slice(0, 255),
          pauseRequested: false,
          cancelRequested: false,
        },
      });
      await this.appendLog(jobId, { level: "error", cmd: "error", detail: message });
      await this.appendUsageSummary(jobId, { apiCalls, durationMs, totalCalls, level: "error" });
      await this.prisma.syncConfiguration.update({
        where: { id: 1 },
        data: {
          lastRunAt: new Date(),
          lastError: message.slice(0, 500),
        },
      });
    } finally {
      if (this.runningJobId === jobId) this.runningJobId = null;
    }
  }

  private async appendUsageSummary(
    jobId: string,
    input: {
      apiCalls: number;
      durationMs: number;
      totalCalls: number;
      level: "info" | "ok" | "warn" | "error";
    },
  ) {
    await this.appendLog(jobId, {
      level: input.level,
      cmd: "summary",
      detail: `${input.apiCalls} API call${input.apiCalls === 1 ? "" : "s"} · ${formatDuration(input.durationMs)}`,
    });
    await this.appendLog(jobId, {
      level: "info",
      cmd: "total",
      detail: `Totally called ${input.totalCalls} OddsPapi request${input.totalCalls === 1 ? "" : "s"} (this API process)`,
    });
  }

  private async setProgress(
    jobId: string,
    patch: {
      progressPct: number;
      currentStep: string;
      progressMessage: string;
      level?: "info" | "ok" | "warn" | "error";
    },
  ) {
    const existing = await this.prisma.syncJob.findUnique({
      where: { id: jobId },
      select: { progressLog: true },
    });
    const log = appendProgressLog(existing?.progressLog, {
      at: new Date().toISOString(),
      level: patch.level ?? "info",
      cmd: patch.currentStep,
      detail: patch.progressMessage,
    });
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: {
        progressPct: patch.progressPct,
        currentStep: patch.currentStep,
        progressMessage: patch.progressMessage,
        progressLog: log,
      },
    });
  }

  private async appendLog(
    jobId: string,
    entry: { level?: "info" | "ok" | "warn" | "error"; cmd: string; detail: string },
  ) {
    const existing = await this.prisma.syncJob.findUnique({
      where: { id: jobId },
      select: { progressLog: true },
    });
    const log = appendProgressLog(existing?.progressLog, {
      at: new Date().toISOString(),
      level: entry.level ?? "info",
      cmd: entry.cmd,
      detail: entry.detail,
    });
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: { progressLog: log },
    });
  }

  private async checkpoint(jobId: string) {
    const job = await this.prisma.syncJob.findUnique({ where: { id: jobId } });
    if (!job) throw new SyncControlError("Job missing", "CANCELLED");
    if (job.cancelRequested) throw new SyncControlError("Cancelled", "CANCELLED");
    if (job.pauseRequested || job.status === "PAUSED") {
      await this.prisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: "PAUSED",
          pauseRequested: false,
          progressMessage: job.progressMessage?.startsWith("Paused")
            ? job.progressMessage
            : `Paused at ${job.currentStep ?? "step"}`,
        },
      });
      await this.waitWhilePaused(jobId);
    }
  }

  private async waitWhilePaused(jobId: string) {
    for (;;) {
      await sleep(800);
      const job = await this.prisma.syncJob.findUnique({ where: { id: jobId } });
      if (!job) throw new SyncControlError("Job missing", "CANCELLED");
      if (job.cancelRequested) throw new SyncControlError("Cancelled", "CANCELLED");
      if (job.status === "RUNNING" && !job.pauseRequested) {
        await this.prisma.syncJob.update({
          where: { id: jobId },
          data: { progressMessage: "Resumed" },
        });
        return;
      }
      if (job.status !== "PAUSED" && job.status !== "RUNNING") {
        throw new SyncControlError("Job ended while paused", "CANCELLED");
      }
    }
  }

  private async execute(
    jobId: string,
    input: {
      scope: SyncScope;
      scopeId?: string;
      resources: SyncResource[];
      force: boolean;
    },
  ): Promise<SyncJobResult> {
    const sportIds =
      input.scope === "SPORT" && input.scopeId ? [Number(input.scopeId)].filter((id) => Number.isInteger(id)) : undefined;
    const tournamentId =
      input.scope === "TOURNAMENT" && input.scopeId ? Number(input.scopeId) : undefined;
    const fixtureId = input.scope === "FIXTURE" ? input.scopeId : undefined;

    const wants = (name: SyncResource) => input.resources.includes(name);
    const counts: SyncJobResult["resources"] = {};
    const bump = (name: SyncResource, patch: Partial<SyncResourceCounts>) => {
      const current = counts[name] ?? { created: 0, updated: 0, skipped: 0, failed: 0 };
      counts[name] = {
        created: current.created + (patch.created ?? 0),
        updated: current.updated + (patch.updated ?? 0),
        skipped: current.skipped + (patch.skipped ?? 0),
        failed: current.failed + (patch.failed ?? 0),
      };
    };

    let fixturesSynced = 0;
    let oddsPriced = 0;
    let settled = 0;
    const providerConnected = true;

    await this.checkpoint(jobId);
    await this.setProgress(jobId, {
      progressPct: 5,
      currentStep: "catalog",
      progressMessage: "Syncing sports, tournaments & markets…",
    });

    if (wants("sports") || wants("tournaments") || wants("markets") || wants("outcomes")) {
      const include = {
        sports: wants("sports"),
        tournaments: wants("tournaments"),
        markets: wants("markets") || wants("outcomes"),
      };
      await this.appendLog(jobId, {
        cmd: "catalog.fetch",
        detail: `Calling OddsPapi · ${[
          include.sports ? "sports" : null,
          include.tournaments ? "tournaments" : null,
          include.markets ? "markets" : null,
        ]
          .filter(Boolean)
          .join(", ")}${sportIds?.length ? ` · sports [${sportIds.join(",")}]` : ""}${tournamentId ? ` · tournament ${tournamentId}` : ""}`,
      });
      const catalog = await this.catalogSync.syncCatalog({
        force: input.force,
        sportIds,
        tournamentId: Number.isInteger(tournamentId) ? tournamentId : undefined,
        include,
      });
      if (catalog.skipped) {
        if (include.sports) bump("sports", { skipped: 1 });
        if (include.tournaments) bump("tournaments", { skipped: 1 });
        await this.appendLog(jobId, {
          level: "warn",
          cmd: "catalog.skip",
          detail: catalog.reason === "nothing-selected" ? "No catalog slices selected" : "Catalog still fresh — skipped provider pull",
        });
      } else {
        if (include.sports) bump("sports", { updated: catalog.sports });
        if (include.tournaments) bump("tournaments", { updated: catalog.tournaments });
        if (include.markets) bump("markets", { updated: catalog.markets });
        await this.appendLog(jobId, {
          level: "ok",
          cmd: "catalog.ok",
          detail: `sports ${catalog.sports} · tournaments ${catalog.tournaments} · markets ${catalog.markets}`,
        });
      }
    } else {
      await this.appendLog(jobId, { level: "warn", cmd: "catalog.skip", detail: "Catalog resources not selected" });
    }

    await this.checkpoint(jobId);
    const wantsFixtures = wants("fixtures") || wants("teams") || wants("odds") || wants("scores");
    await this.setProgress(jobId, {
      progressPct: 35,
      currentStep: "fixtures",
      progressMessage: wantsFixtures ? "Syncing fixtures & teams…" : "Skipping fixtures (not selected)",
    });

    let fixtures = wantsFixtures
      ? await this.catalogSync.syncFixtures({
          force: input.force,
          sportIds,
          tournamentId: Number.isInteger(tournamentId) ? tournamentId : undefined,
          fixtureId,
        })
      : [];

    fixturesSynced = fixtures.length;
    if (wants("fixtures")) bump("fixtures", { updated: fixtures.length });
    if (wants("teams")) bump("teams", { updated: fixtures.length });
    if (wants("scores")) bump("scores", { updated: fixtures.length });
    if (wants("seasons") || wants("fixtures")) {
      const seasonIds = new Set(
        fixtures.map((row) => row.season?.seasonId).filter((id): id is number => Number.isInteger(id)),
      );
      if (wants("seasons")) bump("seasons", { updated: seasonIds.size });
    }
    if (wantsFixtures) {
      const seasonIds = new Set(
        fixtures.map((row) => row.season?.seasonId).filter((id): id is number => Number.isInteger(id)),
      );
      const tournamentsHit = new Set(fixtures.map((row) => row.tournament.tournamentId)).size;
      await this.appendLog(jobId, {
        level: fixtures.length ? "ok" : "warn",
        cmd: "fixtures.ok",
        detail: fixtures.length
          ? `Upserted ${fixtures.length} fixtures · ${tournamentsHit} tournaments · ${seasonIds.size} seasons · window ${env.FIXTURE_SYNC_DAYS}d${fixtureId ? ` · fixture ${fixtureId}` : ""}`
          : `No fixtures returned for this scope (window ${env.FIXTURE_SYNC_DAYS}d) — leagues with no upcoming matches stay at 0`,
      });
    } else {
      await this.appendLog(jobId, { level: "warn", cmd: "fixtures.skip", detail: "Fixtures/teams/scores/odds not selected" });
    }

    await this.checkpoint(jobId);
    await this.setProgress(jobId, {
      progressPct: 65,
      currentStep: "odds",
      progressMessage: !wants("odds")
        ? "Skipping odds (not selected)"
        : fixtures.length
          ? `Pricing odds in batches for ${fixtures.length} fixtures…`
          : "No fixtures to price",
    });

    if (wants("odds")) {
      if (fixtures.length === 0 && fixtureId) {
        await this.appendLog(jobId, { cmd: "odds.refetch", detail: `Re-fetching fixture ${fixtureId} for odds` });
        fixtures = await this.catalogSync.syncFixtures({ force: true, fixtureId });
      }
      if (fixtures.length > 0) {
        await this.appendLog(jobId, {
          cmd: "odds.start",
          detail: `Pricing odds · bookmaker ${this.ingest.activeBookmaker} · ${fixtures.length} fixtures`,
        });
        const odds = await this.ingest.syncMainOdds(fixtures, {
          onProgress: async ({ index, total, tournamentId, priced, skipped, failed }) => {
            const span = Math.max(1, total);
            const pct = 65 + Math.min(24, Math.floor((index / span) * 24));
            await this.setProgress(jobId, {
              progressPct: pct,
              currentStep: "odds",
              progressMessage: `Odds batch ${index}/${total} · tournament ${tournamentId} · priced ${priced} · skipped ${skipped} · failed ${failed}`,
              level: failed > 0 ? "warn" : "info",
            });
            await this.checkpoint(jobId);
          },
        });
        oddsPriced = odds.priced;
        bump("odds", {
          updated: odds.priced,
          skipped: odds.tournamentsSkipped,
          failed: odds.tournamentsFailed,
        });
        await this.appendLog(jobId, {
          level: odds.priced > 0 ? "ok" : "warn",
          cmd: "odds.ok",
          detail: `priced ${odds.priced} · tournaments tried ${odds.tournamentsTried} · skipped ${odds.tournamentsSkipped} · failed ${odds.tournamentsFailed} · bookmaker ${odds.bookmaker}`,
        });
        if (odds.stoppedReason) {
          await this.appendLog(jobId, {
            level: "error",
            cmd: "odds.stop",
            detail: odds.stoppedReason,
          });
        }
        if (odds.priced === 0 && !odds.stoppedReason) {
          await this.appendLog(jobId, {
            level: "warn",
            cmd: "odds.warn",
            detail: `Odds selected but 0 prices stored. SOURCE_BOOKMAKER=${odds.bookmaker} returned empty for sampled tournaments — pick a bookmaker your OddsPapi plan includes.`,
          });
        }
      } else {
        bump("odds", { skipped: 1 });
        await this.appendLog(jobId, { level: "warn", cmd: "odds.skip", detail: "No fixtures available to price" });
      }
    } else {
      await this.appendLog(jobId, { level: "warn", cmd: "odds.skip", detail: "Odds resource not selected" });
    }

    await this.checkpoint(jobId);
    const runSettlement = wants("scores") || wants("odds") || wants("fixtures");
    await this.setProgress(jobId, {
      progressPct: 90,
      currentStep: "settlement",
      progressMessage: runSettlement ? "Running settlement…" : "Skipping settlement (not needed)",
    });

    if (runSettlement) {
      settled = await this.settlement.settlePending().then((row) => row.finalized);
      await this.appendLog(jobId, {
        level: "ok",
        cmd: "settlement.ok",
        detail: `Finalized ${settled} pending bet(s)`,
      });
    } else {
      await this.appendLog(jobId, { level: "warn", cmd: "settlement.skip", detail: "Settlement skipped for catalog-only sync" });
    }

    await this.setProgress(jobId, {
      progressPct: 98,
      currentStep: "finalize",
      progressMessage: "Finalizing…",
    });

    logger.info("Sync job executed", {
      scope: input.scope,
      scopeId: input.scopeId,
      fixturesSynced,
      oddsPriced,
      settled,
    });

    return {
      resources: counts,
      fixturesSynced,
      oddsPriced,
      settled,
      providerConnected,
    };
  }

  private async audit(input: {
    actorId?: string;
    actorName?: string;
    action: string;
    resource: string;
    resourceId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ip?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        oldValue: input.oldValue as Prisma.InputJsonValue | undefined,
        newValue: input.newValue as Prisma.InputJsonValue | undefined,
        ip: input.ip ?? null,
      },
    });
  }
}

export function intervalToMs(value: number, unit: IntervalUnit) {
  const n = Math.max(1, value);
  switch (unit) {
    case "SECONDS":
      return n * 1000;
    case "MINUTES":
      return n * 60_000;
    case "HOURS":
      return n * 3_600_000;
    case "DAYS":
      return n * 86_400_000;
    case "WEEKS":
      return n * 604_800_000;
    default:
      return n * 60_000;
  }
}

function normalizeResources(resources?: SyncResource[]) {
  if (!resources?.length) return [...DEFAULT_RESOURCES];
  return [...new Set(resources)];
}

function sumCounts(result: SyncJobResult, key: keyof SyncResourceCounts) {
  return Object.values(result.resources).reduce((sum, row) => sum + (row?.[key] ?? 0), 0);
}

function maskKey(key: string) {
  if (key.length <= 8) return "********";
  return `${key.slice(0, 4)}${"*".repeat(Math.min(12, key.length - 8))}${key.slice(-4)}`;
}

function mapAccountDto(account: import("../oddspapi/types.js").OddsPapiAccount, fallbackKey: string) {
  const key = account.api_key?.trim() || fallbackKey;
  return {
    apiKeyMasked: maskKey(key),
    createdAt: account.created_at ?? null,
    languageCode: account.language_code ?? null,
    languageName: account.language_name ?? null,
    currentSubscriptionId: account.current_subscription_id ?? null,
    subscriptions: (account.subscriptions ?? []).map((sub) => ({
      subscriptionId: sub.subscription_id,
      currency: sub.currency ?? null,
      price: sub.price ?? null,
      validFrom: sub.valid_from ?? null,
      validUntil: sub.valid_until ?? null,
      autoRenew: Boolean(sub.auto_renew),
      isActive: Boolean(sub.is_active),
      bookmakers: Object.fromEntries(
        Object.entries(sub.bookmakers ?? {}).map(([slug, meta]) => [
          slug,
          {
            hasLiveOdds: Boolean(meta?.has_live_odds),
            hasPlayerProps: Boolean(meta?.has_player_props),
          },
        ]),
      ),
      sportIds: sub.sport_ids ?? [],
      websocketAccess: sub.websocket_access ?? null,
      requestLimit: sub.request_limit ?? null,
      rateLimit: sub.rate_limit ?? null,
      requestCount: sub.request_count ?? null,
      lastRequest: sub.last_request ?? null,
    })),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds - minutes * 60;
  return `${minutes}m ${rem.toFixed(0)}s`;
}

function mapJob(job: {
  id: string;
  type: string;
  trigger: string;
  scope: string;
  scopeId: string | null;
  status: string;
  resourcesJson: Prisma.JsonValue;
  progressPct?: number;
  currentStep?: string | null;
  progressMessage?: string | null;
  progressLog?: Prisma.JsonValue;
  pauseRequested?: boolean;
  cancelRequested?: boolean;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorMessage: string | null;
  resultJson: Prisma.JsonValue;
  startedBy: string | null;
}) {
  return {
    id: job.id,
    type: job.type,
    trigger: job.trigger,
    scope: job.scope,
    scopeId: job.scopeId,
    status: job.status,
    resources: job.resourcesJson,
    progressPct: job.progressPct ?? 0,
    currentStep: job.currentStep ?? null,
    progressMessage: job.progressMessage ?? null,
    progressLog: parseProgressLog(job.progressLog),
    pauseRequested: job.pauseRequested ?? false,
    cancelRequested: job.cancelRequested ?? false,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    durationMs: job.durationMs,
    createdCount: job.createdCount,
    updatedCount: job.updatedCount,
    skippedCount: job.skippedCount,
    failedCount: job.failedCount,
    errorMessage: job.errorMessage,
    result: job.resultJson,
    startedBy: job.startedBy,
  };
}

type ProgressLogEntry = {
  at: string;
  level: "info" | "ok" | "warn" | "error";
  cmd: string;
  detail: string;
};

const PROGRESS_LOG_LIMIT = 250;

function parseProgressLog(value: Prisma.JsonValue | null | undefined): ProgressLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const item = row as Record<string, unknown>;
      const level = item.level;
      const cmd = typeof item.cmd === "string" ? item.cmd : null;
      const detail = typeof item.detail === "string" ? item.detail : null;
      const at = typeof item.at === "string" ? item.at : new Date().toISOString();
      if (!cmd || !detail) return null;
      if (level !== "info" && level !== "ok" && level !== "warn" && level !== "error") {
        return { at, level: "info" as const, cmd, detail };
      }
      return { at, level, cmd, detail };
    })
    .filter((row): row is ProgressLogEntry => Boolean(row));
}

function appendProgressLog(
  current: Prisma.JsonValue | null | undefined,
  entry: ProgressLogEntry,
): ProgressLogEntry[] {
  const next = [...parseProgressLog(current), entry];
  return next.length > PROGRESS_LOG_LIMIT ? next.slice(next.length - PROGRESS_LOG_LIMIT) : next;
}
