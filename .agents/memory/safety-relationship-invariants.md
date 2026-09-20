---
name: Safety relationship invariants
description: Durable rules for account blocks, follows, reports, and preserved moderation evidence.
---

Account blocks are mutual for visibility and interaction authorization, regardless of which account initiated the block. Blocking removes follow edges in both directions; unblocking restores visibility but never restores a previous follow.

**Why:** A one-sided visibility model or a race between blocking and a social write can expose content or create interactions after a member has blocked another account.

**How to apply:** Store directional follows as per-viewer edges. Serialize block creation and every cross-account social write with the same ordered pair lock, then recheck the block inside the mutation transaction.

Reports preserve immutable snapshots of the reported text/profile and a private copy of reported audio. Validate the target, reject self/duplicate/rate-limited reports, and only then copy audio evidence; delete race-loser copies immediately.

**Why:** Source content and accounts can be deleted, while premature evidence copying creates orphaned private data and storage-abuse risk.

**How to apply:** Never expose evidence paths or reporter identity through member APIs. Source cleanup must not delete report evidence; duplicate-report conflict handling must clean any unused evidence copy.