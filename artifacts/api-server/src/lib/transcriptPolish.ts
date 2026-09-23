import { logger } from "./logger";

const MODEL = "gpt-5-mini";

export type TranscriptPolishResult = {
  transcript: string;
  status: "cleaned" | "raw";
};

class TranscriptPolishFailure extends Error {
  constructor(
    readonly reason: "not_configured" | "http" | "empty" | "invalid",
    readonly httpStatus?: number,
  ) {
    super(`transcript_polish_${reason}`);
  }
}

export interface TranscriptPolishProvider {
  polish(transcript: string): Promise<string>;
}

class OpenAITranscriptPolishProvider implements TranscriptPolishProvider {
  async polish(transcript: string): Promise<string> {
    const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!baseUrl || !apiKey) throw new TranscriptPolishFailure("not_configured");

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Lightly edit a speech transcript for public display.",
              "Remove filler words such as um, uh, er, and repeated discourse fillers such as you know when they add no meaning.",
              "Collapse stutters, accidental word repetitions, and abandoned false starts.",
              "Correct punctuation, capitalization, and obvious grammar errors.",
              "Preserve the speaker's meaning, tone, first-person perspective, names, places, numbers, opinions, and level of certainty.",
              "Do not summarize, add facts, sanitize opinions, make the writing formal, or replace meaningful pauses and repetitions used for emphasis.",
              'Return JSON only in the form {"text":"cleaned transcript"}.',
            ].join(" "),
          },
          { role: "user", content: transcript },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new TranscriptPolishFailure("http", response.status);

    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new TranscriptPolishFailure("empty");
    let parsed: { text?: unknown };
    try {
      parsed = JSON.parse(content) as { text?: unknown };
    } catch {
      throw new TranscriptPolishFailure("invalid");
    }
    if (typeof parsed.text !== "string" || !parsed.text.trim()) {
      throw new TranscriptPolishFailure("invalid");
    }
    return parsed.text.trim();
  }
}

let provider: TranscriptPolishProvider = new OpenAITranscriptPolishProvider();

export function setTranscriptPolishProviderForTests(next: TranscriptPolishProvider) {
  const previous = provider;
  provider = next;
  return previous;
}

function useRawTranscript(raw: string, reason: string, httpStatus?: number): TranscriptPolishResult {
  // Log only a bounded failure category, never the transcript or provider response.
  logger.warn({ reason, ...(httpStatus ? { httpStatus } : {}) }, "Transcript cleanup failed; raw text requires author approval");
  return { transcript: raw, status: "raw" };
}

export async function polishTranscript(rawTranscript: string): Promise<TranscriptPolishResult> {
  const raw = rawTranscript.trim();
  if (!raw) throw new Error("Transcription was empty");

  try {
    const polished = await provider.polish(raw);
    if (!polished.trim()) return useRawTranscript(raw, "empty");
    // Avoid publishing a destructive rewrite; the author must explicitly choose raw text.
    if (polished.length < raw.length * 0.35 || polished.length > raw.length * 1.5) {
      return useRawTranscript(raw, "length_guard");
    }
    if (polished.trim() === raw && /\b(?:uh|um|erm|er)\b/i.test(raw)) {
      return useRawTranscript(raw, "unchanged_with_fillers");
    }
    return { transcript: polished.trim(), status: "cleaned" };
  } catch (error) {
    const reason = error instanceof TranscriptPolishFailure
      ? error.reason
      : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "timeout"
        : "provider_error";
    return useRawTranscript(raw, reason, error instanceof TranscriptPolishFailure ? error.httpStatus : undefined);
  }
}