---
name: Web logout navigation
description: Why desktop web logout must use a full homepage replacement instead of client-side routing.
---

After a web logout settles, clear user-scoped query state and replace the browser location with the artifact-aware homepage URL. Do not rely on a soft client-side route change.

**Why:** The authentication query can expose the previous signed-in user for one render after logout. A soft navigation to the homepage can therefore trigger the signed-in redirect back to the feed, leaving a logged-out feed shell with failed requests.

**How to apply:** Use this rule for explicit logout and completed account deletion on the web client. Keep the destination compatible with both root production hosting and path-based artifact previews.