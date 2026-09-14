import { Router, type IRouter } from "express";
import {
  SendContactMessageBody,
  SendContactMessageResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_MESSAGES_PER_WINDOW = 5;
const attempts = new Map<string, number[]>();

router.post("/", async (req, res): Promise<void> => {
  const body = SendContactMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Please complete every field correctly." });
    return;
  }

  if (body.data.website) {
    res.json(SendContactMessageResponse.parse({ sent: true }));
    return;
  }

  const now = Date.now();
  const key = req.ip || "unknown";
  const recentAttempts = (attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recentAttempts.length >= MAX_MESSAGES_PER_WINDOW) {
    res.status(429).json({ error: "Too many messages. Please try again later." });
    return;
  }
  attempts.set(key, [...recentAttempts, now]);

  const token = process.env.POSTMARK_API_KEY ?? process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    req.log.error("A Postmark server token is not configured");
    res.status(503).json({ error: "Contact email is temporarily unavailable." });
    return;
  }

  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: "admin@shuut.me",
        To: "admin@shuut.me",
        ReplyTo: body.data.email,
        Subject: `SHÜÜT contact from ${body.data.firstName} ${body.data.lastName}`,
        TextBody: [
          `Name: ${body.data.firstName} ${body.data.lastName}`,
          `Email: ${body.data.email}`,
          "",
          body.data.message,
        ].join("\n"),
        MessageStream: "outbound",
      }),
    });

    if (!response.ok) {
      const postmarkError = await response.text();
      req.log.error(
        { statusCode: response.status, postmarkError },
        "Postmark rejected contact email",
      );
      res.status(502).json({ error: "Your message could not be sent. Please try again." });
      return;
    }

    res.json(SendContactMessageResponse.parse({ sent: true }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to send contact email");
    res.status(502).json({ error: "Your message could not be sent. Please try again." });
  }
});

export default router;