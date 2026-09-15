import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { eq, inArray, like } from "drizzle-orm";
import app from "../src/app";
import { ObjectStorageService } from "../src/lib/objectStorage";
import { webauthnVerifier } from "../src/lib/webauthn";
import { hashSessionToken } from "../src/middlewares/sessionAuth";
import { authCodeEmail } from "../src/lib/authCodeEmail";
import {
  securityNotificationEmail,
  sendSecurityNotificationEmail,
  type SecurityNotificationKind,
} from "../src/lib/postmark";
import {
  db,
  foundersTable,
  passkeysTable,
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

function assertCodeEmail(email: string, subject: string, expectedPhrase: string) {
  const message = sentEmails.findLast(
    (entry) => entry.To === email && entry.Subject === subject,
  );
  assert.ok(message, `Expected captured email "${subject}" for ${email}`);
  const code = message.TextBody.match(/\b\d{6}\b/)?.[0];
  assert.ok(code);
  assert.ok(message.HtmlBody);
  assert.match(message.HtmlBody, new RegExp(`>${code}<`));
  assert.match(message.HtmlBody, /SH<span[^>]*>ÜÜ<\/span>T/);
  assert.match(message.HtmlBody, /expires in <strong[^>]*>15 minutes<\/strong>/);
  assert.match(message.HtmlBody, new RegExp(expectedPhrase, "i"));
  assert.ok(!message.HtmlBody.includes("<img"));
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
  const availableAt = '2026-09-16T12:00:00.000Z<&"';

  for (const item of cases) {
    const to = `${prefix}-${item.kind}@example.test`;
    await sendSecurityNotificationEmail({
      to,
      kind: item.kind,
      ...(item.kind === "recovery-requested" ? { availableAt } : {}),
    });
    const payload = sentEmails.findLast(
      (entry) => entry.To === to && entry.Subject === item.subject,
    );
    assert.ok(payload, `Expected Postmark payload for ${item.kind}`);
    assert.ok(payload.HtmlBody);
    assert.match(payload.HtmlBody, /SH<span[^>]*>ÜÜ<\/span>T/);
    assert.ok(payload.HtmlBody.includes(item.phrase));
    assert.ok(payload.TextBody.includes(item.phrase));
    assert.ok(!payload.HtmlBody.includes("<img"));
    assert.ok(!/https?:\/\//i.test(payload.HtmlBody));
  }

  const recovery = securityNotificationEmail({
    kind: "recovery-requested",
    availableAt,
  });
  assert.ok(recovery.textBody.includes(availableAt));
  assert.ok(recovery.htmlBody.includes("2026-09-16T12:00:00.000Z&lt;&amp;&quot;"));
  assert.ok(!recovery.htmlBody.includes(availableAt));
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
  const email = `${prefix}-pending@example.test`;
  const session = await register(email);
  assertCodeEmail(email, "Verify your SHÜÜT account", "safely ignore");
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
  assertCodeEmail(email, "Your SHÜÜT sign-in code", "safely ignore");
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
  const feed = await request("/api/feed", { session });
  assert.equal(feed.status, 200);
  const feedText = await feed.text();
  assert.ok(!feedText.includes(objectPath));
  assert.ok(feedText.includes(`/api/posts/${post.id}/audio`));

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
  assert.equal(deletion.status, 204);
  assert.equal((await request("/api/auth/me", {
    headers: { cookie: session.cookie },
  })).status, 401);
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