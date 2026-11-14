Neotoma v0.29.0 checks guest links in one place on every guest-readable route, lets signed agents read entity details as their grant owner, and bounds caller-supplied patterns in schemas. It also stops committed stores from answering 500, keeps reads off the write queue on the worker backend, and adds indexes for entity listings and idempotency-key lookups.

## Highlights

- **Guest links behave the same on every route that accepts them.** One check decides whether a guest token is current and which items it covers, and every refusal uses one of two stable codes: `401 GUEST_TOKEN_INVALID` or `403 GUEST_TOKEN_SCOPE`.
- **A share link opens its page even when the page type's access policy is closed.** An entity-scoped guest token takes precedence over a closed type policy for the entity it names.
- **Signed agents with a matching grant read entity details as the grant owner.** `GET /entities/:id` and its `/observations`, `/relationships` and `/html` reads now treat an admitted agent the way `POST /entities/query` already did.
- **Caller-supplied patterns in schema constraints are bounded and validated at registration.** Pattern length, shape and count are checked when a schema is registered or edited, and every evaluation runs under a time and size limit.
- **A store whose writes committed reports success.** When only the idempotency completion marker cannot be confirmed, the response says so with `write_committed: true` instead of returning `500`.

## What changed for npm package users

### Guest links (`access_token`)

- Every guest-readable route resolves a presented token through one check of its entity coverage, lifetime and revocation. This covers `GET /entities/:id`, `/entities/:id/html`, `/entities/:id/observations`, `/entities/:id/relationships`, the issue routes, the subscription routes and `GET /events/stream`.
- A refused token returns `401 GUEST_TOKEN_INVALID` when it is unknown, malformed, expired, revoked or deleted, or when it is sent as `access_token` to a route that does not accept links (for example `/entities/:id/markdown`). The message is the same for every cause. A valid token presented for an item it does not cover returns `403 GUEST_TOKEN_SCOPE`. On guest-readable routes, a token sent as `Authorization: Bearer` gets the same answer as one sent as the `access_token` query parameter.
- A link lasts the shorter of its stored lifetime and the configured `NEOTOMA_GUEST_TOKEN_TTL_SECONDS` (default 30 days), counted from when it was minted. Lowering the setting shortens existing links; raising it does not extend them. To renew a rendered-page link, call `publish_rendered_page` again.
- A token's state is read from every record on its token entity. Later records, including corrections, can only narrow a link: a revocation applies, the smallest lifetime applies, and the covered entities are the intersection. A token record that was deleted, merged or split refuses the link. If the token records cannot be read from storage, the response is a `5xx`, never a grant.
- On the subscription and event routes, a guest filter outside the token's grant now returns `403 GUEST_TOKEN_SCOPE` instead of `403 FORBIDDEN`. Webhook delivery and `sync_peer_id` requests from a guest still return `403 FORBIDDEN`.

### Share links under a closed type policy

- A valid, unexpired, unrevoked guest token that names an entity grants read access to that entity on `GET /entities/:id` and `GET /entities/:id/html` before the type-level access policy is consulted. This makes `publish_rendered_page` links work when the `rendered_page` policy is closed.
- A merged entity is not served through a token, and a deleted entity answers `404`. A token that does not name the requested entity, and every write route (including the guest issue `add_message` route), still go through the type-level policy.
- `GET /entities/:id/html` now answers an access-policy refusal with `403` instead of `500`.

### Related-entity expansion for guest callers

- On `GET /entities/:id/relationships?expand_entities=true`, related-entity expansion on guest reads is limited to what the guest link covers. For any caller other than the owner, a related entity is expanded only when that caller could read it through `GET /entities/:id`, using the same decision.
- A related entity that is not expanded keeps its relationship rows, ids and relationship type. Its `related_entities` entry has `canonical_name` and `entity_type` set to null and no snapshot, and the convenience name and type fields on each row are null. A merged related entity is never expanded for such a caller.
- At most 50 related entities are evaluated per request for such a caller, in ascending `entity_id` order; the rest keep unexpanded entries. Owner reads are unchanged.

### Signed agents reading entity details

- A signed AAuth agent with an active `agent_grant` that presents no guest token is now stamped as its grant owner on `GET /entities/:id`, `/observations`, `/relationships` and `/html`, on the two no-Bearer branches of the REST auth middleware (local storage with a loopback caller, and encryption off). It then reads through the owner path, as on `POST /entities/query`.
- Unchanged: a request that carries a guest token is judged by that token; a signed agent with no matching grant stays a guest; unsigned, Bearer, sandbox and local-development requests; and the issue, subscription and event-stream routes.

### Patterns in schema constraints

- Caller-supplied patterns in field `constraints.pattern`, derived-entity `matches_any_pattern` conditions and rendered-page conformance rules are evaluated through one shared helper. Each evaluation has a 100 ms limit, field values longer than 10,000 characters are not evaluated, and one store request shares a 1.5 s pattern budget across all its constraint and derived-condition checks.
- Registration and incremental schema edits refuse patterns longer than 256 characters, backreferences, nested variable quantifiers and repeated alternations whose branches overlap; at most 16 patterns per condition and 64 per schema are accepted. Counted quantifiers (`{n}`, `{n,}`, `{n,m}`) are read with counts of any length, including zero-padded counts, the way the engine reads them. Refusals return `400 SCHEMA_VALIDATION_FAILED` with `details.refusal` (`syntax`, `shape`, `length` or `count`) and a structured `details.hint` that names the rewrite, on HTTP and MCP.
- Stored schemas keep loading. Load-time validation checks pattern syntax only.
- At store time, a field value that cannot be checked (too long, a pattern the new rules do not accept, or a spent request budget) is reported as a `pattern` constraint violation, and the configured `constraint_violation_policy` applies. A derived-entity condition whose pattern is not accepted never matches; a pattern with invalid syntax keeps the earlier plain-substring behavior. A rendered-page conformance rule that cannot be evaluated is skipped, with at most 32 rules per page under a shared 1 s budget.

### Store results and write ordering

- A store whose observations and relationships all committed no longer returns `500 DB_QUERY_FAILED` when only the idempotency completion marker cannot be confirmed. The response carries `write_committed: true`, `store_write_completion: "unconfirmed"` and `store_write_completion_note`; a confirmed store carries none of these fields. The note says whether one optional same-key replay completes the marker, whether no replay is needed (a store with an `interpretation`, whose replay would return `ERR_STORE_WRITE_INCOMPLETE`), or whether no action is needed (a store without a key).
- On the SQLite and worker backends, a write outside a transaction now takes its place in the transaction queue, so it never runs inside another caller's transaction.
- On the worker backend, reads outside a transaction no longer wait for queued write transactions when at least one reader is configured.

### Substrate events

- `entity.created` is emitted for a new entity even when the snapshot step fails, on REST `store`, MCP `store` and interpretation runs. Treat it as the signal that a new entity appeared.
- On `entity.updated`, an absent `fields_changed` means the entity changed and the fields are unknown, not that nothing changed. An empty array means the snapshot was computed and no field differed.
- A REST store that targets an id that was merged away emits no entity event, matching MCP. An interpretation run in which two rows resolve to one new entity emits a single `entity.created`.

### Database indexes and reader pool

- On first start after upgrade, `ensureSchema` builds new indexes: four on `entities` for type-scoped, type-less, keyset and name-sorted listings and for population certificates, and partial indexes on `observations` and `sources` over `(user_id, idempotency_key)`. Each is built once and blocks writes until it finishes; the two idempotency-key index builds log a start and an end line. Later starts are a no-op.
- A reader that exceeds `NEOTOMA_DB_STATEMENT_TIMEOUT_MS`, or whose caller aborts, releases its caller at once and is retired with a replacement spawned. It is shut down only after its statement returns, never during a native call. New setting `NEOTOMA_DB_MAX_RETIRED_WORKERS` (default `max(4, 2 × readers)`) caps how many retired readers may finish at once; at the cap the caller is still released and the reader stays in the pool. `NEOTOMA_DB_ORPHAN_GRACE_MS` now bounds only the shutdown wait.
- New diagnostics: gate hold and gate wait warnings above 3 s and 250 ms, event-loop delay in reader-pool stats, the oldest queued wait in the saturation warning, and drain and retirement-cap warnings. Log lines carry SQL text heads only, never bound values.

### Package and registry metadata

- The npm package description and the MCP registry manifest describe Neotoma as "The system of record for AI agents: versioned facts with their sources, over MCP, API and CLI". The npm keywords are now `mcp`, `model-context-protocol`, `ai-agents`, `system-of-record`, `provenance`, `structured-data` and `storage`.

## API surface & contracts

- `openapi.yaml` adds shared responses `GuestTokenInvalid` (401) and `GuestTokenScope` (403) and references them from every guest-readable route. It documents `GET /entities/{id}/html` as operation `getEntityHtml`, mapped to `neotoma request --operation getEntityHtml`, and adds `404` responses to `/entities/{id}/observations` and `/entities/{id}/relationships`.
- `StoreStructuredResponse` adds the optional `write_committed`, `store_write_completion` and `store_write_completion_note` fields. The relationships route's `expand_entities` description states the expansion rule for non-owner callers.
- The README states 67 MCP tools and 113 REST paths for this version. No MCP tool was added or removed.

## Behavior changes

- Invalid guest tokens return `401 GUEST_TOKEN_INVALID` on every guest-readable route, and out-of-coverage requests return `403 GUEST_TOKEN_SCOPE`, replacing the earlier route-specific codes and messages. A guest token sent as `access_token` to a route that does not accept links returns `401 GUEST_TOKEN_INVALID` instead of the generic missing-Bearer `401`.
- A guest link minted with a lifetime longer than `NEOTOMA_GUEST_TOKEN_TTL_SECONDS` now ends at the configured lifetime.
- The access-policy refusal shown to guest callers no longer names an operator command; its hint now asks the reader to request a new link.
- Guest callers see unexpanded related-entity entries for related entities they could not open through `GET /entities/:id`, and at most 50 related entities are evaluated per request.
- Admitted AAuth agents read entity details as their grant owner on the routes listed above instead of being judged by the type's guest policy.
- Pattern registration and evaluation limits, and the store-time handling of stored patterns the new rules do not accept, are described under Breaking changes.
- A committed store with an unconfirmed completion marker returns success with `write_committed: true` instead of `500`.
- On the first start after upgrade, building the new indexes delays writes once.

## Agent-facing instruction changes

- MCP and CLI instructions describe the `write_committed: true` / `store_write_completion: "unconfirmed"` reply: treat it as success, do not retry, and replay the same `idempotency_key` once only when `store_write_completion_note` says so.
- The rendered-page guidance, the CLI instructions and the `publish_rendered_page` tool description state the link lifetime rule and the re-publish step on `401 GUEST_TOKEN_INVALID`. The substrate-subscription section names `403 GUEST_TOKEN_SCOPE` for out-of-grant calls and `401 GUEST_TOKEN_INVALID` for a refused token.

## Plugin / hooks / SDK changes

- No plugin, hook or SDK package change in this range. SDK and CLI callers that match on guest-link error codes should match `GUEST_TOKEN_INVALID` and `GUEST_TOKEN_SCOPE`.

## Security hardening

This range changes guest-link and agent-admission behavior on the REST read routes and bounds caller-supplied patterns. The release-prep review ran the classifier, static rules, protected-routes manifest check and auth topology matrix on the release head; see the [security review](https://github.com/markmhendrickson/neotoma/blob/release/v0.29.0/docs/releases/in_progress/v0.29.0/security_review.md).

- Guest tokens are checked in one place on every guest-readable route (#2829).
- Related-entity expansion on guest reads is limited to what the guest link covers (#2833).
- Signed agents with a matching grant read entity details as the grant owner (#2835).
- Caller-supplied patterns in schema constraints are bounded and validated at registration (#2822, #2828).
- An entity-scoped guest token takes precedence over a closed type policy (#1952).

## Docs site & CI / tooling

- The three site illustrations that stood still now animate, and the Follow a record illustrations have an edge that separates them from the section background in the light theme.
- The operator-instance deploy workflow skips deploys for pushes that cannot change the image, diffing from the commit the instance serves; a test checks that every image input classifies as deploy.
- CLI tests always run against the local test server, and tests run from a git hook no longer act on the enclosing repository (`.husky/pre-commit` and the Vitest setup drop the repository-locating git variables).
- `docs/operations/configuration.md` documents the reader retirement behavior, `NEOTOMA_DB_MAX_RETIRED_WORKERS` and `NEOTOMA_DB_ORPHAN_GRACE_MS`. The legacy-payload changes log records this release's entries under `v0.29.0`.

## Internal changes

- "Hold the write gate for a short, history-independent time on correct" (#2815) was merged and then reverted (#2817); it has no net effect in this release.
- A timing harness for the entity listing indexes was added under `scripts/`.

## Tests and validation

- CI run [43536753035](https://github.com/markmhendrickson/neotoma/actions/runs/43536753035) passed all ten jobs on `main` at `1f95f4d85`, the code this release candidate is cut from: baseline, contract parity, security gates, frontend, site export, graph-render smoke, agentic evals, replay scenarios, combined evals and Python SDK. CI on the release-candidate head is reported by the PR's own checks.
- New and changed tests cover guest-token checks per route and policy mode, signed identity alongside a token, related-entity expansion, share-link precedence under a closed policy, admitted-agent entity reads, pattern registration and evaluation bounds with stored-schema loading, unconfirmed store completion, write ordering on the SQLite and worker backends, `entity.created` emission, reader-pool timeout and drain behavior, the new indexes, deploy classification, CLI local-target pinning and git environment isolation.
- Release prep ran type-check, lint, the test catalog check, the security lane and the root Vitest suite locally; results and gaps are in the [test coverage review](https://github.com/markmhendrickson/neotoma/blob/release/v0.29.0/docs/releases/in_progress/v0.29.0/test_coverage_review.md).

## Breaking changes

**Pattern limits at schema registration.** Schema registration and incremental edits now refuse some regular-expression pattern shapes in `constraints.pattern` and `matches_any_pattern` conditions (for example backreferences, some nested variable quantifiers and some overlapping repeated alternations; the list is not exhaustive) and enforce length and count limits. Counted quantifiers with long or zero-padded counts are read the way the engine reads them, so `^(\d+){000006}$` is refused as `^(\d+){6}$` already was. The error is `400 SCHEMA_VALIDATION_FAILED` with `details.refusal` and a `details.hint` that names the rewrite, for example `^(\d{3}){6}$`, `^\d{6,}$` or `^(\d+){5}$` in place of `^(\d+){000006}$`. Schemas that are already stored keep loading, but a stored pattern that the new rules do not accept no longer accepts values: a store carrying that field reports a `pattern` constraint violation under the schema's `constraint_violation_policy` until the pattern is rewritten and the schema registered again. See [the compatibility record](https://github.com/markmhendrickson/neotoma/blob/release/v0.29.0/tests/contract/legacy_payloads/CHANGES.md) (`v0.28.x/register_schema_repeated_group_pattern`, `v0.28.x/register_schema_counted_quantifier_pattern`).

**Guest-link error codes.** Guest-link refusals now use `401 GUEST_TOKEN_INVALID` and `403 GUEST_TOKEN_SCOPE` with fixed messages. Callers that matched the earlier guest-route error codes or message text should match these two codes instead.

**OpenAPI diff entries.** `npm run openapi:bc-diff -- --base v0.28.0 --head HEAD` reports five `removed-response-status` entries: the `401` response of `POST /subscribe`, `POST /unsubscribe`, `POST /list_subscriptions`, `POST /get_subscription_status` and `GET /events/stream`. Each route still declares `401`; its inline definition was replaced by a reference to the shared `GuestTokenInvalid` response, which the diff tool does not resolve. The only change for callers is the `GUEST_TOKEN_INVALID` code described above. No migration is needed beyond that.

This is a minor release from v0.28.0 under the project's 0.x validation-tightening policy. No additional version change is proposed by these notes.
