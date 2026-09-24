---
name: Postmark sender configuration
description: Confirmed sender-domain status for SHÜÜT customer emails.
---

The `shuut.me` domain is verified in Postmark and configured for domain-wide sending. The Postmark domain screen confirmed that both DKIM and the custom Return-Path were verified on September 16, 2026.

**Why:** The user explicitly confirmed the sender setup and later supplied evidence that DKIM and Return-Path verification were complete, removing the external authentication blocker for customer email delivery.

**How to apply:** Customer-facing authentication emails may use the configured `shuut.me` sender. Treat future delivery problems as reputation, recipient filtering, or runtime issues before assuming domain authentication is missing.

Keep the contact form's destination address server-only, including on error and recovery screens.

**Why:** The creator explicitly asked for contact messages to reach the private recipient without disclosing that address to visitors.

**How to apply:** Route contact and issue-report messages through the server's email integration; use generic public failure text and verify the recipient is absent from client source and bundles.