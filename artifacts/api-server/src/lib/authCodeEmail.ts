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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
    content.instruction,
    "",
    code,
    "",
    `This code expires in ${expiresInMinutes} minutes.`,
    "",
    content.securityNote,
    "",
    "SHÜÜT — Voice notes for real conversations.",
    "This inbox isn’t monitored, so please don’t reply to this email.",
  ].join("\n");

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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.instruction)} This code expires in ${safeExpiry} minutes.</div>
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
              <div style="margin:0 0 10px;color:#a24728;font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;">${escapeHtml(content.eyebrow)}</div>
              <h1 style="margin:0 0 12px;color:#1f1d1a;font-size:29px;line-height:36px;font-weight:750;letter-spacing:-0.5px;">${escapeHtml(content.heading)}</h1>
              <p style="margin:0 0 26px;color:#5f5a52;font-size:16px;line-height:25px;">${escapeHtml(content.instruction)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#1f1d1a;border-radius:14px;">
                <tr>
                  <td align="center" style="padding:24px 12px 22px;">
                    <div aria-label="Your six digit code is ${safeCode}" style="color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:8px;white-space:nowrap;">${safeCode}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 26px;text-align:center;color:#736d64;font-size:14px;line-height:21px;">This code expires in <strong style="color:#1f1d1a;">${safeExpiry} minutes</strong>.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#faf4ef;border-left:4px solid #ef6a3a;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;color:#5f5149;font-size:14px;line-height:21px;">${escapeHtml(content.securityNote)}</td>
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

  return { htmlBody, textBody };
}