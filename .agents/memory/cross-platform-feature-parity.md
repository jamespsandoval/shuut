---
name: Cross-platform feature parity
description: Covers the expectation that SHÜÜT product features remain available across native and desktop web.
---

When adding a user-facing feature to the native SHÜÜT app, also add the corresponding desktop web experience unless the feature is inherently device-specific.

**Why:** The product is expected to remain functionally consistent across its native and desktop clients; native Notifications existed while desktop navigation and routing did not.

**How to apply:** During feature work, inspect both clients for the equivalent entry point, route, states, and API behavior. Keep platform-specific presentation while preserving feature availability.