import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  AcceptVoiceAiConsentBody,
  AcceptVoiceAiConsentResponse,
  GetVoiceAiConsentResponse,
  RevokeVoiceAiConsentResponse,
} from "@workspace/api-zod";
import { db, voiceAiConsentsTable } from "@workspace/db";
import { getAuthenticatedUserId } from "../middlewares/sessionAuth";
import { auditSecurityEvent } from "../lib/security";
import {
  CURRENT_VOICE_AI_CONSENT_VERSION,
  VOICE_AI_CONSENT_CONTENT_HASH,
  getVoiceAiConsentStatus,
} from "../lib/voiceAiConsent";

const router: IRouter = Router();
function userId(req: Request) {
  return getAuthenticatedUserId(req);
}

router.get("/voice-ai-consent", async (req, res): Promise<void> => {
  const id = userId(req);
  if (!id) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json(GetVoiceAiConsentResponse.parse(await getVoiceAiConsentStatus(id)));
});

router.post("/voice-ai-consent", async (req, res): Promise<void> => {
  const id = userId(req);
  if (!id) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = AcceptVoiceAiConsentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid consent request" }); return;
  }
  const { version, source } = body.data;
  if (version !== CURRENT_VOICE_AI_CONSENT_VERSION) {
    res.status(409).json({ error: "Consent version is no longer current.", code: "VOICE_AI_CONSENT_STALE" }); return;
  }
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: voiceAiConsentsTable.id })
      .from(voiceAiConsentsTable)
      .where(and(eq(voiceAiConsentsTable.userId, id), eq(voiceAiConsentsTable.consentVersion, version)))
      .limit(1);
    if (existing[0]) {
      await tx.update(voiceAiConsentsTable).set({
        acceptedAt: new Date(), revokedAt: null, source,
        consentContentHash: VOICE_AI_CONSENT_CONTENT_HASH,
      }).where(eq(voiceAiConsentsTable.id, existing[0].id));
    } else {
      await tx.insert(voiceAiConsentsTable).values({
        userId: id, consentVersion: version, consentContentHash: VOICE_AI_CONSENT_CONTENT_HASH,
        source,
      });
    }
  });
  await auditSecurityEvent(req, "voice_ai_consent_accept", id, { version, source });
  res.json(AcceptVoiceAiConsentResponse.parse(await getVoiceAiConsentStatus(id)));
});

router.delete("/voice-ai-consent", async (req, res): Promise<void> => {
  const id = userId(req);
  if (!id) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.update(voiceAiConsentsTable).set({ revokedAt: new Date() })
    .where(and(
      eq(voiceAiConsentsTable.userId, id),
      eq(voiceAiConsentsTable.consentVersion, CURRENT_VOICE_AI_CONSENT_VERSION),
    ));
  await auditSecurityEvent(req, "voice_ai_consent_revoke", id);
  res.json(RevokeVoiceAiConsentResponse.parse(await getVoiceAiConsentStatus(id)));
});

export default router;