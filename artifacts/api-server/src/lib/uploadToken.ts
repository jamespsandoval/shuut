import { createHmac, timingSafeEqual } from "node:crypto";
import { SIGNED_UPLOAD_TTL_MS } from "./objectStorage";

type UploadClaims = { objectPath: string; contentType: string; size: number; expiresAt: number };
function secret() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  return process.env.SESSION_SECRET;
}
function encode(claims: UploadClaims) {
  return Buffer.from(JSON.stringify(claims)).toString("base64url");
}
export function createUploadToken(objectPath: string, contentType: string, size: number) {
  const claims = { objectPath, contentType, size, expiresAt: Date.now() + SIGNED_UPLOAD_TTL_MS };
  const body = encode(claims);
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}
export function verifyUploadToken(token: string): UploadClaims | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as UploadClaims;
    if (!claims.objectPath || !claims.contentType || !Number.isSafeInteger(claims.size)
      || !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt < Date.now()) return null;
    return claims;
  } catch { return null; }
}