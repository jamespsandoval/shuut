---
name: Development recording interruptions
description: Why routine dev-server restarts must account for active web voice recording and transcription.
---

Avoid restarting the web development workflow while someone may be recording or preparing a voice note. Use Vite hot reload for ordinary frontend edits; if a restart is essential, coordinate a safe moment first. An interrupted transcription is not a published post, even when its audio upload succeeded.

**Why:** A development workflow restart coincided with a real recording attempt, reloaded the page, and aborted the transcription request after the audio had uploaded. The user lost the in-progress flow before any publish request was made.

**How to apply:** Check whether a creator may be using the development preview before restarting. Treat a stopped local recording as a recoverable, reviewable draft after reload, never as permission to publish automatically. Distinguish the uploaded but unpublished recording from a successfully created post when diagnosing logs.