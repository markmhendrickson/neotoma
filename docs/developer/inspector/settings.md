---
title: Inspector — Settings
summary: Connection, attribution policy, retention, and other operator-controlled configuration.
category: development
subcategory: ui
order: 110
audience: developer
visibility: public
tags: [inspector, settings]
---

# Inspector — Settings

The Settings screen (`/inspector/settings`) is the operator's surface for
adjusting Neotoma's runtime configuration. Sub-screens:

- **Connection** (`/inspector/settings/connection`) — base URL, bearer
  token, tunnel status.
- **Attribution policy** (`/inspector/settings/attribution-policy`) — how
  guest writes and sandbox writes are attributed back to a user.
- **Retention** (`/inspector/settings/retention`) — per-type retention
  windows and any pending purge runs.

Most settings round-trip to durable config; some are session-local. Every
mutating action confirms before writing.

## Related

- `docs/subsystems/auth.md`
- `docs/subsystems/aauth.md`
- `docs/subsystems/sandbox.md`
- `docs/operations/`
