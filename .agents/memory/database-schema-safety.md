---
name: Database schema safety
description: Preserve seeded SHÜÜT content when authentication schema changes encounter legacy constraints.
---

Prefer additive authentication schema changes when the schema tool proposes truncating existing founder data to add a constraint on a legacy nullable identity column.

**Why:** The non-interactive schema push could not accept or reject the truncation prompt, and forcing the command still stopped at the same prompt. Removing the unnecessary legacy-column constraint allowed the additive account tables to apply without deleting seeded content.

**How to apply:** Keep uniqueness on the first-party account email. Do not approve founder-table truncation merely to constrain the optional account-to-founder link; use a safe additive constraint or migration only when concurrency requirements justify it.