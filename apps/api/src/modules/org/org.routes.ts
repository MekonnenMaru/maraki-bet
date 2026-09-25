import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/errors.js";
import { ADMIN_COOKIE, readCookie } from "../identity/cookie.js";
import type { IdentityService } from "../identity/identity.service.js";
import { parsePage, parsePageSize } from "../admin/page.js";
import type { OrgService } from "./org.service.js";

const permissionsSchema = z.record(z.string(), z.boolean()).optional();

const agentCreateSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(100),
  displayName: z.string().trim().min(1).max(128),
  code: z.string().trim().max(32).optional(),
  phone: z.string().trim().max(32).optional(),
  permissions: permissionsSchema,
  notes: z.string().trim().max(255).optional(),
});

const agentUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().max(32).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  permissions: permissionsSchema,
  notes: z.string().trim().max(255).nullable().optional(),
  password: z.string().min(6).max(100).optional(),
});

const shopCreateSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().trim().min(1).max(128),
  code: z.string().trim().max(32).optional(),
  address: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(32).optional(),
  permissions: permissionsSchema,
  notes: z.string().trim().max(255).optional(),
});

const shopUpdateSchema = z.object({
  agentId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().max(32).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  permissions: permissionsSchema,
  notes: z.string().trim().max(255).nullable().optional(),
});

const saleCreateSchema = z.object({
  shopId: z.string().min(1),
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(100),
  label: z.string().trim().min(1).max(64),
  code: z.string().trim().max(32).optional(),
  permissions: permissionsSchema,
  notes: z.string().trim().max(255).optional(),
});

const saleUpdateSchema = z.object({
  shopId: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(64).optional(),
  code: z.string().trim().max(32).nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  permissions: permissionsSchema,
  notes: z.string().trim().max(255).nullable().optional(),
  password: z.string().min(6).max(100).optional(),
});

function queryString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function paging(req: { query: Record<string, unknown> }) {
  return {
    page: parsePage(queryString(req.query.page)),
    pageSize: parsePageSize(queryString(req.query.pageSize)),
  };
}

export function orgRoutes(identity: IdentityService, org: OrgService) {
  const router = Router();

  router.get(
    "/admin/agents",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({
        data: await org.listAgents({
          q: queryString(req.query.q),
          status: queryString(req.query.status),
          ...paging(req),
        }),
      });
    }),
  );

  router.post(
    "/admin/agents",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = agentCreateSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid agent payload");
      res.status(201).json({ data: await org.createAgent(body.data) });
    }),
  );

  router.get(
    "/admin/agents/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.getAgent(req.params.id) });
    }),
  );

  router.patch(
    "/admin/agents/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = agentUpdateSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid agent update");
      res.json({ data: await org.updateAgent(req.params.id, body.data) });
    }),
  );

  router.delete(
    "/admin/agents/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.deleteAgent(req.params.id) });
    }),
  );

  router.delete(
    "/admin/agents",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.deleteAllAgents() });
    }),
  );

  router.get(
    "/admin/shops",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({
        data: await org.listShops({
          q: queryString(req.query.q),
          status: queryString(req.query.status),
          agentId: queryString(req.query.agentId),
          ...paging(req),
        }),
      });
    }),
  );

  router.post(
    "/admin/shops",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = shopCreateSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid shop payload");
      res.status(201).json({ data: await org.createShop(body.data) });
    }),
  );

  router.get(
    "/admin/shops/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.getShop(req.params.id) });
    }),
  );

  router.patch(
    "/admin/shops/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = shopUpdateSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid shop update");
      res.json({ data: await org.updateShop(req.params.id, body.data) });
    }),
  );

  router.delete(
    "/admin/shops/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.deleteShop(req.params.id) });
    }),
  );

  router.delete(
    "/admin/shops",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.deleteAllShops() });
    }),
  );

  router.get(
    "/admin/sales",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({
        data: await org.listSales({
          q: queryString(req.query.q),
          status: queryString(req.query.status),
          shopId: queryString(req.query.shopId),
          agentId: queryString(req.query.agentId),
          ...paging(req),
        }),
      });
    }),
  );

  router.post(
    "/admin/sales",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = saleCreateSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid sale payload");
      res.status(201).json({ data: await org.createSale(body.data) });
    }),
  );

  router.get(
    "/admin/sales/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.getSale(req.params.id) });
    }),
  );

  router.patch(
    "/admin/sales/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      const body = saleUpdateSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "Invalid sale update");
      res.json({ data: await org.updateSale(req.params.id, body.data) });
    }),
  );

  router.delete(
    "/admin/sales/:id",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.deleteSale(req.params.id) });
    }),
  );

  router.delete(
    "/admin/sales",
    asyncHandler(async (req, res) => {
      await requireAdmin(identity, req);
      res.json({ data: await org.deleteAllSales() });
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
