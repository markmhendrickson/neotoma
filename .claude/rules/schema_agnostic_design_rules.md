<!-- Source: docs/foundation/schema_agnostic_design_rules.md -->

# Schema-Agnostic Design Rules

## Purpose

Ensure behavior that varies by `entity_type` is driven by declarations on the
schema in the registry, not by hardcoded per-type branches in code. New entity
types must be addable without modifying `src/`.

## Trigger Patterns

Apply when designing or modifying any code that:

- Resolves or derives an entity's identity (`canonical_name`, `entity_id`)
- Emits timeline events from observation fields
- Auto-creates relationships during ingestion
- Validates or transforms fields during store
- Projects observations into the snapshot
- Chooses a merge strategy for a field
- Detects duplicates, synonyms, or equivalents of entity types
- Varies any other behavior based on `entity_type`

## Agent Actions

### Step 1: Check for an existing schema declaration point

Before adding a per-type branch, check whether the behavior can be expressed as
a declaration on the `SchemaDefinition`:

- `canonical_name_fields` — identity composition
- `temporal_fields` — timeline emission rules
- `reference_fields` — field → entity relationship resolution
- `aliases` — duplicate-type equivalence hints
- `merge_policies` — per-field reducer strategy
- Field-level `converters` / `field_type`

If one fits, extend that declaration and read it at runtime.

### Step 2: If no declaration fits, extend the schema

If the behavior is genuinely schema-driven but no declaration exists:

1. Extend `SchemaDefinition` in `src/services/schema_registry.ts` with a new
   optional field.
2. Add validation in `validateSchemaDefinition`.
3. Read the declaration at the appropriate runtime hook.
4. Seed declarations for high-value existing types via bootstrap migration in
   `src/services/schema_bootstrap.ts`.
5. Provide a generic algorithmic or warned fallback for unseeded types.

### Step 3: Only fall back to code branches when declaration is impossible

Hardcoded `if (entityType === "X")` branches are allowed only when:

- The behavior is not data-driven (e.g. a cross-cutting security check).
- Every plausible future type needs the same behavior (i.e. the rule is already
  schema-agnostic, just implemented once).

Document the justification in a comment citing this rule.

## Naming convention: singular entity types

`entity_type` names MUST be singular (e.g. `post`, `contact`, `transaction`),
not plural. An entity represents one thing; plural type names fragment queries
and mismatch the semantic of a single row. Irregular plurals and uncountable
nouns (`news`, `data`, `analytics`, `status`, …) are allowlisted by the
registry. When a plural is genuinely intended, pass `force: true` at
registration time, or add the name to `NEOTOMA_ALLOWED_PLURAL_TYPES`.

## Constraints

Agents MUST NOT:

- Add `switch (entity_type)` or `if (entityType === "X")` branches for behavior
  that could be declared on the schema.
- Hardcode lists of entity types in utility modules (e.g. "post / social_post /
  blog_post" in `src/utils/`).
- Assume a fixed set of entity types in tests (fixtures should declare their
  own schemas).
- Introduce per-type special cases in `entity_resolution.ts`,
  `timeline_events.ts`, `observation_reducer.ts`, or `storeStructuredInternal`
  without a schema declaration backing them.
- Register new entity types with plural names unless the word is an allowlisted
  irregular or the call explicitly passes `force: true`.
- Auto-normalize or silently rewrite `entity_type` values at store time.

Agents MUST:

- Prefer extending `SchemaDefinition` over branching in code.
- Log a structured warning keyed by `entity_type` when falling back to a
  heuristic for an unseeded type, so drift is auditable.
- Seed new declarations for high-value existing types via the bootstrap
  migration.
- Use singular entity type names; when a sibling concept already exists (e.g.
  `blog_post` when `post` exists), declare it as an alias on the canonical type
  instead of adding a new type.

## Validation Checklist

- [ ] No new `switch (entity_type)` or `entityType === "X"` branches without
      justification.
- [ ] If behavior varies by type, the schema has a declaration field for it.
- [ ] Unseeded types trigger a warning, not silent divergence.
- [ ] Bootstrap migration seeds the behavior for known production types.
- [ ] New tests cover both a seeded type and an unseeded (warned) type path.

## Related Documents

- `docs/specs/DATA_MODELS.md`
- `docs/architecture/schema_handling.md`
- `docs/subsystems/reducer.md`
- `docs/foundation/entity_resolution.md`
- `docs/architecture/change_guardrails_rules.mdc` — cross-cutting change touchpoints (OpenAPI, contract mappings, CLI/MCP parity, release discipline).
