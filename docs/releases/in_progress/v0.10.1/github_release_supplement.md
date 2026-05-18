---
title: Github Release Supplement
summary: This hotfix preserves user-registered entity schemas when their type name overlaps a built-in alias.
---

This hotfix preserves user-registered entity schemas when their type name overlaps a built-in alias.

## Highlights

- **Keep custom schemas authoritative.** `store_structured` and interpretation now check active DB-registered schemas before applying built-in aliases such as `organization` -> `company`.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, …)**

- No CLI command surface changes.
- CLI-backed writes that reach the shared store path inherit the schema-routing fix when they submit records with a user-registered `entity_type`.

**Runtime / data layer**

- Structured storage now loads the active schema for the submitted `entity_type` before applying code-defined aliases. A user-registered `organization` schema therefore validates as `organization` instead of being remapped to the built-in `company` schema.
- Interpretation applies the same precedence rule, so extracted entities respect registered schemas before alias fallback.

**Shipped artifacts**

- Runtime package contents change only through the patched server and interpretation code.
- No OpenAPI, MCP tool definition, CLI command, or package export changes are included in this hotfix.

## API surface & contracts

- No OpenAPI schema changes.
- No MCP tool additions, removals, or request/response shape changes.
- The observable contract for existing `store_structured` callers is compatibility-preserving: registered schemas now win over built-in aliases when both could match.

## Behavior changes

- Submitting `entity_type: "organization"` now uses an active user/global `organization` schema when one exists.
- The built-in `company` alias for `organization` remains available as a fallback for users who have not registered a separate `organization` schema.
- Existing stored entities are not migrated or rewritten by this release.

## Agent-facing instruction changes (ship to every client)

- No agent-facing instruction changes are included in this hotfix.

## Plugin / hooks / SDK changes

- No plugin, hook, SDK, or client package changes.

## Security hardening

- No security-surface changes.

## Docs site & CI / tooling

- No docs site or CI changes are included in this hotfix.

## Internal changes

- Store-path type routing now checks `schemaRegistry.loadActiveSchema(entityType, userId)` before `resolveEntityTypeFromAlias(entityType)`.
- Interpretation type routing skips alias resolution when the extracted type already exists in the active schema registry.

## Fixes

- Fixed a regression where a user-registered `organization` schema could be bypassed because the built-in `company` schema declares `organization` as an alias. The regression caused fields outside the built-in `company` schema, such as `slug`, `sector`, `location`, and custom relationship fields, to land in `raw_fragments`.

## Tests and validation

- `npx vitest run tests/services/schema_definitions.test.ts --reporter=verbose`
- `npx vitest run tests/services/entity_resolution.test.ts --reporter=verbose`
- `npx vitest run tests/integration/store_registered_schema_alias_precedence.test.ts --reporter=verbose`
- `npx vitest run tests/contract/ --reporter=verbose`

## Breaking changes

No breaking changes.
