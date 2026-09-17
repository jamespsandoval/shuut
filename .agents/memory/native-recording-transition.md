---
name: Native recording transitions
description: Lifecycle rules for entering and leaving the automatic native recorder safely.
---

Keep the blue microphone on the feed, but cover the feed with a recorder-matched frame before opening the dedicated root-stack recording screen.

**Why:** State updates and navigation issued from the same tap are batched, so the replacement state may never paint before iOS snapshots the outgoing feed. Changing navigators alone did not stop the flicker.

**How to apply:** Do not change the feed microphone after tap. Commit an opaque recording cover, allow it to paint, then route to the root recording screen with animation and gestures disabled. Never render a microphone on the destination.

After a successful post-creation response, navigate away from the recorder immediately. Refresh or poll for server transcription from the feed, after recorder-owned native audio resources are no longer involved.

**Why:** Keeping the recorder mounted during repeated transcription polling leaves iOS audio-session, recorder, and preview-player cleanup coupled to eventual navigation. The post can publish successfully while that native lifecycle transition crashes the client.

**How to apply:** Treat successful post creation as the recorder's completion boundary. Do not make navigation depend on transcription readiness, whether transcript preview is enabled or disabled. Make recorder stop and unmount cleanup idempotent.

Do not call preview-player source replacement with `null` when the native recording screen mounts. Leave an empty player untouched until a real recording URI exists.

**Why:** The TypeScript API accepts a nullable source, but invoking source replacement with `null` during iOS screen initialization can terminate the TestFlight app before microphone recording begins.

**How to apply:** Initialize the player without a source and only call source replacement after review audio exists. Avoid unnecessary player calls in empty-source mount and cleanup paths.