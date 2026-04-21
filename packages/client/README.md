# @neotoma/client

TypeScript client for [Neotoma](https://neotoma.io) — the deterministic personal memory engine.

Used by the hook plugins for Claude Code, Cursor, OpenCode, and Codex, and by the Claude Agent SDK adapter. Can also be used directly from any TypeScript or JavaScript program that needs to store or retrieve data from a running Neotoma instance.

## Install

```bash
npm install @neotoma/client
```

For the local (in-process) transport, also install Neotoma itself:

```bash
npm install neotoma
```

## Quick start

### HTTP transport (default, recommended for hook plugins)

```ts
import { NeotomaClient } from "@neotoma/client";

const client = new NeotomaClient({
  transport: "http",
  baseUrl: "http://127.0.0.1:3080",
  token: process.env.NEOTOMA_TOKEN ?? "dev-local",
});

await client.store({
  entities: [
    { entity_type: "task", title: "Review plan", due_date: "2026-04-15" },
  ],
  idempotency_key: "my-hook-2026-04-09-001",
});
```

### Local transport (in-process, same Node runtime as Neotoma core)

```ts
import { NeotomaClient } from "@neotoma/client";

const client = new NeotomaClient({
  transport: "local",
  userId: "local-dev-user-id",
});

const result = await client.retrieveEntities({ entity_type: "task", limit: 10 });
```

## Transports

Both transports implement the `NeotomaTransport` interface, so hook plugins can switch between them by config without changing code.

| Transport | When to use | Dependencies |
|---|---|---|
| `HttpTransport` | Hook plugin runs in a separate process; remote Neotoma instance; production deployments | Node 18+ (built-in fetch) |
| `LocalTransport` | Hook plugin bundles Neotoma core; single Node process; avoid HTTP roundtrip | `neotoma` peer dependency |

## API

The client exposes typed wrappers for the full MCP action catalog:

- `store(input)` — create or update entities, with optional relationships and attachments
- `retrieveEntities(input)` — list entities by type, time window, or other filters
- `retrieveEntityByIdentifier(input)` — look up a single entity by name / email / canonical identifier
- `retrieveEntitySnapshot(input)` — full snapshot with provenance
- `listObservations(input)` — observation history for a single entity
- `listTimelineEvents(input)` — timeline events in a window
- `retrieveRelatedEntities(input)` — graph expansion
- `createRelationship(input)` — link two existing entities
- `correct(input)` — supersede a prior observation
- `listEntityTypes(input)` — schema-level discovery
- `getEntityTypeCounts(input)` — per-type cardinality
- `executeTool(name, args)` — escape hatch for any MCP action

See [`docs/specs/MCP_SPEC.md`](https://github.com/markmhendrickson/neotoma/blob/main/docs/specs/MCP_SPEC.md) and [`openapi.yaml`](https://github.com/markmhendrickson/neotoma/blob/main/openapi.yaml) for complete action semantics.

## High-level helpers

Canonical primitives that wrap the low-level transport operations and encode the turn-lifecycle and access-policy obligations agents are expected to honor. Import from `@neotoma/client/helpers`, `@neotoma/client/diagnose`, or `@neotoma/client/turn_report`.

```ts
import { storeChatTurn, retrieveOrStore, snapshotOnUpdate } from "@neotoma/client/helpers";
import { diagnoseTurn, applyRepairs, hasErrors } from "@neotoma/client/diagnose";
import { renderTurnReport } from "@neotoma/client/turn_report";
```

- `storeChatTurn(transport, input)` — persist user + assistant `agent_message` for one logical turn with `PART_OF` → conversation. Canonical dual-message shape; idempotent per `(conversationId, turnId)`.
- `retrieveOrStore(transport, input)` — retrieve-before-write primitive. Reuses an existing entity by identifier; stores a new one only if none is found.
- `snapshotOnUpdate(transport, input)` — fetch the current snapshot before applying a correction so callers never write over stale state unseen.
- `diagnoseTurn(observation)` — runs per-turn invariants (missing user/assistant store, unstored attachments, store-first ordering, Parquet residue) and returns structured `Diagnosis` items with severity and suggested repair actions.
- `applyRepairs(transport, diagnoses, conversationId, turnId)` — executes the suggested repairs in the same turn and records a `neotoma_repair` summary entity.
- `renderTurnReport(input)` — formats the mandatory `🧠 Neotoma` section (Created / Updated / Retrieved groups, plus Issues) that agents append to every user-visible reply.

## Related packages

- [`neotoma`](https://www.npmjs.com/package/neotoma) — the Neotoma engine (CLI and server)
- Hook plugins built on this client:
  - `packages/claude-code-plugin` — Claude Code plugin marketplace entry
  - `packages/cursor-hooks` — Cursor `hooks.json` + scripts
  - `packages/opencode-plugin` — OpenCode TypeScript plugin
  - `packages/codex-hooks` — Codex CLI hooks
  - `packages/claude-sdk-adapter` — Claude Agent SDK reference integration

## License

MIT
