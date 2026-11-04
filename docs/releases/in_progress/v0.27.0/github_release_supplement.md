This minor release makes the `store` response small by default, lets a later correction replace an earlier one on array fields, adds a bounded handover window for rotating the static bearer, and speeds up entity listing. It also publishes the reviewed bilingual neotoma.io site and refreshed illustrations.

**Action needed on upgrade:**

- If a client reads `related_entities[].snapshot` (or the full entity row) from a `store` response, pass `include_related_snapshots: true` on the request. By default each entry is now `{id, entity_type, canonical_name}`.

See "Breaking changes".

## Highlights

- **Compact `store` responses.** `related_entities` in the `store` response now carries only `id`, `entity_type` and `canonical_name` for each related entity. A one-task store with two relationships previously returned about 125,000 characters, and one with four relationships about 846,000. Pass `include_related_snapshots: true` to get the previous shape (full row plus current snapshot). The flag shapes the response only: it writes nothing differently and is not part of the idempotency fingerprint. The file-store response, whose `related_entities` are the entities extracted from the stored file, is unchanged (#2735).
- **Corrections can shrink an array.** On a `merge_array` field, every correction is written at priority 1000, so corrections used to union with each other: correcting a 34-member list to 10 members read back as the union. The latest correction (by `observed_at`, `created_at`, then `id`) is now the field's only contribution, and an empty or null correction clears the field to `[]`. Ordinary writes at the same priority still union, and `merge_array_by_key` is untouched because `patch_array_item` depends on it (#2733, fixes #2341).
- **Bearer rotation without a hard cut.** The server now also accepts `NEOTOMA_BEARER_TOKEN_PREVIOUS` until `NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT` (an ISO-8601 instant with an explicit offset, at most 7 days ahead) on REST and `/mcp`. A request on either value takes the same branch: same principal, same grants. Comparison is constant time over SHA-256 digests. A missing, malformed or over-long expiry, a malformed value, a value equal to the primary, or a previous value with no primary disables the slot, and the server accepts the primary only and logs the reason at ERROR. Each use of the retiring value emits `auth_bearer_previous_slot_used` (throttled per client) naming the consumer; no log line or error carries a value or digest. The OAuth key-auth preflight accepts the primary only, so a retiring credential cannot mint a durable OAuth connection. The rotation procedure is in `docs/subsystems/auth.md` (#2752).
- **Faster entity listing.** Source-id lookups are indexed, and the listing fragment fetch is bounded to the requested page (#2738). Recorded-cutover visibility checks use keyed lookups (#2740). See `docs/performance/entity_list_source_lookups.md`.
- **Exact entity totals are certified by membership.** The snapshot-based collection total now proves population by checking that each missing snapshot belongs to an entity the lifecycle selector hides, using the same attachment acquisition the reducer uses. When that cannot be established the total stays marked unverified (`count_population_unverified`) rather than being reported exact (#2759).

## What changed for npm package users

- `store` (MCP and `POST /store`) accepts `include_related_snapshots` (boolean, default `false`).
- `neotoma` server accepts `NEOTOMA_BEARER_TOKEN_PREVIOUS` and `NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT`. Both are optional; with neither set, behavior is unchanged.
- Reducer output for `merge_array` fields changes only when at least one correction exists for the field.

## API surface & contracts

- `POST /store` request: new optional field `include_related_snapshots` (`openapi.yaml`, `StoreRequest`). `npm run openapi:bc-diff` against `v0.26.0` reports no breaking changes and two non-breaking additions (the request field and the schema field).
- MCP `store`: same flag; the default response shape is narrower (see Breaking changes).
- No new routes. The protected-routes manifest is in sync (126 routes).

## Behavior changes

- Default `store` response is smaller (see Breaking changes).
- A later correction on a `merge_array` field replaces earlier corrections; before, they unioned.
- During a bearer handover window the server logs a WARN at boot and on first use per client. A misconfigured slot logs at ERROR and is ignored.

## Docs site & CI / tooling

- The reviewed bilingual (English and Spanish) neotoma.io site, install page and onboarding refinements are published, with illustrations unified to the shared paper artwork and refreshed social previews (#2736, #2737, #2760, #2761, #2763, #2765, #2767). Five October brand images now record maker, tool and rights (#2758).
- CI: the capability manifest, a boundary-test timeout and the publish verify wait were repaired after v0.26.0 (#2734).

## Internal changes

- `src/services/correction_identity.ts` is the single definition of what makes an observation a correction, shared by `createCorrection` and the reducer.
- `src/services/bearer_slots.ts` owns configured-bearer matching for both auth gates.
- `src/services/entity_population_certificate.ts` replaces an inline membership query in the count path.

## Fixes

- Corrections on array fields can remove members (#2341).
- Entity count exactness no longer depends on equal aggregate numbers (#2759).

## Tests and validation

- New tests: `tests/unit/bearer_slots.test.ts`, `tests/integration/bearer_handover_slot.test.ts`, `tests/integration/correct_array_replaces.test.ts`, `tests/unit/observation_reducer_merge_array_correction.test.ts`, `tests/integration/store_related_entities_compact.test.ts`, `tests/integration/entity_list_source_lookups.test.ts`, `tests/integration/entity_lifecycle_visibility_plans.test.ts`, `tests/unit/services/entity_population_certificate.test.ts`. The release preparation run passed these (71 tests).
- Security auth matrix: 18 passed, 1 skipped. `security:lint`: 0 errors. `security:manifest:check`: in sync.
- Coverage audit: `docs/releases/in_progress/v0.27.0/test_coverage_review.md`.

## Security hardening

The diff classifier reports `sensitive=true` (auth middleware in `src/actions.ts`, root landing handlers, `openapi.yaml`). The sensitive change is the bearer handover slot. Review: `docs/releases/in_progress/v0.27.0/security_review.md`. Verdict: with-caveats. No advisory is opened or referenced by this release.

## Breaking changes

- **`store` response shape (default).** `related_entities[]` entries are now `{id, entity_type, canonical_name}` instead of the full entity row plus snapshot. Migration: pass `include_related_snapshots: true` to restore the previous shape. This is a response narrowing and is not flagged by `openapi:bc-diff`; it is named here for that reason. Request validation is not tightened.
