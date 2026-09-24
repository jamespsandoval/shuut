---
name: Static public-page entries
description: Why a standalone public HTML response needs special handling in the SPA
---

Public routes that need to be readable without JavaScript should have a real static HTML response containing truthful visible content, rather than relying on React effects or crawler JavaScript execution. Keep that response compatible with the existing client router so native WebViews and browser links still show the interactive page.

**Why:** The site's static SPA fallback otherwise serves homepage metadata and an empty mount point on direct public-page requests. A route-specific HTML entry starts with its own metadata; without explicitly restoring normal shell metadata when leaving that route through SPA navigation, the next page inherits the previous route's title and canonical.

**How to apply:** When adding similar public routes, check both direct response bytes and client navigation in and out of the route, including native query parameters. If key facts are repeated in fallback HTML and React, verify they remain consistent.