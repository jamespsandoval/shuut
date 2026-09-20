---
name: Voice moderation safety
description: Durable policy and concurrency rules for moderating SHÜÜT voice posts and comments.
---

Only transcript-ready content with an approved current moderation revision may be distributed or acted on. Provider failures stay private and retry durably; exhausted jobs require an explicit operator retry.

**Why:** Detached or fail-open moderation can publish unsafe content, while stale workers can approve an edited transcript. Lease ownership, content hashes, and revision checks must fence every result and side effect.

**How to apply:** Route every feed, direct read, audio, share, Ask, notification, and social write through the same distributability rule. Do not add a bypass for a new surface.

Moderation removals hide content immediately but retain source audio for a 30-day appeal window. Appeal submission and cleanup scheduling must lock the same case row before checking eligibility or queueing deletion.

**Why:** Deleting source audio before an appeal is decided makes a successful restoration impossible; checking appeals before locking leaves a race that can still delete accepted appeals.

**How to apply:** Preserve report evidence separately, pause cleanup for open appeals, and queue source deletion only after the appeal window closes and no open appeal exists.