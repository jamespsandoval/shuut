---
name: Postmark sender configuration
description: Confirmed sender-domain status for SHÜÜT customer emails.
---

The `shuut.me` domain is verified in Postmark, and the account is configured to allow sending from addresses on that domain.

**Why:** The user explicitly confirmed this on September 14, 2026, removing the remaining external blocker for verification and password-reset email delivery.

**How to apply:** Customer-facing authentication emails may use the configured `shuut.me` sender. Treat delivery failures as runtime/configuration issues rather than assuming the sender domain still needs verification.