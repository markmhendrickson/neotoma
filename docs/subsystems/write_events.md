# Write events and turn identity

A server-side record of every write, carrying the operation, the actor, the client, and the conversation turn that caused it. It lets an in-chat activity view or a server-rendered turn summary show what a session wrote from the server's own record, instead of from what the model chose to report.

Design basis: [`docs/foundation/philosophy.md`](../foundation/philosophy.md) §5.7 (full explainability: every output traces to its provenance) and [`docs/foundation/redlines.md`](../foundation/redlines.md) R4 (no state without provenance) and R8 (cross-harness portability: the turn channel works for every MCP client and every REST caller, not only harnesses with hooks).

## Scope

This document covers:

- What a write event is, where it is stored, and what it carries.
- How a client passes conversation-turn identity in.
- Retention and privacy.
- What is implemented now and what is deliberately left to follow-up changes, with the reason for each.
- Reads: why they are not recorded today, why `tool_invocation` stopped arriving, and how read recording relates to this design.

It does NOT cover:

- Substrate event semantics in general (see [`substrate_events.md`](substrate_events.md)).
- Subscription delivery (see [`subscriptions.md`](subscriptions.md)).
- The `conversation_turn` / `tool_invocation` hook entities (see [`conversation_turn.md`](conversation_turn.md)).

## Inventory: what already existed

| Mechanism | What it records | Why it was not enough on its own |
|---|---|---|
| Observations and relationship observations | Every assertion, append-only, kept forever, with an attribution block in `provenance` (tier, agent sub and thumbprint, client name and version, connection id, signed-in member id) | No operation vocabulary (a correction, a deletion and a store all look like observations), no turn identity, and no cheap "what did this turn write" query. |
| `substrate_events` (durable log behind SSE resume) | One row per emitted substrate event: created, updated, deleted, restored, merged, split, relationship created/deleted/restored, observation created | Carried only the agent thumbprint as actor, no client, no member id, no turn. Pruned to `NEOTOMA_EVENT_RETENTION_DAYS` (default 7). |
| `list_recent_changes` | A union over current table rows (entities, sources, observations, interpretations, relationship snapshots, timeline events) | Derived from current state, not an event log: no deletes or restores as events, relationships at snapshot level, turn key only for rows whose own fields carry one. |
| `list_timeline_events` | Domain events derived from entity date fields | About the world, not about writes. |
| `neotoma_turn_summary` | Stored and retrieved entities for a turn | Computed from `REFERS_TO` edges the agent itself writes from its turn messages, so it is only as complete as the agent's reporting. |
| `tool_invocation`, `conversation_turn`, `turn_activity` | Hook-written, client-side self-reports | Written only by harnesses that run Neotoma hooks, and only when those hooks work. See "Reads" below. |
| `harness_event` | A client-defined audit row type | Client-written; not a server record. |

The durable substrate-event log already sat on exactly the right seam: every write path emits through `src/events/substrate_store_emit.ts`, and every emitted event is persisted. It lacked the actor, the turn, and the operation vocabulary. This design extends it rather than adding a parallel table.

## The record

A write event is a substrate event persisted in `substrate_events`, now carrying a `write_context`:

```ts
interface WriteEventContext {
  operation: WriteOperation;   // see table below
  actor: {
    attribution_tier?: string;
    agent_sub?: string;
    agent_thumbprint?: string;
    client_name?: string;
    client_version?: string;
    connection_id?: string;
    authenticated_actor_id?: string;  // the signed-in member's attribution id, when present
  };
  conversation_id?: string;    // client-reported
  turn_key?: string;           // client-reported
  turn_source?: "header" | "mcp_meta";
}
```

Together with the event's existing fields (entity id and type, timestamp, observation id, relationship type and endpoints, changed field names, source peer) this is the full record the lane asked for.

| Event type | Operation |
|---|---|
| `entity.created` | `created` |
| `entity.updated` | `updated`, or `corrected` when written by the correction path |
| `observation.created` | `stored` (or `corrected`) |
| `entity.deleted` / `entity.restored` | `deleted` / `restored` |
| `entity.merged` / `entity.split` | `merged` / `split` |
| `relationship.created` / `.deleted` / `.restored` | `relationship_created` / `relationship_deleted` / `relationship_restored` |

`corrected` is set explicitly by `src/services/correction.ts`; every other operation is derived from the event type, so no other write path changed.

The actor block is read from the same request-scoped context (`getCurrentAttribution()`) that stamps observation provenance, so the write event and the observation it describes always agree on who wrote it. Actor quality is whatever write attribution currently is; this design does not improve or depend on signing.

### Where it is stored, and why no migration

The context lives in the existing JSON `payload` column of `substrate_events`. That column is encrypted at rest with the instance data key when encryption is configured. No column, table or index was added.

The consequence: a query by turn or conversation cannot be pushed into SQL. `listWriteEvents` (`src/services/write_events/write_event_query.ts`) narrows in SQL by user, time window and entity id (the indexed columns), then filters by turn in JS under a scan cap, and reports `truncated` when the cap was hit. For the intended use, a turn that happened seconds or minutes ago, the window is small and the scan is cheap.

If turn-scoped queries over long windows become necessary, the follow-up is a schema change: add `turn_key` and `conversation_id` columns plus an index, populated at persist time. That needs a migration and is out of scope here.

## Turn identity: how clients pass it in

Two carriers, one shape. Both are optional, self-reported, and unverified, the same trust level as MCP `clientInfo`.

| Carrier | Keys | Applies to |
|---|---|---|
| HTTP headers | `X-Neotoma-Conversation-Id`, `X-Neotoma-Turn-Key` | Every REST route (read by the attribution middleware) and `/mcp` on both protocol eras |
| MCP request `params._meta` | `io.neotoma/conversation_id`, `io.neotoma/turn_key` | Every `tools/call`, on stdio, legacy-session HTTP, and the 2026-07-28 stateless transport |

On an MCP tool call, `_meta` wins over a header: `_meta` is scoped to the one call, while a header may be a static per-connection setting.

`_meta` is the carrier the 2026-07-28 stateless protocol is built around: it carries all per-request client state there because there is no session (see #2508 for the matching problem with rules and skills). A per-request turn key needs no server-side session state, so it works the same on every transport.

Values are sanitized before they reach the context: trimmed, at most 200 characters, and restricted to an identifier charset (letters, digits and `. _ : @ # / -`). Anything else, including any value containing whitespace, is dropped. A client therefore cannot place message text in the write record through this channel.

The value of `turn_key` should follow the existing `{session_id}:{turn_id}` convention (see [`conversation_turn.md`](conversation_turn.md)), so server write events join with hook-written `conversation_message` rows. A harness that cannot name a turn should send nothing rather than a per-call timestamp; see #2440 for why a fabricated per-call key is worse than none.

Context propagation: the turn rides in the request context (`RequestContext.turn`). Every place that rebuilds that context now carries it forward: the `/mcp` handler's two nested contexts, the CallTool dispatch scope, the AAuth admission middleware's three rebuilds, `runWithExternalActor`, and the issue-submission bookkeeping store.

## Privacy

- **Identifiers only.** The record carries ids, names of changed fields, and client-reported identifiers. It never carries field values, message text, or the agent public key.
- **Not delivered to subscribers.** `write_context` is persisted but stripped by `toDeliverableSubstrateEvent` at every outbound boundary: the in-memory ring, SSE broadcast, webhook delivery, peer-sync delivery, and durable resume (`getEventsAfterSeq`). A webhook consumer, a guest-token SSE subscriber, or a sync peer receives exactly what it received before this change. An integration test pins this.
- **The member attribution id** is recorded only when a verified sign-in stood behind the request, as it already is in observation provenance. Any read surface for write events must withhold it from guest-token readers, as observation reads already do (`src/services/attribution_redaction.ts`).
- **Retention.** Write events share the durable log's retention, `NEOTOMA_EVENT_RETENTION_DAYS` (default 7 days). That fits the purpose: a turn summary or activity view is read within the session. The long-term record of who wrote what remains the observation log's attribution, kept forever under the substrate's immutability rules.

## What is implemented now

- Turn identity capture from both carriers, sanitized, threaded through the request context.
- `write_context` stamped on every substrate event at emit time (operation, actor ids, turn).
- `corrected` distinguished from a generic update.
- Stripping at every delivery boundary.
- `listWriteEvents` service query by user, time window, entity, turn and conversation.

None of this needs a migration.

## Deliberately not in this change

Each item below is a separate change because it needs a review this one does not.

1. **Read surface** (`list_write_events` MCP tool, `GET /write-events`, and a `server_writes` field on `neotoma_turn_summary`). Each adds an API contract (OpenAPI, contract mappings, generated types, capability manifest) and a new way to read attribution, which needs a security review of guest-token scoping and member-id redaction. The turn-summary extension is the first consumer: it lets the summary report writes even when the agent never stored its turn message, which today makes the summary return "message not found".
2. **Turn identity in observation provenance.** Stamping `turn_key` into the permanent observation provenance would make "which turn wrote this" answerable forever, not only inside the event retention window. It is a JSON field, so no migration, but it changes what every observation reader (including guest readers) sees, so it needs the same redaction review as item 1.
3. **Indexed turn columns on `substrate_events`.** Needs a migration; only worth it if turn queries over long windows prove necessary.
4. **Harness carriers.** The Claude Code, Codex and Cursor hook packages, and the OpenClaw plugin, can send `X-Neotoma-Turn-Key` or `_meta`. That belongs with the turn-key repair in #2440 / #2441, so the key sent is a real per-turn key.

## Reads

### Why reads are not recorded

No server-side read record exists (#2261). Reads pass through the same request context middleware as writes but nothing is persisted. `turn_activity.retrieved_entity_ids` and hook-written `tool_invocation` rows are client self-reports.

### Why `tool_invocation` stopped arriving

On a long-running production instance, the newest `tool_invocation` row was written 2026-07-28T07:45Z (27,155 rows in total, the first on 2026-05-27). Hook-written `conversation_message` rows from the same plugin continued until 2026-08-01, and none have arrived since. No hook code changed in that period (the last change to `packages/claude-code-plugin/hooks` was 2026-06-12).

What the evidence supports:

- The hooks default to `http://127.0.0.1:3080` with no token (`packages/claude-code-plugin/hooks/_common.py`). After that instance moved off the local server, hooks without an explicit `NEOTOMA_BASE_URL` and `NEOTOMA_TOKEN` had nowhere to write.
- Every store failure in `post_tool_use.py` is logged at `debug`, below the default `NEOTOMA_LOG_LEVEL=warn`. That is the same silent-failure class as #2443. A failed write is indistinguishable from a working one.
- The server-side `tool_invocation` schema requires `invoked_at`, which the hook never sends. That produces a `required_fields_missing` warning, not a rejection, so it is a data-quality defect rather than the cause.

What it cannot establish is the exact trigger on 2026-07-28. The server never sees a write that was never attempted or that failed before reaching it, and that gap is the reason for this design. Server-side write events do not depend on any hook being installed, configured, or working.

### How read recording should work

#2261 has a full, lens-reviewed specification: a dedicated `read_events` table with an entity junction table, 90-day retention, entity/query-level granularity, buffered non-blocking writes, and `list_read_events`. That needs new tables, so it is a migration and is not implemented here. This design adds two things to it:

- **Turn identity on reads.** The read record should carry `conversation_id` and `turn_key` from `RequestContext.turn`, the same way write events do, so one turn's reads and writes join on one key.
- **Record every read, not a sample.** A turn summary has to say what was read in that turn, and a sample cannot. Volume is bounded by recording at entity/query granularity (one row per call, entity ids in the junction table) and by retention, as #2261 specifies. Sampling stays available as an operator setting for instances where volume matters more than completeness, but it should not be the default.

## Testing

- `tests/unit/write_events_context.test.ts`: sanitization, both carriers, `_meta` precedence, context-clone survival, the operation vocabulary, actor capture, and stripping.
- `tests/integration/write_events_record.test.ts`: real writes against the real database. MCP `tools/call` with `_meta` (create, relationship create and delete, delete, restore), a correction, HTTP `/store` with headers, conversation filtering, a write without turn identity, and the subscriber boundary (ring and durable resume carry no write context). Each assertion was confirmed to fail when its implementation is reverted.

## Related

- [`substrate_events.md`](substrate_events.md): the event shape `write_context` extends.
- [`subscriptions.md`](subscriptions.md): the delivery paths that strip it.
- [`agent_attribution_integration.md`](agent_attribution_integration.md): where the actor block comes from.
- [`conversation_turn.md`](conversation_turn.md): the `turn_key` convention.
