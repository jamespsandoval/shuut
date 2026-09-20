import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { and, eq, like } from "drizzle-orm";
import app from "../src/app";
import {
  accountSanctionsTable,
  db,
  foundersTable,
  moderationActionsTable,
  moderationCasesTable,
  moderationJobsTable,
  moderationSubjectsTable,
  operatorGrantsTable,
  postsTable,
  pool,
  sessionsTable,
  usersTable,
  voiceAiConsentsTable,
} from "@workspace/db";
import { enqueueModeration, runModerationSweep, setModerationProviderForTests } from "../src/lib/moderation";
import { CURRENT_LEGAL_POLICY_VERSIONS } from "../src/lib/legalPolicy";
import { CURRENT_VOICE_AI_CONSENT_VERSION, VOICE_AI_CONSENT_CONTENT_HASH } from "../src/lib/voiceAiConsent";

const prefix = `moderation-${Date.now()}`;
const emails: Array<{ To: string; Subject: string; TextBody: string }> = [];
let baseUrl = "";
let origin = "";
let server: ReturnType<typeof app.listen>;
let realFetch: typeof globalThis.fetch;

type Session = { cookie: string; csrf: string };
function codeFor(email: string) {
  const message = emails.findLast((item) => item.To === email);
  assert.ok(message);
  const code = message.TextBody.match(/\b\d{6}\b/)?.[0];
  assert.ok(code);
  return code;
}
function parseSession(response: Response): Session {
  const headers = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  const values = new Map<string, string>();
  for (const header of headers) {
    const [pair] = header.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0) values.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  assert.ok(values.get("shu_session"));
  assert.ok(values.get("shu_csrf"));
  return {
    cookie: [...values].map(([name, value]) => `${name}=${value}`).join("; "),
    csrf: values.get("shu_csrf")!,
  };
}
async function request(path: string, init: RequestInit & { json?: unknown; session?: Session } = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.session) {
    headers.set("cookie", init.session.cookie);
    headers.set("origin", origin);
    headers.set("x-csrf-token", init.session.csrf);
  }
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
}
async function register(email: string) {
  assert.equal((await request("/api/auth/register", { method: "POST", json: { email } })).status, 202);
  const verified = await request("/api/auth/verify-email", {
    method: "POST", json: { email, code: codeFor(email) },
  });
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
  process.env.SESSION_SECRET ||= "moderation-regression-secret";
  process.env.POSTMARK_API_KEY ||= "captured-locally";
  realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.postmarkapp.com/email") {
      const body = JSON.parse(String(init?.body)) as { To: string; Subject: string; TextBody: string };
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
  const ids = rows.map((row) => row.id);
  if (ids.length) {
    await db.delete(operatorGrantsTable).where(eq(operatorGrantsTable.userId, ids[0]!));
    await db.delete(usersTable).where(like(usersTable.email, `${prefix}%`));
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("moderation is fail-closed, revision-safe, report-private, and operator controlled", async () => {
  const ownerEmail = `${prefix}-owner@example.test`;
  const reporterEmail = `${prefix}-reporter@example.test`;
  const operatorEmail = `${prefix}-operator@example.test`;
  const adminEmail = `${prefix}-admin@example.test`;
  const ownerSession = await register(ownerEmail);
  const reporterSession = await register(reporterEmail);
  const operatorSession = await register(operatorEmail);
  const adminSession = await register(adminEmail);
  const [ownerUser] = await db.select().from(usersTable).where(eq(usersTable.email, ownerEmail));
  const [reporterUser] = await db.select().from(usersTable).where(eq(usersTable.email, reporterEmail));
  const [operatorUser] = await db.select().from(usersTable).where(eq(usersTable.email, operatorEmail));
  const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail));
  assert.ok(ownerUser && reporterUser && operatorUser && adminUser);
  await db.insert(voiceAiConsentsTable).values({
    userId: ownerUser.id,
    consentVersion: CURRENT_VOICE_AI_CONSENT_VERSION,
    consentContentHash: VOICE_AI_CONSENT_CONTENT_HASH,
  });
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, ownerUser.id));
  const [owner] = await db.insert(foundersTable).values({
    userId: ownerUser.id, name: "Moderation Owner", handle: `${prefix}owner`.slice(-30), bio: "", avatarColor: "#000000",
  }).returning();
  const [reporter] = await db.insert(foundersTable).values({
    userId: reporterUser.id, name: "Moderation Reporter", handle: `${prefix}reporter`.slice(-30), bio: "", avatarColor: "#111111",
  }).returning();
  await db.insert(foundersTable).values({
    userId: operatorUser.id, name: "Moderation Operator", handle: `${prefix}operator`.slice(-30), bio: "", avatarColor: "#222222",
  });
  await db.insert(foundersTable).values({
    userId: adminUser.id, name: "Moderation Admin", handle: `${prefix}admin`.slice(-30), bio: "", avatarColor: "#333333",
  });
  await db.insert(operatorGrantsTable).values([
    { userId: operatorUser.id, role: "reviewer" },
    { userId: adminUser.id, role: "admin" },
  ]);
  const profileReport = await request("/api/reports", {
    method: "POST", session: reporterSession,
    json: { targetType: "profile", targetId: owner.id, reason: "harassment", details: "Profile review" },
  });
  assert.equal(profileReport.status, 201);
  const [profileCase] = await db.select().from(moderationCasesTable).where(and(
    eq(moderationCasesTable.targetType, "profile"), eq(moderationCasesTable.targetId, owner.id),
  ));
  assert.ok(profileCase);

  const [safePost] = await db.insert(postsTable).values({
    authorId: owner.id, transcript: "A safe transcript", durationSeconds: 2, moderationStatus: "pending",
  }).returning();
  const previous = setModerationProviderForTests({ classify: async (text) => (
    text.includes("danger") ? { categories: ["violence"], riskScore: 90 } : { categories: [], riskScore: 0 }
  ) });
  await enqueueModeration("post", safePost.id, safePost.transcript);
  assert.equal((await request(`/api/posts/${safePost.id}`)).status, 401);
  assert.equal((await request(`/api/posts/${safePost.id}`, { session: ownerSession })).status, 200);
  await runModerationSweep();
  const [safeAfter] = await db.select().from(postsTable).where(eq(postsTable.id, safePost.id));
  assert.equal(safeAfter.moderationStatus, "approved");

  const [revokedPost] = await db.insert(postsTable).values({
    authorId: owner.id, transcript: "must not be sent after revocation", durationSeconds: 2, moderationStatus: "pending",
  }).returning();
  await enqueueModeration("post", revokedPost.id, revokedPost.transcript);
  await db.update(voiceAiConsentsTable).set({ revokedAt: new Date() })
    .where(and(
      eq(voiceAiConsentsTable.userId, ownerUser.id),
      eq(voiceAiConsentsTable.consentVersion, CURRENT_VOICE_AI_CONSENT_VERSION),
    ));
  let providerCalls = 0;
  const consentProvider = setModerationProviderForTests({
    classify: async () => {
      providerCalls++;
      return { categories: [], riskScore: 0 };
    },
  });
  await runModerationSweep();
  assert.equal(providerCalls, 0);
  const [revokedJob] = await db.select().from(moderationJobsTable)
    .where(and(eq(moderationJobsTable.targetType, "post"), eq(moderationJobsTable.targetId, revokedPost.id)));
  assert.equal(revokedJob.lastErrorCode, "VOICE_AI_CONSENT_REQUIRED");
  setModerationProviderForTests(consentProvider);
  await db.update(voiceAiConsentsTable).set({ revokedAt: null })
    .where(and(
      eq(voiceAiConsentsTable.userId, ownerUser.id),
      eq(voiceAiConsentsTable.consentVersion, CURRENT_VOICE_AI_CONSENT_VERSION),
    ));

  const [dangerPost] = await db.insert(postsTable).values({
    authorId: owner.id, transcript: "danger transcript", durationSeconds: 2, moderationStatus: "pending",
  }).returning();
  await enqueueModeration("post", dangerPost.id, dangerPost.transcript);
  await runModerationSweep();
  const [dangerAfter] = await db.select().from(postsTable).where(eq(postsTable.id, dangerPost.id));
  assert.equal(dangerAfter.moderationStatus, "quarantined");
  const [caseRow] = await db.select().from(moderationCasesTable)
    .where(and(eq(moderationCasesTable.targetType, "post"), eq(moderationCasesTable.targetId, dangerPost.id)));
  assert.ok(caseRow);
  const profileDetail = await request(`/api/moderation/cases/${profileCase.id}`, { session: operatorSession });
  assert.equal(profileDetail.status, 200);
  assert.equal((await request("/api/moderation/cases")).status, 401);
  assert.equal((await request("/api/moderation/cases", { session: ownerSession })).status, 403);
  const report = await request("/api/reports", {
    method: "POST", session: reporterSession,
    json: { targetType: "post", targetId: dangerPost.id, reason: "violence", details: "Please review this" },
  });
  assert.equal(report.status, 201);
  const detail = await request(`/api/moderation/cases/${caseRow.id}`, { session: operatorSession });
  assert.equal(detail.status, 200);
  const detailBody = await detail.json() as { reports: Array<Record<string, unknown>> };
  assert.ok(detailBody.reports.length);
  assert.ok(!Object.values(detailBody.reports[0]!).some((value) => value === reporterUser.id));
  const claim = await request(`/api/moderation/cases/${caseRow.id}/claim`, { method: "POST", session: operatorSession, json: {} });
  assert.equal(claim.status, 200);
  const version = (await claim.clone().json() as { case: { version: number } }).case.version;
  assert.equal((await request(`/api/moderation/cases/${caseRow.id}`, {
    method: "POST", session: operatorSession, json: { version: version - 1, decision: "approve" },
  })).status, 409);
  const decision = await request(`/api/moderation/cases/${caseRow.id}`, {
    method: "POST", session: operatorSession, json: { version, decision: "approve", reason: "reviewed" },
  });
  assert.equal(decision.status, 200);

  const [failurePost] = await db.insert(postsTable).values({
    authorId: owner.id, transcript: "provider failure", durationSeconds: 1, moderationStatus: "pending",
  }).returning();
  await enqueueModeration("post", failurePost.id, failurePost.transcript);
  setModerationProviderForTests({ classify: async () => { throw new Error("provider_down"); } });
  for (let i = 0; i < 6; i += 1) {
    await db.update(moderationJobsTable).set({ nextAttemptAt: new Date(0) })
      .where(and(eq(moderationJobsTable.targetType, "post"), eq(moderationJobsTable.targetId, failurePost.id)));
    await runModerationSweep();
  }
  const [failed] = await db.select().from(postsTable).where(eq(postsTable.id, failurePost.id));
  assert.equal(failed.moderationStatus, "failed");
  const [failedJob] = await db.select().from(moderationJobsTable).where(and(
    eq(moderationJobsTable.targetType, "post"), eq(moderationJobsTable.targetId, failurePost.id),
  ));
  assert.equal(failedJob.status, "failed");
  assert.equal((await runModerationSweep()), 0);
  assert.equal((await db.select().from(moderationCasesTable).where(and(
    eq(moderationCasesTable.targetType, "post"), eq(moderationCasesTable.targetId, failurePost.id),
  ))).length, 1);

  setModerationProviderForTests(previous);
  const sanction = await request(`/api/moderation/cases/${caseRow.id}/sanctions`, {
    method: "POST", session: adminSession, json: { type: "suspend", reason: "repeat abuse" },
  });
  assert.equal(sanction.status, 201);
  const sanctionId = (await sanction.json() as { sanction: { id: number } }).sanction.id;
  assert.equal((await request(`/api/moderation/cases/${caseRow.id}/appeals`, {
    method: "POST", session: ownerSession, json: { statement: "I request review" },
  })).status, 201);
  const reviewerAppeals = await request("/api/moderation/appeals", { session: operatorSession });
  const reviewerAppealId = ((await reviewerAppeals.json() as { appeals: Array<{ id: number }> }).appeals.find((appeal) => appeal.id)?.id);
  assert.ok(reviewerAppealId);
  assert.equal((await request(`/api/moderation/appeals/${reviewerAppealId}/decision`, {
    method: "POST", session: operatorSession, json: { decision: "revoke_sanction", reason: "not permitted" },
  })).status, 403);
  const appeals = await request("/api/moderation/appeals", { session: operatorSession });
  assert.equal(appeals.status, 200);
  const appealId = ((await appeals.json() as { appeals: Array<{ id: number }> }).appeals.find((appeal) => appeal.id)?.id);
  assert.ok(appealId);
  assert.equal((await request(`/api/moderation/appeals/${appealId}/decision`, {
    method: "POST", session: adminSession, json: { decision: "revoke_sanction", reason: "appeal granted" },
  })).status, 200);
  assert.equal((await db.select().from(accountSanctionsTable).where(eq(accountSanctionsTable.id, sanctionId)))[0]?.status, "revoked");
  assert.ok((await db.select().from(moderationActionsTable).where(eq(moderationActionsTable.caseId, caseRow.id))).length >= 4);
  const [subject] = await db.select().from(moderationSubjectsTable).where(eq(moderationSubjectsTable.targetId, safePost.id));
  assert.equal(subject.status, "approved");
  setModerationProviderForTests(previous);
});