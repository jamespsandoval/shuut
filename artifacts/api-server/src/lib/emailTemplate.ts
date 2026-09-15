export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type EmailTemplateOptions = {
  title: string;
  previewText: string;
  eyebrow?: string;
  heading: string;
  bodyHtml: string;
  urgent?: boolean;
};

export function renderEmailHtml(options: EmailTemplateOptions): string {
  const { title, previewText, eyebrow, heading, bodyHtml, urgent } = options;
  const accentColor = urgent ? "#EF4444" : "#3B82F6"; // Error or SHÜÜT Blue
  
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;color:#111827;font-family:Inter,Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(previewText)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#F3F4F6;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;">
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #E5E7EB;">
              <div style="font-size:28px;line-height:32px;font-weight:800;letter-spacing:-0.5px;color:#111827;">SH<span style="color:#3B82F6;">ÜÜ</span>T</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 40px;">
              ${eyebrow ? `<div style="margin:0 0 12px;color:${accentColor};font-size:13px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>` : ""}
              <h1 style="margin:0 0 16px;color:#111827;font-size:28px;line-height:36px;font-weight:700;letter-spacing:-0.5px;">${escapeHtml(heading)}</h1>
              <div style="color:#111827;font-size:16px;line-height:26px;">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #E5E7EB;color:#6B7280;font-size:13px;line-height:20px;">
              <strong style="color:#111827;">SHÜÜT</strong> — Voice first. A more human feed.<br>
              This inbox isn’t monitored, so please don’t reply.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
