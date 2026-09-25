import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/errors.js";
import { ADMIN_COOKIE, readCookie } from "../identity/cookie.js";
import type { IdentityService } from "../identity/identity.service.js";
import { parsePage, parsePageSize } from "../admin/page.js";
import { SYNC_RESOURCES, type SyncResource } from "./sync.types.js";
import type { SyncScheduler } from "./sync.scheduler.js";
import type { SyncService } from "./sync.service.js";

const resourceEnum = z.enum(SYNC_RESOURCES as unknown as [SyncResource, ...SyncResource[]]);

const configSchema = z.object({
  masterEnabled: z.boolean().optional(),
  automaticEnabled: z.boolean().optional(),
  scheduleType: z.enum(["INTERVAL", "DAILY", "WEEKLY", "CUSTOM"]).optional(),
  intervalValue: z.coerce.number().int().min(1).max(10_000).optional(),
  intervalUnit: z.enum(["SECONDS", "MINUTES", "HOURS", "DAYS", "WEEKS"]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  retryEnabled: z.boolean().optional(),
  maxRetries: z.coerce.number().int().min(0).max(10).optional(),
});

const startSchema = z.object({
  scope: z.enum(["EVERYTHING", "SPORT", "TOURNAMENT", "FIXTURE"]).optional(),
  scopeId: z.string().trim().min(1).max(64).optional(),
  resources: z.array(resourceEnum).optional(),
  force: z.boolean().optional(),
});

function queryString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function syncRoutes(identity: IdentityService, sync: SyncService, scheduler: SyncScheduler) {
  const router = Router();

  router.get(
    "/admin/sync",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.getStatus() });
    }),
  );

  router.get(
    "/admin/sync/status",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.getStatus() });
    }),
  );

  router.put(
    "/admin/sync/config",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      const body = configSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid sync configuration");
      const updated = await sync.updateConfig({
        ...body.data,
        actorId: session.user.id,
        actorName: session.user.username,
        ip: req.ip,
      });
      await scheduler.resync();
      res.json({ data: updated });
    }),
  );

  router.post(
    "/admin/sync/start",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      const body = startSchema.safeParse(req.body ?? {});
      if (!body.success) throw new HttpError(400, "Invalid sync request");
      if (body.data.scope && body.data.scope !== "EVERYTHING" && !body.data.scopeId) {
        throw new HttpError(400, "scopeId is required for selective sync");
      }
      const job = await sync.start({
        trigger: "MANUAL",
        scope: body.data.scope,
        scopeId: body.data.scopeId,
        resources: body.data.resources,
        force: body.data.force ?? true,
        startedBy: session.user.username,
      });
      res.status(202).json({ data: job });
    }),
  );

  router.post(
    "/admin/sync/stop",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      await sync.updateConfig({
        automaticEnabled: false,
        actorId: session.user.id,
        actorName: session.user.username,
        ip: req.ip,
      });
      await scheduler.resync();
      res.json({ data: await sync.getStatus() });
    }),
  );

  router.post(
    "/admin/sync/pause",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.pauseJob() });
    }),
  );

  router.post(
    "/admin/sync/resume",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.resumeJob() });
    }),
  );

  router.post(
    "/admin/sync/cancel",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.cancelJob() });
    }),
  );

  router.post(
    "/admin/sync/test",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.testProvider() });
    }),
  );

  router.get(
    "/admin/oddspapi/account",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.getProviderAccount() });
    }),
  );

  router.post(
    "/admin/oddspapi/account",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      const language =
        typeof req.body?.language === "string"
          ? req.body.language
          : typeof req.query.language === "string"
            ? req.query.language
            : "";
      res.json({
        data: await sync.updateProviderAccountLanguage(language, {
          actorId: session.user.id,
          actorName: session.user.username,
          ip: req.ip,
        }),
      });
    }),
  );

  router.post(
    "/admin/oddspapi/account/refresh-api-key",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      res.json({
        data: await sync.refreshProviderApiKey({
          actorId: session.user.id,
          actorName: session.user.username,
          ip: req.ip,
        }),
      });
    }),
  );

  router.get(
    "/admin/oddspapi/languages",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.getProviderLanguages() });
    }),
  );

  router.get(
    "/admin/sync/jobs",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({
        data: await sync.listJobs({
          page: parsePage(queryString(req.query.page)),
          pageSize: parsePageSize(queryString(req.query.pageSize)),
          status: queryString(req.query.status),
        }),
      });
    }),
  );

  router.get(
    "/admin/sync/jobs/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await sync.getJob(req.params.id) });
    }),
  );

  router.post(
    "/admin/sync/jobs/:id/retry",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      res.status(202).json({ data: await sync.retryJob(req.params.id, session.user.username) });
    }),
  );

  router.post(
    "/admin/sync/sports/:id",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      const job = await sync.start({
        trigger: "MANUAL",
        scope: "SPORT",
        scopeId: req.params.id,
        force: true,
        startedBy: session.user.username,
      });
      res.status(202).json({ data: job });
    }),
  );

  router.post(
    "/admin/sync/tournaments/:id",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      const job = await sync.start({
        trigger: "MANUAL",
        scope: "TOURNAMENT",
        scopeId: req.params.id,
        force: true,
        startedBy: session.user.username,
      });
      res.status(202).json({ data: job });
    }),
  );

  router.post(
    "/admin/sync/fixtures/:id",
    asyncHandler(async (req, res) => {
      const session = await requireAdmin(identity, req);
      const job = await sync.start({
        trigger: "MANUAL",
        scope: "FIXTURE",
        scopeId: req.params.id,
        force: true,
        startedBy: session.user.username,
      });
      res.status(202).json({ data: job });
    }),
  );

  return router;
}

async function requireAdmin(identity: IdentityService, req: import("express").Request) {
  const session = await identity.sessionFor(readCookie(req, ADMIN_COOKIE));
  if (!session) throw new HttpError(401, "Not signed in");
  if (session.user.role !== "ADMIN") throw new HttpError(403, "Admin portal only");
  return session;
}
