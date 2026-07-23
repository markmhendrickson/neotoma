# Legacy-payload outcome flips

One entry per payload whose declared `outcome` changed in a release. The release supplement's **Breaking changes** section links to this file.

Format: one bullet per flip, keyed by the Neotoma version that introduced the new outcome. Name the fixture path and the before/after state.

## v0.5.0

- `v0.4.x/store_person_attributes_wrapped` flipped from `valid` → `rejected`. The v0.5.0 reducer refactor removed resolver tolerance for the pre-0.5 `{ entity_type, attributes: { ... } }` shape. Callers now see `ERR_STORE_RESOLUTION_FAILED` → `ERR_CANONICAL_NAME_UNRESOLVED` with `seen_fields: ["attributes"]` (or `["entity_type", "attributes"]`).

## v0.5.1

- Same fixture updated to assert a structured `hint` on the rejection ("Payload looks like the pre-0.5 `attributes`-nested shape; flatten fields to top level."). No outcome flip; only the hint assertion is new.

## v0.6.0

- `v0.6.x/store_conversation_without_id` seeded as `rejected`. The `conversation` schema bumps to v1.2 declaring `canonical_name_fields: ["conversation_id"]` and `name_collision_policy: "reject"` (R1 + R2 of the conversation-collision plan). Two conversations in one payload with identical `title` and no `conversation_id` used to silently collapse into one entity via heuristic `name_key:title`; the second turn now returns `ERR_STORE_RESOLUTION_FAILED` / `ERR_MERGE_REFUSED` with a structured `hint.text` matching `/declare.+conversation_id/i` and `hint.required_identity_fields` carrying the schema-derived identity key list (R4). Release supplement: `docs/releases/in_progress/v0.6.0/github_release_supplement.md` § Breaking changes.
- `v0.6.x/guest_issues_submit_removed`, `guest_issues_thread_removed`, `guest_issues_messages_removed`, and `guest_entities_removed` seeded as `rejected`. The `/guest/*` URL prefix was removed; callers must use `POST /issues/submit`, `POST /issues/status`, `POST /issues/add_message`, and `GET /entities/{id}` with AAuth or scoped guest-token credentials.

## v0.12.0

- `v0.12.x/store_relationship_non_ent_entity_id` flipped from valid to rejected: store relationship ids now require ent_ prefix.
- `v0.12.x/issues_submit_without_reporter_env` seeded as `rejected`. `submit_issue` now requires at least one of `reporter_git_sha` or `reporter_app_version`; submissions missing both fail with `error_code: ERR_REPORTER_ENVIRONMENT_REQUIRED` and a structured `details.acceptable_field_groups` envelope listing the alternatives. Release supplement: `docs/releases/in_progress/v0.12.0/github_release_supplement.md` § Breaking changes.

## v0.13.0

- `v0.13.x/create_relationship_extra_fields` seeded as `rejected`. `POST /create_relationship` previously declared an open schema in OpenAPI; the handler has always rejected undeclared fields via Zod. The spec now declares `additionalProperties: false` with the three required fields and three optional fields, matching handler behavior. Callers sending extra fields were already receiving 400 errors; this fixture documents that the outcome is unchanged. Release supplement: `docs/releases/in_progress/v0.13.0/github_release_supplement.md` § Breaking changes.

## v0.15.1

- `v0.15.x/delete_relationship_wrong_type` seeded as `rejected` (#277). `POST /delete_relationship` with a `(relationship_type, source_entity_id, target_entity_id)` triple that does not match a live edge previously returned `200` after writing a no-op deletion observation; it now returns `404 RESOURCE_NOT_FOUND` with a structured `details.hint` matching `/list_relationships/`. The prior `200` was a silent no-op (it deleted nothing), so no useful contract was narrowed, but the response status observably flipped `200` → `404`. Release supplement: `docs/releases/in_progress/v0.15.1/github_release_supplement.md` § Behavior changes / Breaking changes.

## v0.18.9

- `v0.18.x/entities_query_deep_offset` seeded as `rejected` (#1943). `POST /entities/query` accepted arbitrarily deep `offset` on every prior version; it is now capped at 2000 and deprecated, rejecting with `VALIDATION_INVALID_FORMAT` and a structured `details.hint` matching `/cursor/`. The offset path is O(offset) — the server re-scanned and discarded `offset` visible rows in JS per page, with a deleted-id round trip per chunk — which pinned the synchronous single-threaded SQLite backend and froze a hosted instance for 4.8–7.5s per call, blocking `/health` and every concurrent request. Callers migrate by dropping `offset` and paging with `cursor` / `next_cursor`, which is constant-time at any depth. Note the cap sits deliberately above the reported repro depth (`offset: 1300`), so the exact client that triggered the bug keeps working on the legacy path while the unbounded case is closed.
- `v0.18.x/entities_query_large_snapshot_page` seeded as `rejected` (#1943). `POST /entities/query` accepted an unbounded `limit` alongside `include_snapshots: true`; `limit` is now capped at 500 when snapshots are requested, rejecting with `VALIDATION_INVALID_FORMAT` and a structured `details.hint` matching `/include_snapshots/`. Each snapshot hydrates synchronously on the event loop, so a large page monopolized it — the same freeze class as the deep-offset case, reached by page size rather than depth. Callers migrate by requesting ≤500 per page (walking the rest with `cursor`) or setting `include_snapshots: false`, which is not capped.
