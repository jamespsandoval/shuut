---
name: Selectable post text
description: Keep transcript selection independent of post navigation on web and native.
---

SHÜÜT transcripts should support browser highlighting and native long-press text selection so people can copy excerpts into other apps. Navigate to a post through a separate visible control rather than making the transcript or its enclosing card one large tap target. Feed excerpts can stay shortened if the full detail view exposes selectable text.

**Why:** A tap-to-navigate wrapper can intercept a selection gesture or leave users on another screen before they can copy the text.

**How to apply:** Preserve selection behavior whenever changing post, profile, or feed card interactions; check both excerpt and full-post views.