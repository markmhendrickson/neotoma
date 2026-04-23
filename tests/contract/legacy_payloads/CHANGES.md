# Legacy-payload outcome flips

One entry per payload whose declared `outcome` changed in a release. The release supplement's **Breaking changes** section links to this file.

Format: one bullet per flip, keyed by the Neotoma version that introduced the new outcome. Name the fixture path and the before/after state.

## v0.5.0

- `v0.4.x/store_person_attributes_wrapped` flipped from `valid` → `rejected`. The v0.5.0 reducer refactor removed resolver tolerance for the pre-0.5 `{ entity_type, attributes: { ... } }` shape. Callers now see `ERR_STORE_RESOLUTION_FAILED` → `ERR_CANONICAL_NAME_UNRESOLVED` with `seen_fields: ["attributes"]` (or `["entity_type", "attributes"]`).

## v0.5.1

- Same fixture updated to assert a structured `hint` on the rejection ("Payload looks like the pre-0.5 `attributes`-nested shape; flatten fields to top level."). No outcome flip; only the hint assertion is new.

## v0.6.0

- `v0.6.x/store_conversation_without_id` seeded as `rejected`. The `conversation` schema bumps to v1.2 declaring `canonical_name_fields: ["conversation_id"]` and `name_collision_policy: "reject"` (R1 + R2 of the conversation-collision plan). Two conversations in one payload with identical `title` and no `conversation_id` used to silently collapse into one entity via heuristic `name_key:title`; the second turn now returns `ERR_STORE_RESOLUTION_FAILED` / `ERR_MERGE_REFUSED` with a structured `hint.text` matching `/declare.+conversation_id/i` and `hint.required_identity_fields` carrying the schema-derived identity key list (R4). Release supplement: `docs/releases/in_progress/v0.6.0/github_release_supplement.md` § Breaking changes.
