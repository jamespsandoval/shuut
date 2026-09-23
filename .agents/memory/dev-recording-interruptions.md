---
name: Development recording interruptions
description: Why routine dev-server restarts must account for active web voice recording and transcription.
---

Avoid restarting the web development workflow while someone may be recording or preparing a voice note. Use Vite hot reload for ordinary frontend edits; if a restart is essential, coordinate a safe moment first. An interrupted transcription is not a published post, even when its audio upload succeeded. Do not add persistent browser voice drafts solely to recover from occasional development reloads.

**Why:** A development workflow restart coincided with a real recording attempt, reloaded the page, and aborted the transcription request after the audio had uploaded. The creator explicitly said rare interruptions in development are acceptable and asked to remove the browser-draft recovery feature.

**How to apply:** Check whether a creator may be using the development preview before restarting. Keep normal in-page retry and review, but do not persist audio across reloads for this reason. Distinguish an uploaded but unpublished recording from a successfully created post when diagnosing logs.