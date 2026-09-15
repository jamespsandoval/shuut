export async function sendPostmarkEmail(input: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
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
      From: "admin@shuut.me",
      To: input.to,
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
    "SHÜÜT — Voice notes for real conversations.",
    "This inbox isn’t monitored, so please don’t reply to this email.",
  ].filter((line) => line !== null).join("\n");
  const safePreview = escapeHtml(`${content.message} ${content.action}`);
  const safeTiming = timing ? escapeHtml(timing) : "";
  const accent = content.urgent ? "#b94224" : "#a24728";
  const panelBackground = content.urgent ? "#fff0ea" : "#faf4ef";

  const htmlBody = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f2ec;color:#1f1d1a;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreview}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f5f2ec;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #ded8ce;border-radius:18px;">
          <tr>
            <td style="padding:28px 28px 18px;border-bottom:1px solid #eee9e1;">
              <div style="font-size:25px;line-height:30px;font-weight:800;letter-spacing:-0.6px;color:#1f1d1a;">SH<span style="color:#ef6a3a;">ÜÜ</span>T</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 30px;">
              <div style="margin:0 0 10px;color:${accent};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;">${escapeHtml(content.eyebrow)}</div>
              <h1 style="margin:0 0 12px;color:#1f1d1a;font-size:29px;line-height:36px;font-weight:750;letter-spacing:-0.5px;">${escapeHtml(content.heading)}</h1>
              <p style="margin:0 0 18px;color:#5f5a52;font-size:16px;line-height:25px;">${escapeHtml(content.message)}</p>
              ${safeTiming ? `<p style="margin:0 0 22px;color:#1f1d1a;font-size:16px;line-height:25px;font-weight:700;">${safeTiming}</p>` : ""}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:${panelBackground};border-left:4px solid ${accent};border-radius:8px;">
                <tr>
                  <td style="padding:16px;color:#5f5149;font-size:14px;line-height:21px;"><strong style="color:#1f1d1a;">${content.urgent ? "Act now if you don’t recognize this." : "What happens next"}</strong><br>${escapeHtml(content.action)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 24px;border-top:1px solid #eee9e1;color:#827b71;font-size:12px;line-height:18px;">
              <strong style="color:#5f5a52;">SHÜÜT</strong> — Voice notes for real conversations.<br>
              This inbox isn’t monitored, so please don’t reply.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: content.subject, textBody, htmlBody };
}

export async function sendSecurityNotificationEmail(input: SecurityNotificationInput): Promise<void> {
  await sendPostmarkEmail({
    to: input.to,
    ...securityNotificationEmail(input),
  });
}