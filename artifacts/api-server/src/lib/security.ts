import { createHmac } from "crypto";
import type { Request } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  securityAuditEventsTable,
  securityRateLimitsTable,
} from "@workspace/db";

export function ipPrefix(req: Request): string {
  const raw = String(req.ip || req.socket.remoteAddress || "unknown")
    .replace(/^::ffff:/, "");
  if (raw.includes(".")) return raw.split(".").slice(0, 3).join(".") + ".0/24";
  if (raw.includes(":")) return raw.split(":").slice(0, 4).join(":") + "::/64";
  return "unknown";
}

export function deviceHash(req: Request): string {
  return privacyHash(String(req.headers["user-agent"] || "unknown"));
}

export function privacyHash(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

export async function auditSecurityEvent(
  req: Request,
  eventType: string,
  userId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(securityAuditEventsTable).values({
      eventType,
      userId: userId ?? null,
      ipPrefix: ipPrefix(req),
      deviceHash: deviceHash(req),
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch {
    // Security telemetry must never turn a successful state change into a
    // client-visible failure that could be retried and duplicated.
  }
}

/**
 * Database-backed fixed-window limiter. The conditional upsert is atomic,
 * so multiple API workers cannot bypass the limit with in-memory counters.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const reset = new Date(Date.now() + windowMs);
  await db
    .insert(securityRateLimitsTable)
    .values({ key, count: 1, resetsAt: reset })
    .onConflictDoUpdate({
      target: securityRateLimitsTable.key,
      set: {
        count: sql`CASE WHEN ${securityRateLimitsTable.resetsAt} <= now() THEN 1 ELSE ${securityRateLimitsTable.count} + 1 END`,
        resetsAt: sql`CASE WHEN ${securityRateLimitsTable.resetsAt} <= now() THEN ${reset} ELSE ${securityRateLimitsTable.resetsAt} END`,
      },
    });
  const [row] = await db
    .select({
      count: securityRateLimitsTable.count,
      resetsAt: securityRateLimitsTable.resetsAt,
    })
    .from(securityRateLimitsTable)
    .where(eq(securityRateLimitsTable.key, key))
    .limit(1);
  if (!row) return { allowed: true, retryAfter: 0 };
  return {
    allowed: row.count <= limit,
    retryAfter: Math.max(1, Math.ceil((row.resetsAt.getTime() - Date.now()) / 1000)),
  };
}