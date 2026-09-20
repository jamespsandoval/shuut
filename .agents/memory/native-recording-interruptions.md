---
name: Native recording interruptions
description: Safety policy for native microphone permission changes, app lifecycle interruptions, and audio-route changes.
---

Cancel any pending microphone start when the recorder loses focus, backgrounds, or unmounts. An interrupted voice post must stop without publishing and preserve recoverable local audio for explicit review. An interrupted voice comment may be discarded because it has no review screen, but the discard must be explicit and the user must be told to record again.

**Why:** Asynchronous permission and recorder preparation can complete after navigation or a system interruption. Without cancellation and explicit recovery states, capture can start detached, audio can be lost silently, or content can be submitted unexpectedly.

**How to apply:** Check a start generation after every awaited permission/audio step, disable background recording, restore playback mode after stopping, and never treat interruption recovery as permission to upload or publish. Validate calls, Siri, lock, route changes, revocation, and relaunch on a physical iPhone before release.