import { Router, type IRouter, type Request } from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
} from "@simplewebauthn/server";
import { and, eq, gt } from "drizzle-orm";
import {
  db,
  passkeysTable,
  usersTable,
  webauthnChallengesTable,
  sessionsTable,
} from "@workspace/db";
import {
  getAuthenticatedUserId,
  deviceBindingHash,
  getSessionTokenHash,
  isPasskeyVerified,
} from "../middlewares/sessionAuth";
import { auditSecurityEvent } from "../lib/security";
import { webauthnVerifier } from "../lib/webauthn";

const router: IRouter = Router();
const CHALLENGE_MS = 5 * 60 * 1000;

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
    await db.insert(passkeysTable).values({
      credentialId: credential.id,
      userId: current.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      transports: req.body.response?.transports?.join(",") || null,
    });
    await db.delete(webauthnChallengesTable).where(eq(webauthnChallengesTable.id, saved.id));
    const tokenHash = getSessionTokenHash(req);
    if (tokenHash) {
      await db.update(sessionsTable).set({
        passkeyVerifiedAt: new Date(),
        deviceHash: deviceBindingHash(req),
      }).where(eq(sessionsTable.tokenHash, tokenHash));
    }
    await auditSecurityEvent(req, "passkey_enrolled", current.id);
    res.json({ verified: true });
  } catch (error) {
    await auditSecurityEvent(req, "passkey_failure", current.id);
    res.status(400).json({ error: "We could not verify that passkey. Please try again." });
  }
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
    await db.update(passkeysTable).set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    }).where(eq(passkeysTable.credentialId, credential.credentialId));
    await db.delete(webauthnChallengesTable).where(eq(webauthnChallengesTable.id, saved.id));
    const tokenHash = getSessionTokenHash(req);
    if (tokenHash) {
      await db.update(sessionsTable).set({
        passkeyVerifiedAt: new Date(),
        deviceHash: deviceBindingHash(req),
      }).where(eq(sessionsTable.tokenHash, tokenHash));
    }
    await auditSecurityEvent(req, "passkey_assertion", current.id);
    res.json({ verified: true });
  } catch {
    await auditSecurityEvent(req, "passkey_failure", current.id);
    res.status(400).json({ error: "We could not verify that passkey. Please try again." });
  }
});

export default router;