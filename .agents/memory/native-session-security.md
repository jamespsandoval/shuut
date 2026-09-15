---
name: Native session security
description: Security boundary for authenticating native SHÜÜT clients without weakening the web session model.
---

Native clients must store bearer sessions in device secure storage. Web clients continue to use bound HTTP-only cookies and CSRF protection.

Native API requests must omit browser credentials, including from the Expo web preview. A stale web session cookie can otherwise make the API apply cookie-session CSRF checks to a native bearer flow.

Passkey-enrolled native users remain pending until they complete WebAuthn in a secure browser handoff. URLs may contain only a short-lived, one-time grant; bearer tokens must never appear in URLs.

**Why:** Expo Go does not expose native WebAuthn, while treating email verification as sufficient would weaken passkey-protected accounts. A temporary browser ceremony preserves the existing passkey guarantee. Cookie omission also prevents browser preview state from crossing the native/web session boundary.

**How to apply:** Any future native authentication or recovery flow must preserve the pending-session gate, one-time grant exchange, session revocation, private-audio bearer authorization, and cookie-free API requests.