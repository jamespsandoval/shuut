import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import contactRouter from "./routes/contact";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { requireAuth, sessionAuth } from "./middlewares/sessionAuth";

const app: Express = express();

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

app.use("/api/contact", contactRouter);
app.use("/api/auth", authRouter);
app.use("/api", healthRouter);
app.use("/api", requireAuth, router);

export default app;
