Neotoma v0.30.0 is a minor release covering every change merged since v0.29.1. Field provenance now returns the same complete, field-scoped evidence over MCP and HTTP, which changes the response shape for existing callers. Instance skills and standing rules now reach agents on every entrance, including the stateless discover path. A server bound beyond loopback now always checks the hosts of outbound webhooks and peer sync. Search and store writes get faster on large databases, and `npm install neotoma` installs 42 fewer runtime packages.

## Highlights

- **Agents now see the instance's skills and standing rules wherever they connect.** Standing rules lead the MCP `instructions` prose, and authenticated `server/discover`, `GET /mcp-interaction-instructions` and `neotoma instructions print` deliver both standing rules and the `[INSTANCE SKILLS]` catalog (#2906, #2916, #2930).
- **Field provenance returns the full chain, the same way on every transport.** `retrieve_field_provenance` (MCP) and `POST /get_field_provenance` (HTTP) share one implementation and one declared response listing every contributing observation and source, or a typed `PROVENANCE_INTEGRITY_ERROR` instead of a partial chain (#2867).
- **Lexical search and store writes stay fast on large databases.** A stored `entity_snapshots.search_text` column lets typed search filter candidates in SQL, with a throttled, resumable backfill (`neotoma snapshots search-text-backfill` or `NEOTOMA_SEARCH_TEXT_BACKFILL=1`), plus new indexes on the store, relationship and instance-policy paths (#2900, #2903, #2905, #2887, #2904).
- **Relationship reads answer "as of" a write time.** `list_relationships` and `retrieve_related_entities` accept `at` and `at_ingested` on MCP, REST and CLI, returning only edges and endpoints visible at that cutoff (#2871).
- **A production install is 43% smaller.** Inspector and site build packages moved to devDependencies: direct runtime dependencies drop from 70 to 28 and installed production packages from 340 to 214 (#2855, #2860).

## What changed for npm package users

- `npm install neotoma` no longer installs React, Radix UI, Tailwind, `turndown`, `papaparse` or the other Inspector and site build packages. No server or CLI code imports them, and the Inspector is still served from the prebuilt `dist/inspector` bundle. If your project imported one of them without declaring it, add it to your own `package.json`.
- New embedded entry point `createEmbeddedNeotoma` takes configuration in code. On that path Neotoma reads no env files, home-directory config or tunnel files, needs no server or daemon, and ignores host environment variables unless they are named in `allowProcessEnv`. CLI and server loading are unchanged (#2866).
- The SDK client's `correct()` accepts a single field correction (#2879).
- `neotoma request` failures keep the server's recovery hint; with `--json` the stderr error line carries the domain code, message and hint (#2867).
- New CLI command `neotoma snapshots search-text-backfill` fills the stored search text for snapshots that have none (#2905).
- `neotoma instructions print` now prints the same standing rules a connected MCP client receives (#2916).
- The CLI relationship list and related-entities reads accept `--at` and `--at-ingested` (#2871).

## API surface & contracts

- **New operations.** `GET /mcp-interaction-instructions` returns the per-user MCP instruction text, standing rules included; it answers without credentials (generic text) and sends `Vary: Authorization` and a private cache header when the caller is signed in (#2916). `POST /mcp/oauth/sign-out` ends the OAuth key-session and clears its cookie (#2899). `POST /guest-access-tokens/{id}/revoke` lets the owner revoke a guest token, honouring the token's correction history; errors use `RESOURCE_NOT_FOUND`, `VALIDATION_INVALID_FORMAT`, `DB_CONNECTION_FAILED` and three `ERR_GUEST_TOKEN_*` 409 codes (#2915). The OpenAPI spec now lists 116 paths.
- **Field provenance.** `getFieldProvenance` has a declared 200 response, `FieldProvenanceResponse`, with `additionalProperties: false`, containing `field`, `entity_id`, `value`, `observation_ids`, `observations`, `sources` and the aliases `source_observation`, `source` and `observed_at`. New schemas `FieldProvenanceObservation` and `FieldProvenanceSource`. New error code `PROVENANCE_INTEGRITY_ERROR` (HTTP 500, MCP InternalError); missing or foreign entities and absent fields share `RESOURCE_NOT_FOUND` (HTTP 404, MCP InvalidParams). See `docs/developer/field_provenance.md` (#2867).
- **As-of relationship reads.** `POST /list_relationships` and `POST /retrieve_related_entities` accept optional `at` and `at_ingested` and return `as_of`. An edge is visible as of T only if the edge and both endpoints are (#2871).
- **Capability narrowing flag.** `GET /entities`, `POST /entities/query`, `GET /observations`, `POST /observations/query`, `POST /retrieve_related_entities` and `POST /retrieve_graph_neighborhood` may return `narrowed_by_capability` when optional retrieve enforcement removed rows. With enforcement off (the default) the field is absent (#2920, #2926).
- **Agent-grant lookup failures.** A signed AAuth request without a Bearer token whose grant lookup fails (a busy or timed-out read) now gets `503 ADMISSION_UNAVAILABLE` with `Retry-After` (MCP code `-32001`) instead of `401 Missing Bearer token`. The 503 is declared in `openapi.yaml`. Nothing previously refused is now admitted (#2890).
- **Empty skill lookups.** `retrieve_entity_by_identifier` with `entity_type: "skill"` and no match returns an optional `hint` naming the caller's user id and suggesting a comparison with the account that owns the graph the instructions came from (#2933).
- No MCP tool was added or removed; the README states 67 MCP tools and 116 REST paths.

## Agent-facing instruction changes

- **Standing rules in the instructions prose (#2906).** Enabled standing rules now lead the MCP `instructions` text, in full, under a `[STANDING RULES]` header, ahead of the base block. They are still mirrored in `serverInfo._neotoma.standing_rules`. General MCP clients surface only `instructions`, so this is what makes the rules reach those sessions.
- **Standing rules on the stateless entrances (#2916).** Authenticated `server/discover`, `GET /mcp-interaction-instructions` and `neotoma instructions print` carry the same standing rules as `initialize`.
- **Instance skills on authenticated discover (#2930).** The `[INSTANCE SKILLS]` catalog now appears on authenticated `server/discover` as well as `initialize`, scoped to the same graph. Skills stored without a description are listed with one derived from the skill body instead of `(no description)` (#2907).
- **Not-found hint on an empty skill lookup (#2933).** The instructions tell agents that an empty `skill` lookup carries a `hint` and how to read it (compare `get_authenticated_user` with the graph owner) rather than concluding the skill does not exist.
- **Skipped standing rules are counted (#2935).** When stored standing rules lack usable rule text, every entrance adds the line `N stored standing rule(s) could not be applied because ...` so the agent and operator know rules were dropped. When the rules cannot be read at all, the block says so instead of reading as empty.
- **Write-time cutoff wording (#2880, #2892).** `at` and `at_ingested` are described everywhere as write-time cutoffs (server clock at write time), not event or valid time. Domain dates remain ordinary fields.
- **`user_id` scope (#2901).** The instructions state that `--user-id` / `NEOTOMA_USER_ID` scope reads to another user only for local no-token requests, otherwise `403`.

## Behavior changes

- **Field provenance, HTTP (#2867).** Observation and source rows are projected: each observation's `fields` holds only the requested field, `provenance` holds only write-attribution keys and `data_origin`, and sources return `id`, `mime_type`, `content_hash`, `file_size` and `created_at`. `observation_ids` is ordered by `observed_at` descending then ID.
- **Field provenance, MCP (#2867).** `source.file_urls` is removed; use `retrieve_file_url`. The aliases select the most recent contributor.
- **Outbound host guard follows the bind host (#2898, #2902).** The guard checks the host of every caller-supplied outbound URL (new webhook subscriptions, webhook mirrors, peer health checks, peer sync pushes and snapshot pulls, `prefer_remote` conflict resolution, repo-discovery manifest resolution) and refuses private, loopback, link-local and platform-internal hosts. Bound to loopback (`127.0.0.1`, `localhost`, `::1`), it is off unless `NEOTOMA_HOSTED_MODE` turns it on. Bound beyond loopback (`0.0.0.0`, `::`, a LAN address), it is always on. See Breaking changes.
- **Local development `user_id` override (#2901).** A caller-supplied `user_id` replaces the local development user only for loopback requests that signed in without a token, outside production. Token sign-ins that resolve to the local development user and pass a different `user_id` get `403`. `NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE=1` restores the wider override for test setups.
- **Static bearer on shared-graph instances (#2908).** When `NEOTOMA_SHARED_GRAPH_USER_ID` is set, the static `NEOTOMA_BEARER_TOKEN` acts as the shared graph owner on REST and MCP, so skills and standing rules resolve against the shared graph. The shared id is honoured only from the HTTP gate. `GET /me` reports `shared_graph` for such a token.
- **OAuth key-session sign-out (#2899).** Signing out ends the key-session and clears its cookie; `/mcp/oauth/authorize` then asks for credentials again. A failed Google sign-in callback also ends the existing key-session.
- **Agent-grant `last_used_at` (#2886).** The daily `last_used_at` update now runs as a server write and succeeds; it previously failed on every admitted request and retried.
- **Ownerless interpretation runs (#2882).** `runInterpretation` without an owner is refused before any row is written; previously it left a run, entity and observation behind.
- **Semantic search without a vector backend (#2891).** When no local vector backend is available, search skips the semantic step and the embedding call. Embedding calls are bounded to 5 s with no retries.
- **Lexical search (#2888, #2889, #2903).** Each snapshot is cleaned once instead of per token, the scan yields to the event loop every 500 candidates, object-valued `raw_fragments` are indexed as JSON instead of `[object Object]`, and typed search filters candidates in SQL on `search_text`. Ranked results are unchanged.
- **Access log (#2917).** The HTTP server writes one access line per request to stdout: `json` beyond loopback, `dev` on loopback, `off` to disable (`NEOTOMA_ACCESS_LOG`). Addresses are redacted prefixes (IPv4 `/24`, IPv6 `/48`, built from expanded addresses) unless `NEOTOMA_ACCESS_LOG_FULL_IP=1`.
- **Structured read log (#2927).** When the access log is on, each logged read operation writes one `read` line naming the entities returned, including the issue status alias and entity Markdown and HTML renderings. Lines that stop at a cap are marked truncated.
- **Contributor tooling (#2862).** Worktree env copy runs only with `NEOTOMA_WORKTREE_COPY_ENV=1` and refuses a `NEOTOMA_ENV=production` source; the pre-commit hook rejects staged env files other than `*.example`.

## Self-hosters

What runs at startup after the upgrade:

- **Indexes created on open (#2887, #2904).** `idx_entity_snapshots_type` on `entity_snapshots(entity_type)` serves the instance-policy lookup. New indexes `idx_entities_type_name` on `entities(entity_type, canonical_name)` and `idx_relationship_observations_key_user` on `relationship_observations(relationship_key, user_id)` serve store and relationship writes, and ownership on id lookups is now filtered in code so the primary key is used. On a large database, creating these indexes adds time to the first start.
- **Stored `search_text` column (#2900, #2903).** `entity_snapshots` gains a `search_text` column, maintained on every snapshot write. Existing rows start empty and are still found through the previous path until filled.
- **Throttled backfill (#2905).** Fill existing rows with `neotoma snapshots search-text-backfill` (batches in short write transactions, rate-limited, backs off after a slow batch, stops after two consecutive batches slower than the stop threshold; safe to stop and re-run). Or set `NEOTOMA_SEARCH_TEXT_BACKFILL=1` to run it in the background after the server starts listening (off by default). Tuning: `NEOTOMA_SEARCH_TEXT_BACKFILL_BATCH_SIZE` (50, max 200), `_ROWS_PER_SECOND` (50), `_SLOW_BATCH_MS` (1000), `_SLOW_PAUSE_FACTOR` (10), `_STOP_BATCH_MS` (10000), `_STOP_AFTER_SLOW_BATCHES`.

New and newly documented settings:

| Setting | Default | What it does |
|---|---|---|
| `NEOTOMA_DROP_ORPHAN_ENTITY_FTS` | off | `1` drops, at open, the leftover `entity_fts_*` triggers some older databases carry (they make every snapshot write read the whole full-text table) together with the unused `entity_search_fts` and `entity_fts_rows` tables, in one transaction. Search results do not change (#2909, #2911). |
| `NEOTOMA_SEARCH_TEXT_BACKFILL` | off | Run the `search_text` backfill in the background after start (#2905). |
| `NEOTOMA_ACCESS_LOG` | `json` beyond loopback, `dev` on loopback | Per-request access log format; `off` disables it and the read log (#2917, #2927). |
| `NEOTOMA_ACCESS_LOG_FULL_IP` | off | `1` logs full addresses instead of redacted prefixes (#2917). |
| `NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE` | off | `1` restores the wider local-development `user_id` override for test setups (#2901). |
| `NEOTOMA_MCP_INSTANCE_SKILL_HINTS` | on | `0` or `false` omits the `[INSTANCE SKILLS]` section; now listed in `docs/operations/configuration.md` (#2447). |
| `NEOTOMA_SHARED_GRAPH_USER_ID` (existing) | unset | When set, the static bearer token now acts as the shared graph owner (#2908). |

Optional read-capability checks (off by default):

- `NEOTOMA_ENFORCE_AGENT_RETRIEVE=1` enforces the `retrieve` capability of an admitted agent grant on entity reads, typed identifier lookups, merge-link following, MCP resource reads and graph-neighbourhood source and event rows. Responses that dropped rows carry `narrowed_by_capability`. Leave it unset to keep current behavior (#2920, #2926). See `docs/subsystems/auth.md#agent-grants-retrieve-scope`.

## Docs site & CI / tooling

- CI: packed production-consumer check (`npm run check:production-consumer`) on every PR (#2860); worktree env copy test (#2862); correction and observation-insert integration tests on PRs (#2816); new suites for search_text, store-path indexes, static bearer skill delivery, standing-rules entrances and skill delivery added to the `test:contract-parity` lane (#2900, #2903, #2904, #2908, #2909, #2916, #2930, #2933). The remote integration nightly builds the server first (#2878).
- The protected-routes manifest generator records routes whose security list includes `{}` as public with expected status 200 (#2916).
- The read-log guard fails when a retrieve-gated route is neither logged nor excluded (#2927).
- New docs: `docs/developer/field_provenance.md`; `docs/proposals/target_instance_check.md` (#2848, design only); access log and read log sections in `docs/operations/configuration.md`; static bearer shared-graph section in `docs/subsystems/auth.md`.
- `fly.operator.toml` sizes the operator's own instance; client deployments set their own machine size (#2904).

## Internal changes

- `src/services/field_provenance.ts` replaces the separate MCP and HTTP provenance handlers (#2867).
- Runtime settings on embedded paths are read through `runtimeEnv()` (#2866).
- Instance-skill composition is a shared helper used by `initialize` and discover (#2930).
- Test-only: ownerless refusal cases (#2881, #2884), median-based trigger timing (#2911).

## Security hardening

`npm run security:classify-diff -- --base v0.29.1 --head HEAD` reports `sensitive=true` (332 changed files; concerns: OpenAPI security blocks, protected-routes manifest and its generator, `src/actions.ts`, AAuth middleware, access policy, Inspector mount, issues GitHub auth, root landing, sandbox mode, subscriptions and sync). Changes operators and callers get:

- Outbound webhooks and peer sync from a server bound beyond loopback reach only public hosts (#2898). Operator action: see Breaking changes.
- The local-development `user_id` override applies only to loopback no-token requests outside production (#2901).
- The static bearer acts as the shared graph owner only when presented through the HTTP gate (#2908).
- Signing out ends the OAuth key-session and clears its cookie; a failed Google callback also ends it (#2899).
- Guest-token owners can revoke a token over HTTP (#2915).
- Field provenance returns only the requested field and permitted attribution, without storage paths or file names (#2867).
- The per-user instructions response is marked private (#2916).
- Access-log addresses are redacted prefixes by default (#2917).
- Optional retrieve-capability enforcement is available and off by default (#2920, #2926).

Upgrade to v0.30.0; no token rotation is needed. See the [security review](https://github.com/markmhendrickson/neotoma/blob/main/docs/releases/in_progress/v0.30.0/security_review.md) and the [test coverage review](https://github.com/markmhendrickson/neotoma/blob/main/docs/releases/in_progress/v0.30.0/test_coverage_review.md).

## Tests and validation

- Release prep ran the security classifier, the protected-routes manifest check, the auth topology matrix and the OpenAPI breaking-change diff on this head. Feature suites for each change ran in their own pull requests and in CI on `main`. Per-commit coverage is in the test coverage review.

## Breaking changes

- **`POST /get_field_provenance` response is closed and projected (#2867).** `npm run openapi:bc-diff` reports `tightened-additional-properties` on the 200 response. Before: an open object with raw observation rows (all fields) and raw source rows including `storage_url` and `original_filename`. After: `FieldProvenanceResponse` with projected rows. Migration: read the requested field from `observations[].fields[field]`, use `retrieve_file_url` / `GET /get_file_url` for file access, and join on `sources[].id`.
- **MCP `retrieve_field_provenance` drops `source.file_urls` (#2867).** It was always an empty array. Migration: call `retrieve_file_url`.
- **Incomplete provenance is an error, not a partial result (#2867).** A missing or foreign contributor or source returns `PROVENANCE_INTEGRITY_ERROR` (HTTP 500, MCP InternalError) where HTTP previously returned 200. `details` names the unresolved reference and carries a repair hint. Migration: handle the error code.
- **`observation_ids` order changed on HTTP (#2867).** Now `observed_at` descending then ID. Migration: do not rely on snapshot order.
- **Runtime packages removed from `dependencies` (#2855, #2860).** 42 Inspector and site build packages are devDependencies. Migration: projects that imported one through `neotoma` add it to their own `package.json`.
- **Self-hosted servers bound beyond loopback no longer send webhooks or peer sync to private addresses (#2898, #2902).**
  - Who: `NEOTOMA_HTTP_HOST` set to a non-loopback address (for example `0.0.0.0`) with webhook or peer targets on private addresses, such as two instances on a home network with a peer at `http://192.168.1.20:3180`. Only `127.0.0.1`, `localhost` and `::1` count as loopback.
  - What you see: creating a webhook subscription fails with `webhook_url must be a public host: private, loopback, link-local, and platform-internal targets are rejected`. Existing webhook subscriptions to private hosts fail each delivery and are deactivated after `max_failures` (10 by default), logged as `[subscriptions] webhook POST failed` and `subscription auto-deactivated`. Peer sync pushes, bilateral pulls and health checks return `peer_url_not_public`, and peer sync subscriptions are deactivated the same way. Inbound sync webhooks from a private peer log `SENDER_PEER_URL_PRIVATE_HOST` (sender sees `http_500`). `prefer_remote` conflict resolution returns ``prefer_remote: `sender_peer_url` must be a public host.``; repo-discovery returns `peer_url_private_host`; a webhook mirror URL is dropped with the log line `webhook mirror URL rejected as non-public`. The startup log line `[outbound_host_guard] on because NEOTOMA_HTTP_HOST is not loopback` confirms the guard is on.
  - Migration: for a local-only setup, unset `NEOTOMA_HTTP_HOST` or set it to `127.0.0.1`; otherwise point webhooks and peers at public addresses. `NEOTOMA_HOSTED_MODE=0` does not turn the guard off on a non-loopback bind. Afterwards, list webhook and peer sync subscriptions and re-activate any that were switched off.
- **Local-development `user_id` override narrowed (#2901).** Before: a request authenticated as the local development user could pass any `user_id` (body or query), with or without a token. After: only loopback requests that signed in without a token, outside production; others get `403` with `user_id parameter (...) does not match authenticated user (...)`. Migration: drop `user_id` from token-authenticated calls, or set `NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE=1` in test setups.
- **Failed agent-grant lookups return 503 (#2890).** Signed AAuth requests without a Bearer token whose grant lookup fails get `503 ADMISSION_UNAVAILABLE` with `Retry-After` instead of `401`. Migration: retry after the stated delay instead of re-authenticating.
- No other request shape was tightened: the OpenAPI diff reports no request-side tightening, and `src/tool_definitions.ts` adds only optional inputs (`at`, `at_ingested` on relationship reads).
