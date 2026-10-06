# Neotoma Error Handling — Error Codes and Propagation
*(Structured Error Envelope and Canonical Error Codes)*

## Envelope Taxonomy

Two envelope shapes exist. Pick the right one and do not mix them.

### 1. Standard envelope

Emitted by `buildErrorEnvelope(code, message, details?)` in `src/actions.ts`. Used for most API errors.

```typescript
interface ErrorEnvelope {
  error_code: string;              // e.g., 'INGESTION_INVALID_FILE'
  message: string;                 // Human-readable description
  details?: Record<string, any>;   // Additional context (no PII)
  trace_id?: string;               // Distributed tracing ID
  timestamp: string;               // ISO 8601
}
```

Wire format: `{ error: ErrorEnvelope }`.

### 2. Resolution envelope (`ERR_STORE_RESOLUTION_FAILED`)

Emitted by the `/store` endpoint when one or more entities fail to resolve during a structured store. Carries per-entity `issues[]` so clients can show each row's failure independently.

```typescript
interface StoreResolutionErrorEnvelope {
  error: {
    code: "ERR_STORE_RESOLUTION_FAILED";
    message: string;
    issues: Array<{
      code: string;                // e.g., 'ERR_CANONICAL_NAME_UNRESOLVED', 'ERR_MERGE_REFUSED', 'ERR_CONVERSATION_MESSAGE_ROLE_CONFLICT'
      message: string;
      details?: Record<string, any>;
      // R4 (conversation_entity_collision_fix): `hint` may be a free-form
      // string (legacy shape) OR a structured object carrying both the
      // caller-facing text AND a schema-derived list of identity fields.
      hint?: string | {
        text: string;
        required_identity_fields?: {
          entity_type: string;
          required: boolean;           // true iff name_collision_policy === "reject"
          any_of_fields: string[];     // single-field canonical rules
          composite_fields: string[][];// every field in at least one group
        };
      };
    }>;
  };
}
```

The `hint` field carries upgrade guidance that the client can surface verbatim (e.g., "Payload looks like the pre-0.5 `attributes`-nested shape; flatten fields to top level."). Do not concatenate upgrade text into `message`; use `hint`.

When a schema declares `name_collision_policy: "reject"` (R1/R2), a refused resolution emits `issues[].hint` as an object: `text` carries the short, verbatim-surfaceable instruction (e.g. `"Declare \`conversation_id\` on entity_type \"conversation\" to match deterministically."`) and `required_identity_fields` carries the schema-derived field contract the caller can program against without parsing prose. See `RequiredIdentityFields` in `openapi.yaml` and the implementation in `src/services/schema_registry.ts#deriveRequiredIdentityFields`.

### Tightening-change hint obligation

Whenever a change causes a previously-accepted request shape to start returning an `ERR_*` envelope, the **same** change ships a structured `hint` populated with migration text — not a follow-up release, not a post-hoc retrofit.

Concretely:

- A PR that narrows validation (adds `additionalProperties: false`, promotes a field from optional to required, tightens an enum, rejects a nested shape a resolver previously tolerated) MUST populate `hint` on the emitted error alongside the tightening.
- A PR that deprecates an alias or field MUST populate `hint` pointing to the replacement the same release ships.
- The `hint` string is surfaceable to end users verbatim; it contains the upgrade path, not diagnostic jargon. Example: `"Payload looks like the pre-0.5 'attributes'-nested shape; flatten fields to top level."`
- The matching legacy-payload fixture (`tests/contract/legacy_payloads/`) is updated in the same PR: the payload moves from `valid` to `rejected` and the fixture asserts the `hint` string.

The motivating case is the v0.5.0 `attributes`-nested regression: resolver tolerance for `{ entity_type, attributes: {...} }` was removed, the validator started rejecting the shape, but no `hint` shipped and no fixture flagged the tightening. The rule exists so the next tightening cannot repeat that pattern.

Process wiring: the pre-PR checklist in `docs/architecture/change_guardrails_rules.mdc` names this obligation, the release-skill preflight (`.cursor/skills/release/SKILL.md`) surfaces any uncovered tightening into the supplement's "Breaking changes" section, and the legacy-payload corpus (`tests/contract/legacy_payloads/`) fails CI when a payload's outcome flips without a `hint` assertion.

### Picking the right envelope

- Use the **standard envelope** for single-object failures (auth, validation, resource-not-found, DB, ingestion).
- Use the **resolution envelope** only when the error carries multiple per-row issues from a batch operation (currently only `/store`).

### Adding fields

Both envelopes are declared in `openapi.yaml` `components/schemas`. Any new field (including `hint`, `details` sub-keys, new issue codes) follows the OpenAPI contract flow: spec first, regenerate types, populate from server, test at contract level. See `docs/architecture/openapi_contract_flow.md`.


## Canonical Error Codes
### Ingestion Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `INGESTION_FILE_TOO_LARGE` | File exceeds size limit | 400 | No |
| `INGESTION_UNSUPPORTED_TYPE` | File type not supported | 400 | No |
| `INGESTION_OCR_FAILED` | OCR processing failed | 500 | Yes |
| `INGESTION_EXTRACTION_FAILED` | Field extraction failed | 500 | No |
### Auth Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `AUTH_REQUIRED` | No token provided | 401 | No |
| `AUTH_INVALID` | Invalid token | 401 | No |
| `AUTH_EXPIRED` | Token expired | 401 | No |
| `FORBIDDEN` | Insufficient permissions | 403 | No |
### Database Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `DB_CONNECTION_FAILED` | Cannot connect to DB | 503 | Yes |
| `DB_QUERY_FAILED` | Query execution failed | 500 | Yes |
| `DB_CONSTRAINT_VIOLATION` | Unique constraint violated | 409 | No |
### Validation Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `VALIDATION_MISSING_FIELD` | Required field missing | 400 | No |
| `VALIDATION_INVALID_FORMAT` | Invalid field format | 400 | No |
| `ERR_UNKNOWN_FIELD` | Request body contained a top-level field not declared by the operation's closed schema (`additionalProperties: false`). `details` carries `unknown_fields`, `json_paths`, `allowed_fields`, and `operation`. | 400 | No |
| `CURSOR_OFFSET_CONFLICT` | CLI-only (`neotoma entities list`): `--cursor` and `--offset` were both supplied explicitly. They are mutually exclusive ways to state where a page starts, so the CLI rejects the pair rather than silently dropping one. Surfaced as `hint.code` in `--json` output. The equivalent server-side rejection is `VALIDATION_INVALID_FORMAT`. | n/a (CLI) | No |
| `INVALID_CURSOR` | Pagination `cursor` is malformed, carries an unsupported version, or was minted under a different `sort_order` than the current request (#1943). `details` carries `code`, `message`, and a flat `hint`. Not retryable with the same token: drop the cursor and restart the walk from the first page. | 400 | No |
| `ERR_CURSOR_COMBINATION` | A `cursor` was paired with a parameter whose query shape cannot honour a keyset seek: a non-zero `offset`, a non-default `sort_by`, `search`, or `published`/`snapshot_filters` (#1943). Distinct from the tightenings below — these combinations were never valid, so this is a coherence guard, not a migration. Surfaced as the issue's `params.code` (REST: lifted to `details.hint`; MCP: on the error `data`). The `hint` names the way out — drop the conflicting parameter, or page that query shape with `offset` instead. | 400 | No |
### Resource Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `RESOURCE_NOT_FOUND` | Resource not found | 404 | No |
### Agent Capability v1 Errors (reserved)
Declared ahead of the `agent_capability_v1` capability type (see `AgentCapabilityEntryV1` in `openapi.yaml`), a narrowly scoped capability that lets one pinned key perform a fixed, owner-chosen purpose and nothing else. **No code path emits any of these yet.** The names and hints are declared first so the contract, generated types and agent instructions exist before the enforcement they describe; each row is a contract for the change that enables the capability. Until then the existing grant validator refuses a grant carrying the v1 shape (message and field `capabilities[i].op`), but how the refusal reaches the caller differs by surface, and not every write path calls the validator:

| Surface | Result today |
|---------|--------------|
| `POST /agents/grants`, `PATCH /agents/grants/{id}` | HTTP 400, `error_code` `AGENT_GRANT_INVALID`, `details.code` `agent_grant_invalid` |
| `POST /correct` | HTTP 400, `error_code` `agent_grant_invalid`, `details.field` `capabilities[0].op` |
| `POST /store` | HTTP 500, `error_code` `DB_QUERY_FAILED`, with the validator message (the refusal holds; it falls into the generic error path) |
| MCP `correct` | JSON-RPC `-32603` carrying the validator message, no error code |
| MCP `store` (structured path), MCP `create_interpretation`, `POST /interpretations/create` | **Not refused.** They insert the observation without running the validator, so a v1-shaped `agent_grant` entity can be persisted |

A persisted v1-shaped entity confers no authority: every read re-validates it, rejects it, and resolves it to no grant (admission fails closed). The enabling change must first reject any v1-shaped grant observation that already exists, from any of those paths (see `docs/subsystems/agent_capabilities.md`, "Reserved: agent_capability_v1").

All of these ride in the standard envelope (`details.hint` carries the structured hint), except that `ERR_REVISION_CONFLICT` rides as an issue of the resolution envelope (above). None echoes a key, token or grant digest. The only value any of them returns is `details.current_last_observation_id` on `ERR_REVISION_CONFLICT`, by design and only after the write passed the capability check. How they render over MCP (JSON-RPC) is specified with the enabling change, not here.

| Code | Meaning | HTTP | Retry? | Hint (`details.hint`) |
|------|---------|------|--------|------|
| `ERR_ACQUISITION_NOT_AUTHORIZED` | A request tried to make the server read a file path, follow a reference, fetch a URL or provider object, or parse a server-local file. A v1 key may only send inline bytes. Refused from request shape alone, before any filesystem or provider call. | 403 | No | Send the exact bytes inline as `file_content` (base64) with `mime_type`; server-side acquisition is not available to this key. |
| `ERR_AUTHORITY_CHANGED` | The grant stopped covering the write between admission and a durable step (revoked, suspended, expired, or its capability changed). `details` carries classified `persisted`, `refused` and `replayed` counts of what the request had already done. Nothing further is written. | 403 | No | Stop. Do not retry with a wider scope. The owner must reissue the grant. |
| `ERR_REVISION_CONFLICT` | A conditional write named an `expected_last_observation_id` that is no longer the entity's first observation, or a create-only write found existing observations. Reported as an `issues[]` entry of an `ERR_STORE_RESOLUTION_FAILED` envelope (resolution envelope above) with `details.current_last_observation_id`, only after the write passed the capability check. The HTTP status is 409 only when every issue in the envelope is `ERR_REVISION_CONFLICT`; any other mix keeps the resolution envelope's 400. On `/store`, 409 also means an idempotency collision (`ERR_IDEMPOTENCY_COLLISION`, standard envelope); tell them apart by the body. | 409 | No (re-read first) | Re-read the entity and re-preview the change. Never overwrite or force. |
| `ERR_V1_OWNER_SESSION_REQUIRED` | An operation reserved to the owner (creating, changing or reactivating a v1 grant, or a merge, split, delete or restore of one) came from a request that is not an owner session. | 403 | No | Ask the owner to perform this in an owner session (Inspector or CLI). |
| `ERR_V1_ROUTE_NOT_PERMITTED` | A v1-scoped key called a route or MCP method outside its capability's `operation_ids`, or one not yet wired for v1. Denial is the default; a route added later is denied until wired. | 403 | No | This key may only call the operations listed in its capability. |
| `ERR_V1_WRITE_BUDGET_EXHAUSTED` | The bound entity already holds the owner-set maximum number of observations, counted across all authors for its lifetime. The body carries no count, revision id or entity id. | 403 | No | Stop. The owner must reissue the grant with a higher `max_observations`; do not retry. |

`agent_grant_invalid` reasons added for the v1 shape. They will ride in `details.reason` of the envelope the refusing surfaces above already return.

| Reason | Meaning | Field |
|--------|---------|-------|
| `delegation_unsupported_v1` | `delegation_chain` is not the empty array. | `capabilities[i].delegation_chain` |
| `validity_required` | A grant with a v1 capability has no `valid_from` / `valid_until`, or the active `agent_grant` schema does not declare them. | `valid_from`, `valid_until` |
| `validity_malformed` | A validity value is not RFC 3339 with uppercase `T` and `Z` or an explicit offset. | `valid_from`, `valid_until` |
| `validity_window_invalid` | `valid_until` is not later than `valid_from`. | `valid_until` |
| `pins_required` | A grant with a v1 capability lacks a non-null canonical `match_thumbprint`, `match_sub` or `match_iss`. | `match_thumbprint`, `match_sub`, `match_iss` |
| `operation_id_not_permitted` | `operation_ids` names an operation outside the closed vocabulary, or one this build does not enforce. | `capabilities[i].param_constraints.operation_ids` |
| `legacy_capability_mixed` | A grant carrying a v1 capability also carries a legacy capability. | `capabilities` |
| `key_already_pinned` | The write would leave a second active or suspended grant pinning a key a v1 grant pins, or give a v1 grant a key already pinned elsewhere. | `match_thumbprint` |
| `unknown_constraint` | `param_constraints` carries an unknown version, unknown key, malformed value or unsupported predicate. | `capabilities[i].param_constraints` |
| `write_budget_required` | `entities.max_observations` is missing, not an integer, not positive, or a float. | `capabilities[i].param_constraints.entities.max_observations` |

### MCP Transport Errors (`POST /mcp`)
These ride in a JSON-RPC error's `error.data` (`{ error_code, message, hint, details? }`), not the standard envelope, because `/mcp` answers in JSON-RPC. The JSON-RPC `error.code` is listed alongside. None of them repeats a header value or a credential.
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `MCP_HEADER_VALUE_REJECTED` | `Mcp-Method` or `Mcp-Name` carried a value shaped like a credential or personal data, or not shaped like a JSON-RPC method, tool/prompt name or served resource URI (`neotoma://`, `ui://`). JSON-RPC `-32020`. Applies to both protocol eras. `details` carries `header` and `reason` (`credential_shaped`, `personal_data_shaped`, `malformed`); `hint` says to send only the method and name, or omit the header. | 400 | No |
| `MCP_HEADER_MISMATCH` | 2026-07-28 request: `MCP-Protocol-Version`, `Mcp-Method` or `Mcp-Name` is missing or does not equal the `_meta` version, JSON-RPC method or target name. JSON-RPC `-32020`. `hint` names the headers to mirror. | 400 | No |
| `MCP_REQUEST_META_INVALID` | 2026-07-28 request: `params._meta` lacks the protocol version or client capabilities. JSON-RPC `-32602`. `hint`: send them on every request, or send `initialize` to use 2025-11-25. | 400 | No |
| `MCP_UNSUPPORTED_PROTOCOL_VERSION` | 2026-07-28 request names a protocol version this server does not serve statelessly. JSON-RPC `-32022`. `data` also carries `supported` and, for a plain revision date, `requested`. | 400 | No |
| `MCP_AUTH_CONNECTION_INVALID` | 2026-07-28 request: the connection id is unknown, expired or revoked. Returned before any method runs, with `WWW-Authenticate: Bearer ... error="invalid_token"`. JSON-RPC `-32001`. `hint`: remove `X-Connection-Id` and connect again. | 401 | No |
| `MCP_AUTH_UNRESOLVED` | 2026-07-28 request: the credential passed the `/mcp` gate but could not be resolved to a user (for example an OAuth lookup failure). JSON-RPC `-32001`. | 401 | Yes |
## Error Propagation
Errors propagate **up** the layer stack:
```
Domain throws → Application catches → Application returns ErrorEnvelope → UI displays
```
```typescript
// Domain layer
async function extractFields(text: string): Promise<Fields> {
  if (!text) {
    throw new ExtractionError('EXTRACTION_FAILED', 'Empty text');
  }
  // ...
}
// Application layer
async function ingestFile(file: File): Promise<Result<Record, ErrorEnvelope>> {
  try {
    const fields = await extractFields(text);
    // ...
  } catch (error) {
    if (error instanceof ExtractionError) {
      return {
        error: {
          error_code: error.code,
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      };
    }
    throw error; // Unexpected error
  }
}
```
## Agent Instructions
Load when implementing error handling, defining new error types, or debugging failures.
Required co-loaded: `docs/architecture/architecture.md`, `docs/subsystems/privacy.md`
Constraints:
- MUST use ErrorEnvelope structure
- MUST NOT include PII in error messages
- MUST distinguish transient vs permanent errors
- MUST include trace_id for debugging
