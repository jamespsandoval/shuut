---
name: App Review fixtures
description: Safety boundary for App Store reviewer accounts and representative review data.
---

Fictional App Review profiles, posts, comments, and audio fixtures must only be created in a staging/review database. Production execution must fail closed. Production reviewers authenticate through the shipped email OTP flow and create any needed review activity themselves.

**Why:** Seeded fictional activity would be visible to normal members in the shared production feed, which would contaminate real community data. Production credentials, sessions, OTPs, and consent records must never be seeded or bypassed.

**How to apply:** Keep reviewer fixture commands explicitly invoked and staging-gated. For App Store submission, provide secure inbox access in App Store Connect, use the real OTP flow, and leave account creation, TestFlight verification, and submission metadata as manual release-owner evidence.