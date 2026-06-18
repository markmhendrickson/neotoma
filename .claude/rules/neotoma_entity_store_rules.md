# Neotoma Entity Store Rules

## Purpose

Ensures agents consult the live entity type schema before storing any entity, so field mappings are correct and no known fields land in `raw_fragments`.

## Trigger Patterns

Before any `store` or `correct` call to the Neotoma MCP server.

## Agent Actions

### Step 1: Look up the schema

Call `list_entity_types` with the target entity type keyword. Read every field's `description`. Do not skip this step even when the entity type is familiar.

### Step 2: Map content to declared fields

Identify:
- The **primary long-form content field** (e.g. `body` for `plan` entities — this is the field for full markdown, prose, or structured spec content).
- Required fields (e.g. `title`, `slug` for `plan`).
- The **canonical_name_field** (the `slug` equivalent — used for entity resolution and deduplication; set it to a stable, human-readable identifier).
- All optional structured fields (arrays, objects) that match the content being stored.

Do not invent field names. Every field passed to `store` must appear in the schema.

### Step 3: Verify `unknown_fields_count: 0`

After storing, check the response for `unknown_fields_count`. If it is > 0, the schema was not followed — read the schema again, correct the field names, and re-store.

## Plan entities: required field usage

For `entity_type: "plan"`:

- `title` — human-readable plan title (required).
- `slug` — canonical identifier, stable and hyphenated (required; used for deduplication).
- `body` — **full plan markdown or spec content** (the primary long-form field; always populate this).
- `overview` — short narrative summary only (not a substitute for `body`).
- `goals`, `todos`, `completion_criteria`, etc. — structured arrays for specific sub-content.

Never split the full spec content across `overview` + `goals` when `body` exists. `body` is the correct field for the complete document.

## Constraints

- MUST call `list_entity_types` before every `store` call for an unfamiliar or newly-updated entity type.
- MUST populate `body` for `plan` entities with the full plan content.
- MUST set the canonical_name_field (`slug` for plans) to a stable identifier.
- MUST NOT pass field names that do not appear in the schema.
- MUST verify `unknown_fields_count: 0` after storing.
- MUST re-store with corrected field names if `unknown_fields_count > 0`.
