import { Router, type IRouter } from "express";
import {
  SendContactMessageBody,
  SendContactMessageResponse,
} from "@workspace/api-zod";
import { sendPostmarkEmail } from "../lib/postmark";
import { escapeHtml, renderEmailHtml } from "../lib/emailTemplate";

const router: IRouter = Router();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_MESSAGES_PER_WINDOW = 5;
const attempts = new Map<string, number[]>();
const CONTACT_RECIPIENT = "james@shuut.me";

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

  try {
    const isIssueReport = body.data.reportType === "issue";
    const subject = isIssueReport
      ? "SHÜÜT web issue report"
      : `SHÜÜT contact from ${body.data.firstName} ${body.data.lastName}`;
    const textBody = [
      `Name: ${body.data.firstName} ${body.data.lastName}`,
      `Email: ${body.data.email}`,
      "",
      body.data.message,
    ].join("\n");

    const bodyHtml = `
      <p style="margin:0 0 8px;color:#6B7280;"><strong>Name:</strong> <span style="color:#111827;">${escapeHtml(body.data.firstName)} ${escapeHtml(body.data.lastName)}</span></p>
      <p style="margin:0 0 24px;color:#6B7280;"><strong>Email:</strong> <span style="color:#111827;">${escapeHtml(body.data.email)}</span></p>
      <div style="padding:20px;background-color:#F3F4F6;border-radius:12px;color:#111827;white-space:pre-wrap;font-size:15px;line-height:24px;">${escapeHtml(body.data.message)}</div>
    `;

    const htmlBody = renderEmailHtml({
      title: subject,
      previewText: body.data.message.slice(0, 100),
      eyebrow: isIssueReport ? "ISSUE REPORT" : "CONTACT MESSAGE",
      heading: isIssueReport ? "New SHÜÜT Issue Report" : "New Contact Message",
      bodyHtml,
      urgent: isIssueReport,
    });

    await sendPostmarkEmail({
      to: CONTACT_RECIPIENT,
      replyTo: body.data.email,
      subject,
      textBody,
      htmlBody,
    });

    res.json(SendContactMessageResponse.parse({ sent: true }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to send contact email");
    res.status(502).json({ error: "Your message could not be sent. Please try again." });
  }
});

export default router;
