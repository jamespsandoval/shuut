import { randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";
import { Router, type IRouter, type Response } from "express";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import {
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailBody,
} from "@workspace/api-zod";
import { authCodesTable, db, sessionsTable, usersTable } from "@workspace/db";
import { sendPostmarkEmail } from "../lib/postmark";
import {
  clearSessionCookie,
  getAuthenticatedUserId,
  hashSessionToken,
  SESSION_COOKIE,
} from "../middlewares/sessionAuth";

const router: IRouter = Router();
const scryptAsync = promisify(scrypt);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetsAt: number }>();

router.use((req, res, next) => {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const current = attempts.get(key);
  if (!current || current.resetsAt <= now) {
    attempts.set(key, { count: 1, resetsAt: now + 15 * 60 * 1000 });
    next();
    return;
  }
  if (current.count >= 12) {
    res.setHeader("Retry-After", String(Math.ceil((current.resetsAt - now) / 1000)));
    res.status(429).json({ error: "Too many attempts. Please wait and try again." });
    return;
  }
  current.count += 1;
  next();
});

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function codeHash(userId: string, purpose: string, code: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(`${userId}:${purpose}:${code}`).digest("hex");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltHex, hashHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function issueCode(userId: string, purpose: "verify" | "reset") {
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
  purpose: "verify" | "reset",
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

async function discardCode(userId: string, purpose: "verify" | "reset", hashedCode: string) {
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

async function consumeCode(userId: string, purpose: "verify" | "reset", code: string) {
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

async function createSession(res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  await db.insert(sessionsTable).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS,
  });
}

function sessionJson(user: typeof usersTable.$inferSelect) {
  return { user: { id: user.id, email: user.email, emailVerified: Boolean(user.emailVerifiedAt) } };
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
            // Pending accounts cannot sign in. Verification replaces this
            // random credential with the password chosen by the email owner.
            passwordHash: await hashPassword(randomBytes(32).toString("hex")),
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
    .set({
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(body.data.password),
    })
    .where(eq(usersTable.id, user.id))
    .returning();
  await createSession(res, user.id);
  res.json(sessionJson(verified));
});

router.post("/login", async (req, res): Promise<void> => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter your email and password." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail(body.data.email))).limit(1);
  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Incorrect email or password." });
    return;
  }
  if (!user.emailVerifiedAt) {
    res.status(403).json({ error: "Verify your email before signing in." });
    return;
  }
  await createSession(res, user.id);
  res.json(sessionJson(user));
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
  res.json(sessionJson(user));
});

router.post("/logout", async (req, res): Promise<void> => {
  const token = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (token) await db.delete(sessionsTable).where(eq(sessionsTable.tokenHash, hashSessionToken(decodeURIComponent(token))));
  clearSessionCookie(res);
  res.sendStatus(204);
});

router.post("/forgot-password", async (req, res): Promise<void> => {
  const body = ForgotPasswordBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const email = normalizedEmail(body.data.email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (user?.emailVerifiedAt) {
    const challenge = await issueCode(user.id, "reset");
    try {
      await sendPostmarkEmail({
        to: email,
        subject: "Reset your SHÜÜT password",
        textBody: `Your SHÜÜT password reset code is ${challenge.code}. It expires in 15 minutes. If you did not request this, ignore this email.`,
      });
      await retireOtherCodes(user.id, "reset", challenge.hashedCode);
    } catch (error) {
      await discardCode(user.id, "reset", challenge.hashedCode);
      req.log.error({ err: error }, "Failed to send password reset email");
    }
  }
  res.status(202).json({ message: "If an account exists, a reset code has been sent." });
});

router.post("/reset-password", async (req, res): Promise<void> => {
  const body = ResetPasswordBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter a valid code and a password of at least 10 characters." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail(body.data.email))).limit(1);
  if (!user || !(await consumeCode(user.id, "reset", body.data.code))) {
    res.status(400).json({ error: "That reset code is invalid or has expired." });
    return;
  }
  await db.update(usersTable).set({ passwordHash: await hashPassword(body.data.password) }).where(eq(usersTable.id, user.id));
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, user.id));
  clearSessionCookie(res);
  res.json({ message: "Password updated. You can now sign in." });
});

export default router;