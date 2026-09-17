---
name: Native session security
description: Security boundary for authenticating native SHÜÜT clients without weakening the web session model.
---

Native clients must store bearer sessions in device secure storage. Web clients continue to use bound HTTP-only cookies and CSRF protection. Email verification is sufficient authentication on both clients; passkeys must not gate sign-in, onboarding, or protected requests.

Native API requests must omit browser credentials, including from the Expo web preview. A stale web session cookie can otherwise make the API apply cookie-session CSRF checks to a native bearer flow.

**Why:** The passkey browser handoff prevented TestFlight users from entering the app and the product decision is to remove all user-facing passkey elements. Cookie omission still prevents browser preview state from crossing the native/web session boundary.

**How to apply:** Future authentication changes must not restore passkey-required states, screens, or API authorization checks. Preserve session revocation, private-audio bearer authorization, secure token storage, and cookie-free native API requests.