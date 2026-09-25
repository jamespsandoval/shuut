---
name: App Review fixtures
description: Safety boundary for App Store reviewer accounts and representative review data.
---

Fictional App Review profiles, posts, comments, and audio fixtures must only be created in a staging/review database. Production execution must fail closed. The production reviewer account must be registered, email-verified, and onboarded through the real email-code flow; reviewers can then use a time-limited password restricted to that account, with normal email-code sign-in still available. They create any review activity themselves.

**Why:** Seeded fictional activity would contaminate the shared production feed. A forwarding-only mailbox cannot give Apple unattended access to fresh one-use codes, so the creator approved a separate reviewer password and a new iPhone build. Email ownership, onboarding, and consent must not be fabricated. The creator confirmed the native development password flow works with the verified development account; that does not establish that the separate production account or signed iPhone build is ready.

**How to apply:** Keep reviewer fixture commands staging-gated. For App Store submission, put the review password only in secure configuration and App Store Connect, require the verified account before password login, and leave account setup, signed-build verification, and submission metadata as manual release-owner evidence. Keep the browser web app email-code-only; the password field belongs in the native app. A short, separately expiring development opt-in can test that native flow against a development account, but it cannot verify the production account. Remove password access after review and replace existing sessions through a fresh email-code login.