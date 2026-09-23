import { desc, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { db, voiceAiConsentsTable } from "@workspace/db";
import { getAuthenticatedUserId } from "../middlewares/sessionAuth";

export const CURRENT_VOICE_AI_CONSENT_VERSION = "2026-09-23.1" as const;
export const VOICE_AI_CONSENT_CONTENT_HASH =
  "sha256:e80464704446453231ff7166a5412d14324641a4da483e35bef73c4db6214f3c";
export const VOICE_AI_CONSENT_SUMMARY =
  "Voice AI is used to transcribe and clean up your voice content.";
export const VOICE_AI_CONSENT_DETAILS = [
  "ElevenLabs processes audio for speech-to-text transcription.",
  "Transcripts are lightly edited using Replit-managed OpenAI model access to remove filler words and false starts and improve punctuation and grammar without changing your meaning.",
  "Audio and transcripts are stored privately in App Storage.",
  "Depending on applicable provider terms and account settings, submitted data may be used to improve provider models or services.",
  "Providers and their subprocessors may process data in the United States and other countries.",
  "You can revoke consent for future processing at any time; existing content remains.",
  "See the Privacy Policy at /privacy for details.",
] as const;
export const VOICE_AI_CONSENT_CANONICAL_PAYLOAD =
  `${VOICE_AI_CONSENT_SUMMARY}\n${VOICE_AI_CONSENT_DETAILS.join("\n")}`;
export type VoiceAiConsentSource = "web" | "native" | "ios" | "android";

export async function getVoiceAiConsentStatus(userId: string) {
  const rows = await db.select().from(voiceAiConsentsTable)
    .where(eq(voiceAiConsentsTable.userId, userId))
    .orderBy(desc(voiceAiConsentsTable.acceptedAt));
  const current = rows.find((row) =>
    row.consentVersion === CURRENT_VOICE_AI_CONSENT_VERSION
    && row.consentContentHash === VOICE_AI_CONSENT_CONTENT_HASH
    && !row.revokedAt);
  const latest = rows[0];
  const latestCurrentVersion = rows.find((row) => row.consentVersion === CURRENT_VOICE_AI_CONSENT_VERSION);
  return {
    required: !current || Boolean(current.revokedAt),
    currentVersion: CURRENT_VOICE_AI_CONSENT_VERSION,
    acceptedVersion: current?.consentVersion ?? latest?.consentVersion ?? null,
    acceptedContentHash: current?.consentContentHash ?? null,
    currentContentHash: VOICE_AI_CONSENT_CONTENT_HASH,
    acceptedAt: current?.acceptedAt?.toISOString() ?? latestCurrentVersion?.acceptedAt?.toISOString() ?? latest?.acceptedAt?.toISOString() ?? null,
    revokedAt: latestCurrentVersion?.revokedAt?.toISOString() ?? null,
    canRevoke: Boolean(current),
    summary: VOICE_AI_CONSENT_SUMMARY,
    details: [...VOICE_AI_CONSENT_DETAILS],
  };
}

export async function hasCurrentVoiceAiConsent(userId: string) {
  return !(await getVoiceAiConsentStatus(userId)).required;
}

export class VoiceAiConsentRequiredError extends Error {
  code = "VOICE_AI_CONSENT_REQUIRED" as const;
  constructor() { super("Accept the current Voice AI disclosure to continue."); }
}

export async function requireCurrentVoiceAiConsent(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (!(await hasCurrentVoiceAiConsent(userId))) {
    res.status(403).json({ error: "Accept the current Voice AI disclosure to continue.", code: "VOICE_AI_CONSENT_REQUIRED" });
    return false;
  }
  return true;
}