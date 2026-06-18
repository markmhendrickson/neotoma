# Peer Sync

Peer sync lets two explicit Neotoma instances exchange selected entity state without a central hub. It is a substrate-level replication surface: each side stores immutable sync-originated observations and the reducer computes snapshots locally.

## Core Model

- `peer_config` is the durable configuration entity for a peer.
- `source_peer_id` on observations records which peer produced a replayed observation.
- `observation_source: "sync"` marks replayed rows and ranks below local sources in default reducer tie-breaking.
- `sync_peer_id` on subscriptions prevents loops by skipping events whose `source_peer_id` matches the destination peer.

Peers are operator configured. There is no automatic discovery.

## Steady-State Delivery

For steady-state propagation, create a subscription whose filters match the peer's entity types and whose `sync_peer_id` is the peer id. When a local write emits a substrate event, the subscription bridge routes matching peer subscriptions through the sync webhook path:

1. Local write emits a `SubstrateEvent`.
2. Subscription matching checks type/id/event filters and loop prevention.
3. Peer delivery posts a signed payload to `<peer_url>/sync/webhook`.
4. The receiving instance verifies the peer, fetches the source entity snapshot, and stores it with `observation_source: "sync"` and `source_peer_id`.

## Manual Catch-Up

Use `neotoma peers sync <peer_id>` for bounded catch-up. The command pushes local changed observations and pulls remote snapshots through `/sync/entities`.

Required local environment:

- `NEOTOMA_PUBLIC_BASE_URL`: base URL other peers can use to fetch this instance.
- `NEOTOMA_LOCAL_PEER_ID`: stable id this instance presents as `sender_peer_id`.

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

- **`peer_id`**: Stable identifier the **counterparty** uses when **they** sign inbound webhooks to your instance. Your row stores *their* `peer_id` (what appears as `sender_peer_id` on payloads you verify).
- **`NEOTOMA_LOCAL_PEER_ID`**: Stable identifier **this** instance uses as `sender_peer_id` when **you** POST to a peer’s `/sync/webhook`. It must match the value your peer configured as their `peer_id` for you.
- **`sync_target_user_id`**: Optional field on `peer_config` — the **receiver’s** Neotoma `user_id` on the peer instance. Required for outbound webhooks so the peer can look up the shared secret via `getPeerSecretForVerification(target_user_id, sender_peer_id)`.
- **`NEOTOMA_PUBLIC_BASE_URL`**: Public base URL of **this** API (no trailing slash), used as `sender_peer_url` on outbound sync so the peer can `GET …/entities/{entity_id}`.
- **`NEOTOMA_HOSTED_MODE`**: Operator opt-in for hosted / multi-tenant deployments. When set to `1`, `sync_webhook_inbound` rejects any `sender_peer_url` whose hostname resolves to a private, loopback, or link-local address (RFC 1918, `127.0.0.0/8`, `169.254.0.0/16`, IPv6 `fc00::/7`, `fe80::/10`, and the `localhost` family). Self-hosted single-tenant operators normally leave it unset; hosted control planes (for example the sandbox or any operator-run multi-user instance) MUST set it to prevent a malicious peer from naming `http://127.0.0.1` as its `sender_peer_url` and tricking the server into fetching snapshots from the host's loopback interface. Mirrors the threat-model guidance at [`docs/security/threat_model.md`](../security/threat_model.md).

## HTTP surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/peers/{peer_id}` | Peer snapshot plus **`remote_health`** (`/health` probe, semver compat vs local package version). |
| POST | `/peers` | Add peer; optional `sync_target_user_id`. |
| POST | `/peers/{peer_id}/sync` | Bounded outbound sync (optional JSON `{ "limit": number }`). |
| POST | `/sync/webhook` | Inbound signed notification (HMAC `X-Neotoma-Sync-Signature-256`). |
| POST | `/peers/resolve_sync_conflict` | `prefer_remote` re-fetches remote guest snapshot; `prefer_local` documents retention + `correct`. |

## Semver compatibility

`remote_health.compatible` and the CLI command `neotoma compat` share the same rules ([`src/semver_compat.ts`](../../src/semver_compat.ts)): major mismatch or more than two minor drift ⇒ incompatible; one–two minor drift ⇒ compatible with warning; patch ignored.

## Outbound batch (`syncPeerFull`)

1. Loads `peer_config` (requires `shared_secret`, `sync_target_user_id`, active peer).
2. Reads `NEOTOMA_PUBLIC_BASE_URL` and `NEOTOMA_LOCAL_PEER_ID`.
3. Lists up to `limit` observations (default 200, max 500) for the peer’s `entity_types`, `observed_at` after `last_sync_at`, excluding `observation_source === "sync"`.
4. For each row, POSTs `/sync/webhook` on the peer with a deterministic idempotency payload.
5. Updates `last_sync_at` watermark and `consecutive_failures` on the `peer_config` row via corrections.

## Conflict resolution

- **`prefer_remote`**: Supply `sender_peer_url` and optional `guest_access_token`; server fetches `GET {sender_peer_url}/entities/{entity_id}` and applies the snapshot with elevated priority.
- **`prefer_local`**: No data change; use `correct` for targeted field overrides.

## Components — `src/services/sync/`

The peer-sync surface lives in eight files under `src/services/sync/`:

### `seed_peer_schema.ts`

Registers the global `peer_config` entity type at server boot. Canonical name field: `peer_id`. Field set covers identity (`peer_id`, `peer_name`, `peer_url`), routing (`direction`, `entity_types`, `sync_scope`), auth (`auth_method`, `shared_secret`, `peer_public_key_thumbprint`), conflict policy (`conflict_strategy`), watermarking (`last_sync_at`, `consecutive_failures`), and the receiver hint (`sync_target_user_id`).

### `peer_ops.ts`

CRUD-style helpers used by the `/peers` HTTP routes:

- `listPeers(userId)`, `listPeersWithSecrets(userId)` (latter resolves stored secrets for outbound use).
- `addPeer(userId, params)`, `removePeer(userId, peerId)` (deactivate).
- `getPeer(userId, peerId)` — joins `peer_config` snapshot with `peer_health` probe.

### `peer_health.ts`

- `readLocalNeotomaPackageVersion()` — reads `package.json` for the bound process.
- `probePeerRemoteHealth(peerUrlBase)` — `GET {peerUrlBase}/health` with a 5-second timeout; never throws. Returns `{ reachable, ok?, version, error? }`.
- `computePeerRemoteHealth(peer_url)` — combines the probe with `compareCliApiCompat` so `remote_health.compatible` reflects the same semver gate as `neotoma compat`.

### `sync_webhook_inbound.ts`

Inbound handler for `POST /sync/webhook`. Steps:

1. Resolve the receiver `user_id` and look up the matching `peer_config` row.
2. Verify the signature (`shared_secret` HMAC or AAuth, depending on `auth_method`).
3. Validate `sender_peer_url` against the configured `peer_url` after normalization; mismatched values are rejected before any outbound fetch is attempted. When `NEOTOMA_HOSTED_MODE=1`, reject any `sender_peer_url` whose hostname is private, loopback, or link-local — this stops a hostile peer from naming `http://127.0.0.1` and forcing the server to fetch snapshots from its own loopback.
4. Fetch the source entity snapshot from the sender (`GET {sender_peer_url}/entities/{entity_id}` for `prefer_remote`, or accept the inline payload for `last_write_wins`).
5. Store an observation with `observation_source: "sync"` and `source_peer_id`.
6. Update `last_sync_at` on the local `peer_config`.

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
3. Pulls the peer's `entity_types` snapshot via `postOutboundSyncEntitiesRequest`.
4. Lists local observations newer than `last_sync_at` via `listObservationsForPeerSyncOutbound`.
5. POSTs each batch via `postOutboundSyncWebhook`, updating `last_sync_at` and `consecutive_failures` through `correct` writes.
6. Returns `{ ok, message, batches, succeeded?, failed?, pulled? }`.

The default batch is 200; the cap is 500. The function is safe to re-run; observations replayed in a second invocation are deduplicated by idempotency key.

### `conflict_resolver.ts`

`resolveSyncConflict({ userId, entity_id, strategy, sender_peer_url?, guest_access_token? })` covers the three explicit operator strategies:

- `prefer_remote` — fetches `GET {sender_peer_url}/entities/{entity_id}` (with the supplied guest token) and applies the snapshot at elevated priority.
- `prefer_local` — no-op with guidance to use `correct` for targeted field overrides.
- `manual` — flags the entity with `sync_conflict = true` via a `correct` write so operators can see it in the Inspector and resolve field by field.

`last_write_wins` and `source_priority` are handled implicitly by the reducer at observation time; they do not require a separate resolver call.

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
