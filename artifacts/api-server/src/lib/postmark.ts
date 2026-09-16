import { escapeHtml, renderEmailHtml } from "./emailTemplate";

export async function sendPostmarkEmail(input: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  replyTo?: string;
}): Promise<void> {
  const token = process.env.POSTMARK_API_KEY ?? process.env.POSTMARK_SERVER_TOKEN;
  if (!token) throw new Error("Postmark is not configured");

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: "James at SHÜÜT <james@shuut.me>",
      To: input.to,
      ...(input.replyTo ? { ReplyTo: input.replyTo } : {}),
      Subject: input.subject,
      TextBody: input.textBody,
      ...(input.htmlBody ? { HtmlBody: input.htmlBody } : {}),
      MessageStream: "outbound",
    }),
  });

  if (!response.ok) {
    throw new Error(`Postmark rejected email with status ${response.status}`);
  }
}

export type SecurityNotificationKind =
  | "passkey-removed"
  | "recovery-requested"
  | "recovery-completed"
  | "recovery-cancelled";

type SecurityNotificationInput = {
  to: string;
  kind: SecurityNotificationKind;
  availableAt?: string;
};

const SECURITY_NOTIFICATIONS: Record<SecurityNotificationKind, {
  subject: string;
  eyebrow: string;
  heading: string;
  message: string;
  action: string;
  urgent: boolean;
}> = {
  "passkey-removed": {
    subject: "A passkey was removed from your SHÜÜT account",
    eyebrow: "ACCOUNT SECURITY",
    heading: "A passkey was removed",
    message: "A passkey device was removed from your SHÜÜT account.",
    action: "If this was not you, start lost-passkey recovery immediately.",
    urgent: true,
  },
  "recovery-requested": {
    subject: "Passkey recovery requested for your SHÜÜT account",
    eyebrow: "PASSKEY RECOVERY",
    heading: "Recovery was requested",
    message: "Passkey recovery was requested for your SHÜÜT account.",
    action: "If this was not you, sign in with your passkey; your existing passkeys remain active.",
    urgent: true,
  },
  "recovery-completed": {
    subject: "Your SHÜÜT passkey recovery is complete",
    eyebrow: "PASSKEY RECOVERY",
    heading: "Recovery is complete",
    message: "All previous passkeys were removed and all sessions were signed out.",
    action: "You must now add a new passkey before using SHÜÜT.",
    urgent: false,
  },
  "recovery-cancelled": {
    subject: "SHÜÜT passkey recovery was cancelled",
    eyebrow: "PASSKEY RECOVERY",
    heading: "Recovery was cancelled",
    message: "A successful passkey verification cancelled the pending recovery request for your SHÜÜT account.",
    action: "Your existing passkeys remain active. No further action is needed.",
    urgent: false,
  },
};

export function securityNotificationEmail(input: Omit<SecurityNotificationInput, "to">): {
  subject: string;
  textBody: string;
  htmlBody: string;
} {
  const content = SECURITY_NOTIFICATIONS[input.kind];
  if (input.kind === "recovery-requested" && !input.availableAt) {
    throw new Error("Recovery request notifications require an available time");
  }
  const timing = input.kind === "recovery-requested"
    ? `It cannot be completed before ${input.availableAt}.`
    : null;
  const textBody = [
    "SHÜÜT",
    "",
    content.heading,
    content.message,
    timing,
    "",
    content.action,
    "",
    "SHÜÜT — Voice first. A more human feed.",
    "This inbox isn’t monitored, so please don’t reply to this email.",
  ].filter((line) => line !== null).join("\n");
  const safeTiming = timing ? escapeHtml(timing) : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#6B7280;">${escapeHtml(content.message)}</p>
    ${safeTiming ? `<p style="margin:0 0 24px;color:#111827;font-weight:600;">${safeTiming}</p>` : ""}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:${content.urgent ? "#FEF2F2" : "#F3F4F6"};border-left:4px solid ${content.urgent ? "#EF4444" : "#3B82F6"};border-radius:8px;">
      <tr>
        <td style="padding:16px;color:#111827;font-size:14px;line-height:22px;">
          <strong style="color:#111827;">${content.urgent ? "Act now if you don’t recognize this." : "What happens next"}</strong><br>
          <span style="color:#6B7280;">${escapeHtml(content.action)}</span>
        </td>
      </tr>
    </table>
  `;

  const htmlBody = renderEmailHtml({
    title: content.heading,
    previewText: `${content.message} ${content.action}`,
    eyebrow: content.eyebrow,
    heading: content.heading,
    bodyHtml,
    urgent: content.urgent,
  });

  return { subject: content.subject, textBody, htmlBody };
}

export async function sendSecurityNotificationEmail(input: SecurityNotificationInput): Promise<void> {
  await sendPostmarkEmail({
    to: input.to,
    ...securityNotificationEmail(input),
  });
}
