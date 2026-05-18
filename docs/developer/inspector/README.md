---
title: Inspector
summary: Web UI for browsing entities, observations, sources, relationships, and timeline events that Neotoma has stored.
category: development
subcategory: ui
order: 5
audience: developer
visibility: public
tags: [inspector, ui]
---

# Inspector

The Inspector is the local web UI for a running Neotoma server. It surfaces
the same data the MCP tools, CLI, and HTTP API expose, but in a form that
people can browse, search, and skim.

**Mount path.** When the inspector SPA is built and present on disk, the
server serves it under `/inspector/`. The mount is wired in
`src/services/inspector_mount.ts` and is gated on the presence of a built
`dist/inspector` bundle. If the inspector hasn't been built, requests to
`/inspector/*` return a 404 and the server logs a single startup line:
`[Inspector] Disabled or no built SPA found; /inspector will not be served.`

## Routes

Each top-level route is implemented as a screen in the SPA under
`inspector/src/`. The canonical list:

- [`/inspector`](dashboard.md) — Dashboard.
- [`/inspector/entities`](entities.md) — Entity browser.
- [`/inspector/observations-and-sources`](observations_and_sources.md) — Observations + their source records.
- [`/inspector/relationships-and-graph`](relationships_and_graph.md) — Typed relationships, hierarchies, and small-graph view.
- [`/inspector/schemas`](schemas.md) — Schema registry browser.
- [`/inspector/timeline`](timeline.md) — Timeline events derived from temporal fields.
- [`/inspector/conversations`](conversations.md) — Stored conversation entities.
- [`/inspector/agents`](agents.md) — Agent grants and capabilities.
- [`/inspector/peers`](peers.md) — Peer-sync configuration and status.
- [`/inspector/search`](search.md) — Cross-entity full-text search.
- [`/inspector/settings`](settings.md) — Connection, attribution policy, retention.

## How Inspector relates to the rest of the surfaces

| Surface | What it does | Where it lives |
|---|---|---|
| MCP tools | Programmatic store/retrieve/relate for agents | `src/server.ts`, `src/tool_definitions.ts` |
| HTTP API | REST surface for tools that don't speak MCP | `src/actions.ts`, `openapi.yaml` |
| CLI | Local-first command-line operator | `src/cli/` |
| `/docs` | Server-rendered markdown documentation | `src/services/docs/` |
| Inspector | Browseable web UI over the State Layer | `inspector/src/`, `src/services/inspector_mount.ts` |

The Inspector is **read-write but conservative**: destructive operations
either go through explicit confirmation modals or refuse, deferring to the
CLI or MCP for fully scripted control.

## Auth

The Inspector mount is auth-gated like the rest of the API. In local-loopback
contexts (`isLocalRequest` true and no proxy headers) it falls through to
local dev auth; remote requests must present a bearer token. See
`docs/subsystems/auth.md` and `docs/security/threat_model.md` for the full
auth topology, including the v0.11.1 regression class that the
`forwarded-for-trust` and `protected_routes_manifest.json` gates exist to
prevent recurring.

## Related

- `docs/subsystems/auth.md`
- `docs/subsystems/aauth.md` — Agent authentication and capability grants.
- `docs/security/threat_model.md`
- `docs/developer/cli_reference.md`
- `docs/developer/mcp/instructions.md`
