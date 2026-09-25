---
name: Expo browser photo selection
description: Why Expo web image picking and uploading need a browser-specific path.
---

In an Expo browser preview, open the image library immediately in the user's tap handler. Do not put a native alert or an awaited media-library permission request before the picker. For web uploads, use the browser's selected `File` bytes and a browser request; keep the Expo file-system file/upload path for native devices.

**Why:** Expo's web picker triggers a hidden file input and browsers can silently block that dialog after asynchronous work loses user activation. Expo's file-system file implementation on web is a stub, so a working picker alone does not make photo preparation or uploads work.

**How to apply:** Any browser-preview photo attachment flow shared with iOS/Android should branch before the picker and before file preparation/upload, while preserving native permission and format-conversion behavior.