import { createHmac, timingSafeEqual } from "node:crypto";

const SHARE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not configured");
  return value;
}

function signature(postId: number, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`${postId}.${expiresAt}`)
    .digest("base64url");
}

function reshuutSignature(reshuutId: number, expiresAt: number): string {
  return createHmac("sha256", secret())
    .update(`reshuut:${reshuutId}.${expiresAt}`)
    .digest("base64url");
}

export function createPostShareToken(
  postId: number,
  now = Date.now(),
): string {
  const expiresAt = now + SHARE_TOKEN_TTL_MS;
  return `${expiresAt}.${signature(postId, expiresAt)}`;
}

export function verifyPostShareToken(
  postId: number,
  token: unknown,
  now = Date.now(),
): boolean {
  if (typeof token !== "string") return false;
  const [rawExpiry, suppliedSignature, extra] = token.split(".");
  if (!rawExpiry || !suppliedSignature || extra) return false;
  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

  const expected = Buffer.from(signature(postId, expiresAt));
  const supplied = Buffer.from(suppliedSignature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createReshuutShareToken(reshuutId: number, now = Date.now()): string {
  const expiresAt = now + SHARE_TOKEN_TTL_MS;
  return `${expiresAt}.${reshuutSignature(reshuutId, expiresAt)}`;
}

export function verifyReshuutShareToken(
  reshuutId: number,
  token: unknown,
  now = Date.now(),
): boolean {
  if (typeof token !== "string") return false;
  const [rawExpiry, suppliedSignature, extra] = token.split(".");
  if (!rawExpiry || !suppliedSignature || extra) return false;
  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const expected = Buffer.from(reshuutSignature(reshuutId, expiresAt));
  const supplied = Buffer.from(suppliedSignature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}