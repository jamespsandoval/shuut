---
name: Voice moderation safety
description: Durable policy and concurrency rules for moderating SHÜÜT voice posts and comments.
---

Only transcript-ready content with an approved current moderation revision may be distributed or acted on. Provider failures stay private and retry durably; exhausted jobs require an explicit operator retry.

**Why:** Detached or fail-open moderation can publish unsafe content, while stale workers can approve an edited transcript. Lease ownership, content hashes, and revision checks must fence every result and side effect.

**How to apply:** Route every feed, direct read, audio, share, Ask, notification, and social write through the same distributability rule. Do not add a bypass for a new surface.

Legacy transcript-ready posts that have no moderation job must be queued for ordinary consent-checked review, not shown merely because they predate the moderation system. Exhausted jobs still require explicit operator retry.

**Why:** An empty feed can mean nothing has cleared review, not that chronological feed selection is broken. Treating older pending content as automatically approved would defeat fail-closed moderation.

**How to apply:** Reconcile missing jobs idempotently for pending active posts only. Keep failed/quarantined/removed content private; preserve operator control over exhausted attempts.

Voice-AI consent validity is the combination of the current disclosure version and its server-owned content hash. Recheck that exact current consent immediately before every external provider dispatch, including transcription and transcript moderation; request-time or upload-time checks are not sufficient.

**Why:** Consent can be revoked or a disclosure can change while audio is uploading or a moderation job is queued. A one-time checkbox remains valid only for the exact disclosure accepted and only until revocation.

**How to apply:** Keep unknown consent states fail-closed, bind accepted records to version plus hash, and check again at the final network boundary before bytes or transcripts leave SHÜÜT.

Moderation removals hide content immediately but retain source audio for a 30-day appeal window. Appeal submission and cleanup scheduling must lock the same case row before checking eligibility or queueing deletion.

**Why:** Deleting source audio before an appeal is decided makes a successful restoration impossible; checking appeals before locking leaves a race that can still delete accepted appeals.

**How to apply:** Preserve report evidence separately, pause cleanup for open appeals, and queue source deletion only after the appeal window closes and no open appeal exists.