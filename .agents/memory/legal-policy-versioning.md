---
name: Legal policy versioning
description: Rules for changing consent-gated Terms or Community Guidelines without recording consent to unseen text.
---

Any policy text change must bump the corresponding current version and update its server-owned content hash in the same release. Routine updates do not invalidate an existing acceptance. Only versions explicitly designated as materially changing member rights or responsibilities require fresh consent.

**Why:** Accepting whichever policy happens to be current at click time can record consent to text the member never reviewed during a deployment race. A stored hash preserves evidence of the accepted text, while separating routine updates from material re-consent avoids blocking established members unnecessarily.

**How to apply:** Update the displayed effective date, canonical version, and canonical content hash together. If legal review requires fresh explicit consent, also designate that exact version for re-consent. Regenerate the API client when the acceptance contract changes, and retain old acceptance rows as immutable history.