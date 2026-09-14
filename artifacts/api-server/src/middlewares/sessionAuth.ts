import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";
import { auditSecurityEvent, ipPrefix, privacyHash } from "../lib/security";

export const SESSION_COOKIE = "shu_session";
export const DEVICE_COOKIE = "shu_device";
export const PASSKEYS_REQUIRED = process.env.NODE_ENV !== "development";

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

export async function sessionAuth(req: Request, _res: Response, next: NextFunction) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (token) {
    const [session] = await db
      .select({
        userId: sessionsTable.userId,
        passkeyVerifiedAt: sessionsTable.passkeyVerifiedAt,
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
    if (session) {
      const currentDeviceHash = deviceBindingHash(req);
      if (!currentDeviceHash) {
        next();
        return;
      }
      const authReq = req as AuthenticatedRequest;
      authReq.authUserId = session.userId;
      authReq.sessionTokenHash = session.tokenHash;
      authReq.sessionPasskeyVerifiedAt = session.passkeyVerifiedAt;
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
  if (PASSKEYS_REQUIRED && !isPasskeyVerified(req)) {
    res.status(403).json({ error: "Additional sign-in verification is required.", code: "passkey_required" });
    return;
  }
  next();
}