import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/async-handler.js";
import { HttpError } from "../../lib/errors.js";
import { clearSessionCookie, readCookie, SESSION_COOKIE, setSessionCookie } from "./cookie.js";
import type { IdentityService } from "./identity.service.js";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, or underscore"),
  password: z.string().min(6).max(72),
  phone: z.string().trim().min(9).max(20).optional().or(z.literal("")),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export function identityRoutes(identity: IdentityService) {
  const router = Router();

  router.post(
    "/auth/register",
    asyncHandler(async (req, res) => {
      const body = parse(registerSchema, req.body);
      const { token, session } = await identity.register({
        username: body.username,
        password: body.password,
        phone: body.phone || undefined,
      });
      setSessionCookie(res, token);
      res.status(201).json({ data: session });
    }),
  );

  router.post(
    "/auth/login",
    asyncHandler(async (req, res) => {
      const body = parse(loginSchema, req.body);
      const { token, session } = await identity.login(body);
      setSessionCookie(res, token);
      res.json({ data: session });
    }),
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      await identity.logout(readCookie(req, SESSION_COOKIE));
      clearSessionCookie(res);
      res.json({ data: { ok: true } });
    }),
  );

  router.get(
    "/auth/me",
    asyncHandler(async (req, res) => {
      const session = await identity.sessionFor(readCookie(req, SESSION_COOKIE));
      if (!session) throw new HttpError(401, "Not signed in");
      res.json({ data: session });
    }),
  );

  return router;
}

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid request");
  return result.data;
}
