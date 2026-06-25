# Conflict Resolution — Merge Policies and Field Semantics

**Related docs:**
- [Reducer engine](reducer.md) — how merge strategies are executed
- [Schema registry](schema_registry.md) — how to register a schema with custom policies
- [Observation architecture](observation_architecture.md) — `source_priority` and `observed_at`

## Scope

This document covers:

- The four merge strategies and their tie-breakers
- Why `--source-priority` / `source_priority` is a no-op until you register a schema
- How to register a schema with per-field `merge_policies` via `register_schema`
- "Omit, don't zero" — why omitting a field is different from writing `0` or `null`
- Current limitations: write-time value constraints and the LWW-default footgun

This document does NOT cover:

- Merge strategy implementation internals — see [reducer.md](reducer.md)
- Schema field definitions and converters — see [schema_registry.md](schema_registry.md)
- Entity deduplication — see [entity_merge.md](entity_merge.md)

---

## 1. The Four Merge Strategies

When multiple observations exist for the same entity field, the reducer picks one winner
per field according to the field's configured **merge strategy**. All four strategies are
implemented in `src/reducers/observation_reducer.ts`.

### 1.1 `last_write`

**Winner:** The observation with the most recent `observed_at` timestamp.

- Tie-breaker: `id ASC` (stable secondary sort when timestamps collide).
- Implementation: `lastWriteWins()` at line 314 of `src/reducers/observation_reducer.ts`.

Use `last_write` for values that change over time and where the latest reading is the
most accurate — account balances, status fields, mutable counters.

```
obs_a: { status: "pending",  observed_at: "2026-01-01T10:00:00Z" }
obs_b: { status: "complete", observed_at: "2026-01-02T09:00:00Z" }

→ snapshot.status = "complete"  (obs_b wins: later timestamp)
```

### 1.2 `highest_priority`

**Winner:** The observation with the highest numeric `source_priority`.

- Primary sort: `source_priority DESC`.
- Secondary sort (within the same priority tier): `observation_source` rank ASC (schema-configurable; sensors and workflow outputs rank above LLM summaries by default).
- Tie-breaker: controlled by the field's optional `tie_breaker` key — `"observed_at"` (default; most recent wins) or `"source_priority"` (falls through to `id ASC`).
- Implementation: `highestPriority()` at line 336 of `src/reducers/observation_reducer.ts`.

Use `highest_priority` when some sources are inherently more trustworthy than others —
official documents over extracted receipts, sensor data over user text, corrections over
initial extractions.

```
obs_a: { vendor_name: "ACME Inc", source_priority: 100 }
obs_b: { vendor_name: "Acme",     source_priority: 500 }

→ snapshot.vendor_name = "Acme"  (obs_b wins: higher priority)
```

> **Footgun:** `highest_priority` is only honored when the field's schema entry declares
> `strategy: "highest_priority"`. Auto-discovered schemas default every field to
> `last_write` (see §2 below), so `--source-priority` is silently ignored until you
> register an explicit schema. See [issue #1755](https://github.com/markmhendrickson/neotoma/issues/1755).

### 1.3 `most_specific`

**Winner:** The observation with the highest `specificity_score`.

- Primary sort: `specificity_score DESC`.
- Secondary sort: `source_priority DESC` (when `tie_breaker: "source_priority"`) or `observation_source` rank ASC.
- Tie-breaker: `observed_at DESC`.
- Implementation: `mostSpecific()` at line 368 of `src/reducers/observation_reducer.ts`.

Use `most_specific` when specificity signals accuracy — a precise postal address beats a
city name, a full legal name beats a nickname, an ISIN beats a ticker alias.

```
obs_a: { location: "Madrid",             specificity_score: 10 }
obs_b: { location: "Calle Mayor 1, Madrid", specificity_score: 85 }

→ snapshot.location = "Calle Mayor 1, Madrid"  (obs_b wins: higher specificity)
```

### 1.4 `merge_array`

**Winner:** Not a single winner — values from all observations at the **maximum present
`source_priority`** are unioned into a deduplicated array.

- Only observations at the maximum `source_priority` contribute to the union (priority
  gating — see [reducer.md §3.4](reducer.md)).
- `null` entries inside contributed arrays are dropped; they are not meaningful elements.
- A correction (`source_priority: 1000`) fully **replaces** lower-priority array
  contributions rather than merging into them.

Use `merge_array` for accumulative sets where every same-priority value is valid — tags,
aliases, category labels, related IDs.

```
obs_a: { tags: ["finance", "q1"],    source_priority: 100 }
obs_b: { tags: ["finance", "audit"], source_priority: 100 }

→ snapshot.tags = ["finance", "q1", "audit"]  (union, deduplicated)
```

---

## 2. Auto-Discovered Schemas Default Every Field to `last_write`

When an entity type has **no registered schema**, Neotoma auto-discovers a schema from the
first observation's fields. The auto-discovery path (`buildSchemaFromExtractedFields()` at
line 748 of `src/services/schema_registry.ts`) assigns `strategy: "last_write"` to every
field:

```typescript
// src/services/schema_registry.ts:770
merge_policies[safeKey] = { strategy: "last_write" };
```

This means:

- **`--source-priority` / `source_priority` has no effect on auto-discovered schemas.**
  The reducer applies `last_write`, which ignores priority entirely and picks the most
  recent observation. No matter how high you set `source_priority`, the latest write wins.
- Fields you expect to resolve by priority, specificity, or accumulation will silently
  fall through to the most-recent-wins default.

**To make priority (or any other strategy) effective, you must register a schema with an
explicit `reducer_config`.** See §3 below.

---

## 3. Registering a Schema with `highest_priority`

Use the `register_schema` MCP tool (or the `neotoma schema register` CLI) to declare
per-field merge policies. The `reducer_config.merge_policies` object maps field names to
strategy entries.

### Worked example: sensor reading wins over manual entry

Suppose you store `sensor_reading` entities from two sources:

- An IoT sensor that submits with `source_priority: 800`.
- A manual user override that submits with `source_priority: 200`.

Without a registered schema, both sources use `last_write` — the most recent write wins,
regardless of priority. After a manual override, the next sensor reading would overwrite
it silently.

**Register a schema that elects `highest_priority` for the `value` field:**

```json
{
  "entity_type": "sensor_reading",
  "schema_version": "1.0",
  "schema_definition": {
    "fields": {
      "sensor_id":   { "type": "string", "required": true },
      "value":       { "type": "number", "required": true },
      "unit":        { "type": "string" },
      "recorded_at": { "type": "date" },
      "tags":        { "type": "array" }
    }
  },
  "reducer_config": {
    "merge_policies": {
      "sensor_id":   { "strategy": "last_write" },
      "value":       { "strategy": "highest_priority", "tie_breaker": "observed_at" },
      "unit":        { "strategy": "last_write" },
      "recorded_at": { "strategy": "highest_priority", "tie_breaker": "observed_at" },
      "tags":        { "strategy": "merge_array" }
    }
  },
  "activate": true
}
```

Call `register_schema` with this payload:

```bash
neotoma schema register \
  --entity-type sensor_reading \
  --schema-version "1.0" \
  --schema-definition '{"fields":{"sensor_id":{"type":"string","required":true},"value":{"type":"number","required":true},"unit":{"type":"string"},"recorded_at":{"type":"date"},"tags":{"type":"array"}}}' \
  --reducer-config '{"merge_policies":{"sensor_id":{"strategy":"last_write"},"value":{"strategy":"highest_priority","tie_breaker":"observed_at"},"unit":{"strategy":"last_write"},"recorded_at":{"strategy":"highest_priority","tie_breaker":"observed_at"},"tags":{"strategy":"merge_array"}}}' \
  --activate
```

Or via the MCP tool:

```json
{
  "tool": "register_schema",
  "entity_type": "sensor_reading",
  "schema_version": "1.0",
  "schema_definition": {
    "fields": {
      "sensor_id":   { "type": "string", "required": true },
      "value":       { "type": "number", "required": true },
      "unit":        { "type": "string" },
      "recorded_at": { "type": "date" },
      "tags":        { "type": "array" }
    }
  },
  "reducer_config": {
    "merge_policies": {
      "sensor_id":   { "strategy": "last_write" },
      "value":       { "strategy": "highest_priority", "tie_breaker": "observed_at" },
      "unit":        { "strategy": "last_write" },
      "recorded_at": { "strategy": "highest_priority", "tie_breaker": "observed_at" },
      "tags":        { "strategy": "merge_array" }
    }
  },
  "activate": true
}
```

After registration, observations submitted with `source_priority: 800` will win over
observations with `source_priority: 200` for the `value` and `recorded_at` fields,
regardless of which was written more recently.

### `tie_breaker` options

| Value | Behavior within the same `source_priority` tier |
|-------|--------------------------------------------------|
| `"observed_at"` (default) | Most recent observation wins |
| `"source_priority"` | Falls through to `id ASC` (stable, not time-based) |

---

## 4. Omit, Don't Zero

Neotoma distinguishes between a field that is **absent** and a field whose value is
**`0` or `null`**.

### What "absent" means

When an observation does not include a field at all (the key is omitted from the
`fields` object), the reducer treats that observation as **not contributing** to the
field. The field is skipped in merge ordering for that observation.

```json
// Observation A — does NOT carry "score"
{ "name": "Alice" }

// Observation B — carries "score"
{ "name": "Bob", "score": 42 }

// Snapshot: score = 42  (only obs_b contributes)
```

### What `null` and `0` mean

When an observation **explicitly writes** `null` or `0` for a field, that is a real
value. It participates in merge ordering exactly like any other value. If it wins under
the active strategy, the snapshot reflects that value — `null` causes the key to be
omitted from the snapshot (cleared); `0` stores `0` in the snapshot.

```json
// Observation A — "score" wins under last_write (latest timestamp)
{ "score": null, "observed_at": "2026-06-24T12:00:00Z" }

// Observation B — older
{ "score": 42, "observed_at": "2026-06-01T09:00:00Z" }

// Snapshot: score key is absent  (obs_a's null won and cleared the field)
```

### The practical rule: omit on failed or absent reads

If your code reads a value from an external system and the read fails or returns nothing,
**omit the field from the observation entirely**. Do not write a sentinel `0`, `""`,
`null`, or `false`.

```typescript
// Wrong — silently stores 0 as a real value
const obs = {
  entity_type: "invoice",
  fields: {
    vendor_name: fetchedName,
    amount_due: fetchedAmount ?? 0,   // ← 0 is now a real observation
  }
};

// Correct — omit the field when the read failed
const fields: Record<string, unknown> = {
  vendor_name: fetchedName,
};
if (fetchedAmount !== undefined && fetchedAmount !== null) {
  fields.amount_due = fetchedAmount;
}
const obs = { entity_type: "invoice", fields };
```

The same applies to any falsy sentinel: `""`, `false`, `[]` (for non-array fields), or
`"N/A"`. If the value is genuinely unknown, omit it — let an earlier observation retain
its value under the active merge strategy.

### When `null` IS the right thing to write

Use `null` deliberately when you want to **clear** a field. A correction
(`correct(entity_id, type, field, null)`) is the canonical way to do this. A `null`
written at high `source_priority` will win under any strategy and remove the field from
the snapshot.

---

## 5. Current Limitations

### Write-time value constraints are not yet supported

Neotoma does not currently enforce value constraints at write time — range checks,
enum validation, required-field enforcement, or banned-value rejection. All of these
happen downstream in the reducer (type coercion via converters) or not at all.

This means:

- An observation can store `amount_due: -999` even if negative amounts are nonsensical.
- A field declared `required: true` in the schema is validated on read (snapshot), not
  on write (observation creation).
- There is no way today to reject a `null` write to a field that should always have a value.

Write-time value constraints are tracked in
[issue #1756](https://github.com/markmhendrickson/neotoma/issues/1756).

### The LWW-default footgun

Auto-discovered schemas assign `last_write` to every field (§2 above). This means
`--source-priority` is silently ignored for any entity type that does not have a
registered schema with `highest_priority` declared on the relevant fields. There is no
warning at write time that the priority you supplied had no effect.

This footgun is tracked in
[issue #1755](https://github.com/markmhendrickson/neotoma/issues/1755).

**Mitigation today:** register an explicit schema (`register_schema`) for any entity type
where source priority must be honored.

---

## Quick Reference

| I want... | Strategy | Notes |
|-----------|----------|-------|
| Latest write wins | `last_write` | Default for auto-discovered schemas |
| Trusted source wins | `highest_priority` | Requires a registered schema; `source_priority` on observations |
| Most specific value wins | `most_specific` | Requires `specificity_score` on observations |
| Accumulate all values | `merge_array` | Field must be array type; corrections replace |
| Field cleared | Write `null` explicitly | Use `correct()` at high priority |
| Field kept from earlier observation | Omit the field | Do not write `0` or `null` as sentinel |

## Related Documents

- [reducer.md](reducer.md) — full merge strategy implementation, tie-breakers, provenance
- [schema_registry.md](schema_registry.md) — `ReducerConfig` / `MergePolicy` type definitions
- [observation_architecture.md](observation_architecture.md) — `source_priority`, `observed_at`, `specificity_score`
- [issue #1755](https://github.com/markmhendrickson/neotoma/issues/1755) — LWW-default footgun (source-priority silently ignored for auto-discovered schemas)
- [issue #1756](https://github.com/markmhendrickson/neotoma/issues/1756) — write-time value constraints (range/enum/required-enforcement)
