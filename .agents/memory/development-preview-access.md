---
name: Development preview access
description: SHÜÜT development preview behavior after remixing the project.
---

If the SHÜÜT artifact opens a Replit “Log in to access a private app” page while its workflows are healthy, check whether **Private development URL** is enabled under Developer tools → Networking.

**Why:** The remixed project had this workspace-level networking setting enabled. Disabling it restored normal artifact preview access from the Replit iOS app.

**How to apply:** Distinguish the Replit access gate from SHÜÜT authentication and from failed workflows. Verify service health, then check the networking privacy setting rather than changing application code.