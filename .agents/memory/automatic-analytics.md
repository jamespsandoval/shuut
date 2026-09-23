---
name: Automatic limited analytics
description: Product decision on PostHog collection and the boundaries of analytics disclosures.
---

SHÜÜT's creator explicitly chose automatic PostHog product analytics rather than an opt-in control. Keep collection narrow and cookieless, identify authenticated users with an opaque account ID, and disclose current processing in the Terms, Privacy Policy, and Cookie Policy. Do not imply that potential future analytics providers are already active.

**Why:** The initial opt-in approach did not match the creator's direction. A disclosure is not a blanket exemption from applicable privacy obligations, so future expansions need review rather than silently enabling broader tracking.

**How to apply:** When modifying analytics or policy copy, preserve the automatic limited baseline unless the creator changes it, and review any new provider, cookies, replay, or capture features separately.

## Automated browser checks

PostHog may classify the automated preview/testing browser as a bot and suppress captures before a network request. An absent ingestion request in that browser alone does not prove human visits fail.

**Why:** The test browser reported the SDK initialized and application capture calls ran, but the SDK identified that browser as a bot. Even a test-only bot bypass did not establish delivery, so treat this as a verification limitation rather than a confirmed production cause.

**How to apply:** For missing analytics, inspect pageview configuration and build-time configuration first; verify ingestion with a normal browser against the published site, without enabling bot tracking in production.