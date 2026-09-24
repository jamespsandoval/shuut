---
name: Selectable post text
description: Keep transcript selection independent of post navigation on web and native.
---

SHÜÜT transcripts should support browser highlighting and native long-press text selection so people can copy excerpts into other apps. Feed SHÜÜTs should also open in full when tapped or clicked, without a separate “View full SHÜÜT” label.

**Why:** A tap-to-navigate wrapper can intercept a selection gesture or leave users on another screen before they can copy the text. The creator later explicitly requested clickable posts in place of the separate link, so preserve both behaviors.

**How to apply:** On web, ignore card navigation after text selection and from playback or action controls. On native, keep transcript text selectable while supporting a tap to open the post. Check both excerpt and full-post views; never let card navigation hijack replies, reactions, playback, or reSHÜÜT actions.