import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { eq, inArray, like } from "drizzle-orm";
import app from "../src/app";
import { retryDueCleanupJobs } from "../src/routes/shuut";
import { queueExpiredPrivateUploads } from "../src/lib/privateObjectCleanup";
import { ObjectStorageService } from "../src/lib/objectStorage";
import { webauthnVerifier } from "../src/lib/webauthn";
import { hashSessionToken } from "../src/middlewares/sessionAuth";
import { authCodeEmail } from "../src/lib/authCodeEmail";
import { canShowPostDeleteAction } from "../../shuut-app/src/lib/post-permissions";
import {
  sendSecurityNotificationEmail,
  type SecurityNotificationKind,
} from "../src/lib/postmark";
import {
  db,
  commentsTable,
  foundersTable,
  passkeyRecoveriesTable,
  objectCleanupJobsTable,
  passkeysTable,
  privateObjectCleanupTable,
  pool,
  postsTable,
  profileImageUploadsTable,
  sessionsTable,
  usersTable,
  webauthnChallengesTable,
} from "@workspace/db";

const prefix = `auth-security-${Date.now()}`;
const userAgent = "SHUUT security regression test";
const sentEmails: Array<{ To: string; Subject: string; TextBody: string; HtmlBody?: string }> = [];
let baseUrl = "";
let appOrigin = "";
let server: ReturnType<typeof app.listen>;
let realFetch: typeof globalThis.fetch;
let realRegisterVerifier: typeof webauthnVerifier.verifyRegistration;
let realAssertionVerifier: typeof webauthnVerifier.verifyAuthentication;
let realStreamPrivate: ObjectStorageService["streamPrivate"];
let requestNumber = 0;

type BrowserSession = {
  cookie: string;
  csrf: string;
  session: string;
  device: string;
};

function codeFor(email: string, subject: string): string {
  const message = sentEmails.findLast(
    (entry) => entry.To === email && entry.Subject === subject,
  );
  assert.ok(message, `Expected captured email "${subject}" for ${email}`);
  const code = message.TextBody.match(/\b\d{6}\b/)?.[0];
  assert.ok(code, "Expected a six-digit code");
  return code;
}

test("authentication code templates are readable, branded, and safely escaped", () => {
  const expectations = {
    verification: ["Confirm your email", "finish creating your account", "safely ignore"],
    "sign-in": ["Your sign-in code", "continue signing in", "safely ignore"],
    "passkey-recovery": ["Confirm passkey recovery", "complete passkey recovery", "removes all passkeys"],
  } as const;
  for (const kind of ["verification", "sign-in", "passkey-recovery"] as const) {
    const message = authCodeEmail({ code: '12<3&"456', kind });
    assert.match(message.htmlBody, /SH<span[^>]*>ÜÜ<\/span>T/);
    assert.match(message.htmlBody, /12&lt;3&amp;&quot;456/);
    assert.ok(!message.htmlBody.includes('12<3&"456'));
    assert.match(message.textBody, /This code expires in 15 minutes/);
    assert.match(message.textBody, /This inbox isn’t monitored/);
    for (const phrase of expectations[kind]) {
      assert.ok(message.htmlBody.includes(phrase));
      assert.ok(message.textBody.includes(phrase));
    }
  }
});

test("post delete controls follow the explicit server permission", () => {
  assert.equal(canShowPostDeleteAction({ canDelete: true }), true);
  assert.equal(canShowPostDeleteAction({ canDelete: false }), false);
});

test("Postmark payloads include branded HTML and text for every security notification", async () => {
  const cases: Array<{
    kind: SecurityNotificationKind;
    subject: string;
    phrase: string;
  }> = [
    {
      kind: "passkey-removed",
      subject: "A passkey was removed from your SHÜÜT account",
      phrase: "start lost-passkey recovery immediately",
    },
    {
      kind: "recovery-requested",
      subject: "Passkey recovery requested for your SHÜÜT account",
      phrase: "your existing passkeys remain active",
    },
    {
      kind: "recovery-completed",
      subject: "Your SHÜÜT passkey recovery is complete",
      phrase: "add a new passkey",
    },
    {
      kind: "recovery-cancelled",
      subject: "SHÜÜT passkey recovery was cancelled",
      phrase: "No further action is needed",
    },
  ];

  for (const item of cases) {
    const to = `${prefix}-${item.kind}@example.test`;
    await sendSecurityNotificationEmail({
      to,
      kind: item.kind,
      ...(item.kind === "recovery-requested"
        ? { availableAt: "2026-09-16T12:00:00.000Z" }
        : {}),
    });
    const payload = sentEmails.findLast(
      (entry) => entry.To === to && entry.Subject === item.subject,
    );
    assert.ok(payload, `Expected Postmark payload for ${item.kind}`);
    assert.ok(payload.HtmlBody);
    assert.match(payload.HtmlBody, /SH<span[^>]*>ÜÜ<\/span>T/);
    assert.ok(payload.HtmlBody.includes(item.phrase));
    assert.ok(payload.TextBody.includes(item.phrase));
  }
});

function parseSession(response: Response): BrowserSession {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  const values = new Map<string, string>();
  for (const header of setCookies) {
    const [pair] = header.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0) values.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  assert.ok(values.get("shu_session"));
  assert.ok(values.get("shu_device"));
  assert.ok(values.get("shu_csrf"));
  assert.match(setCookies.join(";"), /HttpOnly/i);
  return {
    session: values.get("shu_session")!,
    device: values.get("shu_device")!,
    csrf: values.get("shu_csrf")!,
    cookie: [...values].map(([name, value]) => `${name}=${value}`).join("; "),
  };
}

async function request(
  path: string,
  init: RequestInit & { json?: unknown; session?: BrowserSession } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("user-agent", userAgent);
  headers.set("x-forwarded-for", `10.${(requestNumber++ % 250) + 1}.0.1`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.session) {
    headers.set("cookie", init.session.cookie);
    if (!headers.has("origin")) headers.set("origin", appOrigin);
    if (!headers.has("x-csrf-token")) headers.set("x-csrf-token", init.session.csrf);
  }
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
}

async function register(email: string): Promise<BrowserSession> {
  const registration = await request("/api/auth/register", {
    method: "POST",
    json: { email },
  });
  assert.equal(registration.status, 202);
  const verification = await request("/api/auth/verify-email", {
    method: "POST",
    json: { email, code: codeFor(email, "Verify your SHÜÜT account") },
  });
  assert.equal(verification.status, 200);
  const body = await verification.json() as { user: { passkeyVerified: boolean } };
  assert.equal(body.user.passkeyVerified, false);
  return parseSession(verification);
}

async function registrationOptions(session: BrowserSession) {
  const response = await request("/api/auth/passkey/register/options", {
    method: "POST",
    session,
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ challenge: string; rp: { id: string } }>;
}

before(async () => {
  process.env.SESSION_SECRET ||= "auth-regression-session-secret";
  process.env.POSTMARK_API_KEY ||= "captured-locally";
  process.env.PRIVATE_OBJECT_DIR ||= "/test-bucket/private";
  realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.postmarkapp.com/email") {
      sentEmails.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ Message: "OK" }), { status: 200 });
    }
    return realFetch(input, init);
  };
  realRegisterVerifier = webauthnVerifier.verifyRegistration;
  realAssertionVerifier = webauthnVerifier.verifyAuthentication;
  realStreamPrivate = ObjectStorageService.prototype.streamPrivate;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  appOrigin = baseUrl;
  process.env.APP_ORIGIN = appOrigin;
  process.env.WEBAUTHN_RP_ID = "127.0.0.1";
});

after(async () => {
  webauthnVerifier.verifyRegistration = realRegisterVerifier;
  webauthnVerifier.verifyAuthentication = realAssertionVerifier;
  ObjectStorageService.prototype.streamPrivate = realStreamPrivate;
  globalThis.fetch = realFetch;
  const users = await db.select({ id: usersTable.id }).from(usersTable)
    .where(like(usersTable.email, `${prefix}%`));
  const userIds = users.map((user) => user.id);
  if (userIds.length) {
    const founders = await db.select({ id: foundersTable.id }).from(foundersTable)
      .where(inArray(foundersTable.userId, userIds));
    const founderIds = founders.map((founder) => founder.id);
    if (founderIds.length) {
      await db.delete(postsTable).where(inArray(postsTable.authorId, founderIds));
    }
    await db.delete(profileImageUploadsTable)
      .where(inArray(profileImageUploadsTable.userId, userIds));
    await db.delete(webauthnChallengesTable)
      .where(inArray(webauthnChallengesTable.userId, userIds));
    await db.delete(passkeysTable).where(inArray(passkeysTable.userId, userIds));
    await db.delete(sessionsTable).where(inArray(sessionsTable.userId, userIds));
    await db.delete(foundersTable).where(inArray(foundersTable.userId, userIds));
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await pool.end();
});

test("email verification creates a pending session blocked from protected data and audio actions", async () => {
  const session = await register(`${prefix}-pending@example.test`);
  for (const [path, method, json] of [
    ["/api/feed", "GET", undefined],
    ["/api/posts/1/audio", "GET", undefined],
    ["/api/storage/uploads/request-url", "POST", { size: 10, contentType: "audio/webm" }],
    ["/api/transcriptions", "POST", { audioObjectPath: "/objects/uploads/not-owned" }],
    ["/api/posts", "POST", { transcript: "No bypass", durationSeconds: 2, audioObjectPath: "/objects/uploads/not-owned" }],
  ] as const) {
    const response = await request(path, { method, json, session });
    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal((await response.json() as { code?: string }).code, "passkey_required");
  }
});

test("CSRF and Origin checks protect pending passkey requests", async () => {
  const session = await register(`${prefix}-csrf@example.test`);
  const missingCsrf = await request("/api/auth/passkey/register/options", {
    method: "POST",
    headers: { cookie: session.cookie, origin: appOrigin },
  });
  assert.equal(missingCsrf.status, 403);
  const wrongOrigin = await request("/api/auth/passkey/register/options", {
    method: "POST",
    session,
    headers: { origin: "https://attacker.example" },
  });
  assert.equal(wrongOrigin.status, 403);
});

test("passwordless login resists enumeration and replay, logout invalidates the session", async () => {
  const email = `${prefix}-login@example.test`;
  await register(email);
  const known = await request("/api/auth/login", {
    method: "POST",
    json: { email },
  });
  const unknown = await request("/api/auth/login", {
    method: "POST",
    json: { email: `${prefix}-missing@example.test` },
  });
  assert.equal(known.status, 202);
  assert.equal(unknown.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());

  const code = codeFor(email, "Your SHÜÜT sign-in code");
  const verified = await request("/api/auth/login/verify", {
    method: "POST",
    json: { email, code },
  });
  assert.equal(verified.status, 200);
  const session = parseSession(verified);
  assert.equal((await request("/api/auth/login/verify", {
    method: "POST",
    json: { email, code },
  })).status, 400);
  const logout = await request("/api/auth/logout", {
    method: "POST",
    session,
  });
  assert.equal(logout.status, 204);
  assert.equal((await request("/api/auth/me", {
    headers: { cookie: session.cookie },
  })).status, 401);
});

test("session transports cannot cross authentication channels or bypass device binding", async () => {
  const email = `${prefix}-transport@example.test`;
  const browser = await register(email);
  assert.equal((await request("/api/auth/me", {
    headers: { cookie: `shu_session=${browser.session}` },
  })).status, 401);
  assert.equal((await request("/api/auth/me", {
    headers: { authorization: `Bearer ${browser.session}` },
  })).status, 401);

  await request("/api/auth/mobile/login", { method: "POST", json: { email } });
  const mobileResponse = await request("/api/auth/mobile/login/verify", {
    method: "POST",
    json: { email, code: codeFor(email, "Your SHÜÜT sign-in code") },
  });
  const mobile = await mobileResponse.json() as { accessToken: string };
  assert.equal((await request("/api/auth/me", {
    headers: { cookie: `shu_session=${mobile.accessToken}` },
  })).status, 401);
});

test("mobile auth returns an explicit bearer session without cookies and revokes it on logout", async () => {
  const email = `${prefix}-mobile@example.test`;
  await register(email);
  const start = await request("/api/auth/mobile/login", {
    method: "POST",
    json: { email },
  });
  assert.equal(start.status, 202);
  const verified = await request("/api/auth/mobile/login/verify", {
    method: "POST",
    json: { email, code: codeFor(email, "Your SHÜÜT sign-in code") },
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.headers.get("set-cookie"), null);
  const body = await verified.json() as {
    accessToken: string;
    tokenType: string;
    passkeyRequired: boolean;
  };
  assert.match(body.accessToken, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(body.tokenType, "Bearer");
  assert.equal(body.passkeyRequired, false);

  const me = await request("/api/auth/me", {
    headers: { authorization: `Bearer ${body.accessToken}` },
  });
  assert.equal(me.status, 200);
  const logout = await request("/api/auth/mobile/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${body.accessToken}` },
  });
  assert.equal(logout.status, 204);
  assert.equal((await request("/api/auth/me", {
    headers: { authorization: `Bearer ${body.accessToken}` },
  })).status, 401);
});

test("mobile sessions for passkey users remain pending until passkey handoff", async () => {
  const email = `${prefix}-mobile-passkey@example.test`;
  const browser = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.insert(passkeysTable).values({
    credentialId: `${prefix}-mobile-passkey-credential`,
    userId: user.id,
    publicKey: Buffer.from([1, 2, 3]).toString("base64"),
    counter: 0,
  });
  const start = await request("/api/auth/mobile/login", {
    method: "POST",
    json: { email },
  });
  assert.equal(start.status, 202);
  const verified = await request("/api/auth/mobile/login/verify", {
    method: "POST",
    json: { email, code: codeFor(email, "Your SHÜÜT sign-in code") },
  });
  assert.equal(verified.status, 200);
  const body = await verified.json() as { accessToken: string; passkeyRequired: boolean };
  assert.equal(body.passkeyRequired, true);
  assert.equal((await request("/api/feed", {
    headers: { authorization: `Bearer ${body.accessToken}` },
  })).status, 403);
  // The mobile bearer is deliberately not accepted as a fully verified
  // browser session, while the original browser session remains revocable.
  assert.equal((await request("/api/auth/me", { session: browser })).status, 401);
});

test("browser passkey handoff serves a ceremony page and cannot consume an unapproved grant", async () => {
  const email = `${prefix}-mobile-handoff@example.test`;
  await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.insert(passkeysTable).values({
    credentialId: `${prefix}-mobile-handoff-credential`,
    userId: user.id,
    publicKey: Buffer.from([1, 2, 3]).toString("base64"),
    counter: 0,
  });
  await request("/api/auth/mobile/login", { method: "POST", json: { email } });
  const login = await request("/api/auth/mobile/login/verify", {
    method: "POST",
    json: { email, code: codeFor(email, "Your SHÜÜT sign-in code") },
  });
  const { accessToken } = await login.json() as { accessToken: string };
  const started = await request("/api/auth/mobile/passkey/handoff", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(started.status, 201);
  const handoff = await started.json() as { handoffUrl: string };
  assert.ok(!handoff.handoffUrl.includes(accessToken));
  const grantUrl = new URL(handoff.handoffUrl);
  const opened = await request(`${grantUrl.pathname}${grantUrl.search}`);
  assert.equal(opened.status, 200);
  assert.match(opened.headers.get("content-type") || "", /text\/html/);
  const page = await opened.text();
  assert.match(page, /navigator\.credentials\.get/);
  assert.match(page, /passkey\/assertion\/options/);
  assert.match(page, /passkey\/assertion\/verify/);
  assert.match(page, /mobile\/passkey\/handoff\/complete/);
  assert.ok(!page.includes(accessToken));
  const browser = parseSession(opened);

  const beforeExchange = await request("/api/auth/mobile/passkey/handoff/exchange", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    json: { grant: grantUrl.searchParams.get("grant") },
  });
  assert.equal(beforeExchange.status, 400);
  const [stillPending] = await db.select({ passkeyVerifiedAt: sessionsTable.passkeyVerifiedAt })
    .from(sessionsTable)
    .where(eq(sessionsTable.tokenHash, hashSessionToken(accessToken)));
  assert.equal(stillPending.passkeyVerifiedAt, null);

  // Simulate the existing browser WebAuthn verifier after the ceremony. The
  // handoff completion must activate only the matching mobile session.
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.tokenHash, hashSessionToken(browser.session)));
  const completed = await request("/api/auth/mobile/passkey/handoff/complete", {
    method: "POST",
    session: browser,
    json: { grant: grantUrl.searchParams.get("grant") },
  });
  assert.equal(completed.status, 200);
  const exchanged = await request("/api/auth/mobile/passkey/handoff/exchange", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    json: { grant: grantUrl.searchParams.get("grant") },
  });
  assert.equal(exchanged.status, 200);
  const mobileMe = await request("/api/auth/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(mobileMe.status, 200);
  assert.equal((await mobileMe.json() as { user: { passkeyVerified: boolean } }).user.passkeyVerified, true);
  assert.equal((await request("/api/auth/mobile/passkey/handoff/exchange", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    json: { grant: grantUrl.searchParams.get("grant") },
  })).status, 400);
  assert.equal((await request(`${grantUrl.pathname}${grantUrl.search}`)).status, 400);
});

test("unified auth start chooses sign-in for members and registration for new emails", async () => {
  const memberEmail = `${prefix}-unified-member@example.test`;
  await register(memberEmail);

  const memberStart = await request("/api/auth/start", {
    method: "POST",
    json: { email: memberEmail },
  });
  assert.equal(memberStart.status, 202);
  assert.deepEqual(await memberStart.json(), {
    flow: "login",
    message: "Check your email for a sign-in code.",
  });
  codeFor(memberEmail, "Your SHÜÜT sign-in code");

  const newEmail = `${prefix}-unified-new@example.test`;
  const registrationStart = await request("/api/auth/start", {
    method: "POST",
    json: { email: newEmail },
  });
  assert.equal(registrationStart.status, 202);
  assert.deepEqual(await registrationStart.json(), {
    flow: "register",
    message: "Check your email to continue registration.",
  });
  codeFor(newEmail, "Verify your SHÜÜT account");
});

test("mobile passkey recovery rotates the bearer without issuing browser cookies", async () => {
  const email = `${prefix}-mobile-recovery@example.test`;
  await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.insert(passkeysTable).values({
    credentialId: `${prefix}-mobile-recovery-credential`,
    userId: user.id,
    publicKey: Buffer.from([1, 2, 3]).toString("base64"),
    counter: 0,
  });
  await request("/api/auth/mobile/login", { method: "POST", json: { email } });
  const login = await request("/api/auth/mobile/login/verify", {
    method: "POST",
    json: { email, code: codeFor(email, "Your SHÜÜT sign-in code") },
  });
  const oldToken = (await login.json() as { accessToken: string }).accessToken;
  assert.equal((await request("/api/auth/passkey/recovery/request", {
    method: "POST",
    headers: { authorization: `Bearer ${oldToken}` },
  })).status, 202);
  await db.update(passkeyRecoveriesTable).set({ availableAt: new Date(0) })
    .where(eq(passkeyRecoveriesTable.userId, user.id));
  assert.equal((await request("/api/auth/passkey/recovery/code", {
    method: "POST",
    headers: { authorization: `Bearer ${oldToken}` },
  })).status, 202);
  const confirmed = await request("/api/auth/passkey/recovery/confirm", {
    method: "POST",
    headers: { authorization: `Bearer ${oldToken}` },
    json: { code: codeFor(email, "Confirm your SHÜÜT passkey recovery") },
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.headers.get("set-cookie"), null);
  const replacement = await confirmed.json() as { accessToken: string; recovered: boolean };
  assert.equal(replacement.recovered, true);
  assert.notEqual(replacement.accessToken, oldToken);
  assert.equal((await request("/api/auth/me", {
    headers: { authorization: `Bearer ${oldToken}` },
  })).status, 401);
  assert.equal((await request("/api/auth/me", {
    headers: { authorization: `Bearer ${replacement.accessToken}` },
  })).status, 200);
});

test("web passkey recovery keeps browser cookie rotation semantics", async () => {
  const email = `${prefix}-web-recovery@example.test`;
  const oldSession = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.insert(passkeysTable).values({
    credentialId: `${prefix}-web-recovery-credential`,
    userId: user.id,
    publicKey: Buffer.from([1, 2, 3]).toString("base64"),
    counter: 0,
  });
  assert.equal((await request("/api/auth/passkey/recovery/request", {
    method: "POST",
    session: oldSession,
  })).status, 202);
  await db.update(passkeyRecoveriesTable).set({ availableAt: new Date(0) })
    .where(eq(passkeyRecoveriesTable.userId, user.id));
  assert.equal((await request("/api/auth/passkey/recovery/code", {
    method: "POST",
    session: oldSession,
  })).status, 202);
  const confirmed = await request("/api/auth/passkey/recovery/confirm", {
    method: "POST",
    session: oldSession,
    json: { code: codeFor(email, "Confirm your SHÜÜT passkey recovery") },
  });
  assert.equal(confirmed.status, 200);
  const replacement = parseSession(confirmed);
  assert.equal((await request("/api/auth/me", { session: oldSession })).status, 401);
  assert.equal((await request("/api/auth/me", { session: replacement })).status, 200);
});

test("registration is bound to RP ID, origin, challenge, and session, then cannot be replayed", async () => {
  const email = `${prefix}-passkey@example.test`;
  const session = await register(email);
  const options = await registrationOptions(session);
  assert.equal(options.rp.id, "127.0.0.1");

  webauthnVerifier.verifyRegistration = (async (input: any) => {
    assert.equal(input.expectedOrigin, appOrigin);
    assert.equal(input.expectedRPID, "127.0.0.1");
    if (
      input.response.challenge !== input.expectedChallenge ||
      input.response.origin !== input.expectedOrigin ||
      input.response.rpId !== input.expectedRPID
    ) throw new Error("binding mismatch");
    return {
      verified: true,
      registrationInfo: {
        credential: {
          id: `${prefix}-credential-registration`,
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    };
  }) as typeof webauthnVerifier.verifyRegistration;

  for (const body of [
    { challenge: "wrong", origin: appOrigin, rpId: "127.0.0.1" },
    { challenge: options.challenge, origin: "https://attacker.example", rpId: "127.0.0.1" },
    { challenge: options.challenge, origin: appOrigin, rpId: "attacker.example" },
  ]) {
    const response = await request("/api/auth/passkey/register/verify", {
      method: "POST",
      session,
      json: body,
    });
    assert.equal(response.status, 400);
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  assert.ok(user);
  const otherToken = "other-session-token";
  const [otherSession] = await db.insert(sessionsTable).values({
    tokenHash: hashSessionToken(otherToken),
    userId: user.id,
    expiresAt: new Date(Date.now() + 60_000),
    deviceHash: null,
  }).returning();
  const wrongSession = await request("/api/auth/passkey/register/verify", {
    method: "POST",
    headers: {
      cookie: `shu_session=${otherToken}; shu_device=${session.device}; shu_csrf=${session.csrf}`,
      origin: appOrigin,
      "x-csrf-token": session.csrf,
    },
    json: { challenge: options.challenge, origin: appOrigin, rpId: "127.0.0.1" },
  });
  assert.equal(wrongSession.status, 400);
  await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, otherSession.tokenHash));

  const validBody = { challenge: options.challenge, origin: appOrigin, rpId: "127.0.0.1" };
  const verified = await request("/api/auth/passkey/register/verify", {
    method: "POST",
    session,
    json: validBody,
  });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { verified: true });
  assert.equal(
    (await request("/api/auth/passkey/register/verify", {
      method: "POST",
      session,
      json: validBody,
    })).status,
    400,
  );
  assert.equal((await request("/api/feed", { session })).status, 200);
});

test("assertion challenges are session-bound and one-time", async () => {
  const email = `${prefix}-assertion@example.test`;
  const session = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.insert(passkeysTable).values({
    credentialId: `${prefix}-credential-assertion`,
    userId: user.id,
    publicKey: Buffer.from([1, 2, 3]).toString("base64"),
    counter: 0,
  });
  const optionsResponse = await request("/api/auth/passkey/assertion/options", {
    method: "POST",
    session,
  });
  assert.equal(optionsResponse.status, 200);
  const options = await optionsResponse.json() as { challenge: string };
  webauthnVerifier.verifyAuthentication = (async (input: any) => {
    if (
      input.response.challenge !== input.expectedChallenge ||
      input.response.origin !== input.expectedOrigin ||
      input.response.rpId !== input.expectedRPID
    ) throw new Error("binding mismatch");
    return { verified: true, authenticationInfo: { newCounter: 1 } };
  }) as typeof webauthnVerifier.verifyAuthentication;
  const body = {
    id: `${prefix}-credential-assertion`,
    challenge: options.challenge,
    origin: appOrigin,
    rpId: "127.0.0.1",
  };
  assert.equal((await request("/api/auth/passkey/assertion/verify", {
    method: "POST", session, json: body,
  })).status, 200);
  assert.equal((await request("/api/auth/passkey/assertion/verify", {
    method: "POST", session, json: body,
  })).status, 400);
});

test("publishing requires owned audio and responses never expose private object paths", async () => {
  const email = `${prefix}-audio@example.test`;
  const session = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, user.id));
  const [founder] = await db.insert(foundersTable).values({
    userId: user.id,
    name: "Security Tester",
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-20)}audio`,
    bio: "",
    avatarColor: "#000000",
  }).returning();

  const missing = await request("/api/posts", {
    method: "POST",
    session,
    json: { transcript: "Missing audio", durationSeconds: 2 },
  });
  assert.equal(missing.status, 400);
  const notOwned = await request("/api/posts", {
    method: "POST",
    session,
    json: {
      transcript: "Foreign audio",
      durationSeconds: 2,
      audioObjectPath: "/objects/uploads/foreign-audio",
    },
  });
  assert.equal(notOwned.status, 403);

  const objectPath = `/objects/uploads/${prefix}-private-recording`;
  await db.insert(profileImageUploadsTable).values({ objectPath, userId: user.id });
  const [post] = await db.insert(postsTable).values({
    authorId: founder.id,
    transcript: "Private audio",
    durationSeconds: 3,
    audioUrl: objectPath,
  }).returning();
  await db.delete(profileImageUploadsTable)
    .where(eq(profileImageUploadsTable.objectPath, objectPath));
  const feed = await request("/api/feed", { session });
  assert.equal(feed.status, 200);
  const feedBody = await feed.json() as Array<{ id: number; canDelete: boolean }>;
  const ownPost = feedBody.find((entry) => entry.id === post.id);
  assert.equal(ownPost?.canDelete, true);
  const feedText = JSON.stringify(feedBody);
  assert.ok(!feedText.includes(objectPath));
  assert.ok(feedText.includes(`/api/posts/${post.id}/audio`));

  const otherEmail = `${prefix}-non-owner@example.test`;
  const otherSession = await register(otherEmail);
  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.email, otherEmail));
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, otherUser.id));
  await db.insert(foundersTable).values({
    userId: otherUser.id,
    name: "Other Viewer",
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-17)}viewer`,
    bio: "",
    avatarColor: "#111111",
  });
  const otherFeed = await request("/api/feed", { session: otherSession });
  const otherFeedBody = await otherFeed.json() as Array<{ id: number; canDelete: boolean }>;
  assert.equal(otherFeedBody.find((entry) => entry.id === post.id)?.canDelete, false);

  const ownerReaction = await request(`/api/posts/${post.id}/reaction`, {
    method: "PUT",
    session,
    json: { emojiType: "rocket" },
  });
  assert.equal((await ownerReaction.json() as { canDelete: boolean }).canDelete, true);
  const otherReaction = await request(`/api/posts/${post.id}/reaction`, {
    method: "PUT",
    session: otherSession,
    json: { emojiType: "laughing" },
  });
  assert.equal((await otherReaction.json() as { canDelete: boolean }).canDelete, false);

  const ownerReshuut = await request(`/api/posts/${post.id}/reshuut`, {
    method: "POST",
    session,
  });
  assert.equal((await ownerReshuut.json() as { canDelete: boolean }).canDelete, true);
  const otherReshuut = await request(`/api/posts/${post.id}/reshuut`, {
    method: "POST",
    session: otherSession,
  });
  assert.equal((await otherReshuut.json() as { canDelete: boolean }).canDelete, false);

  const forbiddenDelete = await request(`/api/posts/${post.id}`, {
    method: "DELETE",
    session: otherSession,
  });
  assert.equal(forbiddenDelete.status, 403);

  ObjectStorageService.prototype.streamPrivate = async () => ({
    body: Readable.toWeb(Readable.from([Buffer.from("private audio")])),
    contentType: "audio/webm",
    size: 13,
  });
  const audio = await request(`/api/posts/${post.id}/audio`, { session });
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("cache-control"), "private, no-store");
  assert.equal(audio.headers.get("content-type"), "audio/webm");
  assert.equal(await audio.text(), "private audio");
  assert.ok(![...audio.headers].some(([, value]) => value.includes(objectPath)));

  const deletion = await request("/api/account", {
    method: "DELETE",
    session,
  });
  assert.equal(deletion.status, 200);
  assert.deepEqual(await deletion.json(), { status: "completed" });
  assert.equal((await request("/api/auth/me", {
    headers: { cookie: session.cookie },
  })).status, 401);
});

test("failed post recording cleanup remains durable and retries to completion", async () => {
  const email = `${prefix}-post-cleanup@example.test`;
  const session = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, user.id));
  const [founder] = await db.insert(foundersTable).values({
    userId: user.id,
    name: "Cleanup Retry",
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-16)}retry`,
    bio: "",
    avatarColor: "#000000",
  }).returning();
  const objectPath = `/objects/uploads/${prefix}-retry-recording`;
  const [post] = await db.insert(postsTable).values({
    authorId: founder.id,
    transcript: "Retry this cleanup",
    durationSeconds: 4,
    audioUrl: objectPath,
  }).returning();
  const shareBeforeDeletion = await request(`/api/posts/${post.id}/share-link`, {
    method: "POST",
    session,
  });
  assert.equal(shareBeforeDeletion.status, 200);
  const shareUrl = new URL((await shareBeforeDeletion.json() as { url: string }).url);
  const realDeleteObject = ObjectStorageService.prototype.deleteObject;
  let attempts = 0;
  ObjectStorageService.prototype.deleteObject = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("simulated storage outage");
  };
  try {
    const failed = await request(`/api/posts/${post.id}`, {
      method: "DELETE",
      session,
    });
    assert.equal(failed.status, 200);
    assert.deepEqual(await failed.json(), { status: "failed" });
    const [deletingPost] = await db.select().from(postsTable).where(eq(postsTable.id, post.id));
    assert.equal(deletingPost.deletionStatus, "deleting");
    const [job] = await db.select().from(objectCleanupJobsTable)
      .where(eq(objectCleanupJobsTable.scopeId, String(post.id)));
    assert.equal(job.status, "failed");
    assert.equal((await request(`/api/posts/${post.id}`, { session })).status, 404);
    assert.equal((await request(`/api/posts/${post.id}/audio`, { session })).status, 404);
    assert.equal((await request(`/api/posts/${post.id}/comments`, { session })).status, 404);
    assert.equal((await request(`/api/posts/${post.id}/share-link`, {
      method: "POST",
      session,
    })).status, 404);
    const feed = await request("/api/feed", { session });
    assert.ok(!(await feed.text()).includes(`"id":${post.id}`));
    const sharedPreview = await request(`${shareUrl.pathname}${shareUrl.search}`);
    assert.ok(!(await sharedPreview.text()).includes("Retry this cleanup"));

    await db.update(objectCleanupJobsTable).set({ nextAttemptAt: new Date(0) })
      .where(eq(objectCleanupJobsTable.id, job.id));
    const completed = await request(`/api/posts/${post.id}`, {
      method: "DELETE",
      session,
    });
    assert.equal(completed.status, 200);
    assert.deepEqual(await completed.json(), { status: "completed" });
    assert.equal(attempts, 2);
    assert.equal(
      (await db.select().from(postsTable).where(eq(postsTable.id, post.id))).length,
      0,
    );
  } finally {
    ObjectStorageService.prototype.deleteObject = realDeleteObject;
  }
});

test("account deletion waits out issued upload URLs and blocks new uploads", async () => {
  const email = `${prefix}-upload-race@example.test`;
  const session = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, user.id));
  await db.insert(foundersTable).values({
    userId: user.id,
    name: "Upload Race",
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-16)}upload`,
    bio: "",
    avatarColor: "#000000",
  }).returning();
  const [founder] = await db.select().from(foundersTable).where(eq(foundersTable.userId, user.id));
  const postObjectPath = `/objects/uploads/${prefix}-account-post`;
  const [post] = await db.insert(postsTable).values({
    authorId: founder.id,
    transcript: "Hidden during account cleanup",
    durationSeconds: 2,
    audioUrl: postObjectPath,
  }).returning();
  const objectPath = `/objects/uploads/${prefix}-issued-upload`;
  await db.insert(profileImageUploadsTable).values({ objectPath, userId: user.id });
  const realDeleteObject = ObjectStorageService.prototype.deleteObject;
  const deletedPaths: string[] = [];
  ObjectStorageService.prototype.deleteObject = async (path) => {
    deletedPaths.push(path);
  };
  try {
    const pending = await request("/api/account", { method: "DELETE", session });
    assert.equal(pending.status, 200);
    assert.deepEqual(await pending.json(), { status: "pending" });
    assert.ok(deletedPaths.includes(postObjectPath));
    assert.equal((await request(`/api/profiles/${founder.handle}`, { session })).status, 404);
    assert.equal((await request(`/api/posts/${post.id}`, { session })).status, 404);
    assert.equal((await request(`/api/posts/${post.id}/audio`, { session })).status, 404);
    assert.equal((await request(`/api/posts/${post.id}/comments`, { session })).status, 404);
    assert.equal((await request(`/api/posts/${post.id}/share-link`, {
      method: "POST",
      session,
    })).status, 404);
    const feed = await request("/api/feed", { session });
    assert.ok(!(await feed.text()).includes("Hidden during account cleanup"));
    const [job] = await db.select().from(objectCleanupJobsTable)
      .where(eq(objectCleanupJobsTable.scopeId, user.id));
    assert.ok(job.nextAttemptAt.getTime() > Date.now());

    const blockedUpload = await request("/api/storage/uploads/request-url", {
      method: "POST",
      session,
      json: { name: "late.webm", size: 10, contentType: "audio/webm" },
    });
    assert.equal(blockedUpload.status, 409);
    deletedPaths.length = 0;

    await db.update(objectCleanupJobsTable).set({ nextAttemptAt: new Date(0) })
      .where(eq(objectCleanupJobsTable.id, job.id));
    const completed = await request("/api/account", { method: "DELETE", session });
    assert.equal(completed.status, 200);
    assert.deepEqual(await completed.json(), { status: "completed" });
    assert.deepEqual(deletedPaths, [objectPath]);
  } finally {
    ObjectStorageService.prototype.deleteObject = realDeleteObject;
  }
});

test("retry sweep finalizes deleting posts with zero or already-completed object jobs", async () => {
  const email = `${prefix}-finalization-retry@example.test`;
  await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  const [founder] = await db.insert(foundersTable).values({
    userId: user.id,
    name: "Finalization Retry",
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-16)}finalize`,
    bio: "",
    avatarColor: "#000000",
  }).returning();
  const [emptyPost, completedJobPost] = await db.insert(postsTable).values([
    {
      authorId: founder.id,
      transcript: "No objects remain",
      durationSeconds: 1,
      deletionStatus: "deleting",
    },
    {
      authorId: founder.id,
      transcript: "Object deletion finished before interruption",
      durationSeconds: 1,
      deletionStatus: "deleting",
    },
  ]).returning();
  await db.insert(objectCleanupJobsTable).values({
    objectPath: `/objects/uploads/${prefix}-already-deleted`,
    scopeType: "post",
    scopeId: String(completedJobPost.id),
    status: "completed",
  });

  await retryDueCleanupJobs();

  assert.equal(
    (await db.select().from(postsTable).where(inArray(
      postsTable.id,
      [emptyPost.id, completedJobPost.id],
    ))).length,
    0,
  );
  assert.equal(
    (await db.select().from(objectCleanupJobsTable)
      .where(eq(objectCleanupJobsTable.scopeId, String(completedJobPost.id)))).length,
    0,
  );
});

test("comment publication serializes with post deletion and its recording is removed", async () => {
  const email = `${prefix}-comment-delete-race@example.test`;
  const session = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, user.id));
  const [founder] = await db.insert(foundersTable).values({
    userId: user.id,
    name: "Comment Race",
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-16)}comment`,
    bio: "",
    avatarColor: "#000000",
  }).returning();
  const [post] = await db.insert(postsTable).values({
    authorId: founder.id,
    transcript: "Delete while comment publishes",
    durationSeconds: 1,
  }).returning();
  const objectPath = `/objects/uploads/${prefix}-racing-comment`;
  await db.insert(profileImageUploadsTable).values({ objectPath, userId: user.id });
  const realPublishAudio = ObjectStorageService.prototype.publishAudio;
  const realDeleteObject = ObjectStorageService.prototype.deleteObject;
  let releasePublication!: () => void;
  let publicationStarted!: () => void;
  const publicationStartedPromise = new Promise<void>((resolve) => {
    publicationStarted = resolve;
  });
  const releasePublicationPromise = new Promise<void>((resolve) => {
    releasePublication = resolve;
  });
  const deletedPaths: string[] = [];
  ObjectStorageService.prototype.publishAudio = async () => {
    publicationStarted();
    await releasePublicationPromise;
  };
  ObjectStorageService.prototype.deleteObject = async (path) => {
    deletedPaths.push(path);
  };
  try {
    const commentRequest = request(`/api/posts/${post.id}/comments`, {
      method: "POST",
      session,
      json: { audioObjectPath: objectPath, durationSeconds: 2 },
    });
    await publicationStartedPromise;
    const deletionRequest = request(`/api/posts/${post.id}`, {
      method: "DELETE",
      session,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    releasePublication();

    const comment = await commentRequest;
    assert.equal(comment.status, 202);
    const deletion = await deletionRequest;
    assert.equal(deletion.status, 200);
    assert.deepEqual(await deletion.json(), { status: "completed" });
    assert.ok(deletedPaths.includes(objectPath));
    assert.equal(
      (await db.select().from(profileImageUploadsTable)
        .where(eq(profileImageUploadsTable.objectPath, objectPath))).length,
      0,
    );
    assert.equal(
      (await db.select().from(objectCleanupJobsTable)
        .where(eq(objectCleanupJobsTable.scopeId, objectPath))).length,
      0,
    );
  } finally {
    releasePublication();
    ObjectStorageService.prototype.publishAudio = realPublishAudio;
    ObjectStorageService.prototype.deleteObject = realDeleteObject;
  }
});

test("expiry cleanup cannot claim recordings being published as posts or comments", async () => {
  const email = `${prefix}-expiry-publication-race@example.test`;
  const session = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, user.id));
  const [founder] = await db.insert(foundersTable).values({
    userId: user.id,
    name: "Expiry Race",
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-14)}expiry`,
    bio: "",
    avatarColor: "#000000",
  }).returning();
  const targetPost = await db.insert(postsTable).values({
    authorId: founder.id,
    transcript: "Comment expiry target",
    durationSeconds: 1,
  }).returning().then(([row]) => row);
  const realPublishAudio = ObjectStorageService.prototype.publishAudio;
  const realReadAudio = ObjectStorageService.prototype.readAudio;
  const capturedFetch = globalThis.fetch;
  ObjectStorageService.prototype.readAudio = async () => ({
    data: Buffer.from("voice"),
    contentType: "audio/webm",
  });
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.elevenlabs.io")) {
      return new Response(JSON.stringify({ text: "Published safely" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return capturedFetch(input, init);
  };
  try {
    for (const kind of ["post", "comment"] as const) {
      const objectPath = `/objects/uploads/${prefix}-expiry-${kind}`;
      await db.insert(profileImageUploadsTable).values({
        objectPath,
        userId: user.id,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      let releasePublication!: () => void;
      let publicationStarted!: () => void;
      const publicationStartedPromise = new Promise<void>((resolve) => {
        publicationStarted = resolve;
      });
      const releasePublicationPromise = new Promise<void>((resolve) => {
        releasePublication = resolve;
      });
      ObjectStorageService.prototype.publishAudio = async () => {
        publicationStarted();
        await releasePublicationPromise;
      };
      const publicationRequest = kind === "post"
        ? request("/api/posts", {
          method: "POST",
          session,
          json: {
            transcript: "Expiry-safe post",
            durationSeconds: 2,
            audioObjectPath: objectPath,
          },
        })
        : request(`/api/posts/${targetPost.id}/comments`, {
          method: "POST",
          session,
          json: { audioObjectPath: objectPath, durationSeconds: 2 },
        });
      await publicationStartedPromise;
      const expiryRequest = queueExpiredPrivateUploads();
      await new Promise((resolve) => setTimeout(resolve, 20));
      releasePublication();
      const publication = await publicationRequest;
      assert.equal(publication.status, kind === "post" ? 201 : 202);
      assert.equal(await expiryRequest, 0);
      assert.equal(
        (await db.select().from(privateObjectCleanupTable)
          .where(eq(privateObjectCleanupTable.objectPath, objectPath))).length,
        0,
      );
    }
  } finally {
    globalThis.fetch = capturedFetch;
    ObjectStorageService.prototype.publishAudio = realPublishAudio;
    ObjectStorageService.prototype.readAudio = realReadAudio;
  }
});

test("failed comment transcription keeps durable cleanup work until storage retry succeeds", async () => {
  const email = `${prefix}-comment-transcription-cleanup@example.test`;
  const session = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, user.id));
  const [founder] = await db.insert(foundersTable).values({
    userId: user.id,
    name: "Comment Cleanup",
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-14)}transcribe`,
    bio: "",
    avatarColor: "#000000",
  }).returning();
  const [post] = await db.insert(postsTable).values({
    authorId: founder.id,
    transcript: "Comment transcription target",
    durationSeconds: 1,
  }).returning();
  const objectPath = `/objects/uploads/${prefix}-failed-comment-transcription`;
  await db.insert(profileImageUploadsTable).values({ objectPath, userId: user.id });
  const realPublishAudio = ObjectStorageService.prototype.publishAudio;
  const realReadAudio = ObjectStorageService.prototype.readAudio;
  const realDeleteObject = ObjectStorageService.prototype.deleteObject;
  const capturedFetch = globalThis.fetch;
  let deleteAttempts = 0;
  ObjectStorageService.prototype.publishAudio = async () => {};
  ObjectStorageService.prototype.readAudio = async () => ({
    data: Buffer.from("voice"),
    contentType: "audio/webm",
  });
  ObjectStorageService.prototype.deleteObject = async () => {
    deleteAttempts += 1;
    if (deleteAttempts === 1) throw new Error("simulated cleanup outage");
  };
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.elevenlabs.io")) {
      return new Response("transcription unavailable", { status: 503 });
    }
    return capturedFetch(input, init);
  };
  try {
    const response = await request(`/api/posts/${post.id}/comments`, {
      method: "POST",
      session,
      json: { audioObjectPath: objectPath, durationSeconds: 2 },
    });
    assert.equal(response.status, 202);
    const { id } = await response.json() as { id: number };
    let job;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      [job] = await db.select().from(objectCleanupJobsTable)
        .where(eq(objectCleanupJobsTable.scopeId, objectPath));
      if (job?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(job?.status, "failed");
    assert.equal(
      (await db.select().from(commentsTable).where(eq(commentsTable.id, id))).length,
      0,
    );
    await db.update(objectCleanupJobsTable).set({ nextAttemptAt: new Date(0) })
      .where(eq(objectCleanupJobsTable.id, job!.id));
    await retryDueCleanupJobs();
    assert.equal(deleteAttempts, 2);
    assert.equal(
      (await db.select().from(objectCleanupJobsTable)
        .where(eq(objectCleanupJobsTable.scopeId, objectPath))).length,
      0,
    );
  } finally {
    globalThis.fetch = capturedFetch;
    ObjectStorageService.prototype.publishAudio = realPublishAudio;
    ObjectStorageService.prototype.readAudio = realReadAudio;
    ObjectStorageService.prototype.deleteObject = realDeleteObject;
  }
});

test("rich preview metadata requires an authenticated share action and signed token", async () => {
  const email = `${prefix}-share-preview@example.test`;
  const session = await register(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  await db.update(sessionsTable).set({ passkeyVerifiedAt: new Date() })
    .where(eq(sessionsTable.userId, user.id));
  const [founder] = await db.insert(foundersTable).values({
    userId: user.id,
    name: 'Preview <Author>',
    handle: `${prefix.replace(/[^a-z0-9]/g, "").slice(-18)}preview`,
    bio: "",
    avatarColor: "#000000",
  }).returning();
  const [post] = await db.insert(postsTable).values({
    authorId: founder.id,
    transcript: 'A private-by-default thought with "quotes" & markup <here>.',
    durationSeconds: 8,
  }).returning();

  const unsigned = await request(`/p/${post.id}`);
  assert.equal(unsigned.status, 200);
  const unsignedHtml = await unsigned.text();
  assert.ok(!unsignedHtml.includes("private-by-default"));
  assert.ok(!unsignedHtml.includes("Preview &lt;Author&gt;"));
  assert.ok(unsignedHtml.includes('content="noindex, nofollow"'));

  const anonymousShareAttempt = await request(`/api/posts/${post.id}/share-link`, {
    method: "POST",
  });
  assert.equal(anonymousShareAttempt.status, 401);

  const shareResponse = await request(`/api/posts/${post.id}/share-link`, {
    method: "POST",
    session,
  });
  assert.equal(shareResponse.status, 200);
  const { url } = await shareResponse.json() as { url: string };
  const shareUrl = new URL(url);
  const signed = await request(`${shareUrl.pathname}${shareUrl.search}`);
  assert.equal(signed.status, 200);
  const signedHtml = await signed.text();
  assert.ok(signedHtml.includes("Preview &lt;Author&gt; on SHÜÜT"));
  assert.ok(signedHtml.includes("&quot;quotes&quot; &amp; markup &lt;here&gt;"));
  assert.ok(signedHtml.includes('content="noindex, nofollow"'));
  assert.equal(signed.headers.get("cache-control"), "no-store");

  const tampered = await request(`${shareUrl.pathname}?t=${shareUrl.searchParams.get("t")}x`);
  const tamperedHtml = await tampered.text();
  assert.ok(!tamperedHtml.includes("private-by-default"));
  assert.ok(!tamperedHtml.includes("Preview &lt;Author&gt;"));
});