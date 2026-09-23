const MODEL = "gpt-5-mini";

export interface TranscriptPolishProvider {
  polish(transcript: string): Promise<string>;
}

class OpenAITranscriptPolishProvider implements TranscriptPolishProvider {
  async polish(transcript: string): Promise<string> {
    const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!baseUrl || !apiKey) throw new Error("transcript_polish_not_configured");

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
    if (!response.ok) throw new Error(`transcript_polish_http_${response.status}`);

    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("transcript_polish_empty");
    const parsed = JSON.parse(content) as { text?: unknown };
    if (typeof parsed.text !== "string" || !parsed.text.trim()) {
      throw new Error("transcript_polish_invalid");
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

export async function polishTranscript(rawTranscript: string): Promise<string> {
  const raw = rawTranscript.trim();
  if (!raw) throw new Error("Transcription was empty");

  try {
    const polished = await provider.polish(raw);
    // Reject unexpectedly destructive or expansive rewrites. A raw transcript
    // remains usable and is safer than blocking publication on a second AI call.
    if (polished.length < raw.length * 0.35 || polished.length > raw.length * 1.5) {
      return raw;
    }
    return polished;
  } catch {
    return raw;
  }
}