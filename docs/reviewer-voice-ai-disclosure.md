# Reviewer disclosure: voice-AI consent and data flow

This document explains the implemented flow for reviewer use. It is supporting material, not a submitted store privacy label.

## Where the consent prompt appears

The versioned voice-AI consent prompt is presented in the authenticated voice-AI flow on both web and native when the current consent is missing or has been revoked, before the protected voice operation can be retried. The web and native legal/policy gates also link the current policies; native policy pages open inside the app. The prompt/version is the record of voice-AI consent, rather than continued use of SHÜÜT.

## Required action and microphone timing

The user must take the affirmative consent action in the prompt before voice-AI processing. The user must separately grant the operating system/browser microphone permission when recording. Microphone capture begins only when the user starts recording, not merely when the prompt or recorder is displayed. The user can review, edit where offered, and choose whether to publish or send the recording.

## Processing sequence

After a recording is submitted, private audio is stored and can be sent to ElevenLabs for speech-to-text. Transcript text can then be sent for automated safety classification using OpenAI models through Replit-managed AI integrations. Transcription and moderation are asynchronous and may complete after the user leaves the recording screen. A recording can remain private; private audio and its generated transcript are still processed for the requested service and safety purposes. The supplied ElevenLabs terms permit provider model improvement and describe a prospective account opt-out, but no applicable UK/EEA agreement or account opt-out was evidenced. The conservative App Store answer therefore includes Other Purposes for voice and transcript data.

## Revocation and deletion limits

Users can revoke voice-AI consent through the available privacy/account controls. Revocation stops future voice processing and SHÜÜT sends no new audio after revocation. It does not retract content already submitted or already processed. Current provider calls expose no per-request deletion ID, so SHÜÜT cannot promise immediate provider-side erasure. ElevenLabs’ public self-serve terms do not guarantee deletion after a set inactivity period, and backup purge follows an unpublished standard schedule. OpenAI’s default API abuse-monitoring period can be up to 30 days, but SHÜÜT accesses OpenAI through Replit-managed AI Integrations and cannot claim that optional zero-retention or regional controls are enabled.

Deleting an account queues private audio and avatar cleanup and removes profile data, posts, comments, transcripts, current automated moderation jobs, and consent records after cleanup succeeds. Unlinked private uploads are cleaned up after signed-upload expiry and retries. Moderation-removed source audio is retained 30 days for appeal; reports, moderation, security/audit, and legal records may remain or be anonymized when needed. Backups and provider-held copies follow applicable schedules.

Provider terms, locations, safeguards, and the limits of public verification are recorded in [`provider-privacy-verification.md`](provider-privacy-verification.md).

The prompt and this disclosure do not claim that continued use alone is consent to a privacy or voice-AI change.