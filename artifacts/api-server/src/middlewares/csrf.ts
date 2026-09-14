import { randomBytes, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { auditSecurityEvent } from "../lib/security";
import { SESSION_COOKIE } from "./sessionAuth";

export const CSRF_COOKIE = "shu_csrf";
export const CSRF_HEADER = "x-csrf-token";

function cookieValue(req: Request, name: string): string | null {
  const value = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
}

export function issueCsrfCookie(res: Response): string {
  const token = randomBytes(32).toString("base64url");
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return token;
}

function allowedOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

export async function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
  const hasSession = Boolean(cookieValue(req, SESSION_COOKIE));
  if (!unsafe || !hasSession) {
    next();
    return;
  }
  const supplied = req.header(CSRF_HEADER);
  const cookie = cookieValue(req, CSRF_COOKIE);
  const matches =
    Boolean(supplied && cookie && supplied.length === cookie.length) &&
    Boolean(supplied && cookie && timingSafeEqual(Buffer.from(supplied), Buffer.from(cookie)));
  if (!allowedOrigin(req) || !matches) {
    await auditSecurityEvent(req, !allowedOrigin(req) ? "origin_failure" : "csrf_failure");
    res.status(403).json({ error: "Request verification failed. Please try again." });
    return;
  }
  next();
}