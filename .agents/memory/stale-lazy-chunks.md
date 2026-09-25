---
name: Stale lazy chunks
description: Why an open SHÜÜT tab can fail on first navigation to a lazy-loaded route after a new publish.
---

A missing hashed JavaScript asset on the published site can receive an HTML SPA fallback with HTTP 200 rather than a 404. An old open tab may therefore fail to load a lazy route after a new version is published. A successful document response does not establish that its route chunk is still available; check the chunk's content type.

**Why:** The reported profile navigation reached the route but displayed the client error boundary, while deployment logs showed no matching authenticated profile API request. A deliberately nonexistent production JavaScript asset returned `text/html`, consistent with failure before the page component mounted. This is a likely explanation, not a captured browser exception.

**How to apply:** Keep one-time stale-chunk recovery bounded by the loaded bundle so a broken release cannot reload forever. A tab still running a release from before that recovery was added must be reloaded manually once; publishing new code cannot update JavaScript already running in the tab.