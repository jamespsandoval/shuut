---
name: Static public-page entries
description: Why a standalone public HTML response needs special handling in the SPA
---

Public routes that need to be readable without JavaScript should have a real static HTML response containing truthful visible content, rather than relying on React effects or crawler JavaScript execution. Keep that response compatible with the existing client router so native WebViews and browser links still show the interactive page.

**Why:** The site's static SPA fallback otherwise serves homepage metadata and an empty mount point on direct public-page requests. A route-specific HTML entry starts with its own metadata; without explicitly restoring normal shell metadata when leaving that route through SPA navigation, the next page inherits the previous route's title and canonical.

**How to apply:** When adding similar public routes, check both direct response bytes and client navigation in and out of the route, including native query parameters. If key facts are repeated in fallback HTML and React, verify they remain consistent.

Pre-rendered markup that uses utility CSS must have a render-blocking stylesheet in the HTML head. In this Vite dev setup, a plain link to the source CSS is served as a JavaScript module; the link needs the `?direct` query to receive `text/css`. Production builds rewrite the link to a compiled stylesheet.

**Why:** Importing CSS only from the client entry lets readable HTML paint before the app script runs, exposing an unstyled homepage with an oversized logo and misplaced text during refresh.

**How to apply:** When adding crawler-readable markup, inspect the initial HTML and the linked stylesheet's response type in development, then confirm the production HTML links a compiled CSS asset.