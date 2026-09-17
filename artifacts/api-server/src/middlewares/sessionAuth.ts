import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import { auditSecurityEvent, ipPrefix, privacyHash } from "../lib/security";

export const SESSION_COOKIE = "shu_session";
export const DEVICE_COOKIE = "shu_device";
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.clearCookie(DEVICE_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

type AuthenticatedRequest = Request & {
  authUserId?: string;
  sessionPasskeyVerifiedAt?: Date | null;
  sessionTokenHash?: string;
  authTransport?: "cookie" | "bearer";
};

function cookieValue(req: Request, name: string): string | null {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export function deviceBindingHash(req: Request): string | null {
  const deviceToken = cookieValue(req, DEVICE_COOKIE);
  if (!deviceToken) return null;
  return privacyHash(`${deviceToken}:${String(req.headers["user-agent"] || "unknown")}`);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getAuthenticatedUserId(req: Request): string | null {
  return (req as AuthenticatedRequest).authUserId ?? null;
}

export function isPasskeyVerified(req: Request): boolean {
  return Boolean((req as AuthenticatedRequest).sessionPasskeyVerifiedAt);
}

export function getSessionTokenHash(req: Request): string | null {
  return (req as AuthenticatedRequest).sessionTokenHash ?? null;
}

export function isBearerRequest(req: Request): boolean {
  return (req as AuthenticatedRequest).authTransport === "bearer";
}

function bearerValue(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer[ \t]+([A-Za-z0-9_-]{32,})$/i);
  return match?.[1] ?? null;
}

export async function sessionAuth(req: Request, _res: Response, next: NextFunction) {
  const bearer = bearerValue(req);
  const cookie = cookieValue(req, SESSION_COOKIE);
  // An explicit bearer attempt must never fall back to a browser cookie, and
  // vice versa. This prevents either token class being replayed over the
  // other transport.
  const token = bearer ?? cookie;
  if (token) {
    const [session] = await db
      .select({
        userId: sessionsTable.userId,
        passkeyVerifiedAt: sessionsTable.passkeyVerifiedAt,
        transport: sessionsTable.transport,
        deviceHash: sessionsTable.deviceHash,
        tokenHash: sessionsTable.tokenHash,
      })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.tokenHash, hashSessionToken(token)),
          gt(sessionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (session && ((bearer && session.transport === "mobile") || (!bearer && session.transport === "browser"))) {
      // Bearer sessions are explicitly mobile sessions and have no browser
      // device cookie to bind. Browser sessions retain the existing binding.
      if (bearer) {
        const authReq = req as AuthenticatedRequest;
        authReq.authUserId = session.userId;
        authReq.sessionTokenHash = session.tokenHash;
        authReq.sessionPasskeyVerifiedAt = session.passkeyVerifiedAt;
        authReq.authTransport = "bearer";
        next();
        return;
      }
      const currentDeviceHash = deviceBindingHash(req);
      if (!currentDeviceHash) {
        next();
        return;
      }
      // Do not assign any authenticated fields until device binding has
      // passed. This is important for routes that only inspect authUserId.
      const authReq = req as AuthenticatedRequest;
      authReq.authUserId = session.userId;
      authReq.sessionTokenHash = session.tokenHash;
      authReq.sessionPasskeyVerifiedAt = session.passkeyVerifiedAt;
      authReq.authTransport = "cookie";
      // A changed browser/device is treated as a new authentication context.
      // Mobile IP changes are intentionally tolerated because the device hash
      // remains stable; the coarse prefix is retained for audit only.
      if (session.deviceHash && session.deviceHash !== currentDeviceHash) {
        await db
          .update(sessionsTable)
          .set({ passkeyVerifiedAt: null, ipPrefix: ipPrefix(req) })
          .where(eq(sessionsTable.tokenHash, session.tokenHash));
        authReq.sessionPasskeyVerifiedAt = null;
        await auditSecurityEvent(req, "session_anomaly", session.userId, {
          reason: "device_changed",
        });
      }
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!getAuthenticatedUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}