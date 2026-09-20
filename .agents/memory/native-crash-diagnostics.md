---
name: Native crash diagnostics
description: Provider choice and release-artifact policy for native crash reporting.
---

Keep native release diagnostics provider-neutral until the creator explicitly
chooses to connect Sentry. Do not leave a partially installed or unconfigured
crash SDK in production.

**Why:** The creator deferred Sentry setup. Native dSYMs and Hermes source maps
still need to be retained and tied to an immutable version/build release key so
they remain usable when a provider is connected.

**How to apply:** Preserve the provider-neutral archive and controlled
non-production crash probe. When Sentry is approved, add its Expo/Metro build
plugins, privacy-safe runtime configuration, automatic artifact upload, and a
real symbolication verification before release.