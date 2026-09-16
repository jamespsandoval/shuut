---
name: Native recording transition
description: Preventing a blue microphone flash when entering the automatic native recorder.
---

Keep the blue microphone on the feed, but cover the feed with a recorder-matched frame before opening the dedicated root-stack recording screen.

**Why:** State updates and navigation issued from the same tap are batched, so the replacement state may never paint before iOS snapshots the outgoing feed. Changing navigators alone did not stop the flicker.

**How to apply:** Do not change the feed microphone after tap. Commit an opaque recording cover, allow it to paint, then route to the root recording screen with animation and gestures disabled. Never render a microphone on the destination.