---
name: Expo QR launch branding
description: Distinguishes Replit's QR loading card from the Expo app icon and splash screen.
---

The loading card shown after scanning Replit's Expo QR code can use the registered mobile artifact title and cached launch artwork, not only the Expo app configuration.

**Why:** Updating the Expo icon and splash did not remove an older waveform card because the mobile artifact registration still carried the original native-app identity.

**How to apply:** When QR launch branding is stale, verify both the Expo icon/splash source and the registered artifact metadata. Update artifact metadata through its validated workflow, then restart Expo and scan the newly generated QR code.