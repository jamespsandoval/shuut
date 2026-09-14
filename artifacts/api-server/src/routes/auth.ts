import { randomBytes, randomInt, randomUUID, createHmac } from "crypto";
import { Router, type IRouter, type Response } from "express";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import {
  LoginBody,
  RegisterBody,
  VerifyEmailBody,
  VerifyLoginBody,
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
  await createSession(res, user.id);
  res.json(sessionJson(verified));
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

export default router;