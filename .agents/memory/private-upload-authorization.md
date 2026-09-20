---
name: Private upload authorization
description: Why consent-sensitive uploads use a server-verified token endpoint instead of direct sidecar-signed PUT URLs.
---

Replit App Storage’s signed-object-url sidecar signs only the host for PUT URLs in this environment. Supplying content type, content length, or custom headers does not add them to the signed headers, so caller-declared MIME and size cannot safely authorize voice uploads.

**Why:** A client could request an image upload before granting voice consent, then use the returned direct PUT URL for audio bytes. The storage service would accept the bytes before later API gates rejected processing.

**How to apply:** Keep consent-sensitive private uploads behind a short-lived tamper-proof token that binds object path, MIME, exact size, and expiry. Verify headers, byte length, and file magic before saving server-side. Do not restore direct PUT URLs unless the platform can cryptographically bind and enforce those properties.