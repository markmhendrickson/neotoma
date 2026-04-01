# Progressive schema enforcement

## Problem

Pre-defining entity schemas before storing data gives users consistency, validation, queryability, and discoverability. But most users won't do it. Agents storing financial data (or any structured data) incrementally will `store` whatever fields the conversation or import produces. Without intervention, schemas drift: the same concept gets five field names, numbers arrive as strings, required context is omitted, and queries become unreliable.

The gap between "users who pre-define" and "users who don't" should not exist. Neotoma should deliver the same end-state regardless of whether the user registered a schema upfront or let it emerge from usage.

---

## Principle

**Schema-on-write with progressive tightening.** Accept anything on first contact. Converge toward consistency through inference, hints, and soft enforcement. Crystallize when confidence is high. Never require the user to read a spec before storing their first entity.

---

## What pre-definition buys (the target properties)

| Property | Description |
|----------|-------------|
| **Field name consistency** | `amount_eur` every time, not `eur`, `amount_euros`, `€` |
| **Type coercion** | Numbers are numbers, dates are dates, not strings |
| **Required-field enforcement** | A `loan` without `lender` is probably incomplete |
| **Controlled vocabulary** | `billing_frequency` is one of N tokens, not free text |
| **Relationship shape** | A `property_expense` should always link to a `financial_account` |
| **Discoverability** | Agents and queries know what fields exist on a type |

Every tier below should be evaluated against how well it delivers these properties without requiring user action.

---

## Tier 1 — Schema inference and convergence

**Friction:** Zero for the user. Internal to the platform.
**Impact:** High. Addresses field consistency, type coercion, and discoverability.

### 1.1 Post-hoc schema crystallization

After N observations of the same `entity_type`, Neotoma derives a suggested schema from the union of observed fields, dominant types, and common patterns.

- Track field frequency, value types, and cardinality across all entities of a type.
- When a type reaches a confidence threshold (e.g. 5+ entities, >80% field overlap), generate a candidate schema.
- Surface it: "You've stored 14 `expense` entities. Here's the inferred schema. Adopt it?" Or adopt silently in a "lenient" mode.
- Once adopted, the schema behaves like a registered schema for validation and query planning.

### 1.2 Field normalization hints

When a `store` arrives with `amount_euros` and the system already has 12 `expense` entities using `amount_eur`, suggest or auto-map the alias at write time.

- Maintain per-type field alias maps (fuzzy matching + edit distance + semantic similarity).
- On write, if a field name is close to an existing canonical field, either: (a) silently map it (lenient mode), (b) warn and suggest (default mode), or (c) reject (strict mode).
- Log the mapping so the user can audit or override.

### 1.3 Canonical field registry

Maintain a global (or per-user) dictionary of known fields with expected types. When `amount_eur` shows up on any entity type, Neotoma knows it's a number. When `as_of_date` appears, it's a date.

- Ship a base dictionary of common financial, temporal, and identity fields.
- Extend per-user as new fields are observed.
- Use for type coercion at write time: if `amount_eur` arrives as `"45.00"` (string), coerce to `45.00` (number) and note the coercion.

---

## Tier 2 — Write-time guardrails

**Friction:** Low to medium. Opt-in strictness; defaults are lenient.
**Impact:** Medium. Addresses required-field enforcement, controlled vocabulary, and relationship shape.

### 2.1 Soft validation on store

When storing an entity and the system already has a crystallized or inferred schema for that type, validate the incoming fields.

- **Lenient mode (default):** Accept the store. Log warnings for missing common fields, type mismatches, or unknown fields. Return warnings in the response so agents can self-correct.
- **Strict mode (opt-in):** Reject stores that violate the schema. User or agent enables this per type or globally.
- Warnings should be actionable: "This `loan` is missing `lender` (present on 12/12 existing loans)."

### 2.2 Discriminator inference

If every `expense` entity has an `expense_category` field, infer it as a discriminator and surface it on future writes.

- Track fields with low cardinality and high presence across entities of a type.
- When an agent stores an `expense` without `expense_category`, include in the response: "Previous expenses use `expense_category` with values: general, discretionary, vehicle, third_party."
- Agents with good instructions will self-correct. Users see the prompt in their tool output.

### 2.3 Relationship templates

Track common relationship patterns per entity type. If every `property_expense` links to a `financial_account` via `REFERS_TO`, flag when a new one doesn't.

- "Every `property_expense` you've stored links to a `financial_account`. This one doesn't. Should it?"
- Same tiered enforcement: lenient = log, default = warn in response, strict = reject.

---

## Tier 3 — Agent-side schema awareness

**Friction:** Zero for the user. Requires agent/platform integration.
**Impact:** High. Addresses all six properties by front-loading good schema choices before the first store.

### 3.1 Domain schema packs

Ship curated schema packs for common domains: personal finance, small business accounting, real estate, crypto portfolio, etc.

- A schema pack defines entity types, field names, types, required fields, controlled vocabularies, and relationship templates.
- Agents activate a pack when the user's intent is clear: "track my finances" loads the personal-finance pack.
- The user never sees or manages the schemas directly. The agent's first stores already conform.
- Packs are versioned and extensible. Users can fork or extend.

### 3.2 Schema negotiation on first store

On the first `store` of a new `entity_type`, Neotoma responds with the inferred schema and a confirmation signal.

- "Created new type `loan`. Based on your fields, here's the inferred schema. Future stores will be validated against this unless you modify it."
- One store creates the schema. No separate `register_schema` step required for the common case.
- If the type matches a known domain pack type, suggest adopting the pack definition instead of the ad-hoc one.

### 3.3 Enhanced MCP instructions

Update agent-facing MCP instructions to encourage schema conformance without requiring pre-registration.

- Before storing a new entity type, check `list_entity_types` for a close match. If one exists, conform to its fields.
- After storing, read back the response warnings and self-correct in the same turn.
- When a domain pack is active, prefer its type names and field names over ad-hoc ones.

---

## Progressive tightening lifecycle

```
First store
  → Neotoma accepts anything
  → Infers initial schema from fields (Tier 1.1)
  → Applies canonical field types (Tier 1.3)
  → Returns inferred schema + any normalization applied (Tier 3.2)

Subsequent stores
  → Fuzzy-matches field names to existing schema (Tier 1.2)
  → Warns on drift: new fields OK, type mismatches flagged, missing common fields noted (Tier 2.1)
  → Surfaces discriminator + relationship expectations (Tier 2.2, 2.3)

Threshold crossed (N entities or explicit confirmation)
  → Schema crystallizes (Tier 1.1)
  → Validation tightens to default or strict (Tier 2.1)
  → Schema available for queries, UI, and agent discovery

Domain pack activated (Tier 3.1)
  → Skips the convergence phase entirely
  → First store already conforms to curated schema
  → Best UX for known domains
```

---

## Recommendation and priority

| Priority | Item | Rationale |
|----------|------|-----------|
| **P0** | Tier 1.1 — Post-hoc schema crystallization | Highest-leverage single feature. Makes incremental storage converge toward the same outcome as pre-definition without any user action. |
| **P0** | Tier 1.3 — Canonical field registry | Low implementation cost. Prevents the most common drift (type mismatches, currency/date fields as strings). |
| **P1** | Tier 1.2 — Field normalization hints | Prevents the "five names for the same field" problem. Can start simple (edit distance) and improve. |
| **P1** | Tier 2.1 — Soft validation on store | Natural extension of schema crystallization. Warnings in responses let agents self-correct immediately. |
| **P1** | Tier 3.2 — Schema negotiation on first store | Makes the first store of a new type a "schema registration" event. Removes the need for a separate `register_schema` step in most workflows. |
| **P2** | Tier 2.2 — Discriminator inference | Useful but narrower. Can be implemented as a special case of schema crystallization. |
| **P2** | Tier 2.3 — Relationship templates | Same: useful, narrower. Depends on relationship patterns being consistent enough to infer. |
| **P2** | Tier 3.3 — Enhanced MCP instructions | Low cost, moderate impact. Can be done independently of platform changes. |
| **P3** | Tier 3.1 — Domain schema packs | Highest UX impact for known domains but requires curation effort. Build after the inference layer proves the concept. |

---

## Success criteria

The directive succeeds when:

1. A user who never calls `register_schema` gets the same field consistency, type safety, and query reliability as one who pre-defines everything.
2. An agent storing data incrementally receives enough feedback in store responses to self-correct within the same turn.
3. Schema drift across 50+ entities of the same type stays below a defined threshold (e.g. <5% field name variants, 0% type mismatches after crystallization).
4. Domain-expert users (e.g. financial advisors, accountants) can activate a schema pack and immediately get structured, validated storage without understanding Neotoma internals.

---

## Related documents

- [`developer_release_principles.md`](../foundation/developer_release_principles.md) — core thesis: deterministic state, not retrieval
- [`schema_handling.md`](schema_handling.md) — current schema architecture
- [`schema_expansion.md`](schema_expansion.md) — schema expansion patterns
