import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable } from "@workspace/db";

export const SESSION_COOKIE = "shu_session";

type AuthenticatedRequest = Request & { authUserId?: string };

function cookieValue(req: Request, name: string): string | null {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getAuthenticatedUserId(req: Request): string | null {
  return (req as AuthenticatedRequest).authUserId ?? null;
}

export async function sessionAuth(req: Request, _res: Response, next: NextFunction) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (token) {
    const [session] = await db
      .select({ userId: sessionsTable.userId })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.tokenHash, hashSessionToken(token)),
          gt(sessionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (session) (req as AuthenticatedRequest).authUserId = session.userId;
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