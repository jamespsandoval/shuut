---
name: Database schema safety
description: Preserve seeded SHÜÜT content when authentication schema changes encounter legacy constraints.
---

Prefer additive authentication schema changes when the schema tool proposes truncating existing founder data to add a constraint on a legacy nullable identity column.

**Why:** The non-interactive schema push could not accept or reject the truncation prompt, and forcing the command still stopped at the same prompt. Removing the unnecessary legacy-column constraint allowed the additive account tables to apply without deleting seeded content.

**How to apply:** Keep uniqueness on the first-party account email. Do not approve founder-table truncation merely to constrain the optional account-to-founder link; use a safe additive constraint or migration only when concurrency requirements justify it.

When changing the predicate of an existing unique index, verify the live development index after Drizzle push. A successful push can leave the old, unfiltered index intact; apply the reviewed, data-preserving migration before testing behavior that depends on the new predicate.

**Why:** Drizzle may report a successful push while retaining an existing index definition whose predicate changed in code.

**How to apply:** Inspect the actual index definition rather than assuming schema introspection applied a predicate change. Never force a push that proposes deleting founder content.