import { createHash, timingSafeEqual } from "node:crypto";

const REVIEWER_EMAIL = "appstore@shuut.me";

/** Reviewer password access is opt-in, production-only, and expires without a code deployment. */
export function reviewerPasswordMatches(
  email: string,
  password: string,
  config: { secret?: string; expiresAt?: string; environment?: string; now?: number } = {},
): boolean {
  const {
    secret = process.env.APP_REVIEW_LOGIN_PASSWORD,
    expiresAt = process.env.APP_REVIEW_LOGIN_EXPIRES_AT,
    environment = process.env.NODE_ENV,
    now = Date.now(),
  } = config;
  const expiry = expiresAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expiresAt)
    ? Date.parse(expiresAt) : NaN;
  if (
    environment !== "production" ||
    email.trim().toLowerCase() !== REVIEWER_EMAIL ||
    !secret || secret.length < 24 || secret.length > 256 ||
    !Number.isFinite(expiry) || now >= expiry
  ) return false;

  const submitted = createHash("sha256").update(password, "utf8").digest();
  const expected = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(submitted, expected);
}