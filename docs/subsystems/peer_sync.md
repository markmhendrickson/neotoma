# Peer Sync

Peer sync lets two explicit Neotoma instances exchange selected entity state without a central hub. It is a substrate-level replication surface: each side stores immutable sync-originated observations and the reducer computes snapshots locally.

## Core Model

- `peer_config` is the durable configuration entity for a peer. Its `entity_types` names the types synced with that peer, and its `accept_governance_entity_types` names the governance types (see [Remote Snapshot Admission](#remote-snapshot-admission)) the operator accepts from that peer.
- `source_peer_id` on observations records which peer produced a replayed observation.
- `observation_source: "sync"` marks replayed rows and ranks below local sources in default reducer tie-breaking.
- Replication does not carry correction identity. A replayed row is an ordinary `sync` write, so it never displaces a local correction, and a correction made on the sender lands on the receiver as an ordinary row. A field corrected on one peer and changed (or corrected) on the other therefore stays divergent until an operator resolves it with `resolve_sync_conflict` (`prefer_remote` applies the remote value as a local correction).
- `sync_peer_id` on subscriptions prevents loops by skipping events whose `source_peer_id` matches the destination peer.

Peers are operator configured. There is no automatic discovery.

## Steady-State Delivery

For steady-state propagation, create a subscription whose filters match the peer's entity types and whose `sync_peer_id` is the peer id. When a local write emits a substrate event, the subscription bridge routes matching peer subscriptions through the sync webhook path:

1. Local write emits a `SubstrateEvent`.
2. Subscription matching checks type/id/event filters and loop prevention.
3. Peer delivery posts a signed payload to `<peer_url>/sync/webhook`.
4. The receiving instance verifies the peer, fetches the source entity snapshot, checks the snapshot's `entity_type` (see [Remote Snapshot Admission](#remote-snapshot-admission)), and stores it with `observation_source: "sync"` and `source_peer_id`.

## Manual Catch-Up

Use `neotoma peers sync <peer_id>` for bounded catch-up. The command pushes local changed observations and pulls remote snapshots through `/sync/entities`. Pulled rows pass the same admission check as webhook deliveries; the result reports refused rows in `refused`.

Required local environment:

- `NEOTOMA_PUBLIC_BASE_URL`: base URL other peers can use to fetch this instance.
- `NEOTOMA_LOCAL_PEER_ID`: stable id this instance presents as `sender_peer_id`.

## Remote Snapshot Admission

A peer's snapshot names its own `entity_type`. Before anything is stored, every peer-ingest path (inbound `/sync/webhook`, the pull leg of `neotoma peers sync`, and `resolve_sync_conflict` with `prefer_remote`) runs the same check in `src/services/sync/remote_snapshot_admission.ts`:

1. **Protected types are always refused.** Anything on the protected-type list (`protected_entity_types.ts`, today `agent_grant`) is never accepted from a peer, whatever the caller or the peer configuration.
2. **Governance types are refused by default.** `PEER_GOVERNANCE_ENTITY_TYPES` is the single list of types that grant access, change policy, schedule outbound calls, steer agents, or alter sync: `peer_config`, `subscription`, `submission_config`, `instance_policy`, `conformance_policy`, `guest_access_token`, `standing_rule`, `skill`, `issue`. `issue` is on the list because issue records feed the instance's outbound publishing to GitHub; an instance that syncs issues between peers opts each such peer in with `accept_governance_entity_types: ["issue"]`.
3. **Operator opt-in per configured peer.** A governance type is accepted only from a configured, active peer whose `peer_config.accept_governance_entity_types` names that exact type. The operator sets the field, for example with `correct` on the peer's `peer_config` entity, and each write replaces it as a whole. A `prefer_remote` call against a `sender_peer_url` that matches no configured peer keeps every governance type refused. `peer_config` itself is never accepted from a peer, even if listed, so a peer cannot write the allow list that admits it.
4. **`entity_types` bounds what a peer can send.** On `/sync/webhook` and the pull leg, every type must also be one of the peer's `entity_types`. On `prefer_remote`, a governance type from a configured peer must be in both its `entity_types` and its `accept_governance_entity_types`; other types follow the caller's own store permissions.

Rules 1 to 3 apply to every spelling store would treat as the same type, including schema aliases, and an opt-in admits only the exact listed spelling. The store payload is built from the admitted type. Keys that store reads as instructions (`entity_type`, `target_id`, `intent`, `entity_id`), and keys beginning with an underscore, which are reserved for the instance's own markers, are never taken from a peer's snapshot.

### Accepting governance types from a peer

`accept_governance_entity_types` is an array field on the peer's `peer_config` entity. A new peer starts without it, so every governance type is refused. `add_peer`, `POST /peers`, and `neotoma peers add` do not take the field; set it afterwards with `correct` on the `peer_config` entity (its `entity_id` is in `list_peers` / `neotoma peers list`):

```bash
neotoma corrections create <peer_config_entity_id> \
  --entity-type peer_config \
  --field-name accept_governance_entity_types \
  --corrected-value '["issue"]'
```

The MCP equivalent is `correct({ entity_id, entity_type: "peer_config", field: "accept_governance_entity_types", value: ["issue"], idempotency_key })`. The field uses `last_write`, so each correction replaces the whole list: to narrow it, write the shorter list; to accept nothing, write `[]`. When a correction repeats a list the field held before, pass a new `--idempotency-key` (CLI) or `idempotency_key` (MCP); otherwise it is answered as a replay of the earlier correction and changes nothing. The type must also be in the peer's `entity_types`. The setting is per receiving instance: when two instances both send a governance type to each other, each operator sets it on their own `peer_config` for the other side.

Values that name `peer_config` or a protected type have no effect, and a value that is not on the governance list changes nothing (ordinary types need only `entity_types`).

### What a refusal looks like

- **`POST /sync/webhook`** answers `403` with the standard error envelope, `error_code: "SYNC_ENTITY_TYPE_REFUSED"`, and a `message` of the form `REMOTE_ENTITY_TYPE_REFUSED:<reason>`. Nothing is stored.
- **Pull leg of `neotoma peers sync` / `POST /peers/{peer_id}/sync`**: a refused row is skipped and counted in the result's `refused` field, and the result `message` gains one sentence with that count. The watermark still advances past a refused row, so a refusal is not retried on every run; after changing `entity_types` or `accept_governance_entity_types`, earlier refused rows arrive again only when the peer changes them, or after the recovery below.
- **`resolve_sync_conflict` with `prefer_remote`** returns `ok: false`, writes nothing, and reports the refusal in `message`.
- **On the receiving instance**, every refusal on the webhook and pull paths is logged as a warning (`[sync] refused ...`) with the peer id and the reason; pull refusals are logged once per run with counts by reason.
- **On the sending instance**, a `403 SYNC_ENTITY_TYPE_REFUSED` answer is not a delivery failure. Real-time delivery logs a warning and does not retry it or count it toward the subscription's `consecutive_failures`, so it never deactivates the subscription. `neotoma peers sync` counts such rows in `refused_by_peer` (not in `failed`), moves the watermark past them as the pull leg does, and its `message` says what the receiving operator must change. A run whose only problem is refused rows still returns `ok: true`, so a scheduled sync that alerts on `ok: false` should also check `refused_by_peer`.

### Recovering rows refused before an opt-in

Rows refused before the receiving operator added a type are not resent on their own. After the opt-in:

1. **Rows the receiver pulls.** On the receiving instance, set the peer's `last_sync_at` back to a time before the first refusal, then run a sync. The next pull asks the peer for everything observed after that time; rows already ingested are skipped by their idempotency keys. Each run moves at most `--limit` rows per direction (default 200, at most 500), oldest first, so repeat `neotoma peers sync` until it reports nothing more to pull.

   ```bash
   neotoma corrections create <peer_config_entity_id> \
     --entity-type peer_config \
     --field-name last_sync_at \
     --corrected-value '"2026-10-01T00:00:00.000Z"' \
     --idempotency-key "recover-$(date +%s)-last-sync"
   neotoma peers sync <peer_id>
   ```

2. **Rows the sender pushed.** On the sending instance, do the same for its `peer_config` describing the receiver, then run `neotoma peers sync <peer_id>` there. Real-time deliveries that were refused are covered by this step too.

`last_sync_at` is shared by the push and pull legs of one `peer_config`, so a reset resends local rows from that time as well; the receiver skips rows it already holds.

Pass a new `--idempotency-key` on every correction in this section, as the examples do. Without one, `neotoma corrections create` derives the key from the entity, field and value, so a correction that repeats a value the field held before (the same `last_sync_at` twice, `direction pull` on a second recovery, `active true` on a second re-enable) is answered as a replay of the earlier one: it reports success and changes nothing. Read the field back after each correction to confirm it holds the value you set.

On a peer whose `direction` is `bidirectional`, recover one direction at a time. Both legs list rows after the same `last_sync_at`, and a run stores the furthest point either leg reached, so when both legs fill `--limit` in one run the leg that ended earlier skips the rest of its rows. Note a time `T0` a few minutes before either instance changes anything (earlier is safe: rows already held are skipped, and it absorbs clock differences between the instances). On each of the two instances, set the peer to pull only, reset, repeat the sync until a run reports `pulled: 0`; the other instance doing the same covers the rows going the other way. While `direction` is `pull`, real-time delivery to that peer pauses and events written meanwhile are not queued. So once both instances are back to `bidirectional`, close the gap: on each instance, correct `last_sync_at` to `T0` and run `neotoma peers sync <peer_id>` once more (if that run reaches the limit, repeat the pull-only loop from `T0` with a new `RUN` value, so its corrections are not answered as replays).

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

The closing correction sets `last_sync_at` to the same `T0` as the reset, so it needs its own key; without one it is dropped as a replay and the gap is never closed.

A sender on a release before this behaviour counts each refusal as a failed delivery and, after `max_failures` (default 10), deactivates its peer-sync subscription, which stops real-time sync of every type to that peer. To turn it back on, find the subscription with `neotoma --json entities list --type subscription`: it is the one whose `sync_peer_id` is the receiver's peer id and whose `active` is false. `list_subscriptions` lists only active subscriptions, so it cannot find it; the listing may show the subscription's webhook secret, so do not paste it anywhere. Correct two fields on it, then restart the server or call `list_subscriptions` so the subscription index is rebuilt:

```bash
RUN="reenable-$(date +%s)"
neotoma corrections create <subscription_entity_id> \
  --entity-type subscription --field-name active --corrected-value true \
  --idempotency-key "$RUN-active"
neotoma corrections create <subscription_entity_id> \
  --entity-type subscription --field-name consecutive_failures --corrected-value 0 \
  --idempotency-key "$RUN-failures"
```

`<reason>` is one of `invalid_entity_type` (missing, blank, or not a string), `protected_entity_type`, `peer_configuration_entity_type`, `governance_entity_type` (not opted in for this peer), or `entity_type_not_synced` (not in the peer's `entity_types`). Refusal messages are fixed server text. They may name the local list entry the type matched (for example `agent_grant` or `issue`), and never repeat the `entity_type` string the peer sent.

### Example: syncing issues to a central instance

The `issue` type is on the governance list, so the `simon-central` example below needs an opt-in on each instance that ingests issues from the other. On the central instance, for the `peer_config` that describes the personal instance:

```bash
neotoma corrections create <personal_peer_config_entity_id> \
  --entity-type peer_config \
  --field-name accept_governance_entity_types \
  --corrected-value '["issue"]'
```

When the personal instance also pulls issues back (`direction` other than `push`), run the same correction on the personal instance for its `simon-central` peer. `product_feedback` is not a governance type and needs only `entity_types`. Without the opt-in, central answers each issue delivery with `403 SYNC_ENTITY_TYPE_REFUSED` and the pull leg counts issue rows as `refused`.

## Selective Sync

When a peer has `sync_scope: "tagged"`, only entities whose current snapshot has `sync_peers` containing the peer id are eligible for delivery or batch sync.

```json
{
  "entity_type": "issue",
  "title": "Example",
  "sync_peers": ["simon-central"]
}
```

## Authentication

Peer sync supports two configured auth modes:

- `shared_secret`: HMAC-SHA256 over stable JSON with `X-Neotoma-Sync-Signature-256`.
- `aauth`: AAuth-signed HTTP requests; optionally pin `peer_public_key_thumbprint` on the peer config.

## CLI

```bash
neotoma peers add --peer-id simon-central --name "Simon Central" --url https://example.com --types issue,product_feedback --target-user-id <uuid>
neotoma peers list
neotoma peers status simon-central
neotoma peers sync simon-central
neotoma peers remove simon-central
```

# Peer sync (cross-instance)

Neotoma can register **peers** (`peer_config` entities) and exchange incremental state via signed **`POST /sync/webhook`** payloads. Full symmetric batch sync is intentionally bounded; operators also use **substrate subscriptions** for event-driven delivery (see [scope decisions](../foundation/scope_decisions.md) SD-002).

## Concepts

- **`peer_id`**: Stable identifier the **counterparty** uses when **they** sign inbound webhooks to your instance. Your row stores _their_ `peer_id` (what appears as `sender_peer_id` on payloads you verify).
- **`NEOTOMA_LOCAL_PEER_ID`**: Stable identifier **this** instance uses as `sender_peer_id` when **you** POST to a peer’s `/sync/webhook`. It must match the value your peer configured as their `peer_id` for you.
- **`sync_target_user_id`**: Optional field on `peer_config` — the **receiver’s** Neotoma `user_id` on the peer instance. Required for outbound webhooks so the peer can look up the shared secret via `getPeerSecretForVerification(target_user_id, sender_peer_id)`.
- **`NEOTOMA_PUBLIC_BASE_URL`**: Public base URL of **this** API (no trailing slash), used as `sender_peer_url` on outbound sync so the peer can `GET …/entities/{entity_id}`.
- **`NEOTOMA_HOSTED_MODE`**: Operator opt-in for hosted / multi-tenant deployments. When set to `1`, `sync_webhook_inbound` rejects any `sender_peer_url` whose host is a private, loopback, link-local or unspecified address or a local name, in any spelling (RFC 1918, `127.0.0.0/8`, `169.254.0.0/16`, IPv6 `fc00::/7`, `fe80::/10`, and the `localhost` family). Self-hosted single-tenant operators normally leave it unset; hosted control planes (for example the sandbox or any operator-run multi-user instance) MUST set it to prevent a malicious peer from naming `http://127.0.0.1` as its `sender_peer_url` and tricking the server into fetching snapshots from the host's loopback interface. Mirrors the threat-model guidance at [`docs/security/threat_model.md`](../security/threat_model.md).

## HTTP surface

| Method | Path                           | Purpose                                                                                                                                                                                     |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/peers/{peer_id}`             | Peer snapshot plus **`remote_health`** (`/health` probe, semver compat vs local package version).                                                                                           |
| POST   | `/peers`                       | Add peer; optional `sync_target_user_id`.                                                                                                                                                   |
| POST   | `/peers/{peer_id}/sync`        | Bounded outbound sync (optional JSON `{ "limit": number }`).                                                                                                                                |
| POST   | `/sync/webhook`                | Inbound signed notification (HMAC `X-Neotoma-Sync-Signature-256`). `403 SYNC_ENTITY_TYPE_REFUSED` when the snapshot's `entity_type` is not admitted (see Remote Snapshot Admission).        |
| POST   | `/sync/entities`               | Serves this instance's snapshots of the requesting peer's configured `entity_types` to an authenticated peer pull.                                                                          |
| POST   | `/peers/resolve_sync_conflict` | `prefer_remote` re-fetches the remote guest snapshot and applies differing declared fields as one correction transaction (needs `correct`); `prefer_local` documents retention + `correct`. |

## Semver compatibility

`remote_health.compatible` and the CLI command `neotoma compat` share the same rules ([`src/semver_compat.ts`](../../src/semver_compat.ts)): major mismatch or more than two minor drift ⇒ incompatible; one–two minor drift ⇒ compatible with warning; patch ignored.

## Outbound batch (`syncPeerFull`)

1. Loads `peer_config` (requires `shared_secret`, `sync_target_user_id`, active peer).
2. Reads `NEOTOMA_PUBLIC_BASE_URL` and `NEOTOMA_LOCAL_PEER_ID`.
3. Lists up to `limit` observations (default 200, max 500) for the peer’s `entity_types`, `observed_at` after `last_sync_at`, excluding `observation_source === "sync"`.
4. For each row, POSTs `/sync/webhook` on the peer with a deterministic idempotency payload.
5. Unless `direction` is `push`, pulls the peer's snapshots through `/sync/entities` and ingests each row that passes [Remote Snapshot Admission](#remote-snapshot-admission); refused rows are skipped and counted in `refused`.
6. Updates `last_sync_at` watermark and `consecutive_failures` on the `peer_config` row via corrections. A pulled row's `observed_at` moves the watermark only when it parses as a timestamp no later than now plus five minutes; it is stored in canonical ISO form.

## Conflict resolution

- **`prefer_remote`**: Supply `sender_peer_url` and optional `guest_access_token`; server fetches `GET {sender_peer_url}/entities/{entity_id}` and applies the fields that differ from the local snapshot as one atomic correction transaction, so the remote value wins even on a field that already holds a local correction (a correction wins on every merge rule and is replaced only by a later correction; see [reducer §3.6](reducer.md)). It needs the `correct` capability on the entity type for an admitted agent, like `correct` itself. The response lists `fields_applied` (fields whose remote value now stands) and `fields_withheld` with a reason: `undeclared_field` (the local schema does not declare it, so a correction would never reach the snapshot) or `array_corrections_combine` (an array field that already holds a local correction; use `correct` to replace it). `ok: true` with a non-empty `fields_withheld` means a partial apply; check `fields_withheld`. `ok` is false when nothing could be applied or the transaction refused (for example a value that fails the schema); then nothing was written. Applied fields are pinned: they hold against later replicated rows from this peer and against importers until corrected again. If no local entity exists, the remote snapshot is ingested as a normal write. In both cases the remote snapshot's `entity_type` first passes [Remote Snapshot Admission](#remote-snapshot-admission): governance types are admitted only when `sender_peer_url` matches a configured, active peer whose `entity_types` and `accept_governance_entity_types` both name the type, and an existing local entity of a different type is never changed. `fields_withheld` holds at most 50 entries, each name cut to 128 characters, and `fields_withheld_count` gives the full count. The `message` never names the remote `entity_type` or a withheld field (withheld names appear only in `fields_withheld`), and a failed fetch, a redirect to a non-public host, or a body that is not JSON is reported as fixed text, without the remote's error text or body.
- **`manual`**: flags the entity `sync_conflict = true` through a correction and needs the same `correct` capability.
- **`prefer_local`**: No data change; use `correct` for targeted field overrides.

## Components — `src/services/sync/`

The peer-sync surface lives in nine files under `src/services/sync/`:

### `seed_peer_schema.ts`

Registers the global `peer_config` entity type at server boot. Canonical name field: `peer_id`. Field set covers identity (`peer_id`, `peer_name`, `peer_url`), routing (`direction`, `entity_types`, `sync_scope`), auth (`auth_method`, `shared_secret`, `peer_public_key_thumbprint`), conflict policy (`conflict_strategy`), watermarking (`last_sync_at`, `consecutive_failures`), the receiver hint (`sync_target_user_id`), and the operator opt-in for governance types (`accept_governance_entity_types`, added to existing installs by an incremental schema update).

### `peer_ops.ts`

CRUD-style helpers used by the `/peers` HTTP routes:

- `listPeers(userId)`, `listPeersWithSecrets(userId)` (latter resolves stored secrets for outbound use).
- `addPeer(userId, params)`, `removePeer(userId, peerId)` (deactivate).
- `getPeer(userId, peerId)` — joins `peer_config` snapshot with `peer_health` probe.
- `findActivePeerForUrl(userId, baseUrl)` — the active configured peer whose `peer_url` matches `baseUrl` after normalization, or null. `prefer_remote` uses it to find the opt-in list for `sender_peer_url`.

### `peer_health.ts`

- `readLocalNeotomaPackageVersion()` — reads `package.json` for the bound process.
- `probePeerRemoteHealth(peerUrlBase)` — `GET {peerUrlBase}/health` with a 5-second timeout; never throws. Returns `{ reachable, ok?, version, error? }`.
- `computePeerRemoteHealth(peer_url)` — combines the probe with `compareCliApiCompat` so `remote_health.compatible` reflects the same semver gate as `neotoma compat`.

### `sync_webhook_inbound.ts`

Inbound handler for `POST /sync/webhook`. Steps:

1. Resolve the receiver `user_id` and look up the matching `peer_config` row.
2. Verify the signature (`shared_secret` HMAC or AAuth, depending on `auth_method`).
3. Validate `sender_peer_url` against the configured `peer_url` after normalization; mismatched values are rejected before any outbound fetch is attempted. When `NEOTOMA_HOSTED_MODE=1`, reject any `sender_peer_url` whose hostname is private, loopback, or link-local — this stops a hostile peer from naming `http://127.0.0.1` and forcing the server to fetch snapshots from its own loopback.
4. Fetch the source entity snapshot from the sender (`GET {sender_peer_url}/entities/{entity_id}`) through `guardedFetch`, which checks every redirect hop against the same host policy as the first request: with `NEOTOMA_HOSTED_MODE=1`, a redirect to a private, loopback, or link-local host is refused with `REMOTE_FETCH_FAILED:refused` and nothing is fetched from it.
5. Check the snapshot's `entity_type` with `admitRemoteSnapshotType` against this peer's `entity_types` and `accept_governance_entity_types`; a refusal throws `REMOTE_ENTITY_TYPE_REFUSED:<reason>`, which the route answers as `403 SYNC_ENTITY_TYPE_REFUSED`.
6. Store an observation with `observation_source: "sync"` and `source_peer_id`, built by `remoteSnapshotStoreEntity`.

The handler is idempotent — replaying the same signed payload produces no new observation because the inbound store carries a deterministic idempotency key.

### `sync_webhook_outbound.ts`

Outbound delivery utilities:

- `getNeotomaPublicBaseUrl()`, `getLocalPeerIdForOutboundSync()` — env wrappers with operator-friendly errors.
- `postOutboundSyncWebhook(peer, payload)` — signs (HMAC or AAuth) and POSTs to `{peer_url}/sync/webhook`.
- `postOutboundSyncEntitiesRequest(peer, params)` — pulls remote snapshots through `/sync/entities` for bilateral catch-up.
- `queuePeerSyncDelivery(subscription, event)` — invoked by the subscription bridge when a webhook subscription has `sync_peer_id` set; routes through the peer envelope rather than the generic webhook queue.

### `peer_sync_batch.ts`

Bounded batch query helpers used by `syncPeerFull`:

- `listObservationsForPeerSyncOutbound({ userId, entityTypes, syncScope, after, limit })` — orders by `observed_at ASC` for stable batching, excludes `observation_source === "sync"` rows so re-replication stops at one hop, and honors `sync_scope: "tagged"` by joining against snapshot `sync_peers`.

### `full_sync.ts`

`syncPeerFull({ userId, peer_id, limit })` is the single entry point for `neotoma peers sync` and the `POST /peers/{peer_id}/sync` HTTP route.

1. Resolves the `peer_config` and validates auth + receiver hints.
2. Reads `NEOTOMA_PUBLIC_BASE_URL` / `NEOTOMA_LOCAL_PEER_ID`.
3. Unless `direction` is `pull`, lists local observations newer than `last_sync_at` via `listObservationsForPeerSyncOutbound` and POSTs each via `postOutboundSyncWebhook`.
4. Unless `direction` is `push`, pulls the peer's snapshots of its `entity_types` via `postOutboundSyncEntitiesRequest` and ingests each admitted row; a row refused by `admitRemoteSnapshotType` is skipped, counted, and still advances the watermark. A pulled `observed_at` that does not parse or lies more than five minutes in the future is ignored for the watermark.
5. Updates `last_sync_at` and `consecutive_failures` through `correct` writes.
6. Returns `{ ok, message, batches, succeeded?, failed?, pulled?, refused?, refused_by_peer? }`. `refused` counts pulled rows not ingested; `refused_by_peer` counts pushed rows the peer answered with `403 SYNC_ENTITY_TYPE_REFUSED` (not counted in `failed`, and not by themselves making `ok` false). `message` adds a sentence for each count when it is non-zero.

The default batch is 200; the cap is 500. The function is safe to re-run; observations replayed in a second invocation are deduplicated by idempotency key.

### `conflict_resolver.ts`

`resolveSyncConflict({ userId, entity_id, strategy, sender_peer_url?, guest_access_token? })` covers the three explicit operator strategies:

- `prefer_remote` — fetches `GET {sender_peer_url}/entities/{entity_id}` (with the supplied guest token), checks the snapshot's `entity_type` with `admitRemoteSnapshotType`, and applies the differing fields as one correction transaction (see above); the response lists `fields_applied`, `fields_withheld`, and `fields_withheld_count`.
- `prefer_local` — no-op with guidance to use `correct` for targeted field overrides.
- `manual` — flags the entity with `sync_conflict = true` via a `correct` write so operators can see it in the Inspector and resolve field by field.

`last_write_wins` and `source_priority` are handled implicitly by the reducer at observation time; they do not require a separate resolver call.

### `remote_snapshot_admission.ts`

The one admission check for every peer-ingest path (see [Remote Snapshot Admission](#remote-snapshot-admission)):

- `PEER_GOVERNANCE_ENTITY_TYPES` — the governance-type list; `getPeerGovernanceEntityTypes()` returns it sorted.
- `admitRemoteSnapshotType(entityType, { userId, peerEntityTypes?, acceptGovernanceEntityTypes? })` — returns a refusal `{ reason, entity_type, message }` or null. It applies the rules to every form store could persist the type as, including store's equivalence lookup.
- `remoteSnapshotStoreEntity(entityType, snapshot)` — the store payload: the snapshot without `entity_id`, `entity_type`, `target_id`, and `intent`, under the admitted type.
- `isStoreAdmissionRefusal(err)` / `storeAdmissionRefusalMessage(err)` — report the caller's own store admission refusing the write as `ok: false` with fixed text.

## Cloud availability peer (operator runbook)

This runbook configures a second always-on Neotoma instance as a full bidirectional peer of a local instance, for guaranteed cloud availability of truth while the local instance stays authoritative. It replicates observations and entity snapshots, not raw source blobs, and it does not propagate deletions or merges. Keep a separate `neotoma backup` schedule for point-in-time recovery.

### Topology

- Cloud instance: a standalone Neotoma (SQLite) process on an always-on host (Fly matches the existing `*.neotoma.io` deployments). It runs `NEOTOMA_HOSTED_MODE=1` and is exposed over HTTPS.
- Local instance: the authoritative writer. Reachable by the cloud peer over a stable private network (Tailscale recommended) or a tunnel, so the cloud side can `GET /entities/{entity_id}` for snapshot fetch.
- Conflict policy: `last_write_wins`. Local-sourced observations outrank `observation_source: "sync"` rows in reducer tie-breaking, so the local instance wins genuine ties without operator action.

### Environment

Cloud host:

```
NEOTOMA_HOSTED_MODE=1
NEOTOMA_PUBLIC_BASE_URL=https://<cloud-host>   # no trailing slash
NEOTOMA_LOCAL_PEER_ID=neotoma-cloud
```

Local instance:

```
NEOTOMA_PUBLIC_BASE_URL=https://<local-reachable-url>   # e.g. Tailscale MagicDNS name
NEOTOMA_LOCAL_PEER_ID=neotoma-local
```

### Pairing

Register each side as a peer of the other with a shared secret. `--target-user-id` is the receiver's `user_id` on the counterparty instance.

```bash
# on LOCAL: register the cloud peer
neotoma peers add \
  --peer-id neotoma-cloud --name "Cloud" --url https://<cloud-host> \
  --types <full entity-type set> \
  --direction bidirectional --sync-scope all \
  --auth-method shared_secret --shared-secret "<SECRET>" \
  --conflict-strategy last_write_wins \
  --target-user-id <user_id on cloud>

# on CLOUD: register the local peer symmetrically (same secret)
neotoma peers add \
  --peer-id neotoma-local --name "Local" --url https://<local-reachable-url> \
  --types <full entity-type set> \
  --direction bidirectional --sync-scope all \
  --auth-method shared_secret --shared-secret "<SECRET>" \
  --conflict-strategy last_write_wins \
  --target-user-id <user_id on local>
```

Upgrade path: switch `--auth-method aauth` and pin `--peer-public-key-thumbprint` once both sides have AAuth keypairs.

Governance types in the entity-type set (for example `issue`, `subscription`, `skill`, or `standing_rule`) are refused by default on each receiving side. To replicate them, set `accept_governance_entity_types` on each side's `peer_config` for the other (see [Accepting governance types from a peer](#accepting-governance-types-from-a-peer)). Leave out any type whose remote copy should not act on the receiving instance: a replicated `subscription` schedules webhook deliveries there, and a replicated `skill` or `standing_rule` reaches its agents. `peer_config` and protected types such as `agent_grant` never replicate, so register peers and grants on each instance separately.

### Guaranteed convergence

Steady-state webhook delivery is best-effort (retries `[1s, 5s, 30s, 300s]`, no persistence, circuit breaker after repeated failures). To make availability a guarantee rather than best-effort, schedule the bounded catch-up on both instances:

```bash
# cron, every 15 minutes, on each instance
neotoma peers sync neotoma-cloud   # run on local
neotoma peers sync neotoma-local   # run on cloud
```

`syncPeerFull` is idempotent (deterministic idempotency keys, `last_sync_at` watermark, 200 per batch, 500 max), so overlapping runs are safe.

### Known gaps

- Raw source file blobs (`$DATA_DIR/sources/{user_id}/{content_hash}`) do not replicate. For full-fidelity original-file recall on the cloud side, add a side-channel: periodic `rclone`/`rsync` of the content-addressed `sources/` directory to the cloud host or object storage. Content addressing makes this safe and deduplicating.
- Deletions and merges (`merged_to_entity_id`) do not propagate. A peer mirrors live truth, not a point-in-time backup. Run `neotoma backup` separately for disaster recovery.

## Related

- Inbound apply path: [`src/services/sync/sync_webhook_inbound.ts`](../../src/services/sync/sync_webhook_inbound.ts)
- Outbound client: [`src/services/sync/sync_webhook_outbound.ts`](../../src/services/sync/sync_webhook_outbound.ts)
- Bounded batch: [`src/services/sync/full_sync.ts`](../../src/services/sync/full_sync.ts)
- Substrate event source: [`substrate_events.md`](substrate_events.md)
- Subscription routing: [`subscriptions.md`](subscriptions.md) (`sync_peer_id` loop prevention)
- Semver gate: [`release_notes.md`](release_notes.md)
- Repo-side peer discovery: [`repo_discovery_manifest.md`](repo_discovery_manifest.md) — `.well-known/neotoma.json` advertises a repo's peer URL + pinned key so a trust relationship can be established automatically, rather than operator-configured.
