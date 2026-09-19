---
name: Native post-publish refresh
description: How native publishing should return to and refresh the feed without visible repeated loading.
---

Native posts created without a preview transcript remain in a processing state and are excluded from the feed until background transcription finishes. Poll for the specific new post silently and stop as soon as it appears. Do not bind those background requests to the native pull-to-refresh indicator.

**Why:** Fixed retry schedules made the feed’s loading wheel repeatedly enter and leave view after publishing. Replacing the pushed recorder with another feed route could also leave duplicate feed screens in navigation history.

**How to apply:** After publishing or cancelling, dismiss the recorder toward the existing feed route rather than replacing it with a new feed. Keep post-readiness polling bounded to the new post and visually separate from user-initiated refresh state.