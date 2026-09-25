import type { Request, Response } from "express";

export const SESSION_COOKIE = "maraki_sid";
export const ADMIN_COOKIE = "maraki_admin_sid";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function readCookie(req: Request, name: string) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string) {
  res.append("Set-Cookie", serializeCookie(SESSION_COOKIE, token, MAX_AGE_SEC));
}

export function clearSessionCookie(res: Response) {
  res.append("Set-Cookie", serializeCookie(SESSION_COOKIE, "", 0));
}

export function setAdminCookie(res: Response, token: string) {
  res.append("Set-Cookie", serializeCookie(ADMIN_COOKIE, token, MAX_AGE_SEC));
}

export function clearAdminCookie(res: Response) {
  res.append("Set-Cookie", serializeCookie(ADMIN_COOKIE, "", 0));
}

function serializeCookie(name: string, value: string, maxAge: number) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}
