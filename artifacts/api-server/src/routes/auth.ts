import { randomBytes, randomInt, randomUUID, createHmac } from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import {
  LoginBody,
  CheckUsernameAvailabilityParams,
  CheckUsernameAvailabilityResponse,
  CompleteOnboardingBody,
  CompleteOnboardingResponse,
  RegisterBody,
  VerifyEmailBody,
  VerifyLoginBody,
} from "@workspace/api-zod";
import { authCodesTable, db, foundersTable, passkeysTable, sessionsTable, usersTable } from "@workspace/db";
import { sendPostmarkEmail } from "../lib/postmark";
import {
  clearSessionCookie,
  DEVICE_COOKIE,
  getAuthenticatedUserId,
  hashSessionToken,
  isPasskeyVerified,
  SESSION_COOKIE,
} from "../middlewares/sessionAuth";
import { CSRF_COOKIE, issueCsrfCookie } from "../middlewares/csrf";
import { ipPrefix, auditSecurityEvent, privacyHash } from "../lib/security";
import passkeyRouter from "./passkey";

const router: IRouter = Router();
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_MS = 15 * 60 * 1000;

router.use(passkeyRouter);
function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function codeHash(userId: string, purpose: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(`${userId}:${purpose}:${code}`).digest("hex");
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
  const [record] = await db
    .select()
    .from(authCodesTable)
    .where(
      and(
        eq(authCodesTable.userId, userId),
        eq(authCodesTable.purpose, purpose),
        eq(authCodesTable.codeHash, codeHash(userId, purpose, code)),
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

async function createSession(req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const deviceToken = randomBytes(32).toString("base64url");
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  await db.insert(sessionsTable).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MS),
    deviceHash: privacyHash(`${deviceToken}:${String(req.headers["user-agent"] || "unknown")}`),
    ipPrefix: ipPrefix(req),
  });
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

async function sessionJson(user: typeof usersTable.$inferSelect, req?: Request) {
  const [profile] = await db
    .select({ id: foundersTable.id })
    .from(foundersTable)
    .where(eq(foundersTable.userId, user.id))
    .limit(1);
  const [passkey] = await db
    .select({ credentialId: passkeysTable.credentialId })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, user.id))
    .limit(1);
  return {
    user: {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      onboardingComplete: Boolean(profile),
      passkeyEnrolled: Boolean(passkey),
      passkeyVerified: req ? isPasskeyVerified(req) : false,
    },
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
  try {
    await sendPostmarkEmail({
      to: email,
      subject: "Verify your SHÜÜT account",
      textBody: `Your SHÜÜT verification code is ${challenge.code}. It expires in 15 minutes.`,
    });
    await retireOtherCodes(user.id, "verify", challenge.hashedCode);
  } catch (error) {
    await discardCode(user.id, "verify", challenge.hashedCode);
    req.log.error({ err: error }, "Failed to send verification email");
    res.status(502).json({ error: "We could not send your verification email. Please try again." });
    return;
  }
  res.status(202).json({ message: "Check your email for a verification code." });
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
  await createSession(req, res, user.id);
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
    const challenge = await issueCode(user.id, "login");
    try {
      await sendPostmarkEmail({
        to: user.email,
        subject: "Your SHÜÜT sign-in code",
        textBody: `Your SHÜÜT sign-in code is ${challenge.code}. It expires in 15 minutes. If you did not request this, ignore this email.`,
      });
      await retireOtherCodes(user.id, "login", challenge.hashedCode);
    } catch (error) {
      await discardCode(user.id, "login", challenge.hashedCode);
      req.log.error({ err: error }, "Failed to send sign-in code");
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
  await createSession(req, res, user.id);
  await auditSecurityEvent(req, "email_login", user.id);
  res.json(await sessionJson(user, req));
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
  if (!req.headers.cookie?.split(";").some((part) => part.trim().startsWith(`${CSRF_COOKIE}=`))) {
    issueCsrfCookie(res);
  }
  res.json(await sessionJson(user, req));
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
  if (existingProfile) {
    res.json(CompleteOnboardingResponse.parse(await sessionJson(user, req)));
    return;
  }
  const handle = body.data.handle.trim().toLowerCase();
  const [taken] = await db
    .select({ id: foundersTable.id })
    .from(foundersTable)
    .where(eq(foundersTable.handle, handle))
    .limit(1);
  if (taken) {
    res.status(409).json({ error: "That username is already taken." });
    return;
  }
  await db.insert(foundersTable).values({
    userId,
    name: `${body.data.firstName.trim()} ${body.data.lastName.trim()}`,
    handle,
    bio: "",
    avatarColor: "#3B82F6",
    isFollowing: false,
    followerCount: 0,
    followingCount: 0,
  });
  res.json(CompleteOnboardingResponse.parse(await sessionJson(user, req)));
});

router.get("/usernames/:handle/availability", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
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
  const token = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (token) await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashSessionToken(decodeURIComponent(token))));
  clearSessionCookie(res);
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.sendStatus(204);
});

export default router;