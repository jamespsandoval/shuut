---
name: Native public-page navigation
description: How public web pages should appear and return inside the native app without duplicate browser controls.
---

Public pages opened from the native app must render in an embedded web view without native browser chrome. Keep the webpage's single back control and intercept homepage navigation to return to the native app.

**Why:** Safari adds an X and title under the Dynamic Island while the webpage adds its own back arrow. Navigating home within either browser container leaves stale public-page chrome over the homepage.

**How to apply:** Add new public pages to the shared native embedded-page route, use the current web artifact in development and the published site in production, apply native safe-area insets around the web view, and intercept home navigation.