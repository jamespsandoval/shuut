---
name: Transcript cleanup consent
description: Why SHÜÜT must distinguish successful text cleanup from raw transcript fallback before publication.
---

Prepare transcription before publishing a new voice note, even for authors who have disabled transcript preview. Successful cleanup may remain hidden in that mode, but a failed cleanup must show the raw text only after an explicit Yes/Cancel decision; Cancel retains the recording and does not publish. Voice comments and reSHÜÜTs processed in the background must fail rather than present raw text as cleaned.

**Why:** The old cleanup swallowed AI failures and destructive/no-op rewrites, which made an unedited raw transcript appear successfully processed in published content. A no-preview publish cannot offer meaningful consent after it is already public.

**How to apply:** Preserve the original audio. Carry an explicit cleanup outcome through server and clients, log only bounded failure categories (not speech or provider responses), and keep the post unpublished until the author accepts raw text or cleanup succeeds. Do not retroactively rewrite old posts without proof they were not manually edited.