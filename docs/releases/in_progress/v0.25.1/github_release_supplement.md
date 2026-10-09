This patch release closes a gap in agent grant scoping: a grant limited to certain relationship types now limits edge writes on every entrance, not only on REST `/store`. It also fixes the ordering of relationship delete, restore and delete-again sequences.

**Action needed on upgrade:** if an AAuth agent grant has a `create_relationship` capability entry with no `relationship_types`, that agent can no longer write edges. Add `relationship_types` to the entry. See "Breaking changes".

## Highlights

- **Relationship grants are enforced on every edge write.** A `create_relationship` capability entry must now cover the relationship type and both endpoint entity types together. The check runs for REST and MCP `store`, `create_relationship`, `create_relationships`, `restore_relationship`, `delete_relationship`, `create_interpretation`, `/interpretations/create`, and edges auto-linked from schema reference fields. Before, only REST `/store` checked the relationship type, so an agent scoped to `REFERS_TO` could create other edge types through the sibling routes.
- **A refused edge write returns 403.** REST `/store` and `/create_relationship` answer a capability refusal with `403 capability_denied` and a structured `hint`, instead of `500 DB_QUERY_FAILED`. In `create_relationships` and `create_interpretation` a refused edge is reported per item and successful siblings are kept.
- **Restored relationships can be deleted again.** A delete issued after a restore now outranks the restore. Before, the fixed delete priority lost to the restoration's priority, so the edge stayed live (#2570). Same-edge lifecycle writes are serialized and the materialized snapshot is recomputed atomically.

## What changed for npm package users

**CLI (`neotoma`)**

- `neotoma agents grants import` preserves an existing `relationship_types` list on `create_relationship` entries.

**Runtime / MCP**

- Edge writes made by an admitted agent are checked against one `create_relationship` entry that names the relationship type and both endpoint entity types. Separate entries do not combine into permission. An endpoint that does not resolve for the owner is denied.
- A signer whose grant is revoked, suspended, unbound, invalid or in a pin conflict is refused on every edge write. Only a signer that no grant recognizes is treated as a guest and left to access policy.
- Edges the server derives from a registered schema (reference-field auto-links) are gated by the same grant. A refused auto-link is reported as not linked, and the store that triggered it still succeeds.
- MCP `create_relationship` no longer fails when two calls land in the same millisecond. Its source hash now includes a unique suffix.
- Relationship lifecycle: delete and restore compute their priority from the highest existing observation for the edge, and writes to the same edge are serialized.

**Shipped artifacts**

- `config/agent_capabilities.default.json` no longer grants `create_relationship` to the `agent-site@neotoma.io` feedback forwarder. It writes no edges.

## API surface & contracts

- `npm run openapi:bc-diff` (base `v0.25.0`) reports no breaking changes and one non-breaking addition: `components.schemas.AgentCapabilityEntry.relationship_types`. A new `RelationshipBatchErrorItem` schema documents the per-item errors of `create_relationships`, including `code`, `op`, `entity_type`, `agent_label` and `hint` for capability denials.
- `capability_denied` is now returned with HTTP 403 from `/store` and `/create_relationship`. No new or removed MCP tools.

## Behavior changes

- Grants created before `relationship_types` existed grant no edge writes until updated. See "Breaking changes".
- In the Inspector grant form, `create_relationship` rows have a "Relationship types" input. A row with an empty list shows an inline warning, and a summary line above the submit button counts such rows.
- Agent instructions (`docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`) tell agents to repair a `capability_denied` by updating the existing grant with the needed `entity_types` and `relationship_types`, not by retrying with a wider edge type.

## Docs site & CI / tooling

- `docs/subsystems/agent_capabilities.md` documents the combined-entry rule, the enforced entrances and a migration note.
- The CI integration lane runs `tests/integration/relationship_write_capability_surfaces.test.ts`. The test catalog is regenerated.

## Fixes

- Relationship delete after restore now takes effect (#2570).
- Capability refusals no longer surface as `500 DB_QUERY_FAILED` on REST (#2524, #2525).

## Tests and validation

- `tests/integration/relationship_write_capability_surfaces.test.ts` drives REST over HTTP and the MCP tool methods as a `REFERS_TO`-scoped agent and asserts the effect on each surface.
- `tests/integration/relationship_liveness_pagination.test.ts` and `tests/services/relationship_type_registration.test.ts` cover the delete, restore, delete-again ordering and concurrent same-edge writes.
- Contract, unit and Inspector tests cover the grant shape, import, and the form. An agentic-eval snapshot covers the relationship capability effect.
- Release lane: 378 tests across 30 targeted files pass, `type-check` is clean, and `test:security:auth-matrix` passes (18 passed, 1 skipped).

## Security hardening

`npm run security:classify-diff -- --base v0.25.0 --head HEAD` reports `sensitive=true` for `openapi.yaml` and `src/actions.ts`. `security:lint` reports 0 errors, `security:manifest:check` is in sync, and no routes were added. Findings and sign-off are in [`docs/releases/in_progress/v0.25.1/security_review.md`](security_review.md). Deployed-probe results will be linked here after Step 5.

## Breaking changes

- **Authorization outcome change for agent grants.** A `create_relationship` capability entry without `relationship_types` (every entry written before this release) now denies edge writes with `capability_denied`. The grant record is still accepted. To restore edge writes, update the grant with an entry that lists the relationship types and both endpoint entity types, for example `{"op": "create_relationship", "entity_types": ["checkpoint_brief", "task"], "relationship_types": ["REFERS_TO"]}`. Use the Inspector grant form, `PATCH /agents/grants/{grant_id}`, or a `correct` on the `agent_grant` entity. This is recorded in `tests/contract/legacy_payloads/CHANGES.md` under v0.25.1.
- Edge writes refused by a grant now return `403 capability_denied` on REST `/store` and `/create_relationship`. Clients that treated the previous `500` as retryable should stop retrying.
