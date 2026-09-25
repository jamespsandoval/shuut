import { createHash, timingSafeEqual } from "node:crypto";

const REVIEWER_EMAIL = "appstore@shuut.me";

/** Reviewer password access is opt-in and time-limited in each environment. */
export function reviewerPasswordMatches(
  email: string,
  password: string,
  config: { secret?: string; expiresAt?: string; developmentExpiresAt?: string; environment?: string; now?: number } = {},
): boolean {
  const {
    secret = process.env.APP_REVIEW_LOGIN_PASSWORD,
    environment = process.env.NODE_ENV,
    now = Date.now(),
  } = config;
  const expiresAt = environment === "production"
    ? config.expiresAt ?? process.env.APP_REVIEW_LOGIN_EXPIRES_AT
    : environment === "development"
      ? config.developmentExpiresAt ?? process.env.APP_REVIEW_LOGIN_DEV_EXPIRES_AT
      : undefined;
  const expiry = expiresAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expiresAt)
    ? Date.parse(expiresAt) : NaN;
  if (
    (environment !== "production" && environment !== "development") ||
    email.trim().toLowerCase() !== REVIEWER_EMAIL ||
    !secret || secret.length < 24 || secret.length > 256 ||
    !Number.isFinite(expiry) || now >= expiry
  ) return false;

  const submitted = createHash("sha256").update(password, "utf8").digest();
  const expected = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(submitted, expected);
}