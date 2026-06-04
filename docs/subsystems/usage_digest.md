# Usage Digest

`usage_digest` is a periodic, PII-safe aggregate telemetry entity. It captures a rollup of operational health and usage metrics for a Neotoma deployment over a bounded time window. It is complementary to — not a replacement for — the per-event `harness_event` and per-incident `daemon_report` entity types:

- **`harness_event`** — one row per turn or operation (high-cardinality, event-level).
- **`daemon_report`** — one entity per incident or anomaly (exception-oriented).
- **`usage_digest`** — one entity per observer × period (aggregated rollup for trend queries).

A usage digest is a drill-down companion: `retrieve_entities(entity_type: "usage_digest")` gives the trend view; the related `daemon_report` rows for the same period give the incident drill-down.

## Purpose

Usage digests serve baseline observability goals:

- Trend analysis: is error rate going up or down over the last 30 days?
- Capacity: which entity types or tool calls are growing fastest?
- Quality feedback: are there recurring friction notes that signal UX gaps?
- Attribution: which agent (`aauth_sub`) is driving the most operations?

The entity is designed to be safe to store in shared or multi-tenant Neotoma instances because all free-text fields (e.g. `friction_notes`) MUST be redacted client-side before submission. See [Client-side redaction](#client-side-redaction) below.

## Schema

The `usage_digest` entity type is registered in `src/services/schema_definitions.ts`.

### Required fields

| Field              | Type              | Notes                                                                                                                                                                                                                    |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schema_version`   | string            | Always `"1.0"` for digests built against this spec.                                                                                                                                                                      |
| `period_start`     | string (ISO-8601) | Start of the digest window, inclusive. Use RFC 3339 format (`2026-06-01T00:00:00Z`). **Must be string, not date** — lexicographic sort must match temporal order for `sort_by: "snapshot.period_end"` to work correctly. |
| `period_end`       | string (ISO-8601) | End of the digest window, exclusive. Used as the time-series sort key.                                                                                                                                                   |
| `reporter_channel` | string            | Observer slug, e.g. `"lemonbrand-observer"`. Identifies the emitter instance.                                                                                                                                            |

### Optional fields

| Field                  | Type   | Notes                                                                                                                                                                                                    |
| ---------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aauth_sub`            | string | Agent attribution. Mirrors `daemon_report` convention.                                                                                                                                                   |
| `reporter_app_version` | string | Semver of the observer app, e.g. `"1.4.2"`.                                                                                                                                                              |
| `reporter_git_sha`     | string | Short SHA of the deployed build.                                                                                                                                                                         |
| `operation_counts`     | object | Opaque. See [Object field shapes](#object-field-shapes) below.                                                                                                                                           |
| `error_rate`           | number | Fraction [0, 1] of operations that errored in the period.                                                                                                                                                |
| `error_counts`         | object | Opaque. See [Object field shapes](#object-field-shapes) below.                                                                                                                                           |
| `entity_type_usage`    | object | Opaque. See [Object field shapes](#object-field-shapes) below.                                                                                                                                           |
| `tool_usage`           | object | Opaque. See [Object field shapes](#object-field-shapes) below.                                                                                                                                           |
| `compliance_signals`   | object | Opaque. Agent-instruction adherence metrics ("is Neotoma used as intended"). See [Object field shapes](#object-field-shapes) and [Compliance signals](#compliance-signals-intended-use-adherence) below. |
| `friction_notes`       | array  | Array of strings. PII MUST be redacted before submission. See [Client-side redaction](#client-side-redaction).                                                                                           |
| `effectiveness_signal` | string | Enum: `excellent` \| `good` \| `fair` \| `poor` \| `unknown`. Enforced by convention, not the registry.                                                                                                  |
| `notes`                | string | Free-text operational notes. PII MUST be redacted.                                                                                                                                                       |
| `redaction_salt`       | string | Shared salt used for client-side PII redaction (see [Client-side redaction](#client-side-redaction)).                                                                                                    |

### Object field shapes

The registry stores these fields as opaque JSONB objects. The schema does not validate their internal shape. This document IS the contract.

#### `operation_counts`

```json
{
  "total": 4821,
  "by_operation": {
    "store": 3100,
    "retrieve_entities": 980,
    "correct": 410,
    "retrieve_entity_by_identifier": 331
  }
}
```

#### `error_counts`

```json
{
  "total": 47,
  "by_error_code": {
    "ERR_STORE_VALIDATION_FAILED": 28,
    "ERR_STORE_RESOLUTION_FAILED": 12,
    "ERR_NOT_FOUND": 7
  }
}
```

#### `entity_type_usage`

```json
{
  "by_entity_type": {
    "conversation": { "store_count": 214, "retrieve_count": 88 },
    "task": { "store_count": 156, "retrieve_count": 304 },
    "harness_event": { "store_count": 3021, "retrieve_count": 12 }
  }
}
```

#### `tool_usage`

```json
{
  "by_tool": {
    "store": { "call_count": 3100, "error_count": 18 },
    "retrieve_entities": { "call_count": 980, "error_count": 4 },
    "correct": { "call_count": 410, "error_count": 7 }
  }
}
```

#### `friction_notes`

An array of redacted free-text strings. Each entry should be a brief description of a UX friction point observed during the period. Examples after redaction:

```json
[
  "retrieve_entities returned empty for entity_type=task despite known stored entities",
  "store rejected with ERR_STORE_VALIDATION_FAILED on field <UUID:a1b2c3d4>"
]
```

## Compliance signals (intended-use adherence)

`operation_counts` / `error_*` answer **"is Neotoma working?"** They do **not** answer **"is the agent using Neotoma _as intended_ per the MCP/CLI instruction contract?"** — an agent can post low error rates while systematically skipping the closing assistant store or orphaning entities. `compliance_signals` carries that second signal: each metric maps to a specific behavioral mandate in the agent instruction contract (`docs/developer/mcp/compact_instructions.md`, `docs/specs/MCP_SPEC.md`).

All rates are fractions in `[0, 1]` (1.0 = fully compliant); counts are non-negative integers (0 = no violations). Every field is optional — an emitter SHOULD only populate the metrics it can actually compute from the data it observes. **Do not emit a metric you cannot compute** (e.g. an observer that only sees CLI/MCP JSONL cannot reliably compute reply-text citation rates). Omission means "not measured," not "100%."

### Confidence tiers

The emitter computes most of these from the observer JSONL (the chronological log of MCP/CLI calls + their request/response payloads). Confidence reflects how reliably a client-side observer can compute each:

- **high** — derivable directly from the JSONL call sequence + payloads (ordering, presence/absence of calls, field formats, response flags).
- **medium** — needs turn/transcript alignment or message-type detection the observer may only partially see.
- **low (aspirational)** — needs NLP over reply text or server-side graph data an external observer typically lacks. Document, but most emitters will omit these.

### Shape

```json
{
  "compliance_signals": {
    "turn_lifecycle": {
      "retrieval_completeness_rate": 0.97, // high — retrieve_* precedes user-phase store on implied-entity turns
      "user_phase_store_rate": 0.99, // high — each user turn has a unified store call
      "closing_store_completion_rate": 0.98, // medium — assistant-reply turns have a paired :assistant store
      "step_ordering_violation_count": 2, // high — non-Neotoma tools called before retrieval/store
      "closing_store_skip_count": 1 // medium — reply produced, no closing store
    },
    "relationships": {
      "closing_relationship_completion_rate": 0.96, // medium — closing store has PART_OF to conversation
      "relationship_batch_efficiency_rate": 0.9, // high — relationships sent in store vs separate calls
      "per_turn_entity_linkage_rate": 0.94, // medium — touched entities have REFERS_TO from the turn
      "reply_citation_completeness_rate": null // low/aspirational — needs NLP on reply text; omit if unmeasured
    },
    "schema_fidelity": {
      "unknown_fields_repair_rate": 1.0, // high — unknown_fields_count>0 followed by repair in same turn
      "schema_check_hit_rate": 0.92, // high — known entity_type stores preceded by describe/retrieve
      "flat_entity_shape_violation_count": 0, // high — no nested-attributes payloads
      "data_fidelity_violation_count": 0 // medium — proxy: unknown_fields_count>0 left unrepaired
    },
    "turn_identity": {
      "turn_key_format_compliance_rate": 1.0, // high — turn_key carries conversation_id prefix
      "conversation_id_stability_rate": 1.0, // high — one conversation_id per visible thread
      "idempotency_key_uniqueness_rate": 1.0, // high — distinct idempotency_key per store in a turn
      "closing_message_key_conflict_count": 0 // high — :assistant suffix present, no collision
    },
    "retrieval_behavior": {
      "retrieval_before_fallback_rate": 0.95, // high — Neotoma retrieval before native-tool fallback
      "category_retrieval_compliance_rate": 0.9 // medium — list-intent queries call retrieve_entities
    },
    "coverage": {
      "session_coverage_rate": 1.0, // high — sessions with >=1 store call
      "rapid_fire_store_frequency_rate": 0.97 // medium — stores at least every 3–5 turns in rapid sessions
    },
    "security": {
      "pii_stripping_compliance_rate": 1.0, // high — submit_issue bodies free of detectable PII
      "issue_linking_completion_rate": 0.93 // high — submit_issue followed by REFERS_TO links
    },
    "summary": {
      "overall_mandate_compliance_rate": 0.96, // emitter-defined weighted aggregate of populated rates
      "critical_violations_count": 3 // total FORBIDDEN-pattern occurrences (skip-session, only-user-msg, no-closing-store)
    }
  }
}
```

The groups above are the families an emitter SHOULD aim to cover; the exact key set is a documented convention (the registry stores the object opaquely). Add families as the instruction contract evolves — additive, no schema migration. Each metric's mandate, violation signature, and confidence tier are tracked in the design analysis attached to issue #1569.

## Identity and idempotency

The entity's canonical identity is the composite `[reporter_channel, period_start, period_end]`. This three-field composite prevents silent deduplication of replayed digests from different channels or different periods.

`name_collision_policy: "reject"` is set on this entity type. A second `store` with the same `reporter_channel` + `period_start` + `period_end` will return `ERR_STORE_RESOLUTION_FAILED` rather than silently merging or creating a duplicate. If you need to amend a digest, use `correct` instead.

The recommended idempotency key for `store` calls is:

```
usage-digest-<reporter_channel>-<period_end>
```

For example: `usage-digest-lemonbrand-observer-2026-06-01T00:00:00Z`.

## Submitting a digest

### Via the `store` MCP operation

```json
{
  "entity_type": "usage_digest",
  "idempotency_key": "usage-digest-lemonbrand-observer-2026-06-01T00:00:00Z",
  "schema_version": "1.0",
  "period_start": "2026-05-25T00:00:00Z",
  "period_end": "2026-06-01T00:00:00Z",
  "reporter_channel": "lemonbrand-observer",
  "reporter_app_version": "1.4.2",
  "operation_counts": { "total": 4821, "by_operation": { "store": 3100 } },
  "error_rate": 0.0097,
  "error_counts": { "total": 47, "by_error_code": { "ERR_STORE_VALIDATION_FAILED": 28 } },
  "entity_type_usage": { "by_entity_type": { "task": { "store_count": 156 } } },
  "tool_usage": { "by_tool": { "store": { "call_count": 3100, "error_count": 18 } } },
  "friction_notes": ["retrieve_entities returned empty for entity_type=task despite known data"],
  "effectiveness_signal": "good"
}
```

### Authentication

Two paths are supported:

1. **AAuth grant** — issue a grant with `{ op: "store", entity_types: ["usage_digest"] }` to the reporting agent's `aauth_sub`. This is the recommended path for automated observers.
2. **Keyless guest** — if the `usage_digest` type is configured with a permissive `guest_access_policy` (see [`guest_access_policy.md`](guest_access_policy.md)), unauthenticated `store` calls are accepted. This is appropriate for low-trust telemetry sinks where the data is not sensitive.

## Retrieving digests (time-series)

```json
{
  "entity_type": "usage_digest",
  "sort_by": "snapshot.period_end",
  "sort_order": "desc",
  "limit": 30
}
```

`sort_by: "snapshot.<field>"` is a supported sort form in `retrieve_entities`. The `period_end` field is an ISO-8601 string, so lexicographic order matches temporal order (as required by the schema design decision). This makes descending `period_end` sort work correctly without a date-aware index.

To filter by channel:

```json
{
  "entity_type": "usage_digest",
  "sort_by": "snapshot.period_end",
  "sort_order": "desc",
  "snapshot_filters": { "reporter_channel": { "op": "eq", "value": "lemonbrand-observer" } }
}
```

## Relationship to daemon_report

A usage digest COVERS its period. The individual `daemon_report` entities emitted during that period provide the drill-down. Clients that build dashboards can:

1. Retrieve the digest for the period to get aggregate error rate and counts.
2. Retrieve related `daemon_report` entities (sorted by `last_observation_at` desc) to see the individual incidents.

The relationship from a digest to its daemon_report rows is expressed as:

```json
{
  "from_entity_id": "<usage_digest entity id>",
  "to_entity_id": "<daemon_report entity id>",
  "relationship_type": "REFERS_TO"
}
```

This is an optional but recommended convention. Omitting it does not break anything; it only removes the drill-down link in the Inspector graph view.

## Client-side redaction

All free-text fields (`friction_notes`, `notes`) MUST have PII removed before the digest is submitted. The recommended approach is a shared redaction salt per digest.

### Scan mode

Inspect each string for patterns matching:

| Pattern                                            | Placeholder          |
| -------------------------------------------------- | -------------------- |
| Email address (`foo@bar.com`)                      | `<EMAIL:sha256[:8]>` |
| Bearer / API token (long hex or base64 strings)    | `<TOKEN:sha256[:8]>` |
| Filesystem path (`/home/user/...`, `C:\Users\...`) | `<PATH:sha256[:8]>`  |
| UUID (`xxxxxxxx-xxxx-...`)                         | `<UUID:sha256[:8]>`  |
| Phone number                                       | `<PHONE:sha256[:8]>` |

The hash uses `sha256(value + redaction_salt)`, truncated to 8 hex characters. This lets a single operator correlate the same redacted value across digests (using the same salt) without re-exposing PII.

Store the `redaction_salt` on the entity so the server-side record is self-describing. The salt is not a secret; its purpose is correlation, not encryption.

## Emitter reference (Node/TypeScript)

The following is a reference snippet for an observer building and submitting a weekly digest. Include this in your observer's reporter module.

```typescript
import crypto from "node:crypto";

/**
 * Build and submit a usage digest for the given period.
 *
 * @param neotomaClient - Neotoma MCP store client (wraps the `store` operation).
 * @param channel - Reporter channel slug, e.g. "lemonbrand-observer".
 * @param periodStart - ISO-8601 string, start of the period (inclusive).
 * @param periodEnd   - ISO-8601 string, end of the period (exclusive).
 * @param metrics     - Aggregated metrics for the period.
 */
export async function emitUsageDigest(
  neotomaClient: { store: (payload: Record<string, unknown>) => Promise<unknown> },
  channel: string,
  periodStart: string,
  periodEnd: string,
  metrics: {
    operationCounts: Record<string, unknown>;
    errorRate: number;
    errorCounts: Record<string, unknown>;
    entityTypeUsage: Record<string, unknown>;
    toolUsage: Record<string, unknown>;
    frictionNotes: string[];
    effectivenessSignal: "excellent" | "good" | "fair" | "poor" | "unknown";
    notes?: string;
    reporterAppVersion?: string;
    reporterGitSha?: string;
    aauthSub?: string;
  }
): Promise<void> {
  // Generate a per-digest redaction salt for PII correlation.
  const redactionSalt = crypto.randomBytes(16).toString("hex");

  // Redact PII from free-text fields before submission.
  const redactedFrictionNotes = metrics.frictionNotes.map((note) => redactPii(note, redactionSalt));
  const redactedNotes = metrics.notes ? redactPii(metrics.notes, redactionSalt) : undefined;

  const idempotencyKey = `usage-digest-${channel}-${periodEnd}`;

  await neotomaClient.store({
    entity_type: "usage_digest",
    idempotency_key: idempotencyKey,
    schema_version: "1.0",
    period_start: periodStart,
    period_end: periodEnd,
    reporter_channel: channel,
    ...(metrics.reporterAppVersion && { reporter_app_version: metrics.reporterAppVersion }),
    ...(metrics.reporterGitSha && { reporter_git_sha: metrics.reporterGitSha }),
    ...(metrics.aauthSub && { aauth_sub: metrics.aauthSub }),
    operation_counts: metrics.operationCounts,
    error_rate: metrics.errorRate,
    error_counts: metrics.errorCounts,
    entity_type_usage: metrics.entityTypeUsage,
    tool_usage: metrics.toolUsage,
    friction_notes: redactedFrictionNotes,
    effectiveness_signal: metrics.effectivenessSignal,
    ...(redactedNotes && { notes: redactedNotes }),
    redaction_salt: redactionSalt,
  });
}

// ─── PII redaction ────────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, label: "EMAIL" },
  { re: /\b[0-9a-fA-F]{32,}\b/g, label: "TOKEN" },
  { re: /(\/[a-zA-Z0-9_.-]+){3,}/g, label: "PATH" },
  { re: /[C-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)+/g, label: "PATH" },
  {
    re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    label: "UUID",
  },
  { re: /\+?[\d\s\-().]{7,15}\d/g, label: "PHONE" },
];

function hashFragment(value: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(value + salt)
    .digest("hex")
    .slice(0, 8);
}

function redactPii(text: string, salt: string): string {
  let result = text;
  for (const { re, label } of PII_PATTERNS) {
    result = result.replace(re, (match) => `<${label}:${hashFragment(match, salt)}>`);
  }
  return result;
}
```

### Usage example

```typescript
await emitUsageDigest(
  neotomaClient,
  "lemonbrand-observer",
  "2026-05-25T00:00:00Z",
  "2026-06-01T00:00:00Z",
  {
    operationCounts: { total: 4821, by_operation: { store: 3100, retrieve_entities: 980 } },
    errorRate: 0.0097,
    errorCounts: { total: 47, by_error_code: { ERR_STORE_VALIDATION_FAILED: 28 } },
    entityTypeUsage: { by_entity_type: { task: { store_count: 156, retrieve_count: 304 } } },
    toolUsage: { by_tool: { store: { call_count: 3100, error_count: 18 } } },
    frictionNotes: ["retrieve_entities returned empty for entity_type=task despite known data"],
    effectivenessSignal: "good",
    reporterAppVersion: "1.4.2",
  }
);
```

## Related

- [`daemon_report`](../../src/services/schema_definitions.ts) — per-incident anomaly reports; the drill-down companion to usage digests.
- [`harness_event`](../../src/services/schema_definitions.ts) — per-turn/per-operation event records; the raw data that usage digests aggregate.
- [`guest_access_policy.md`](guest_access_policy.md) — configuring keyless write access for telemetry sinks.
- [`aauth.md`](aauth.md) — issuing agent grants for authenticated digest submission.
- [`subscriptions.md`](subscriptions.md) — subscribing to `UsageDigestClosed` timeline events for downstream alerting.
