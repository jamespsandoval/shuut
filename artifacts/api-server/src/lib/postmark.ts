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