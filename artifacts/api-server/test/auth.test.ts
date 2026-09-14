import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { and, eq, like } from "drizzle-orm";
import app from "../src/app";
import {
  authCodesTable,
  db,
  pool,
  sessionsTable,
  usersTable,
} from "@workspace/db";

const prefix = `auth-regression-${Date.now()}`;
const sentEmails: Array<{ To: string; Subject: string; TextBody: string }> = [];
let origin = "";
let server: ReturnType<typeof app.listen>;

function codeFor(email: string, subject: string): string {
  const message = sentEmails.findLast(
    (entry) => entry.To === email && entry.Subject === subject,
  );
  assert.ok(message, `Expected captured email "${subject}" for ${email}`);
  const code = message.TextBody.match(/\b\d{6}\b/)?.[0];
  assert.ok(code, "Expected a six-digit code in captured email");
  return code;
}

async function request(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return fetch(`${origin}${path}`, {
    ...init,
    headers,
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Expected a session cookie");
  assert.match(setCookie, /shu_session=[^;]+/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  return setCookie.split(";")[0];
}

async function registerAndVerify(email: string, password: string): Promise<string> {
  const registration = await request("/api/auth/register", {
    method: "POST",
    json: { email, password },
  });
  assert.equal(registration.status, 202);

  const verification = await request("/api/auth/verify-email", {
    method: "POST",
    json: {
      email,
      code: codeFor(email, "Verify your SHÜÜT account"),
    },
  });
  assert.equal(verification.status, 200);
  return sessionCookie(verification);
}

before(async () => {
  process.env.SESSION_SECRET ||= "auth-regression-session-secret";
  process.env.POSTMARK_API_KEY ||= "captured-locally";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.postmarkapp.com/email") {
      sentEmails.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ Message: "OK" }), { status: 200 });
    }
    return realFetch(input, init);
  };
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(like(usersTable.email, `${prefix}%`));
  for (const user of users) {
    await db.delete(usersTable).where(eq(usersTable.id, user.id));
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await pool.end();
});

test("registration, verification, login, logout, reset, deletion, and rate limits", async () => {
  const password = "correct horse battery staple";
  const email = `${prefix}-primary@example.test`;

  const registration = await request("/api/auth/register", {
    method: "POST",
    json: { email, password },
  });
  assert.equal(registration.status, 202);
  assert.equal(sentEmails.length, 1);

  const invalidVerification = await request("/api/auth/verify-email", {
    method: "POST",
    json: { email, code: "000000" },
  });
  assert.equal(invalidVerification.status, 400);

  const verificationCode = codeFor(email, "Verify your SHÜÜT account");
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  assert.ok(user);
  await db
    .update(authCodesTable)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(
      and(
        eq(authCodesTable.userId, user.id),
        eq(authCodesTable.purpose, "verify"),
      ),
    );
  const expiredVerification = await request("/api/auth/verify-email", {
    method: "POST",
    json: { email, code: verificationCode },
  });
  assert.equal(expiredVerification.status, 400);

  await request("/api/auth/register", {
    method: "POST",
    json: { email, password },
  });
  const verified = await request("/api/auth/verify-email", {
    method: "POST",
    json: {
      email,
      code: codeFor(email, "Verify your SHÜÜT account"),
    },
  });
  assert.equal(verified.status, 200);
  let cookie = sessionCookie(verified);

  const invalidLogin = await request("/api/auth/login", {
    method: "POST",
    json: { email, password: "not the password" },
  });
  assert.equal(invalidLogin.status, 401);
  const login = await request("/api/auth/login", {
    method: "POST",
    json: { email, password },
  });
  assert.equal(login.status, 200);
  cookie = sessionCookie(login);

  const logout = await request("/api/auth/logout", {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie") ?? "", /shu_session=;/);
  assert.match(logout.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.equal(
    (await request("/api/auth/me", { headers: { cookie } })).status,
    401,
  );

  const relogin = await request("/api/auth/login", {
    method: "POST",
    json: { email, password },
  });
  cookie = sessionCookie(relogin);
  const knownForgot = await request("/api/auth/forgot-password", {
    method: "POST",
    json: { email },
  });
  const unknownForgot = await request("/api/auth/forgot-password", {
    method: "POST",
    json: { email: `${prefix}-missing@example.test` },
  });
  assert.equal(knownForgot.status, 202);
  assert.equal(unknownForgot.status, 202);
  assert.deepEqual(await knownForgot.json(), await unknownForgot.json());

  const expiredResetCode = codeFor(email, "Reset your SHÜÜT password");
  await db
    .update(authCodesTable)
    .set({ expiresAt: new Date(Date.now() - 1_000) })
    .where(
      and(
        eq(authCodesTable.userId, user.id),
        eq(authCodesTable.purpose, "reset"),
      ),
    );
  const expiredReset = await request("/api/auth/reset-password", {
    method: "POST",
    json: {
      email,
      code: expiredResetCode,
      password: "a different secure password",
    },
  });
  assert.equal(expiredReset.status, 400);

  assert.equal(
    (
      await request("/api/auth/forgot-password", {
        method: "POST",
        json: { email },
      })
    ).status,
    202,
  );
  const resetCode = codeFor(email, "Reset your SHÜÜT password");
  const invalidReset = await request("/api/auth/reset-password", {
    method: "POST",
    json: { email, code: "000000", password: "a different secure password" },
  });
  assert.equal(invalidReset.status, 400);
  const validReset = await request("/api/auth/reset-password", {
    method: "POST",
    json: { email, code: resetCode, password: "a different secure password" },
  });
  assert.equal(validReset.status, 200);
  assert.match(validReset.headers.get("set-cookie") ?? "", /shu_session=;/);
  assert.match(validReset.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.equal(
    (await request("/api/auth/me", { headers: { cookie } })).status,
    401,
  );
  const oldPasswordLogin = await request("/api/auth/login", {
    method: "POST",
    json: { email, password },
  });
  assert.equal(oldPasswordLogin.status, 401);
  const newPasswordLogin = await request("/api/auth/login", {
    method: "POST",
    json: { email, password: "a different secure password" },
  });
  assert.equal(newPasswordLogin.status, 200);
  sessionCookie(newPasswordLogin);
  const reusedReset = await request("/api/auth/reset-password", {
    method: "POST",
    json: { email, code: resetCode, password: "another secure password" },
  });
  assert.equal(reusedReset.status, 400);

  const deletionEmail = `${prefix}-delete@example.test`;
  const deletionCookie = await registerAndVerify(deletionEmail, password);
  const deletion = await request("/api/account", {
    method: "DELETE",
    headers: { cookie: deletionCookie },
  });
  assert.equal(deletion.status, 204);
  assert.match(deletion.headers.get("set-cookie") ?? "", /shu_session=;/);
  assert.match(deletion.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.equal(
    (await request("/api/auth/me", { headers: { cookie: deletionCookie } }))
      .status,
    401,
  );

  let limited: Response | undefined;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request("/api/auth/forgot-password", {
      method: "POST",
      json: { email: `${prefix}-rate-${attempt}@example.test` },
    });
    if (response.status === 429) {
      limited = response;
      break;
    }
  }
  assert.ok(limited, "Expected forgot-password rate limiting");
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});