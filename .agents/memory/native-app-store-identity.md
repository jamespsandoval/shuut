---
name: Native App Store identity
description: Release constraints for the existing Replit-published iOS listing and safe runtime configuration.
---

Keep the bundle identifier from the first Replit App Store upload. Replit treats that identifier as immutable for the project; using a different identifier requires a new project and App Store listing.

**Why:** A later repository value did not match the installed TestFlight binary. Official Replit documentation confirmed that the installed identity belongs to the existing listing and cannot be replaced in place.

**How to apply:** Validate release identity against the established listing. Embed essential public runtime configuration in the Expo manifest and validate it during build, but keep a safe canonical runtime fallback so a missing build-shell variable cannot abort before React renders.