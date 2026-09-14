---
name: Workspace React singletons
description: Production bundling constraint for React context libraries imported by linked workspace packages.
---

React context libraries used by both the SHÜÜT app and linked workspace packages must resolve to one production-bundle instance.

**Why:** Development module resolution hid a duplicate React Query instance. The production provider and generated hooks then used different contexts, causing an immediate “No QueryClient set” crash.

**How to apply:** When adding a context-based dependency to a linked workspace package, ensure the app's Vite dedupe configuration includes it and inspect the production bundle when behavior differs between development and publishing.