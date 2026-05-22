---
title: Inspector — Schemas
summary: Browse registered schemas, their declared fields, merge policies, and timeline / relationship rules.
category: development
subcategory: ui
order: 50
audience: developer
visibility: public
tags: [inspector, schemas, registry]
---

# Inspector — Schemas

The Schemas screen (`/inspector/schemas`) is a browser for the schema
registry — the table that drives every type-specific behavior in Neotoma.

## What you see

- **Registered types.** Every `entity_type` that has a `SchemaDefinition` in
  the registry, with its current version.
- **Declared fields.** Field name, declared type, merge policy, whether it
  participates in `canonical_name_fields`, whether it's a `temporal_field`,
  whether it's a `reference_field` (entity link).
- **Aliases.** Sibling type names that resolve back to the canonical type.
- **Bootstrap origin.** Whether the schema was seeded by
  `src/services/schema_bootstrap.ts` or registered at runtime.

## Why this matters

Per `docs/foundation/schema_agnostic_design_rules.md`, all per-type behavior
in Neotoma is supposed to be schema-declared, not code-branched. The Schemas
screen is how an operator verifies that — every behavior they expect to see
should be visible as a declaration on the schema.

## Related

- `docs/foundation/schema_agnostic_design_rules.md`
- `docs/architecture/schema_handling.md`
- `docs/subsystems/reducer.md`
