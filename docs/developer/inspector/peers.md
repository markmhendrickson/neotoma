---
title: Inspector — Peers
summary: View peer-sync configuration, current peer status, and recent sync activity.
category: development
subcategory: ui
order: 90
audience: developer
visibility: public
tags: [inspector, peers, sync]
---

# Inspector — Peers

The Peers screen (`/inspector/peers`) is the operational view over Neotoma's
peer-sync subsystem.

## What you see

- **Peer list.** Each peer record with endpoint, role (push / pull / both),
  last-synced cursor, and current health.
- **Sync activity.** Recent sync runs per peer: counts of records pushed and
  pulled, conflicts surfaced, errors raised.
- **Conflict queue.** Outstanding sync conflicts that need a manual
  resolution; click-through to `resolve_sync_conflict`.

## Related

- `docs/subsystems/sync.md`
- `docs/subsystems/peer_sync.md`
- `docs/developer/cli_reference.md` (peer commands)
