import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../src/app";
import { ObjectStorageService } from "../src/lib/objectStorage";
import { createUploadToken } from "../src/lib/uploadToken";
import { and, eq, like } from "drizzle-orm";
import { db, pool, usersTable, voiceAiConsentsTable } from "@workspace/db";
import { CURRENT_LEGAL_POLICY_VERSIONS } from "../src/lib/legalPolicy";
import {
  CURRENT_VOICE_AI_CONSENT_VERSION,
  VOICE_AI_CONSENT_CANONICAL_PAYLOAD,
  VOICE_AI_CONSENT_CONTENT_HASH,
  VOICE_AI_CONSENT_DETAILS,
  VOICE_AI_CONSENT_SUMMARY,
} from "../src/lib/voiceAiConsent";

type Session = { cookie: string; csrf: string };
const prefix = `voice-consent-${Date.now()}`;
let server: ReturnType<typeof app.listen>;
let baseUrl = "";
let origin = "";
let realFetch: typeof globalThis.fetch;
const emails: Array<{ To: string; TextBody: string }> = [];
let requestNumber = 1;

async function request(path: string, init: RequestInit & { json?: unknown; session?: Session } = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-forwarded-for", `172.${process.pid % 250}.${(requestNumber++ % 250) + 1}.1`);
  if (init.session) {
    headers.set("cookie", init.session.cookie);
    headers.set("origin", origin);
    headers.set("x-csrf-token", init.session.csrf);
  }
  return fetch(`${baseUrl}${path}`, {
    ...init, headers, body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
}
function parseSession(response: Response): Session {
  const headers = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
  const values = new Map<string, string>();
  for (const header of headers) {
    const [pair] = header.split(";");
    const at = pair.indexOf("=");
    if (at > 0) values.set(pair.slice(0, at), pair.slice(at + 1));
  }
  assert.ok(values.get("shu_session"));
  assert.ok(values.get("shu_csrf"));
  return { cookie: [...values].map(([key, value]) => `${key}=${value}`).join("; "), csrf: values.get("shu_csrf")! };
}
async function register(email: string) {
  assert.equal((await request("/api/auth/register", { method: "POST", json: { email } })).status, 202);
  const message = emails.findLast((item) => item.To === email);
  assert.ok(message);
  const code = message.TextBody.match(/\b\d{6}\b/)?.[0];
  assert.ok(code);
  const verified = await request("/api/auth/verify-email", { method: "POST", json: { email, code } });
  assert.equal(verified.status, 200);
  const session = parseSession(verified);
  assert.equal((await request("/api/auth/legal-policy-consent", {
    method: "POST", session, json: {
      termsVersion: CURRENT_LEGAL_POLICY_VERSIONS.terms,
      communityGuidelinesVersion: CURRENT_LEGAL_POLICY_VERSIONS.communityGuidelines,
      source: "web",
    },
  })).status, 200);
  return session;
}

before(async () => {
  process.env.SESSION_SECRET ||= "voice-consent-regression-secret";
  process.env.POSTMARK_API_KEY ||= "captured-locally";
  realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.postmarkapp.com/email") {
      const body = JSON.parse(String(init?.body)) as { To: string; TextBody: string };
      emails.push(body);
      return new Response("{}", { status: 200 });
    }
    return realFetch(input, init);
  };
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  origin = baseUrl;
  process.env.APP_ORIGIN = origin;
  process.env.WEBAUTHN_RP_ID = "127.0.0.1";
});

after(async () => {
  globalThis.fetch = realFetch;
  const rows = await db.select({ id: usersTable.id }).from(usersTable).where(like(usersTable.email, `${prefix}%`));
  for (const row of rows) await db.delete(usersTable).where(eq(usersTable.id, row.id));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("voice AI disclosure version and content hash are canonical", () => {
  assert.equal(CURRENT_VOICE_AI_CONSENT_VERSION, "2026-09-20");
  assert.equal(
    VOICE_AI_CONSENT_CANONICAL_PAYLOAD,
    `${VOICE_AI_CONSENT_SUMMARY}\n${VOICE_AI_CONSENT_DETAILS.join("\n")}`,
  );
  assert.equal(
    createHash("sha256").update(VOICE_AI_CONSENT_CANONICAL_PAYLOAD).digest("hex"),
    "a48f9e7a2ad2a983acbb9e7fd3143f4a74191155b5ebe8417f7f3dadac65958c",
  );
  assert.equal(
    VOICE_AI_CONSENT_CONTENT_HASH,
    "sha256:a48f9e7a2ad2a983acbb9e7fd3143f4a74191155b5ebe8417f7f3dadac65958c",
  );
});

test("consent endpoints enforce auth, current disclosure, idempotence, and revocation", async () => {
  assert.equal((await request("/api/voice-ai-consent")).status, 401);
  assert.equal((await request("/api/voice-ai-consent", { method: "POST", json: {} })).status, 401);
  assert.equal((await request("/api/voice-ai-consent", { method: "DELETE" })).status, 401);

  const email = `${prefix}-lifecycle@example.test`;
  const session = await register(email);
  const initial = await (await request("/api/voice-ai-consent", { session })).json();
  assert.deepEqual(initial, {
    required: true, currentVersion: CURRENT_VOICE_AI_CONSENT_VERSION,
    acceptedVersion: null, acceptedAt: null, revokedAt: null, canRevoke: false,
    summary: VOICE_AI_CONSENT_SUMMARY, details: [...VOICE_AI_CONSENT_DETAILS],
  });

  const user = (await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)))[0]!;
  await db.insert(voiceAiConsentsTable).values({
    userId: user.id, consentVersion: "2025-01-01", consentContentHash: "sha256:old",
  });
  const old = await (await request("/api/voice-ai-consent", { session })).json();
  assert.equal(old.required, true);
  assert.equal(old.acceptedVersion, "2025-01-01");
  await db.insert(voiceAiConsentsTable).values({
    userId: user.id, consentVersion: CURRENT_VOICE_AI_CONSENT_VERSION, consentContentHash: "sha256:stale",
  });
  const hashMismatch = await (await request("/api/voice-ai-consent", { session })).json();
  assert.equal(hashMismatch.required, true);
  assert.equal(hashMismatch.acceptedVersion, CURRENT_VOICE_AI_CONSENT_VERSION);
  assert.equal(hashMismatch.canRevoke, false);
  const stale = await request("/api/voice-ai-consent", {
    method: "POST", session, json: { version: "2025-01-01", source: "web" },
  });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "VOICE_AI_CONSENT_STALE");

  const acceptedResponse = await request("/api/voice-ai-consent", {
    method: "POST", session, json: { version: CURRENT_VOICE_AI_CONSENT_VERSION, source: "native" },
  });
  assert.equal(acceptedResponse.status, 200);
  const accepted = await acceptedResponse.json();
  assert.equal(accepted.required, false);
  assert.equal(accepted.currentVersion, CURRENT_VOICE_AI_CONSENT_VERSION);
  const row = (await db.select().from(voiceAiConsentsTable).where(and(
    eq(voiceAiConsentsTable.userId, user.id),
    eq(voiceAiConsentsTable.consentVersion, CURRENT_VOICE_AI_CONSENT_VERSION),
  )))[0]!;
  assert.equal(row.consentContentHash, VOICE_AI_CONSENT_CONTENT_HASH);
  assert.equal(row.source, "native");
  const repeated = await request("/api/voice-ai-consent", {
    method: "POST", session, json: { version: CURRENT_VOICE_AI_CONSENT_VERSION, source: "ios" },
  });
  assert.equal(repeated.status, 200);
  assert.equal((await db.select().from(voiceAiConsentsTable).where(eq(voiceAiConsentsTable.userId, user.id))).length, 2);

  const revoked = await request("/api/voice-ai-consent", { method: "DELETE", session });
  const revokedBody = await revoked.json();
  assert.equal(revoked.status, 200);
  assert.equal(revokedBody.required, true);
  assert.ok(revokedBody.revokedAt);
  assert.equal((await (await request("/api/voice-ai-consent", { session })).json()).required, true);
  const reaccepted = await request("/api/voice-ai-consent", {
    method: "POST", session, json: { version: CURRENT_VOICE_AI_CONSENT_VERSION, source: "web" },
  });
  assert.equal((await reaccepted.json()).required, false);
  assert.equal((await (await request("/api/voice-ai-consent", { session })).json()).revokedAt, null);
});

test("voice operations are blocked before provider or storage side effects without consent", async () => {
  const session = await register(`${prefix}-gates@example.test`);
  for (const [path, json] of [
    ["/api/transcriptions", { audioObjectPath: "/objects/uploads/no-provider-call" }],
    ["/api/posts", { audioObjectPath: "/objects/uploads/no-post-side-effect", durationSeconds: 1 }],
    ["/api/posts/999999/comments", { audioObjectPath: "/objects/uploads/no-comment-side-effect", durationSeconds: 1 }],
  ] as const) {
    const response = await request(path, { method: "POST", session, json });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "VOICE_AI_CONSENT_REQUIRED");
  }
  const audio = await request("/api/storage/uploads/request-url", {
    method: "POST", session, json: { name: "voice.mp3", contentType: "audio/mpeg", size: 100 },
  });
  assert.equal(audio.status, 403);
  assert.equal((await audio.json()).code, "VOICE_AI_CONSENT_REQUIRED");
  const image = await request("/api/storage/uploads/request-url", {
    method: "POST", session, json: { name: "avatar.jpg", contentType: "image/jpeg", size: 100 },
  });
  assert.notEqual(image.status, 403);
  if (image.status === 200) assert.ok((await image.json()).uploadURL);
});

test("token upload enforces MIME, exact size, magic bytes, and expiry", async () => {
  const saved: Buffer[] = [];
  const originalSave = ObjectStorageService.prototype.saveUpload;
  ObjectStorageService.prototype.saveUpload = async function (_path, data) { saved.push(data); };
  const objectPath = "/objects/uploads/token-image-test";
  const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
  const token = createUploadToken(objectPath, "image/jpeg", jpeg.length);
  const upload = (body: Buffer, contentType: string, tokenValue = token) => fetch(
    `${baseUrl}/api/storage/uploads/put?token=${encodeURIComponent(tokenValue)}`,
    { method: "PUT", headers: { "content-type": contentType, "content-length": String(body.length) }, body },
  );
  try {
    assert.equal((await upload(jpeg, "image/jpeg")).status, 200);
    assert.equal(saved.length, 1);
    assert.equal((await upload(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), "audio/webm")).status, 400);
    assert.equal((await upload(jpeg, "image/png")).status, 400);
    assert.equal((await upload(Buffer.from([0xff, 0xd8]), "image/jpeg")).status, 400);
    assert.equal((await upload(jpeg, "image/jpeg", `${token}tampered`)).status, 400);
    const expiredPayload = Buffer.from(JSON.stringify({
      objectPath, contentType: "image/jpeg", size: jpeg.length, expiresAt: 1,
    })).toString("base64url");
    assert.equal((await upload(jpeg, "image/jpeg", `${expiredPayload}.invalid`)).status, 400);
    assert.equal(saved.length, 1);
  } finally {
    ObjectStorageService.prototype.saveUpload = originalSave;
  }
});