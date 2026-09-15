import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import contactRouter from "./routes/contact";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";
import socialPreviewRouter from "./routes/socialPreview";
import { logger } from "./lib/logger";
import { requireAuth, sessionAuth } from "./middlewares/sessionAuth";
import { csrfProtection } from "./middlewares/csrf";
import { auditSecurityEvent, consumeRateLimit, ipPrefix, privacyHash } from "./lib/security";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(sessionAuth);
app.use(csrfProtection);

app.use(async (req, res, next) => {
  const method = req.method.toUpperCase();
  const path = req.path;
  const limited =
    (path.startsWith("/api/auth/") && method !== "GET") ||
    path === "/api/posts" ||
    path === "/api/storage/uploads/request-url" ||
    path === "/api/transcriptions";
  if (!limited) {
    next();
    return;
  }
  const bucket = path.startsWith("/api/auth/") ? "auth" : path.includes("transcriptions") ? "transcription" : path.includes("uploads") ? "upload" : "publish";
  const result = await consumeRateLimit(`${bucket}:${ipPrefix(req)}`, bucket === "auth" ? 12 : 30, bucket === "auth" ? 15 * 60_000 : 60 * 60_000);
  const identity =
    typeof req.body?.email === "string"
      ? privacyHash(req.body.email.trim().toLowerCase())
      : null;
  const identityResult = identity
    ? await consumeRateLimit(`${bucket}:account:${identity}`, bucket === "auth" ? 8 : 30, bucket === "auth" ? 15 * 60_000 : 60 * 60_000)
    : null;
  if (!result.allowed || identityResult?.allowed === false) {
    await auditSecurityEvent(req, "rate_limit_failure", null, { bucket });
    res.setHeader("Retry-After", String(Math.max(result.retryAfter, identityResult?.retryAfter ?? 0)));
    res.status(429).json({ error: "Too many requests. Please wait and try again." });
    return;
  }
  next();
});

app.use("/api/contact", contactRouter);
app.use("/api/auth", authRouter);
app.use("/api", healthRouter);
app.use(socialPreviewRouter);
app.use("/api", requireAuth, router);

export default app;
