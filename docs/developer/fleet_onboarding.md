# Fleet onboarding quickstart

**Audience:** Operators of agent fleets (AIBTC Lumen, LangGraph, OpenClaw, custom runtimes) wiring a deployment into Neotoma for the first time as a verifiable write-integrity backbone.

**Goal:** After following this page your fleet writes are:

- Cryptographically attributed (AAuth — `hardware` / `software` tier, not `anonymous`).
- Classified by the kind of write (`observation_source`: `sensor`, `llm_summary`, `workflow_state`, `human`, `import`).
- Bucketed into the fleet-general `agent_*` schemas (`agent_task`, `agent_attempt`, `agent_outcome`, `agent_artifact`, `agent_sensor_signal`, `agent_cycle_summary`).
- Exportable as canonical JSON and diff-able against whatever state your fleet already keeps on disk (MEMORY.md, shadow SQLite, vector store, …).

The rest of this page is a linear recipe — each section produces an artefact you can verify before moving on.

## 1. Set up AAuth

Generate a keypair on the operator machine and confirm the tier Neotoma resolves:

```bash
neotoma auth keygen             # writes ~/.neotoma/aauth/private.jwk (ES256 by default)
neotoma auth session --text     # resolved tier + signer configuration
```

Expected output: `attribution.tier: hardware` (ES256/EdDSA) or `software` (other algs), with `signature_verified: true` and `eligible_for_trusted_writes: true`.

If you see `anonymous` / `unverified_client` or `signature_verified: false`, walk the diagnostics checklist in [`docs/subsystems/agent_attribution_integration.md#6-diagnostics-checklist`](../subsystems/agent_attribution_integration.md#6-diagnostics-checklist) before continuing.

For non-CLI integrators (a local proxy, a custom agent harness), implement the same wire format documented in the integration guide — `Signature`, `Signature-Input`, and `Signature-Key` headers covering `@authority`, `@method`, `@target-uri`, and `content-digest`. The `authority` MUST match `NEOTOMA_AAUTH_AUTHORITY`; using the inbound `Host` header is explicitly unsafe.

### Capability scoping (optional, strongly recommended in production)

Pin each agent identity to the operations and entity types it actually needs. See [`docs/subsystems/agent_capabilities.md`](../subsystems/agent_capabilities.md) for the registry shape. A Lumen dispatcher, for example, might be scoped to `(create|correct, agent_task|agent_attempt|agent_outcome|agent_artifact|agent_sensor_signal)` only — any other write returns `403 capability_denied` even with a valid signature.

## 2. Classify every write with `observation_source`

Set `observation_source` on every structured write. The value is orthogonal to AAuth (which agent) and to `source_priority` (numeric ranking); it classifies the *kind* of write so the reducer and drift reports can prefer ground-truth over narration.

| Value            | When to use                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `sensor`         | Ground-truth tool events, telemetry, env probes. The reducer ranks these above LLM summaries.    |
| `workflow_state` | Deterministic state-machine transitions (task started, attempt succeeded, …).                     |
| `llm_summary`    | LLM-authored summaries / extractions. **Default** when `observation_source` is unspecified.       |
| `human`          | Direct human edits, acceptances, corrections.                                                     |
| `import`         | Batch / ETL ingestion. Ranked last by default because provenance is typically second-hand.        |
| `sync`           | Writes replayed from a peer during fleet sync (Phase 5 loop prevention). Set automatically by the sync path; rarely supplied by hand. |

`sensor`, `llm_summary`, `workflow_state`, `human`, `import`, and `sync` are the **only** accepted values — this is a closed enum (see the v0.17→v0.18 migration note below).

Reducer tie-breaking proceeds `source_priority → observation_source_priority → observed_at`. Per-schema overrides (e.g. `agent_sensor_signal` locks `observation_source_priority` so sensor rows always win) live on `SchemaDefinition.reducer_config.observation_source_priority`.

### CLI example

```bash
neotoma store \
  --file-path ./tool-event.json \
  --observation-source sensor
```

### MCP example

```jsonc
{
  "method": "tools/call",
  "params": {
    "name": "store",
    "arguments": {
      "content": "…",
      "observation_source": "workflow_state"
    }
  }
}
```

See the applied rules in [`.cursor/rules/neotoma_cli.mdc`](../../.cursor/rules/neotoma_cli.mdc) (rule 14a) or [`docs/developer/mcp/instructions.md`](./mcp/instructions.md) for the agent-instruction wording.

### Migrating `observation_source` from v0.17 to v0.18

**Breaking change (v0.18.x, [#1841](https://github.com/markmhendrickson/neotoma/issues/1841)).** In v0.17, `observation_source` (and the `--observation-source` CLI flag) accepted arbitrary strings — e.g. `cboe_live`, `stale_cache`, `computed_greeks`. v0.18 restricts it to the closed enum above. Stores and `--observation-source` flags carrying a custom string now fail with:

```
Invalid --observation-source "cboe_live". Expected one of: sensor, llm_summary, workflow_state, human, import, sync. Custom v0.17 observation_source labels are no longer accepted — put them in the free-form "data_source" field instead.
```

`observation_source` is a *fixed classification* of the kind of write (it drives reducer tie-breaking); the descriptive label of *where* a value came from belongs in the free-form `data_source` field, which remains unconstrained. To migrate, map each custom string to the closest enum value and move the original label into `data_source`:

| v0.17 custom string (examples) | v0.18 `observation_source` | `data_source` (free-form) |
| ------------------------------ | -------------------------- | ------------------------- |
| `cboe_live`, `*_live`, market/exchange feeds, webhooks, telemetry | `sensor` | `cboe_live` |
| `computed_greeks`, derived/calculated state, state-machine output | `workflow_state` | `computed_greeks` |
| `gpt_summary`, model-authored extractions / summaries | `llm_summary` | `gpt_summary` |
| `analyst_note`, manual edits / acceptances | `human` | `analyst_note` |
| `stale_cache`, `nightly_etl`, batch / backfill ingestion | `import` | `stale_cache` |

If no enum value fits the *kind* of write, default to `import` (second-hand provenance) or `llm_summary` (the system default) and preserve the original string in `data_source`. There is no back-compat shim — the enum is enforced at the parse boundary on both the CLI and the API.

## 3. Use the fleet-general `agent_*` schemas

Neotoma ships a v0.1 "lowest common denominator" schema set in the `agent_runtime` category. Store runtime data against these types so your drift reports, timeline views, and Inspector filters work without fleet-specific migrations:

| Schema                 | Purpose                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `agent_task`           | A unit of agent work dispatched to a runtime.                                           |
| `agent_attempt`        | One attempt against an `agent_task` (retry, branch, …).                                |
| `agent_outcome`        | Pass / fail / partial outcome of an `agent_attempt`.                                    |
| `agent_artifact`       | A concrete artefact emitted by an `agent_outcome` (file, message, tool output).         |
| `agent_sensor_signal`  | Ground-truth emission from an agent sensor (tool event, telemetry). Use with `observation_source=sensor`. |
| `agent_cycle_summary`  | Periodic roll-up of a cycle (tick, iteration, episode).                                 |

Fleet-specific fields ride a minor-version bump on the same entity type — do not mint parallel `agent_task_lumen` / `agent_task_langgraph` types. `agent_sub` and `agent_id` are deliberately *not* schema fields; agent identity flows through AAuth provenance.

Definitions live in [`src/services/schema_definitions.ts`](../../src/services/schema_definitions.ts); the contract test [`tests/services/schema_definitions_agent_runtime.test.ts`](../../tests/services/schema_definitions_agent_runtime.test.ts) is the authoritative assertion of the v0.1 shape.

## 4. Round-trip: write → export → diff

The end-to-end smoke test that proves a fleet is wired correctly:

```bash
# 1. Write a task + sensor + summary with classified observation_source.
neotoma store-structured \
  --entities '[
    {"entity_type":"agent_task","task_id":"task-42","status":"pending"},
    {"entity_type":"agent_sensor_signal","sensor_id":"tool.exec","signal_kind":"stdout",
     "emitted_at":"2026-04-22T12:00:00Z"}
  ]' \
  --observation-source workflow_state

# 2. Export the canonical Neotoma snapshot for this fleet.
neotoma snapshots export \
  --entity-types agent_task,agent_attempt,agent_outcome,agent_artifact,agent_sensor_signal,agent_cycle_summary \
  --out ./neotoma.json

# 3. Produce a NormalizedExternalSnapshot from whatever your fleet keeps on disk
#    (MEMORY.md, shadow SQLite, vector store, …) and diff.
neotoma snapshots diff \
  --neotoma ./neotoma.json \
  --external ./fleet-state.json \
  --parser json
```

The export document is fleet-neutral — schema version `0.1.0`, with per-field provenance, an `observation_source` histogram, and an `attribution_fingerprint` roll-up per entity. The diff report has four sections:

- `missing_in_neotoma` — entities the fleet knows about but Neotoma does not.
- `missing_in_external` — entities Neotoma has but the fleet lost.
- `field_diffs` — per-field value disagreements.
- `provenance_gaps` — entities with unclassified `observation_source` or anonymous / unverified_client attribution, **even when values agree**. Use this to spot drift caused by the wiring itself, not just data rot.

Register fleet-specific parsers (for example an AIBTC MEMORY.md ASMR parser, a LangGraph state-dump parser) via `registerExternalParser` in [`src/services/drift_comparison.ts`](../../src/services/drift_comparison.ts). The core comparator stays fleet-agnostic.

## 5. Verify in CI

Minimum checks to run in a fleet's CI before shipping writes to production:

1. `neotoma auth session --json` → assert `attribution.tier !== "anonymous"` and `eligible_for_trusted_writes === true`.
2. Write a canary `agent_task` + `agent_sensor_signal` with `--observation-source`; assert the stored rows round-trip via `neotoma entities get` with the expected `observation_source` values.
3. `neotoma snapshots export --entity-types agent_task,agent_sensor_signal --limit 10` → assert the export parses, that at least one entity has `observation_source_histogram.sensor > 0`, and that `attribution_fingerprint.fully_attributed === true`.
4. `neotoma snapshots diff` against a fixture → assert `summary.provenance_gaps === 0` for healthy paths.

## 6. References

- Attribution integration guide (wire format, diagnostics, transport parity): [`docs/subsystems/agent_attribution_integration.md`](../subsystems/agent_attribution_integration.md).
- Auth + trust-tier contract: [`docs/subsystems/auth.md`](../subsystems/auth.md).
- Capability scoping registry: [`docs/subsystems/agent_capabilities.md`](../subsystems/agent_capabilities.md).
- Fleet-general `agent_*` schemas: [`src/services/schema_definitions.ts`](../../src/services/schema_definitions.ts).
- Snapshot export + drift comparison services: [`src/services/snapshot_export.ts`](../../src/services/snapshot_export.ts), [`src/services/drift_comparison.ts`](../../src/services/drift_comparison.ts).
- CLI reference for `snapshots …` commands: [`docs/developer/cli_reference.md#snapshots`](./cli_reference.md#snapshots).
