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
  operatorGrantsTable,
  postsTable,
  pool,
  usersTable,
} from "@workspace/db";
import { canDistributePost } from "../src/lib/moderation";
import { CURRENT_LEGAL_POLICY_VERSIONS } from "../src/lib/legalPolicy";

const prefix = `moderation-${Date.now()}`;
const testIp = `10.${Math.floor(Date.now() / 86400000) % 254 + 1}.${Math.floor(Date.now() / 1000) % 254 + 1}.5`;
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
  // Keep the persistent development rate limiter isolated across test runs.
  headers.set("x-forwarded-for", testIp);
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

test("publication is immediate, historical review states distribute safely, and manual reports remain private", async () => {
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

  const [unreviewed, pending, failed, quarantined, removed] = await db.insert(postsTable).values([
    { authorId: owner.id, transcript: "new publication", durationSeconds: 2, transcriptionStatus: "ready", moderationStatus: "unreviewed", createdAt: new Date("2026-09-10T10:00:00Z") },
    { authorId: owner.id, transcript: "legacy pending", durationSeconds: 2, transcriptionStatus: "ready", moderationStatus: "pending", createdAt: new Date("2026-09-11T10:00:00Z") },
    { authorId: owner.id, transcript: "legacy failed", durationSeconds: 2, transcriptionStatus: "ready", moderationStatus: "failed", createdAt: new Date("2026-09-12T10:00:00Z") },
    { authorId: owner.id, transcript: "quarantined", durationSeconds: 2, transcriptionStatus: "ready", moderationStatus: "quarantined", createdAt: new Date("2026-09-13T10:00:00Z") },
    { authorId: owner.id, transcript: "removed", durationSeconds: 2, transcriptionStatus: "ready", moderationStatus: "removed", createdAt: new Date("2026-09-14T10:00:00Z") },
  ]).returning();
  assert.equal(await canDistributePost(unreviewed.id), true);
  assert.equal(await canDistributePost(pending.id), true);
  assert.equal(await canDistributePost(failed.id), true);
  assert.equal(await canDistributePost(quarantined.id), false);
  assert.equal(await canDistributePost(removed.id), false);
  assert.equal((await db.select().from(moderationJobsTable).where(
    and(eq(moderationJobsTable.targetType, "post"), eq(moderationJobsTable.targetId, unreviewed.id)),
  )).length, 0);
  const feed = await request("/api/feed?view=everyone", { session: reporterSession });
  assert.equal(feed.status, 200);
  const feedIds = (await feed.json() as Array<{ id: number }>).map((post) => post.id);
  assert.deepEqual(feedIds.filter((id) => [unreviewed.id, pending.id, failed.id, quarantined.id, removed.id].includes(id)),
    [failed.id, pending.id, unreviewed.id]);

  const profileDetail = await request(`/api/moderation/cases/${profileCase.id}`, { session: operatorSession });
  assert.equal(profileDetail.status, 200);
  assert.equal((await request("/api/moderation/cases")).status, 401);
  assert.equal((await request("/api/moderation/cases", { session: ownerSession })).status, 403);
  const report = await request("/api/reports", {
    method: "POST", session: reporterSession,
    json: { targetType: "post", targetId: quarantined.id, reason: "violence", details: "Please review this" },
  });
  assert.equal(report.status, 201);
  const [caseRow] = await db.select().from(moderationCasesTable).where(and(
    eq(moderationCasesTable.targetType, "post"), eq(moderationCasesTable.targetId, quarantined.id),
  ));
  assert.ok(caseRow);
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
});