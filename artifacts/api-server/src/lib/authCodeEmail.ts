import { escapeHtml, renderEmailHtml } from "./emailTemplate";

type AuthCodeEmailKind = "verification" | "sign-in" | "passkey-recovery";

type AuthCodeEmailInput = {
  code: string;
  kind: AuthCodeEmailKind;
  expiresInMinutes?: number;
};

type AuthCodeEmailContent = {
  htmlBody: string;
  textBody: string;
};

const CONTENT: Record<AuthCodeEmailKind, {
  eyebrow: string;
  heading: string;
  instruction: string;
  securityNote: string;
}> = {
  verification: {
    eyebrow: "ACCOUNT VERIFICATION",
    heading: "Confirm your email",
    instruction: "Enter this code in SHÜÜT to finish creating your account.",
    securityNote: "If you didn’t create a SHÜÜT account, you can safely ignore this email.",
  },
  "sign-in": {
    eyebrow: "SECURE SIGN-IN",
    heading: "Your sign-in code",
    instruction: "Enter this code in SHÜÜT to continue signing in.",
    securityNote: "If you didn’t request this code, you can safely ignore this email.",
  },
  "passkey-recovery": {
    eyebrow: "PASSKEY RECOVERY",
    heading: "Confirm passkey recovery",
    instruction: "Enter this code in SHÜÜT to complete passkey recovery.",
    securityNote: "Completing recovery removes all passkeys and signs out every existing session. If you didn’t request this, do not use this code.",
  },
};

export function authCodeEmail({
  code,
  kind,
  expiresInMinutes = 15,
}: AuthCodeEmailInput): AuthCodeEmailContent {
  const content = CONTENT[kind];
  const safeCode = escapeHtml(code);
  const safeExpiry = escapeHtml(String(expiresInMinutes));
  const textBody = [
    "SHÜÜT",
    "",
    content.heading,
    code,
    "",
    content.instruction,
    `This code expires in ${expiresInMinutes} minutes.`,
    "",
    content.securityNote,
    "",
    "SHÜÜT — Voice first. A more human feed.",
    "This inbox isn’t monitored, so please don’t reply to this email.",
  ].join("\n");

  const bodyHtml = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <div aria-label="Your six digit code is ${safeCode}" style="color:#111827;font-family:'Courier New',Courier,monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:8px;white-space:nowrap;">${safeCode}</div>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 8px;color:#6B7280;">${escapeHtml(content.instruction)}</p>
    <p style="margin:0 0 20px;text-align:center;color:#6B7280;font-size:14px;">This code expires in <strong style="color:#111827;">${safeExpiry} minutes</strong>.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#F3F4F6;border-left:4px solid #3B82F6;border-radius:8px;">
      <tr>
        <td style="padding:16px;color:#111827;font-size:14px;line-height:22px;">${escapeHtml(content.securityNote)}</td>
      </tr>
    </table>
  `;

  const htmlBody = renderEmailHtml({
    title: content.heading,
    previewText: `${content.instruction} This code expires in ${expiresInMinutes} minutes.`,
    eyebrow: content.eyebrow,
    heading: content.heading,
    bodyHtml,
    urgent: false,
    compact: true,
  });

  return { htmlBody, textBody };
}
