---
name: Legal policy versioning
description: Rules for changing consent-gated Terms or Community Guidelines without recording consent to unseen text.
---

Any material change to consent-gated Terms or Community Guidelines must bump the corresponding current version and update its server-owned content hash in the same release. Clients submit the exact versions shown to the member, and the server rejects stale pairs.

**Why:** Accepting whichever policy happens to be current at click time can record consent to text the member never reviewed during a deployment race. A stored hash also preserves evidence of the accepted policy content.

**How to apply:** When policy copy materially changes, update the displayed effective date, canonical version, and canonical content hash together. Regenerate the API client when the acceptance contract changes, and retain old acceptance rows as immutable history.