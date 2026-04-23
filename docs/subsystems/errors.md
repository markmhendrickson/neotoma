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
      code: string;                // e.g., 'ERR_CANONICAL_NAME_UNRESOLVED', 'ERR_MERGE_REFUSED'
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
### Resource Errors
| Code | Meaning | HTTP | Retry? |
|------|---------|------|--------|
| `RESOURCE_NOT_FOUND` | Resource not found | 404 | No |
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
