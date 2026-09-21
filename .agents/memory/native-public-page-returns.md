---
name: Native public-page navigation
description: How public web pages should appear and return inside the native app without duplicate browser controls.
---

Public pages opened from the native app must render in an embedded web view without native browser chrome. Keep the webpage's single back control and intercept homepage navigation to return to an explicit native route. Never use generic stack back-navigation for this return.

**Why:** Safari adds an X and title under the Dynamic Island while the webpage adds its own back arrow. Generic stack history may still contain a pre-authentication login route, making a return from public content appear to log out an authenticated user.

**How to apply:** Add new public pages to the shared native embedded-page route, pass an explicit return destination, preserve native context across links, use the current web artifact in development and the published site in production, apply native safe-area insets, and replace to the return route.

Authenticated Settings screens should present About, Community Guidelines, Privacy Policy, Terms of Service, and Help & Contact as full-width rows in a Legal & Support section, not as a small website-style footer. Keep Cookie Policy on the public website only.

**Why:** The creator chose fewer, larger, explicit destinations after repeated footer visibility and return-navigation failures in TestFlight.

**How to apply:** Keep the responsive web and native Settings implementations aligned, and route every row through the controlled public-page return flow.