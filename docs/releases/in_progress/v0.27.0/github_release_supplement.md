This minor release is a security release, **severity High**. It tightens how Neotoma admits data from sync peers and applies agent grants on every entry point that changes data, and it makes corrections durable. Upgrade promptly if your instance syncs with any peer or admits agents through agent grants. It also makes the `store` response small by default, adds a bounded handover window for rotating the static bearer, speeds up entity listing, and publishes the reviewed bilingual neotoma.io site.

**Action needed on upgrade:**

1. **Upgrade and restart.** `npm install -g neotoma@0.27.0` (or your usual install path), then restart the server.
2. **Before the next sync runs, opt in each peer that sends you issues or another governance type.** From this release, a peer can no longer send `issue` records, or the other governance types listed below, unless you allow it for that peer. If syncs run on a schedule, pause them until this step is done. On the receiving instance, for each such peer:

   ```bash
   neotoma peers list          # note the peer's peer_config entity_id and that its entity_types include the type
   neotoma corrections create <peer_config_entity_id> \
     --entity-type peer_config \
     --field-name accept_governance_entity_types \
     --corrected-value '["issue"]' \
     --idempotency-key "optin-$(date +%s)"
   ```

   Add `prod` (for example `neotoma prod corrections create ...`) or `--env` the way you normally target that instance. A correction that repeats a value the field held before is answered as a replay and changes nothing unless it carries a new `--idempotency-key`, so these commands pass one; read the field back after each correction. The MCP equivalent is `correct` on the peer's `peer_config` entity with `field: "accept_governance_entity_types"`. Each write replaces the whole list. The type must also be in the peer's `entity_types`. When two instances send issues to each other, each operator sets this on their own side.

   **Verify:** run `neotoma peers sync <peer_id>` on the instance that runs the sync. The result shows `refused: 0` on a receiver that pulls and `refused_by_peer: 0` on a sender that pushes, and the receiving server logs no `[sync] refused` warning for that peer.
3. **If rows were refused before you opted in, resend them.** Refused rows are not resent on their own. On each instance that runs the sync, set the peer's `last_sync_at` back to a time before the receiving instance was upgraded (when refusals started), then sync. Rows already held are skipped.

   ```bash
   neotoma corrections create <peer_config_entity_id> \
     --entity-type peer_config --field-name last_sync_at \
     --corrected-value '"<ISO time before the receiving instance was upgraded, e.g. 2026-11-04T12:00:00+01:00>"' \
     --idempotency-key "recover-$(date +%s)-last-sync"
   neotoma peers sync <peer_id>
   ```

   Each run moves at most 200 rows per direction (500 with `--limit 500`), oldest first; repeat `neotoma peers sync` until a run sends and pulls nothing (`batches: 0`, and `pulled: 0` where the instance pulls).

   **For a peer whose `direction` is `bidirectional`, recover one direction at a time.** Both directions share `last_sync_at`, so in a run where both fill the limit, one of them can skip rows. Note a time `T0`, as an ISO time with an offset such as `2026-11-04T12:00:00+01:00`, a few minutes before either instance changes anything (earlier is safe: rows already held are skipped, and it absorbs clock differences between the instances). On each of the two instances: set the peer to pull only, reset `last_sync_at` as above, repeat the sync until it reports `pulled: 0`, then set it back; the other instance doing the same covers the rows going the other way. Real-time delivery to that peer pauses while it is set to pull, and events written meanwhile are not queued, so once both instances are back to `bidirectional`, on each instance set `last_sync_at` to `T0` and sync once more (if that run reaches the limit, repeat the pull-only loop from `T0` with a new `RUN` value). The closing correction repeats the reset value, so it needs its own key or it is dropped as a replay.

   ```bash
   RUN="recover-$(date +%s)"   # one new value per recovery
   neotoma corrections create <peer_config_entity_id> \
     --entity-type peer_config --field-name direction --corrected-value pull \
     --idempotency-key "$RUN-direction-pull"
   neotoma corrections create <peer_config_entity_id> \
     --entity-type peer_config --field-name last_sync_at --corrected-value '"<T0>"' \
     --idempotency-key "$RUN-reset"
   neotoma peers sync <peer_id>        # repeat until it reports pulled: 0
   neotoma corrections create <peer_config_entity_id> \
     --entity-type peer_config --field-name direction --corrected-value bidirectional \
     --idempotency-key "$RUN-direction-back"
   # after BOTH instances are back to bidirectional, on each:
   neotoma corrections create <peer_config_entity_id> \
     --entity-type peer_config --field-name last_sync_at --corrected-value '"<T0>"' \
     --idempotency-key "$RUN-close"
   neotoma peers sync <peer_id>
   ```
4. **If a sending instance is still on an earlier release,** it counts each refusal as a failed delivery and turns its real-time peer-sync subscription off after 10. Do these in order: upgrade it to 0.27.0, then turn the subscription back on as below, then run step 3 on it. To turn the subscription back on, find it with `neotoma --json entities list --type subscription`: it is the one whose `sync_peer_id` is the receiver's peer id and whose `active` is false (`list_subscriptions` shows active subscriptions only; the listing may include the subscription's webhook secret, so do not paste it anywhere). Then:

   ```bash
   RUN="reenable-$(date +%s)"
   neotoma corrections create <subscription_entity_id> \
     --entity-type subscription --field-name active --corrected-value true \
     --idempotency-key "$RUN-active"
   neotoma corrections create <subscription_entity_id> \
     --entity-type subscription --field-name consecutive_failures --corrected-value 0 \
     --idempotency-key "$RUN-failures"
   ```

   Restart that server (or call `list_subscriptions`) so it picks the change up.
5. **Add the new grant operations to agents that need them.** Grants now carry five more operations: `delete`, `restore`, `merge`, `split` and `register_schema`. No existing grant has them, so after the upgrade an admitted agent can no longer delete, restore, merge or split entities, register or update schemas, or manage bundles until you grant it. Several other entry points now check the grant too (see the "Agent grants on every entry point" item under "What changed for npm package users"); an agent whose grant does not list the types they write is refused there. Owner sessions (CLI, Inspector, Bearer or OAuth without an agent signature) are unaffected. To see which entries an agent needs, search the server log for `agent_capability_denied`: each line names the agent, the operation and the entity types. For each agent that should keep one of these abilities, add an entry naming the operation and the entity types, in Inspector → Agents → Grants or with the grants API:

   ```bash
   curl -sS "<base_url>/agents/grants" -H "Authorization: Bearer <token>" \
     | jq '.grants[] | {grant_id, label}'                       # find the agent's grant_id
   curl -sS "<base_url>/agents/grants/<grant_id>" -H "Authorization: Bearer <token>" \
     | jq '.grant.capabilities'                                 # the current list
   # send the whole list back with the new entry appended:
   curl -sS -X PATCH "<base_url>/agents/grants/<grant_id>" \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"capabilities":[ ...existing entries..., {"op":"delete","entity_types":["task"]}]}'
   ```

   `...existing entries...` is a placeholder, not valid JSON: paste the list from the previous command there. `capabilities` is replaced as a whole, so always send the existing entries back with the new one. Bundle install, enable and disable need `{"op":"register_schema","entity_types":["*"]}`. For `agent_grant` itself, the new operations need the type named; `*` does not cover it. Add these entries only after upgrading: an earlier release reads a grant that names one of them as invalid and refuses all of that agent's capability-gated writes, and so does a rollback to an earlier release after you add them.

   **Verify:** the agent's next call to one of these operations succeeds; a refusal is `403` with `error_code: "capability_denied"` (MCP: the same code in the error data) and names the missing operation and type.
6. **Review peer configurations and agent grants.** Check that each `peer_config` lists only the `entity_types` you mean to sync with that peer, and that every agent grant (`neotoma entities list --type agent_grant`, or Inspector → Agents → Grants) is one you created. Look in particular for grants with `store` or `correct` on `*`: those also cover `agent_grant` records, so give them only to agents you trust to manage grants, and list the types an agent needs instead where you can. After a day of normal use, search the log for `agent_capability_denied` again to catch operations an agent uses rarely.
7. **Optional: apply the correction rule to existing data now.** Stored snapshots pick up the new correction rule on the next write to each entity. To apply it at once for a type you correct often (dry run first, then without `dry_run`):

   ```bash
   curl -fsS -X POST "<base_url>/recompute_snapshots_by_type" \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"entity_type":"<type>","dry_run":true}'
   ```

8. **If a client reads `related_entities[].snapshot`** (or the full entity row) from a `store` response, pass `include_related_snapshots: true` on the request. By default each entry is now `{id, entity_type, canonical_name}`.

9. **If a client stores entities without `entity_type`, change it to send one.** A structured `store` now requires `entity_type` as a non-empty string on every entity, on REST and MCP. A client that sends only `type`, or no type at all, is refused with `ERR_INVALID_ENTITY_TYPE` and nothing is written. Rename the key or add the type.

Issue reporting through `submit_issue` to a remote issues target is not peer sync and is unaffected.

## Highlights

- **Sync peers can only send what you configured.** Every way a peer's data enters your instance (the inbound sync webhook, the pull leg of `neotoma peers sync`, and `resolve_sync_conflict` with `prefer_remote`) now runs one admission check before anything is stored.
- **Governance records from peers need your opt-in.** Types that grant access, change policy, schedule outbound calls or steer agents are refused from peers by default. The new `peer_config.accept_governance_entity_types` field admits them per peer. Agent grants and peer configurations are never accepted from a peer.
- **Agent grants apply on every entry point that changes data.** Deleting, restoring, merging and splitting entities, registering and updating schemas, and managing bundles now need their own grant operations. Batch corrections, observation and interpretation creation, file uploads, subscriptions, peer removal and sync, issue writes made as the owner, and publishing a page link now apply the `store` or `correct` grant for the types they write, matching `/store` and `/correct`.
- **Corrections stay corrected.** A correction now wins on its field under every merge strategy until a later correction for that field replaces it.
- **Compact `store` responses.** `related_entities` in the `store` response now carries only `id`, `entity_type` and `canonical_name` for each related entity. A one-task store with two relationships previously returned about 125,000 characters, and one with four relationships about 846,000. Pass `include_related_snapshots: true` to get the previous shape (full row plus current snapshot). The flag shapes the response only: it writes nothing differently and is not part of the idempotency fingerprint. The file-store response, whose `related_entities` are the entities extracted from the stored file, is unchanged (#2735).
- **Corrections can shrink an array.** On a `merge_array` field, every correction is written at priority 1000, so corrections used to union with each other: correcting a 34-member list to 10 members read back as the union. The latest correction (by `observed_at`, `created_at`, then `id`) is now the field's only contribution, and an empty or null correction clears the field to `[]`. Ordinary writes at the same priority still union, and `merge_array_by_key` is untouched because `patch_array_item` depends on it (#2733, issue #2341).
- **Bearer rotation without a hard cut.** The server now also accepts `NEOTOMA_BEARER_TOKEN_PREVIOUS` until `NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT` (an ISO-8601 instant with an explicit offset, at most 7 days ahead) on REST and `/mcp`. A request on either value takes the same branch: same principal, same grants. Comparison is constant time over SHA-256 digests. A missing, malformed or over-long expiry, a malformed value, a value equal to the primary, or a previous value with no primary disables the slot, and the server accepts the primary only and logs the reason at ERROR. Each use of the retiring value emits `auth_bearer_previous_slot_used` (throttled per client) naming the consumer; no log line or error carries a value or digest. The OAuth key-auth preflight accepts the primary only, so a retiring credential cannot mint a durable OAuth connection. The rotation procedure is in `docs/subsystems/auth.md` (#2752).
- **Faster entity listing.** Source-id lookups are indexed, and the listing fragment fetch is bounded to the requested page (#2738). Recorded-cutover visibility checks use keyed lookups (#2740). See `docs/performance/entity_list_source_lookups.md`.
- **Exact entity totals are certified by membership.** The snapshot-based collection total now proves population by checking that each missing snapshot belongs to an entity the lifecycle selector hides, using the same attachment acquisition the reducer uses. When that cannot be established the total stays marked unverified (`count_population_unverified`) rather than being reported exact (#2759).

## What changed for npm package users

**Runtime / MCP**

- **Peer admission.** A peer's data is admitted only for types in that peer's `entity_types`; governance types also need `accept_governance_entity_types`; `agent_grant` and `peer_config` are always refused. The check covers alternate spellings of a type, and keys the instance reserves for its own use are never taken from a peer's snapshot.
- **Governance types:** `peer_config`, `subscription`, `submission_config`, `instance_policy`, `conformance_policy`, `guest_access_token`, `standing_rule`, `skill`, `issue`.
- **Refusals are visible on both sides.** The receiving instance logs each refusal with the peer id and reason. A sending instance treats `403 SYNC_ENTITY_TYPE_REFUSED` as the receiver's configuration, not a delivery failure: real-time delivery logs it and does not retry it or count it toward deactivating the subscription, and `neotoma peers sync` counts it in a new `refused_by_peer` field and says what the receiving operator must change. A sync whose only problem is refused rows still returns `ok: true`; alerting should also check `refused_by_peer`.
- **`resolve_sync_conflict`.**
  - With `prefer_remote` and a local entity, it applies the remote snapshot's differing declared fields as one atomic correction transaction and reports them in the new `fields_applied` and `fields_withheld` fields. Undeclared fields, and array fields that already hold a local correction, are withheld. `fields_withheld` holds at most 50 entries; `fields_withheld_count` gives the full count; `message` reports withheld fields by count.
  - `prefer_remote` and `manual` need the `correct` capability on the entity type for an admitted agent.
  - A type the admission check rejects returns `ok: false` and writes nothing. Fetch and parse failures are reported as fixed text.
- **Pull leg of `neotoma peers sync`.** Refused rows are skipped and counted in a new `refused` field. The sync watermark advances only on a timestamp that parses and is not in the future.
- **Inbound sync webhook.** The sender's snapshot is fetched through the same guarded fetch as other outbound calls, re-checking each redirect.
- **Hosted mode.** The outbound host check covers more forms of local addresses and names.
- **Agent grants on every entry point.** New grant operations `delete`, `restore`, `merge`, `split` and `register_schema`, scoped by `entity_types` and granted only by an entry that names them (`store`, `correct` and `*` on another operation do not imply them). The entity types checked are read from storage for the ids a call names. Coverage, REST and MCP alike:
  - `delete_entity`, `restore_entity`: `delete` / `restore` on the entity's type. `/issues/bulk_remove`: `delete` on `issue`.
  - `/entities/merge`, `merge_entities`: `merge` on both types. `/entities/split`, `split_entity`: `split` on the source type, the new entity's type and any existing target's type.
  - `register_schema`, `update_schema_incremental`: `register_schema` on the type. `manage_bundles` install, enable and disable: `register_schema` on `*`.
  - File uploads through `store`: `store` on the asset type (`image_asset`, `audio_asset`, `video_asset` or `file_asset`, by MIME type).
  - `unsubscribe`: `correct` on `subscription`. `remove_peer` and `sync_peer`: `correct` on `peer_config`. `/issues/bulk_close`: `correct` on `issue`.
  - `submit_issue`, `add_issue_message` and their REST routes when used as the owner: `store` on `issue`, `conversation` and `conversation_message`. `sync_issues` and `sync_entity_submissions` (issues): `store` and `correct` on the same types.
  - `publish_rendered_page`: `store` on `guest_access_token`, and on `rendered_page` for a new page.
  - `store` that extends an existing entity (`target_id`) also needs `store` on that entity's stored type; MCP `store` with overflow intake needs `store` on the types it carries.
  - Issue writes that link the issue to other entities (`entity_ids_to_link`, `conversation_turn_id`) need `create_relationship` for `REFERS_TO` covering `issue` and each linked entity's type.
  - A store, observation or correction that sets the `_deleted` field needs `delete` (for `true`) or `restore` (any other value) on the type, in addition to `store` or `correct`.
  - A structured `store` entity must name its type in `entity_type` as a non-empty string (see Breaking changes). On other paths a blank or missing entity type is judged as `*`; `register_schema` and `update_schema_incremental` reject an empty `entity_type`.
  - Unchanged: relationship delete and restore stay under `create_relationship`; snapshot repair does not need a grant. A signer that no grant recognises still follows `NEOTOMA_AGENT_DEFAULT_DENY`.
- **Agent grants (earlier in this batch).** `batch_correct` applies the `correct` capability for the entity's stored type; `/observations/create`, `/interpretations/create`, MCP `create_interpretation` and MCP `store` with an `interpretation` apply the `store` capability (and the protected-type guard) for every type they would write, before any write. Refusals return `403 capability_denied`.
- **Reducer.** A correction outranks every ordinary write to its field, whatever its `source_priority` or the field's merge strategy. Among corrections the latest wins; on a `merge_array` field it replaces the whole array, and `merge_array_by_key` fields combine corrections by key.

**Also in this release**

- `store` (MCP and `POST /store`) accepts `include_related_snapshots` (boolean, default `false`).
- `neotoma` server accepts `NEOTOMA_BEARER_TOKEN_PREVIOUS` and `NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT`. Both are optional; with neither set, behavior is unchanged.
- Reducer output for `merge_array` fields changes only when at least one correction exists for the field.

## API surface & contracts

- `POST /sync/webhook` can answer `403` with `error_code: "SYNC_ENTITY_TYPE_REFUSED"`.
- `POST /peers/{peer_id}/sync` responses gain `refused` and `refused_by_peer`.
- `resolve_sync_conflict` responses gain `fields_applied`, `fields_withheld` (capped at 50) and `fields_withheld_count`, and the route documents `403 capability_denied`.
- `POST /entities/{id}/batch_correct`, `POST /observations/create` and `POST /interpretations/create` document `403 capability_denied`.
- `delete_entity`, `restore_entity`, `/entities/merge`, `/entities/split`, `register_schema`, `update_schema_incremental`, `POST /peers`, `DELETE /peers/{peer_id}`, `POST /peers/{peer_id}/sync`, `/issues/submit`, `/issues/add_message`, `/issues/bulk_close` and `/issues/bulk_remove` document `403 capability_denied`; `/store`, `/subscribe`, `/unsubscribe` and `/issues/sync` add it to their existing `403`.
- `AgentCapabilityEntry.op` accepts `delete`, `restore`, `merge`, `split` and `register_schema` (and lists `register_relationship_type`, already accepted).
- `peer_config` gains `accept_governance_entity_types` (array of strings). `add_peer`, `POST /peers` and `neotoma peers add` do not take it; set it with `correct`.
- `POST /store` request: new optional field `include_related_snapshots` (`openapi.yaml`, `StoreRequest`). `npm run openapi:bc-diff` against `v0.26.0` reports no breaking changes and 15 non-breaking additions (this field, the schema field, and the peer sync and conflict response fields). The tool does not flag tightened request validation, so those changes are listed under Breaking changes.
- MCP `store`: same flag; the default response shape is narrower (see Breaking changes).
- No new routes. The protected-routes manifest is in sync (126 routes).
- `POST /store` can answer `400` with `error_code: "ERR_INVALID_ENTITY_TYPE"` and a `hint`; MCP `store` returns an invalid-params error with the same code and `hint` under `data`, and no HTTP status. `POST /interpretations/create` and MCP `create_interpretation` use the same code when an entity declares a type that is not a string.

## Behavior changes

- Default `store` response is smaller (see Breaking changes).
- A structured `store` with a missing or malformed `entity_type` is refused before anything is written (see Breaking changes).
- A later correction on a `merge_array` field replaces earlier corrections; before, they unioned.
- During a bearer handover window the server logs a WARN at boot and on first use per client. A misconfigured slot logs at ERROR and is ignored.

## Docs site & CI / tooling

- The reviewed bilingual (English and Spanish) neotoma.io site, install page and onboarding refinements are published, with illustrations unified to the shared paper artwork and refreshed social previews (#2736, #2737, #2760, #2761, #2763, #2765, #2767). Five October brand images now record maker, tool and rights (#2758).
- CI: the capability manifest, a boundary-test timeout and the publish verify wait were repaired after v0.26.0 (#2734).
- Rendered pages gain sandboxed, renderer-owned copy controls (#2769).

## Internal changes

- `src/services/correction_identity.ts` is the single definition of what makes an observation a correction, shared by `createCorrection` and the reducer.
- `src/services/bearer_slots.ts` owns configured-bearer matching for both auth gates.
- `src/services/entity_population_certificate.ts` replaces an inline membership query in the count path.

## Fixes

- Corrections on array fields can remove members (issue #2341).
- Entity count exactness no longer depends on equal aggregate numbers (#2759).

## Tests and validation

- New tests for this release's changes include `tests/integration/entity_mutation_capability_coverage.test.ts`, `tests/integration/flow_mutation_capability_coverage.test.ts`, `tests/integration/store_capability_parity_observations_interpretations.test.ts`, `tests/integration/batch_correct_capability_parity.test.ts`, `tests/unit/agent_grant_mutation_ops.test.ts`, `tests/unit/observation_reducer_corrections_win.test.ts`, `tests/services/sync_peer_refusal_visibility.test.ts`, `tests/unit/bearer_slots.test.ts`, `tests/integration/bearer_handover_slot.test.ts`, `tests/integration/correct_array_replaces.test.ts`, `tests/integration/store_related_entities_compact.test.ts` and `tests/unit/services/entity_population_certificate.test.ts`.
- Full suite on the security package's final tree: 8285 passed, 6 failed. Five of the six (`entity_semantic_search`, `correct_http_mcp_parity` twice, `mcp_entity_variations`, `mcp_store_variations`) also fail on `main` before the package; the sixth, `nonjson_fixtures_mcp_replay`, is intermittent.
- Security auth matrix: 18 passed, 1 skipped. `security:lint`: 0 errors. `security:manifest:check`: in sync.
- Coverage audit: `docs/releases/in_progress/v0.27.0/test_coverage_review.md`.

## Security hardening

`npm run security:classify-diff -- --base v0.26.0 --head HEAD` reports `sensitive=true` (sync services, auth middleware in `src/actions.ts`, root landing handlers, `openapi.yaml`). Findings and sign-off: `docs/releases/in_progress/v0.27.0/security_review.md`. Deployed-probe results are linked here after the sandbox deploy.

- **Peer sync admission** (surface: inbound webhook, pull leg, `prefer_remote`). Exposure if it regressed: a peer could write record types outside its configuration, including access-control records. Gate: the admission tests under `tests/integration/sync_remote_*` and `tests/services/sync_peer_*`. Operator action: upgrade, then opt in peers that should send governance types.
- **Agent capability parity** (surface: `batch_correct`, observation and interpretation create, MCP store with interpretation). Exposure if it regressed: an agent could write or correct types its grant does not cover. Gate: `tests/integration/batch_correct_capability_parity.test.ts` and `tests/integration/store_capability_parity_observations_interpretations.test.ts`. Operator action: upgrade.
- **Agent grants on every mutating entry point** (surface: entity delete, restore, merge and split; schema registration and bundles; file uploads; subscriptions; peers; issue writes as the owner; page publishing). Exposure if it regressed: an agent could change records or settings its grant does not cover. Gate: `tests/integration/entity_mutation_capability_coverage.test.ts`, `tests/integration/flow_mutation_capability_coverage.test.ts` and `tests/unit/agent_grant_mutation_ops.test.ts`. Operator action: upgrade, then add the new operations to the grants of agents that need them.
- **Store entity type rule** (surface: structured `store` on REST and MCP). Exposure if it regressed: a request with a malformed type could be written. Gate: `tests/integration/entity_mutation_capability_coverage.test.ts`. Operator action: upgrade, and send `entity_type` from any client that does not.
- **Hosted outbound host check** (surface: guarded fetch in hosted mode). Gate: `tests/security/ssrf_host_guard_alternate_loopback_forms.test.ts`. Operator action: upgrade.

- **Bearer handover slot** (surface: configured-bearer matching on REST and `/mcp`). Gate: `tests/integration/bearer_handover_slot.test.ts`, `tests/unit/bearer_slots.test.ts`. Operator action: none unless rotating.

Severity: High. Found during internal review.

## Breaking changes

- **A write to a corrected field no longer changes it.** On every field, including the auto-discovered ones that use `last_write`, a later `store`, import or sync write to a field that holds a correction still returns success but no longer changes the value in the snapshot. Before, the later write replaced the corrected value. To change a corrected field, write another correction. This also applies to writes above priority 1000, which used to override a correction under `highest_priority` and the array strategies.
- **Peers that send governance types are refused until opted in.** Issue sync between instances (for example a personal instance feeding a central one) stops until the receiving operator adds `issue` to that peer's `accept_governance_entity_types`. See the action list above for the order of steps and recovery.
- **`peer_config` no longer syncs between peers**, even when listed in `entity_types`.
- **Agents with type-scoped grants can be refused on routes that used to accept them.** An agent whose grant does not cover a type now gets `403 capability_denied` from `batch_correct`, `/observations/create`, `/interpretations/create`, MCP `create_interpretation`, MCP `store` with an `interpretation`, and `resolve_sync_conflict` (`prefer_remote`, `manual`). Requests without agent identity (operator, CLI) are unchanged.
- **Admitted agents need the new grant operations.** Without `delete`, `restore`, `merge`, `split` or `register_schema` on the types involved, an admitted agent gets `403 capability_denied` from delete, restore, merge, split, schema registration and bundle management. Without `store` or `correct` on the types written, it is also refused on file uploads, `unsubscribe`, `remove_peer`, `sync_peer`, `publish_rendered_page`, issue writes as the owner, `sync_issues`, `/issues/bulk_close` and `/issues/bulk_remove`. Setting `_deleted` through `store` or `correct`, extending an entity of another type with `target_id`, and linking an issue to other entities now also need the matching grant entry. A grant naming a new operation is invalid on an earlier release, which then refuses all of that agent's capability-gated writes until the entry is removed. An MCP client that identifies itself only by its client name can no longer delete, restore, merge or split `agent_grant` entities; use Inspector or the `/agents/grants` routes.
- **`prefer_remote` withholds undeclared fields** instead of ingesting them into an existing entity.
- **An empty `entity_type` is rejected** by `register_schema` and `update_schema_incremental` (`400` validation error; it used to be accepted). Send the type name.
- **MCP `store` checks the grant on the type each entity names before it writes anything**, as REST `/store` does. A batch with one entity the grant does not cover is refused as a whole, and an agent that names an alias needs the grant to cover the alias as written, not only the type it resolves to.
- **Hosted mode refuses more local host forms** for outbound fetches.
- **A structured `store` requires `entity_type` as a non-empty string**, on REST and MCP, for every caller kind. The undocumented `type` shortcut is no longer accepted, and an entity with no type is no longer stored as `generic`: send `entity_type`. A refusal carries `ERR_INVALID_ENTITY_TYPE` and a hint and writes nothing: `400` on REST, invalid params on MCP. `/interpretations/create` and MCP `create_interpretation` still accept a missing type or `type`, and refuse a declared type that is not a string with the same code.
- **`store` response shape (default).** `related_entities[]` entries are now `{id, entity_type, canonical_name}` instead of the full entity row plus snapshot. Migration: pass `include_related_snapshots: true` to restore the previous shape. This is a response narrowing and is not flagged by `openapi:bc-diff`; it is named here for that reason. The flag itself adds no request validation.
