import { createHmac, randomBytes, randomInt } from "crypto";
import { Router, type IRouter, type Request } from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
} from "@simplewebauthn/server";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import {
  db,
  passkeyRecoveriesTable,
  passkeysTable,
  securityAuditEventsTable,
  usersTable,
  webauthnChallengesTable,
  sessionsTable,
} from "@workspace/db";
import {
  getAuthenticatedUserId,
  deviceBindingHash,
  getSessionTokenHash,
  isPasskeyVerified,
  clearSessionCookie,
  hashSessionToken,
  SESSION_COOKIE,
  DEVICE_COOKIE,
} from "../middlewares/sessionAuth";
import { auditSecurityEvent, consumeRateLimit, deviceHash, ipPrefix, privacyHash } from "../lib/security";
import { sendPostmarkEmail } from "../lib/postmark";
import { authCodeEmail } from "../lib/authCodeEmail";
import { issueCsrfCookie } from "../middlewares/csrf";
import { webauthnVerifier } from "../lib/webauthn";

const router: IRouter = Router();
const CHALLENGE_MS = 5 * 60 * 1000;
const RECOVERY_DELAY_MS = 24 * 60 * 60 * 1000;
const RECOVERY_CODE_MS = 15 * 60 * 1000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function rpId(req: Request): string {
  return process.env.WEBAUTHN_RP_ID || String(req.hostname).split(":")[0];
}

function origin(req: Request): string {
  return process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
}

async function user(req: Request) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) return null;
  const [record] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return record ?? null;
}

async function challenge(req: Request, purpose: string, value: string) {
  const current = await user(req);
  const sessionTokenHash = getSessionTokenHash(req);
  if (!current || !sessionTokenHash) return false;
  await db.delete(webauthnChallengesTable).where(
    and(
      eq(webauthnChallengesTable.userId, current.id),
      eq(webauthnChallengesTable.sessionTokenHash, sessionTokenHash),
    ),
  );
  await db.insert(webauthnChallengesTable).values({
    userId: current.id,
    sessionTokenHash,
    challenge: value,
    purpose,
    expiresAt: new Date(Date.now() + CHALLENGE_MS),
  });
  return true;
}

function recoveryCodeHash(userId: string, code: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(`${userId}:passkey-recovery:${code}`).digest("hex");
}

function passkeyDeviceName(req: Request): string {
  const agent = String(req.headers["user-agent"] || "");
  if (/iphone|ipad/i.test(agent)) return "Apple mobile device";
  if (/android/i.test(agent)) return "Android device";
  if (/macintosh|mac os/i.test(agent)) return "Mac";
  if (/windows/i.test(agent)) return "Windows device";
  if (/linux/i.test(agent)) return "Linux device";
  return "Passkey device";
}

async function lockPasskeyState(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
}

router.post("/passkey/register/options", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const existing = await db
    .select({ credentialId: passkeysTable.credentialId })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, current.id));
  if (existing.length > 0 && !isPasskeyVerified(req)) {
    res.status(403).json({ error: "Verify an existing passkey before adding another one." });
    return;
  }
  const options = await generateRegistrationOptions({
    rpName: "SHÜÜT",
    rpID: rpId(req),
    userName: current.email,
    userDisplayName: current.email,
    userID: Buffer.from(current.id),
    attestationType: "none",
    excludeCredentials: existing.map((item) => ({ id: item.credentialId })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await challenge(req, "registration", options.challenge);
  res.json(options);
});

router.post("/passkey/register/verify", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [existingCredential] = await db
    .select({ credentialId: passkeysTable.credentialId })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, current.id))
    .limit(1);
  if (existingCredential && !isPasskeyVerified(req)) {
    res.status(403).json({ error: "Verify an existing passkey before adding another one." });
    return;
  }
  const [saved] = await db
    .select()
    .from(webauthnChallengesTable)
    .where(and(
      eq(webauthnChallengesTable.userId, current.id),
      eq(webauthnChallengesTable.sessionTokenHash, getSessionTokenHash(req) ?? ""),
      eq(webauthnChallengesTable.purpose, "registration"),
      gt(webauthnChallengesTable.expiresAt, new Date()),
    ))
    .limit(1);
  if (!saved) {
    res.status(400).json({ error: "This passkey request has expired. Please try again." });
    return;
  }
  try {
    const verification = await webauthnVerifier.verifyRegistration({
      response: req.body,
      expectedChallenge: saved.challenge,
      expectedOrigin: origin(req),
      expectedRPID: rpId(req),
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error("Passkey verification failed");
    const info = verification.registrationInfo;
    const credential = info.credential;
    const tokenHash = getSessionTokenHash(req);
    if (!tokenHash) throw new Error("Session missing");
    await db.transaction(async (tx) => {
      await lockPasskeyState(tx, current.id);
      const [liveSession] = await tx
        .select({ passkeyVerifiedAt: sessionsTable.passkeyVerifiedAt })
        .from(sessionsTable)
        .where(eq(sessionsTable.tokenHash, tokenHash))
        .limit(1);
      if (!liveSession) throw new Error("Session expired");
      const [liveExisting] = await tx
        .select({ credentialId: passkeysTable.credentialId })
        .from(passkeysTable)
        .where(eq(passkeysTable.userId, current.id))
        .limit(1);
      if (liveExisting && !liveSession.passkeyVerifiedAt) throw new Error("Passkey verification required");
      const consumed = await tx
        .delete(webauthnChallengesTable)
        .where(and(
          eq(webauthnChallengesTable.id, saved.id),
          gt(webauthnChallengesTable.expiresAt, new Date()),
        ))
        .returning({ id: webauthnChallengesTable.id });
      if (!consumed.length) throw new Error("Challenge consumed");
      await tx.insert(passkeysTable).values({
        credentialId: credential.id,
        userId: current.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64"),
        counter: credential.counter,
        transports: req.body.response?.transports?.join(",") || null,
        deviceName: passkeyDeviceName(req),
      });
      await tx.update(sessionsTable).set({
        passkeyVerifiedAt: new Date(),
        deviceHash: deviceBindingHash(req),
      }).where(eq(sessionsTable.tokenHash, tokenHash));
    });
    await auditSecurityEvent(req, "passkey_enrolled", current.id);
    res.json({ verified: true });
  } catch (error) {
    await auditSecurityEvent(req, "passkey_failure", current.id);
    res.status(400).json({ error: "We could not verify that passkey. Please try again." });
  }
});

router.get("/passkey/devices", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current || !isPasskeyVerified(req)) {
    res.status(current ? 403 : 401).json({ error: current ? "Verify your passkey to manage devices." : "Unauthorized" });
    return;
  }
  const devices = await db
    .select({
      id: passkeysTable.credentialId,
      name: passkeysTable.deviceName,
      createdAt: passkeysTable.createdAt,
      lastUsedAt: passkeysTable.lastUsedAt,
    })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, current.id));
  res.json({
    devices: devices.map((device) => ({
      ...device,
      name: device.name || "Passkey device",
      createdAt: device.createdAt.toISOString(),
      lastUsedAt: device.lastUsedAt?.toISOString() ?? null,
    })),
  });
});

router.delete("/passkey/devices/:credentialId", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current || !isPasskeyVerified(req)) {
    res.status(current ? 403 : 401).json({ error: current ? "Verify your passkey to manage devices." : "Unauthorized" });
    return;
  }
  const removed = await db
    .delete(passkeysTable)
    .where(and(
      eq(passkeysTable.userId, current.id),
      eq(passkeysTable.credentialId, req.params.credentialId),
    ))
    .returning({ id: passkeysTable.credentialId });
  if (!removed.length) {
    res.status(404).json({ error: "Passkey device not found." });
    return;
  }
  await auditSecurityEvent(req, "passkey_removed", current.id);
  await sendPostmarkEmail({
    to: current.email,
    subject: "A passkey was removed from your SHÜÜT account",
    textBody: "A passkey device was removed from your SHÜÜT account. If this was not you, start lost-passkey recovery immediately.",
  }).catch((error) => req.log.error({ err: error }, "Failed to send passkey removal notice"));
  res.sendStatus(204);
});

router.get("/passkey/recovery/status", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [recovery] = await db
    .select()
    .from(passkeyRecoveriesTable)
    .where(eq(passkeyRecoveriesTable.userId, current.id))
    .limit(1);
  res.json({
    pending: Boolean(recovery),
    availableAt: recovery?.availableAt.toISOString() ?? null,
    codeExpiresAt: recovery?.confirmationCodeExpiresAt?.toISOString() ?? null,
  });
});

router.post("/passkey/recovery/request", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const limit = await consumeRateLimit(`passkey-recovery:${privacyHash(current.id)}`, 3, 24 * 60 * 60 * 1000);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    res.status(429).json({ error: "Too many recovery attempts. Please try again later." });
    return;
  }
  const availableAt = new Date(Date.now() + RECOVERY_DELAY_MS);
  await db
    .insert(passkeyRecoveriesTable)
    .values({ userId: current.id, availableAt })
    .onConflictDoUpdate({
      target: passkeyRecoveriesTable.userId,
      set: {
        availableAt,
        confirmationCodeHash: null,
        confirmationCodeExpiresAt: null,
        requestedAt: new Date(),
      },
    });
  try {
    await sendPostmarkEmail({
      to: current.email,
      subject: "Passkey recovery requested for your SHÜÜT account",
      textBody: `Passkey recovery was requested for your SHÜÜT account. It cannot be completed before ${availableAt.toISOString()}. If this was not you, sign in with your passkey; your existing passkeys remain active.`,
    });
  } catch (error) {
    await db.delete(passkeyRecoveriesTable).where(eq(passkeyRecoveriesTable.userId, current.id));
    req.log.error({ err: error }, "Failed to send recovery security notice");
    res.status(502).json({ error: "We could not send the recovery security notice. Please try again." });
    return;
  }
  await auditSecurityEvent(req, "passkey_recovery_requested", current.id, { availableAt: availableAt.toISOString() });
  res.status(202).json({ pending: true, availableAt: availableAt.toISOString(), codeExpiresAt: null });
});

router.post("/passkey/recovery/code", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [recovery] = await db
    .select()
    .from(passkeyRecoveriesTable)
    .where(and(
      eq(passkeyRecoveriesTable.userId, current.id),
      lte(passkeyRecoveriesTable.availableAt, new Date()),
    ))
    .limit(1);
  if (!recovery) {
    res.status(409).json({ error: "Recovery is not ready for confirmation yet." });
    return;
  }
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + RECOVERY_CODE_MS);
  const emailContent = authCodeEmail({ code, kind: "passkey-recovery" });
  await db.update(passkeyRecoveriesTable).set({
    confirmationCodeHash: recoveryCodeHash(current.id, code),
    confirmationCodeExpiresAt: expiresAt,
  }).where(eq(passkeyRecoveriesTable.userId, current.id));
  try {
    await sendPostmarkEmail({
      to: current.email,
      subject: "Confirm your SHÜÜT passkey recovery",
      ...emailContent,
    });
  } catch (error) {
    await db.update(passkeyRecoveriesTable).set({
      confirmationCodeHash: null,
      confirmationCodeExpiresAt: null,
    }).where(eq(passkeyRecoveriesTable.userId, current.id));
    req.log.error({ err: error }, "Failed to send recovery confirmation code");
    res.status(502).json({ error: "We could not send the confirmation code. Please try again." });
    return;
  }
  await auditSecurityEvent(req, "passkey_recovery_code_sent", current.id);
  res.status(202).json({ pending: true, availableAt: recovery.availableAt.toISOString(), codeExpiresAt: expiresAt.toISOString() });
});

router.post("/passkey/recovery/confirm", async (req, res): Promise<void> => {
  const current = await user(req);
  const code = String(req.body?.code || "");
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!/^[0-9]{6}$/.test(code)) {
    res.status(400).json({ error: "Enter the six-digit confirmation code." });
    return;
  }
  const limit = await consumeRateLimit(`passkey-recovery-confirm:${privacyHash(current.id)}`, 6, 15 * 60 * 1000);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    res.status(429).json({ error: "Too many confirmation attempts. Please try again later." });
    return;
  }
  const token = randomBytes(32).toString("base64url");
  const deviceToken = randomBytes(32).toString("base64url");
  try {
    await db.transaction(async (tx) => {
      await lockPasskeyState(tx, current.id);
      const consumed = await tx
        .delete(passkeyRecoveriesTable)
        .where(and(
          eq(passkeyRecoveriesTable.userId, current.id),
          lte(passkeyRecoveriesTable.availableAt, new Date()),
          eq(passkeyRecoveriesTable.confirmationCodeHash, recoveryCodeHash(current.id, code)),
          gt(passkeyRecoveriesTable.confirmationCodeExpiresAt, new Date()),
        ))
        .returning({ userId: passkeyRecoveriesTable.userId });
      if (!consumed.length) throw new Error("Invalid recovery code");
      await tx.delete(passkeysTable).where(eq(passkeysTable.userId, current.id));
      await tx.delete(sessionsTable).where(eq(sessionsTable.userId, current.id));
      await tx.insert(sessionsTable).values({
        tokenHash: hashSessionToken(token),
        userId: current.id,
        expiresAt: new Date(Date.now() + SESSION_MS),
        deviceHash: privacyHash(`${deviceToken}:${String(req.headers["user-agent"] || "unknown")}`),
        ipPrefix: ipPrefix(req),
      });
      await tx.insert(securityAuditEventsTable).values({
        eventType: "passkey_recovery_completed",
        userId: current.id,
        ipPrefix: ipPrefix(req),
        deviceHash: deviceHash(req),
        metadata: JSON.stringify({ sessionsRevoked: true }),
      });
    });
  } catch {
    await auditSecurityEvent(req, "passkey_recovery_failure", current.id);
    res.status(400).json({ error: "That confirmation code is invalid or has expired." });
    return;
  }
  clearSessionCookie(res);
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
  await sendPostmarkEmail({
    to: current.email,
    subject: "Your SHÜÜT passkey recovery is complete",
    textBody: "Passkey recovery is complete. All previous passkeys were removed and all sessions were signed out. You must now add a new passkey before using SHÜÜT.",
  }).catch((error) => req.log.error({ err: error }, "Failed to send recovery completion notice"));
  res.json({ recovered: true });
});

router.post("/passkey/assertion/options", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const credentials = await db
    .select({ credentialId: passkeysTable.credentialId, transports: passkeysTable.transports })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, current.id));
  const options = await generateAuthenticationOptions({
    rpID: rpId(req),
    userVerification: "required",
    allowCredentials: credentials.map((item) => ({
      id: item.credentialId,
      transports: item.transports ? item.transports.split(",") as any : undefined,
    })),
  });
  await challenge(req, "assertion", options.challenge);
  res.json(options);
});

router.post("/passkey/assertion/verify", async (req, res): Promise<void> => {
  const current = await user(req);
  if (!current) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [saved] = await db
    .select()
    .from(webauthnChallengesTable)
    .where(and(
      eq(webauthnChallengesTable.userId, current.id),
      eq(webauthnChallengesTable.sessionTokenHash, getSessionTokenHash(req) ?? ""),
      eq(webauthnChallengesTable.purpose, "assertion"),
      gt(webauthnChallengesTable.expiresAt, new Date()),
    ))
    .limit(1);
  const credentialId = String(req.body?.id || "");
  const [credential] = await db
    .select()
    .from(passkeysTable)
    .where(and(eq(passkeysTable.userId, current.id), eq(passkeysTable.credentialId, credentialId)))
    .limit(1);
  if (!saved || !credential) {
    res.status(400).json({ error: "This passkey request has expired or is not recognized." });
    return;
  }
  try {
    const verification = await webauthnVerifier.verifyAuthentication({
      response: req.body,
      expectedChallenge: saved.challenge,
      expectedOrigin: origin(req),
      expectedRPID: rpId(req),
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, "base64")),
        counter: credential.counter,
        transports: credential.transports ? credential.transports.split(",") as any : undefined,
      },
    });
    if (!verification.verified) throw new Error("Passkey verification failed");
    const tokenHash = getSessionTokenHash(req);
    if (!tokenHash) throw new Error("Session missing");
    const cancelledRecovery = await db.transaction(async (tx) => {
      await lockPasskeyState(tx, current.id);
      const consumed = await tx
        .delete(webauthnChallengesTable)
        .where(and(
          eq(webauthnChallengesTable.id, saved.id),
          gt(webauthnChallengesTable.expiresAt, new Date()),
        ))
        .returning({ id: webauthnChallengesTable.id });
      if (!consumed.length) throw new Error("Challenge consumed");
      const [liveCredential] = await tx
        .select({ counter: passkeysTable.counter })
        .from(passkeysTable)
        .where(and(
          eq(passkeysTable.userId, current.id),
          eq(passkeysTable.credentialId, credential.credentialId),
        ))
        .limit(1);
      if (!liveCredential || liveCredential.counter !== credential.counter) {
        throw new Error("Passkey counter changed");
      }
      const updatedCredential = await tx.update(passkeysTable).set({
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      }).where(and(
        eq(passkeysTable.userId, current.id),
        eq(passkeysTable.credentialId, credential.credentialId),
      )).returning({ id: passkeysTable.credentialId });
      if (!updatedCredential.length) throw new Error("Passkey removed");
      const updatedSession = await tx.update(sessionsTable).set({
        passkeyVerifiedAt: new Date(),
        deviceHash: deviceBindingHash(req),
      }).where(eq(sessionsTable.tokenHash, tokenHash)).returning({ tokenHash: sessionsTable.tokenHash });
      if (!updatedSession.length) throw new Error("Session expired");
      return tx
        .delete(passkeyRecoveriesTable)
        .where(eq(passkeyRecoveriesTable.userId, current.id))
        .returning({ userId: passkeyRecoveriesTable.userId });
    });
    await auditSecurityEvent(req, "passkey_assertion", current.id);
    if (cancelledRecovery.length) {
      await auditSecurityEvent(req, "passkey_recovery_cancelled", current.id, { reason: "passkey_verified" });
      await sendPostmarkEmail({
        to: current.email,
        subject: "SHÜÜT passkey recovery was cancelled",
        textBody: "A successful passkey verification cancelled the pending recovery request for your SHÜÜT account.",
      }).catch((error) => req.log.error({ err: error }, "Failed to send recovery cancellation notice"));
    }
    res.json({ verified: true });
  } catch {
    await auditSecurityEvent(req, "passkey_failure", current.id);
    res.status(400).json({ error: "We could not verify that passkey. Please try again." });
  }
});

export default router;