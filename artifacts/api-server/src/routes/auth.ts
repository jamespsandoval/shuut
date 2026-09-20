import { randomBytes, randomInt, randomUUID, createHmac } from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt, isNull, isNotNull, ne } from "drizzle-orm";
import {
  LoginBody,
  CheckUsernameAvailabilityParams,
  CheckUsernameAvailabilityResponse,
  CompleteOnboardingBody,
  CompleteOnboardingResponse,
  RegisterBody,
  VerifyEmailBody,
  VerifyLoginBody,
  AcceptLegalPolicyConsentBody,
  AcceptLegalPolicyConsentResponse,
} from "@workspace/api-zod";
import {
  authCodesTable,
  db,
  foundersTable,
  mobileSessionGrantsTable,
  passkeysTable,
  sessionsTable,
  usersTable,
  legalPolicyAcceptancesTable,
} from "@workspace/db";
import { sendPostmarkEmail } from "../lib/postmark";
import { authCodeEmail } from "../lib/authCodeEmail";
import {
  clearSessionCookie,
  DEVICE_COOKIE,
  getAuthenticatedUserId,
  getSessionTokenHash,
  hashSessionToken,
  isPasskeyVerified,
  isBearerRequest,
  SESSION_COOKIE,
} from "../middlewares/sessionAuth";
import { CSRF_COOKIE, issueCsrfCookie } from "../middlewares/csrf";
import { ipPrefix, auditSecurityEvent, privacyHash } from "../lib/security";
import passkeyRouter from "./passkey";
import {
  CURRENT_LEGAL_POLICY_VERSIONS,
  CURRENT_LEGAL_POLICY_CONTENT_HASHES,
  getLegalPolicyStatus,
  type LegalPolicySource,
} from "../lib/legalPolicy";

const router: IRouter = Router();
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_MS = 15 * 60 * 1000;
const MOBILE_GRANT_MS = 5 * 60 * 1000;
const DEVELOPMENT_VERIFICATION_CODE = "111333";

router.use(passkeyRouter);
function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function codeHash(userId: string, purpose: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(`${userId}:${purpose}:${code}`).digest("hex");
}

function grantHash(grant: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(`mobile-session-grant:${grant}`).digest("hex");
}

function passkeyHandoffPage(grant: string, nonce: string): string {
  // Grants are generated from base64url bytes and are validated before this
  // function is called. JSON encoding keeps the value data-only in the page;
  // it is never a session bearer token.
  const encodedGrant = JSON.stringify(grant);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verify your SHÜÜT passkey</title>
<style>
  :root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#101010;color:#fafafa}
  body{display:grid;min-height:100vh;place-items:center;margin:0;padding:24px;box-sizing:border-box}
  main{width:min(440px,100%);padding:32px;border:1px solid #343434;border-radius:20px;background:#191919;box-shadow:0 18px 60px #0008;text-align:center}
  .brand{font-size:28px;font-weight:800;letter-spacing:.08em}.brand span{color:#ef476f}
  p{color:#bdbdbd;line-height:1.5}.status{margin-top:24px;min-height:24px;color:#f2f2f2}
  .error{color:#ff8b9d}.success{color:#91e6ad}
</style></head>
<body><main><div class="brand">SH<span>ÜÜ</span>T</div>
<h1>Verify your passkey</h1>
<p>Use your passkey to securely finish signing in to the SHÜÜT app.</p>
<div id="status" class="status">Waiting for passkey verification…</div>
<script nonce="${nonce}">
(async function () {
  "use strict";
  const grant = ${encodedGrant};
  const status = document.getElementById("status");
  const setStatus = (message, kind) => {
    status.textContent = message;
    status.className = "status " + (kind || "");
  };
  const csrf = () => {
    const match = document.cookie.split(";").map((v) => v.trim())
      .find((v) => v.startsWith("shu_csrf="));
    return match ? decodeURIComponent(match.slice("shu_csrf=".length)) : "";
  };
  const call = async (url, options) => {
    const response = await fetch(url, Object.assign({
      credentials: "same-origin",
      headers: { "x-csrf-token": csrf(), "content-type": "application/json" }
    }, options || {}));
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) throw new Error(body.error || "The passkey request failed.");
    return body;
  };
  const bytes = (value) => {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const raw = atob(padded);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  };
  const encoded = (value) => {
    const bytes = new Uint8Array(value);
    let binary = "";
    bytes.forEach((item) => { binary += String.fromCharCode(item); });
    return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  };
  const jsonCredential = (credential) => {
    const response = credential.response;
    return {
      id: credential.id,
      rawId: encoded(response.rawId),
      type: credential.type,
      response: {
        clientDataJSON: encoded(response.clientDataJSON),
        authenticatorData: encoded(response.authenticatorData),
        signature: encoded(response.signature),
        userHandle: response.userHandle ? encoded(response.userHandle) : null
      },
      clientExtensionResults: credential.getClientExtensionResults()
    };
  };
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      throw new Error("This browser does not support passkeys.");
    }
    const options = await call("/api/auth/passkey/assertion/options", { method: "POST" });
    const publicKey = Object.assign({}, options.publicKey || options);
    publicKey.challenge = bytes(publicKey.challenge);
    if (publicKey.allowCredentials) {
      publicKey.allowCredentials = publicKey.allowCredentials.map((item) =>
        Object.assign({}, item, { id: bytes(item.id) }));
    }
    const credential = await navigator.credentials.get({ publicKey });
    if (!credential) throw new Error("Passkey verification was cancelled.");
    await call("/api/auth/passkey/assertion/verify", {
      method: "POST",
      body: JSON.stringify(jsonCredential(credential))
    });
    await call("/api/auth/mobile/passkey/handoff/complete", {
      method: "POST",
      body: JSON.stringify({ grant })
    });
    setStatus("Passkey verified. Return to SHÜÜT to continue.", "success");
  } catch (error) {
    setStatus(error && error.message ? error.message : "We could not verify your passkey. Please try again.", "error");
  }
}());
</script></main></body></html>`;
}

type CodePurpose = "verify" | "login";

async function issueCode(userId: string, purpose: CodePurpose) {
  const code = String(randomInt(100000, 1000000));
  const hashedCode = codeHash(userId, purpose, code);
  await db.insert(authCodesTable).values({
    userId,
    purpose,
    codeHash: hashedCode,
    expiresAt: new Date(Date.now() + CODE_MS),
  });
  return { code, hashedCode };
}

async function retireOtherCodes(
  userId: string,
  purpose: CodePurpose,
  activeHash: string,
) {
  await db
    .update(authCodesTable)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authCodesTable.userId, userId),
        eq(authCodesTable.purpose, purpose),
        isNull(authCodesTable.consumedAt),
        ne(authCodesTable.codeHash, activeHash),
      ),
    );
}

async function discardCode(userId: string, purpose: CodePurpose, hashedCode: string) {
  await db
    .delete(authCodesTable)
    .where(
      and(
        eq(authCodesTable.userId, userId),
        eq(authCodesTable.purpose, purpose),
        eq(authCodesTable.codeHash, hashedCode),
      ),
    );
}

async function consumeCode(userId: string, purpose: CodePurpose, code: string) {
  const isDevelopmentOverride =
    process.env.NODE_ENV === "development" &&
    code === DEVELOPMENT_VERIFICATION_CODE;
  const [record] = await db
    .select()
    .from(authCodesTable)
    .where(
      and(
        eq(authCodesTable.userId, userId),
        eq(authCodesTable.purpose, purpose),
        isDevelopmentOverride
          ? undefined
          : eq(authCodesTable.codeHash, codeHash(userId, purpose, code)),
        isNull(authCodesTable.consumedAt),
        gt(authCodesTable.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(authCodesTable.createdAt))
    .limit(1);
  if (!record) return false;
  const consumed = await db
    .update(authCodesTable)
    .set({ consumedAt: new Date() })
    .where(and(eq(authCodesTable.id, record.id), isNull(authCodesTable.consumedAt)))
    .returning({ id: authCodesTable.id });
  return consumed.length === 1;
}

async function createSession(
  req: Request,
  res: Response,
  userId: string,
  transport: "browser" | "mobile",
) {
  const mobile = transport === "mobile";
  const token = randomBytes(32).toString("base64url");
  const deviceToken = randomBytes(32).toString("base64url");
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  await db.insert(sessionsTable).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MS),
    transport,
    deviceHash: privacyHash(`${deviceToken}:${String(req.headers["user-agent"] || "unknown")}`),
    ipPrefix: ipPrefix(req),
  });
  if (!mobile) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MS,
    });
    res.cookie(DEVICE_COOKIE, deviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MS,
    });
    issueCsrfCookie(res);
  }
  return token;
}

async function sendRegistrationCode(req: Request, email: string) {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  const user = existing
    ? existing
    : (
        await db
          .insert(usersTable)
          .values({
            id: randomUUID(),
            email,
            // Retained for schema compatibility; password authentication is disabled.
            passwordHash: `disabled:${randomBytes(32).toString("hex")}`,
          })
          .returning()
      )[0];
  const challenge = await issueCode(user.id, "verify");
  const emailContent = authCodeEmail({ code: challenge.code, kind: "verification" });
  try {
    await sendPostmarkEmail({
      to: email,
      subject: "Verify your SHÜÜT account",
      ...emailContent,
    });
    await retireOtherCodes(user.id, "verify", challenge.hashedCode);
  } catch (error) {
    await discardCode(user.id, "verify", challenge.hashedCode);
    req.log.error({ err: error }, "Failed to send verification email");
    throw error;
  }
}

async function sendLoginCode(req: Request, user: typeof usersTable.$inferSelect) {
  const challenge = await issueCode(user.id, "login");
  const emailContent = authCodeEmail({ code: challenge.code, kind: "sign-in" });
  try {
    await sendPostmarkEmail({
      to: user.email,
      subject: "Your SHÜÜT sign-in code",
      ...emailContent,
    });
    await retireOtherCodes(user.id, "login", challenge.hashedCode);
  } catch (error) {
    await discardCode(user.id, "login", challenge.hashedCode);
    req.log.error({ err: error }, "Failed to send sign-in code");
    throw error;
  }
}

async function sessionJson(user: typeof usersTable.$inferSelect, req?: Request) {
  const [profile] = await db
    .select({ id: foundersTable.id })
    .from(foundersTable)
    .where(eq(foundersTable.userId, user.id))
    .limit(1);
  return {
    user: {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      onboardingComplete: Boolean(profile),
      eligibilityStatus: profile ? "eligible" as const : user.eligibilityStatus as "undecided" | "eligible" | "waitlisted",
      passkeyEnrolled: false,
      passkeyVerified: false,
      legalPolicyConsent: await getLegalPolicyStatus(user.id),
    },
  };
}

async function mobileSessionJson(
  user: typeof usersTable.$inferSelect,
  token: string,
  req?: Request,
) {
  const body = await sessionJson(user, req);
  const [session] = await db
    .select({ expiresAt: sessionsTable.expiresAt, passkeyVerifiedAt: sessionsTable.passkeyVerifiedAt })
    .from(sessionsTable)
    .where(eq(sessionsTable.tokenHash, hashSessionToken(token)))
    .limit(1);
  return {
    ...body,
    accessToken: token,
    tokenType: "Bearer" as const,
    expiresAt: session?.expiresAt.toISOString(),
    passkeyRequired: false,
  };
}

router.post("/register", async (req, res): Promise<void> => {
  const body = RegisterBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Use a valid email address." });
    return;
  }
  const email = normalizedEmail(body.data.email);
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing?.emailVerifiedAt) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }
  try {
    await sendRegistrationCode(req, email);
  } catch (error) {
    res.status(502).json({ error: "We could not send your verification email. Please try again." });
    return;
  }
  res.status(202).json({ message: "Check your email for a verification code." });
});

router.post("/start", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const email = normalizedEmail(body.data.email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  try {
    if (user?.emailVerifiedAt) {
      await sendLoginCode(req, user);
      res.status(202).json({ flow: "login", message: "Check your email for a sign-in code." });
      return;
    }
    await sendRegistrationCode(req, email);
    res.status(202).json({ flow: "register", message: "Check your email to continue registration." });
  } catch {
    res.status(502).json({ error: "We could not send your code. Please try again." });
  }
});

router.post("/verify-email", async (req, res): Promise<void> => {
  const body = VerifyEmailBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter the six-digit verification code." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail(body.data.email))).limit(1);
  if (!user || !(await consumeCode(user.id, "verify", body.data.code))) {
    res.status(400).json({ error: "That verification code is invalid or has expired." });
    return;
  }
  const [verified] = await db
    .update(usersTable)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  await createSession(req, res, user.id, "browser");
  await auditSecurityEvent(req, "email_verified", user.id);
  res.json(await sessionJson(verified, req));
});

router.post("/login", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail(body.data.email))).limit(1);
  if (user?.emailVerifiedAt) {
    try {
      await sendLoginCode(req, user);
    } catch (error) {
      res.status(502).json({ error: "We could not send your sign-in code. Please try again." });
      return;
    }
  }
  res.status(202).json({ message: "If an account exists, a sign-in code has been sent." });
});

router.post("/login/verify", async (req, res): Promise<void> => {
  const body = VerifyLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter the six-digit sign-in code." });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail(body.data.email)))
    .limit(1);
  if (!user?.emailVerifiedAt || !(await consumeCode(user.id, "login", body.data.code))) {
    res.status(400).json({ error: "That sign-in code is invalid or has expired." });
    return;
  }
  await createSession(req, res, user.id, "browser");
  await auditSecurityEvent(req, "email_login", user.id);
  res.json(await sessionJson(user, req));
});

// Mobile clients use an explicit token contract. These endpoints never issue
// browser cookies; callers must store accessToken and send Authorization:
// Bearer <accessToken> on subsequent requests.
router.post("/mobile/login", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const email = normalizedEmail(body.data.email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (user?.emailVerifiedAt) {
    try {
      await sendLoginCode(req, user);
    } catch (error) {
      req.log.error({ err: error }, "Failed to send mobile sign-in code");
    }
  }
  res.status(202).json({ message: "If an account exists, a sign-in code has been sent." });
});

router.post("/mobile/start", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const email = normalizedEmail(body.data.email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  try {
    if (user?.emailVerifiedAt) {
      await sendLoginCode(req, user);
      res.status(202).json({ flow: "login", message: "Check your email for a sign-in code." });
      return;
    }
    await sendRegistrationCode(req, email);
    res.status(202).json({ flow: "register", message: "Check your email to continue registration." });
  } catch {
    res.status(502).json({ error: "We could not send your code. Please try again." });
  }
});

router.post("/mobile/login/verify", async (req, res): Promise<void> => {
  const body = VerifyLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter the six-digit sign-in code." });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail(body.data.email)))
    .limit(1);
  if (!user?.emailVerifiedAt || !(await consumeCode(user.id, "login", body.data.code))) {
    res.status(400).json({ error: "That sign-in code is invalid or has expired." });
    return;
  }
  const token = await createSession(req, res, user.id, "mobile");
  await auditSecurityEvent(req, "mobile_email_login", user.id);
  res.json(await mobileSessionJson(user, token));
});

router.post("/mobile/verify-email", async (req, res): Promise<void> => {
  const body = VerifyEmailBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter the six-digit verification code." });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail(body.data.email)))
    .limit(1);
  if (!user || !(await consumeCode(user.id, "verify", body.data.code))) {
    res.status(400).json({ error: "That verification code is invalid or has expired." });
    return;
  }
  const [verified] = await db
    .update(usersTable)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  const token = await createSession(req, res, user.id, "mobile");
  await auditSecurityEvent(req, "mobile_email_verified", user.id);
  res.json(await mobileSessionJson(verified, token));
});

router.post("/mobile/passkey/handoff", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const sessionTokenHash = getSessionTokenHash(req);
  if (!userId || !sessionTokenHash || !isBearerRequest(req)) {
    res.status(401).json({ error: "A mobile bearer session is required." });
    return;
  }
  const [passkey] = await db
    .select({ credentialId: passkeysTable.credentialId })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, userId))
    .limit(1);
  if (!passkey) {
    res.status(409).json({ error: "This account does not have a passkey to verify." });
    return;
  }
  const grant = randomBytes(32).toString("base64url");
  await db.insert(mobileSessionGrantsTable).values({
    grantHash: grantHash(grant),
    userId,
    sessionTokenHash,
    expiresAt: new Date(Date.now() + MOBILE_GRANT_MS),
  });
  const handoffUrl = `${process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`}/api/auth/mobile/passkey/handoff?grant=${encodeURIComponent(grant)}`;
  await auditSecurityEvent(req, "mobile_passkey_handoff_started", userId);
  res.status(201).json({
    handoffUrl,
    expiresAt: new Date(Date.now() + MOBILE_GRANT_MS).toISOString(),
  });
});

// This URL contains only a short-lived, hashed exchange grant (never a
// session bearer). It establishes a temporary browser session so the existing
// browser passkey ceremony can be used without exposing the mobile token.
router.get("/mobile/passkey/handoff", async (req, res): Promise<void> => {
  const grant = typeof req.query.grant === "string" ? req.query.grant : "";
  if (!/^[A-Za-z0-9_-]{32,}$/.test(grant)) {
    res.status(400).json({ error: "Invalid passkey handoff grant." });
    return;
  }
  const [saved] = await db
    .select()
    .from(mobileSessionGrantsTable)
    .where(and(
      eq(mobileSessionGrantsTable.grantHash, grantHash(grant)),
      isNull(mobileSessionGrantsTable.consumedAt),
      isNull(mobileSessionGrantsTable.browserSessionTokenHash),
      gt(mobileSessionGrantsTable.expiresAt, new Date()),
    ))
    .limit(1);
  if (!saved) {
    res.status(400).json({ error: "This passkey handoff has expired or was already opened." });
    return;
  }
  const browserToken = randomBytes(32).toString("base64url");
  const deviceToken = randomBytes(32).toString("base64url");
  const claimed = await db
    .update(mobileSessionGrantsTable)
    .set({ browserSessionTokenHash: hashSessionToken(browserToken) })
    .where(and(
      eq(mobileSessionGrantsTable.grantHash, saved.grantHash),
      isNull(mobileSessionGrantsTable.browserSessionTokenHash),
      isNull(mobileSessionGrantsTable.consumedAt),
      gt(mobileSessionGrantsTable.expiresAt, new Date()),
    ))
    .returning({ grantHash: mobileSessionGrantsTable.grantHash });
  if (!claimed.length) {
    res.status(409).json({ error: "This passkey handoff was already opened." });
    return;
  }
  await db.insert(sessionsTable).values({
    tokenHash: hashSessionToken(browserToken),
    userId: saved.userId,
    expiresAt: new Date(Date.now() + MOBILE_GRANT_MS),
    transport: "browser",
    deviceHash: privacyHash(`${deviceToken}:${String(req.headers["user-agent"] || "unknown")}`),
    ipPrefix: ipPrefix(req),
  });
  res.cookie(SESSION_COOKIE, browserToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MOBILE_GRANT_MS,
  });
  res.cookie(DEVICE_COOKIE, deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MOBILE_GRANT_MS,
  });
  issueCsrfCookie(res);
  const nonce = randomBytes(16).toString("base64url");
  res
    .status(200)
    .set("Content-Security-Policy", `default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`)
    .type("html")
    .send(passkeyHandoffPage(grant, nonce));
});

router.post("/mobile/passkey/handoff/complete", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const browserSessionTokenHash = getSessionTokenHash(req);
  const grant = typeof req.body?.grant === "string" ? req.body.grant : "";
  if (!userId || !browserSessionTokenHash || !isPasskeyVerified(req)) {
    res.status(userId ? 403 : 401).json({ error: "Verify your passkey before completing the handoff." });
    return;
  }
  if (!/^[A-Za-z0-9_-]{32,}$/.test(grant)) {
    res.status(400).json({ error: "Invalid passkey handoff grant." });
    return;
  }
  const completed = await db
    .update(mobileSessionGrantsTable)
    .set({ approvedAt: new Date() })
    .where(and(
      eq(mobileSessionGrantsTable.grantHash, grantHash(grant)),
      eq(mobileSessionGrantsTable.userId, userId),
      eq(mobileSessionGrantsTable.browserSessionTokenHash, browserSessionTokenHash),
      isNull(mobileSessionGrantsTable.approvedAt),
      isNull(mobileSessionGrantsTable.consumedAt),
      gt(mobileSessionGrantsTable.expiresAt, new Date()),
    ))
    .returning({ grantHash: mobileSessionGrantsTable.grantHash });
  if (!completed.length) {
    res.status(400).json({ error: "This passkey handoff has expired or is not recognized." });
    return;
  }
  await auditSecurityEvent(req, "mobile_passkey_handoff_approved", userId);
  res.json({ approved: true });
});

router.post("/mobile/passkey/handoff/exchange", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const sessionTokenHash = getSessionTokenHash(req);
  const grant = typeof req.body?.grant === "string" ? req.body.grant : "";
  if (!userId || !sessionTokenHash || !isBearerRequest(req)) {
    res.status(401).json({ error: "A mobile bearer session is required." });
    return;
  }
  if (!/^[A-Za-z0-9_-]{32,}$/.test(grant)) {
    res.status(400).json({ error: "Invalid passkey handoff grant." });
    return;
  }
  let exchanged = false;
  try {
    exchanged = await db.transaction(async (tx) => {
      // Update the session first, but only commit it together with consuming
      // the approved grant. A failed grant update throws so the transaction
      // rolls back rather than leaving a verified mobile session.
      const updated = await tx
        .update(sessionsTable)
        .set({ passkeyVerifiedAt: new Date() })
        .where(and(eq(sessionsTable.tokenHash, sessionTokenHash), eq(sessionsTable.userId, userId)))
        .returning({ tokenHash: sessionsTable.tokenHash });
      if (updated.length !== 1) return false;
      const consumed = await tx
        .update(mobileSessionGrantsTable)
        .set({ consumedAt: new Date() })
        .where(and(
          eq(mobileSessionGrantsTable.grantHash, grantHash(grant)),
          eq(mobileSessionGrantsTable.userId, userId),
          eq(mobileSessionGrantsTable.sessionTokenHash, sessionTokenHash),
          isNull(mobileSessionGrantsTable.consumedAt),
          isNotNull(mobileSessionGrantsTable.approvedAt),
          gt(mobileSessionGrantsTable.expiresAt, new Date()),
        ))
        .returning({ grantHash: mobileSessionGrantsTable.grantHash });
      if (consumed.length !== 1) throw new Error("Handoff grant unavailable");
      return true;
    });
  } catch {
    exchanged = false;
  }
  if (!exchanged) {
    res.status(400).json({ error: "This passkey handoff is not ready or has expired." });
    return;
  }
  await auditSecurityEvent(req, "mobile_passkey_handoff_exchanged", userId);
  res.json({ verified: true });
});

router.get("/me", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isBearerRequest(req) && !req.headers.cookie?.split(";").some((part) => part.trim().startsWith(`${CSRF_COOKIE}=`))) {
    issueCsrfCookie(res);
  }
  res.json(await sessionJson(user, req));
});

router.post("/legal-policy-consent", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = AcceptLegalPolicyConsentBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Provide the current legal policy versions and a valid source." });
    return;
  }
  if (
    body.data.termsVersion !== CURRENT_LEGAL_POLICY_VERSIONS.terms ||
    body.data.communityGuidelinesVersion !== CURRENT_LEGAL_POLICY_VERSIONS.communityGuidelines
  ) {
    res.status(409).json({
      error: "The submitted legal policy versions are no longer current.",
      code: "LEGAL_POLICY_VERSION_MISMATCH",
      currentVersions: CURRENT_LEGAL_POLICY_VERSIONS,
    });
    return;
  }
  const source: LegalPolicySource = body.data.source ?? "web";
  await db.transaction(async (tx) => {
    await tx.insert(legalPolicyAcceptancesTable).values([
      {
        userId,
        policyKey: "terms",
        policyVersion: CURRENT_LEGAL_POLICY_VERSIONS.terms,
        policyContentHash: CURRENT_LEGAL_POLICY_CONTENT_HASHES.terms,
        source,
      },
      {
        userId,
        policyKey: "communityGuidelines",
        policyVersion: CURRENT_LEGAL_POLICY_VERSIONS.communityGuidelines,
        policyContentHash: CURRENT_LEGAL_POLICY_CONTENT_HASHES.communityGuidelines,
        source,
      },
    ]).onConflictDoNothing();
  });
  res.json(AcceptLegalPolicyConsentResponse.parse(await getLegalPolicyStatus(userId)));
});

router.post("/onboarding", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = CompleteOnboardingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter your name and a valid lowercase username." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [existingProfile] = await db
    .select({ id: foundersTable.id })
    .from(foundersTable)
    .where(eq(foundersTable.userId, userId))
    .limit(1);
  const requestedStatus = body.data.eligible ? "eligible" : "waitlisted";
  if (existingProfile) {
    if (!body.data.eligible) {
      res.status(409).json({ error: "Your onboarding decision has already been recorded." });
      return;
    }
    res.json(CompleteOnboardingResponse.parse(await sessionJson(user, req)));
    return;
  }
  if (user.eligibilityStatus !== "undecided") {
    if (user.eligibilityStatus !== requestedStatus) {
      res.status(409).json({ error: "Your onboarding decision has already been recorded." });
      return;
    }
    res.json(CompleteOnboardingResponse.parse(await sessionJson(user, req)));
    return;
  }
  const handle = body.data.handle.trim().toLowerCase();
  try {
    await db.transaction(async (tx) => {
      const updated = await tx.update(usersTable).set({
        eligibilityStatus: requestedStatus,
        onboardingFirstName: body.data.firstName.trim(),
        onboardingLastName: body.data.lastName.trim(),
        proposedHandle: handle,
        eligibilityDecidedAt: new Date(),
      }).where(and(
        eq(usersTable.id, userId),
        eq(usersTable.eligibilityStatus, "undecided"),
      )).returning({ id: usersTable.id });
      if (!updated.length) throw new Error("ONBOARDING_DECISION_CONFLICT");
      if (body.data.eligible) {
        await tx.insert(foundersTable).values({
          userId,
          name: `${body.data.firstName.trim()} ${body.data.lastName.trim()}`,
          handle,
          bio: "",
          avatarColor: "#3B82F6",
          isFollowing: false,
          followerCount: 0,
          followingCount: 0,
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ONBOARDING_DECISION_CONFLICT") {
      res.status(409).json({ error: "Your onboarding decision has already been recorded." });
      return;
    }
    if (body.data.eligible && typeof error === "object" && error && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "That username is already taken." });
      return;
    }
    throw error;
  }
  const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json(CompleteOnboardingResponse.parse(await sessionJson(updatedUser, req)));
});

router.get("/usernames/:handle/availability", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (isBearerRequest(req) && !isPasskeyVerified(req)) {
    const [enrolled] = await db
      .select({ credentialId: passkeysTable.credentialId })
      .from(passkeysTable)
      .where(eq(passkeysTable.userId, userId))
      .limit(1);
    if (enrolled) {
      res.status(403).json({ error: "Additional sign-in verification is required.", code: "passkey_required" });
      return;
    }
  }
  const params = CheckUsernameAvailabilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Enter at least two lowercase letters, numbers, or underscores." });
    return;
  }
  const [existing] = await db
    .select({ userId: foundersTable.userId })
    .from(foundersTable)
    .where(eq(foundersTable.handle, params.data.handle))
    .limit(1);
  res.json(
    CheckUsernameAvailabilityResponse.parse({
      handle: params.data.handle,
      available: !existing || existing.userId === userId,
    }),
  );
});

router.post("/logout", async (req, res): Promise<void> => {
  const sessionTokenHash = getSessionTokenHash(req);
  if (sessionTokenHash) await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, sessionTokenHash));
  clearSessionCookie(res);
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.sendStatus(204);
});

router.post("/mobile/logout", async (req, res): Promise<void> => {
  if (!isBearerRequest(req)) {
    res.status(401).json({ error: "A mobile bearer session is required." });
    return;
  }
  const sessionTokenHash = getSessionTokenHash(req);
  if (sessionTokenHash) await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, sessionTokenHash));
  res.sendStatus(204);
});

export default router;