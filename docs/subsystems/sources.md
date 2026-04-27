# Neotoma Source Architecture

## Scope

This document covers:
- `sources` table structure and semantics (stores [source](../vocabulary/canonical_terms.md#source))
- `interpretations` table structure and semantics
- Content-addressed storage with SHA-256 hashing
- Deduplication via `(user_id, content_hash)` uniqueness
- [Interpretation](../vocabulary/canonical_terms.md#interpretation) immutability (reinterpretation creates NEW [observations](../vocabulary/canonical_terms.md#observation))
- Storage and [interpretation](../vocabulary/canonical_terms.md#interpretation) quotas
- Upload queue for resilient storage

This document does NOT cover:
- [Observation](../vocabulary/canonical_terms.md#observation) creation (see `docs/subsystems/observation_architecture.md`)
- [Entity](../vocabulary/canonical_terms.md#entity) resolution (see `docs/subsystems/ingestion/ingestion.md`)
- [Entity](../vocabulary/canonical_terms.md#entity) merge (see `docs/subsystems/entity_merge.md`)

## 1. Architecture Overview

### 1.1 Data Flow

```
Source → Interpretation → Observations → Entity Snapshots
```

**Layers:**
1. **[Source](../vocabulary/canonical_terms.md#source)**: Raw content (structured or unstructured) stored with content hash for deduplication
2. **[Interpretations](../vocabulary/canonical_terms.md#interpretation)**: Versioned interpretation attempts with config logging (stored in `interpretations` table)
3. **[Observations](../vocabulary/canonical_terms.md#observation)**: Granular facts [extracted](../vocabulary/canonical_terms.md#extraction) from [source](../vocabulary/canonical_terms.md#source) (via [interpretations](../vocabulary/canonical_terms.md#interpretation))
4. **[Entity Snapshots](../vocabulary/canonical_terms.md#snapshot)**: Deterministic [reducer](../vocabulary/canonical_terms.md#reducer) output

### 1.2 Key Principles

| Principle | Description |
|-----------|-------------|
| Content-Addressed | Same bytes = same hash; deduplication per user |
| Immutable [Source](../vocabulary/canonical_terms.md#source) | Raw content never modified after storage |
| Versioned [Interpretation](../vocabulary/canonical_terms.md#interpretation) | Each [interpretation](../vocabulary/canonical_terms.md#interpretation) creates a new [interpretation](../vocabulary/canonical_terms.md#interpretation) record |
| [Observation](../vocabulary/canonical_terms.md#observation) Immutability | Reinterpretation creates NEW [observations](../vocabulary/canonical_terms.md#observation); never modifies existing |
| User Isolation | All tables user-scoped with RLS |
| Auditability | [Interpretation](../vocabulary/canonical_terms.md#interpretation) config logged; can understand how data was [extracted](../vocabulary/canonical_terms.md#extraction) |

## 2. Sources Table

### 2.1 Schema

```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  storage_status TEXT NOT NULL DEFAULT 'uploaded',
  mime_type TEXT NOT NULL,
  file_name TEXT,
  byte_size INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_agent_id TEXT,
  source_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL,
  CONSTRAINT unique_content_per_user UNIQUE(content_hash, user_id)
);
```

### 2.2 Content Hashing

Content hash is computed using SHA-256:

```typescript
import { createHash } from 'crypto';

function computeContentHash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
```

**Determinism:** Same bytes always produce the same hash.

### 2.3 Storage Path Convention

```
sources/{user_id}/{content_hash}
```

Example: `sources/usr_abc123/a1b2c3d4e5f6...`

### 2.4 Storage Status

| Status | Meaning |
|--------|---------|
| `uploaded` | Content successfully stored in object storage |
| `pending` | Initial upload failed; queued for retry |
| `failed` | All retries exhausted; content not available |

### 2.5 Deduplication

Per-user deduplication via `(user_id, content_hash)` unique constraint:

```typescript
async function ingestSourceNode(content: Buffer, userId: string): Promise<Source> {
  const hash = computeContentHash(content);
  
  // Check for existing source
  const existing = await db.queryOne("sources", {
    content_hash: hash,
    user_id: userId,
  });
  
  if (existing) {
    return { ...existing, deduplicated: true };
  }
  
  // Create new source
  // ...
}
```

## 3. Interpretations Table

### 3.1 Schema

```sql
CREATE TABLE interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  extracted_entities JSONB DEFAULT '[]',
  confidence NUMERIC(3,2),
  unknown_field_count INTEGER NOT NULL DEFAULT 0,
  extraction_completeness TEXT DEFAULT 'unknown',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  user_id UUID NOT NULL
);
```

**Note:** `timeout_at` and `heartbeat_at` columns are deferred to v0.3.0 (see Section 7.3).

### 3.2 Interpretation Config

The `interpretation_config` JSONB field stores all parameters needed to understand how [interpretation](../vocabulary/canonical_terms.md#interpretation) was performed:

```json
{
  "model": "gpt-4o-mini",
  "model_version": "2024-01-15",
  "extractor_type": "rule_based",
  "extractor_version": "1.2.0",
  "prompt_version": "v3",
  "temperature": 0,
  "schema_version": "1.0"
}
```

**Purpose:** Enables audit ("why was this [extracted](../vocabulary/canonical_terms.md#extraction) this way?") without guaranteeing replay determinism.

### 3.3 Interpretation Status

| Status | Meaning |
|--------|---------|
| `pending` | [Interpretation](../vocabulary/canonical_terms.md#interpretation) created, not yet started |
| `running` | [Interpretation](../vocabulary/canonical_terms.md#interpretation) in progress |
| `completed` | [Interpretation](../vocabulary/canonical_terms.md#interpretation) finished successfully |
| `failed` | [Interpretation](../vocabulary/canonical_terms.md#interpretation) failed (see `error_message`) |

## 4. Determinism Doctrine

### 4.1 What Is Deterministic

| Component | Deterministic? | Notes |
|-----------|----------------|-------|
| Content hashing (SHA-256) | **Yes** | Same bytes = same hash |
| Deduplication | **Yes** | `(user_id, content_hash)` uniqueness |
| Storage path | **Yes** | `{user_id}/{content_hash}` |
| [Observation](../vocabulary/canonical_terms.md#observation) creation (given fixed validated fields + entity_id) | **Yes** | Pure insert |
| [Reducer](../vocabulary/canonical_terms.md#reducer) computation | **Yes** | Same [observations](../vocabulary/canonical_terms.md#observation) + same merge rules → same [entity snapshot](../vocabulary/canonical_terms.md#entity-snapshot) |

### 4.2 What Is NOT Deterministic

| Component | Deterministic? | Notes |
|-----------|----------------|-------|
| AI [interpretation](../vocabulary/canonical_terms.md#interpretation) | **No** | Outputs vary; config logged for audit |
| [Entity](../vocabulary/canonical_terms.md#entity) resolution (heuristic) | **No** | May drift; duplicates expected |

**Policy:** Neotoma never claims replay determinism for AI [interpretation](../vocabulary/canonical_terms.md#interpretation). [Interpretation](../vocabulary/canonical_terms.md#interpretation) config is logged for audit, but outputs may vary across runs.

## 5. Reinterpretation

### 5.1 Immutability Invariant

**Rule:** `reinterpret()` always creates a new [interpretation](../vocabulary/canonical_terms.md#interpretation) and new [observations](../vocabulary/canonical_terms.md#observation). Existing [observations](../vocabulary/canonical_terms.md#observation) remain unchanged and linked to their original [interpretation](../vocabulary/canonical_terms.md#interpretation).

```
Source A
  └─ Interpretation 1 (2024-01-01)
  │    └─ Observation X → Entity E1
  └─ Interpretation 2 (2024-06-01, new model)
       └─ Observation Y → Entity E1 (same entity, new observation)
```

### 5.2 MCP Tool

```typescript
reinterpret({
  source_id: string,
  interpretation_config?: { model?: string, extractor_type?: string }
})
→ {
  interpretation_id: string,
  entities: Array<{ entity_id: string, entity_type: string, fields: object }>,
  unknown_field_count: number,
  extraction_completeness: string,
  confidence: number,
  previous_interpretation_id?: string
}
```

**Preconditions:**
1. `storage_status = 'uploaded'` (else `STORAGE_PENDING`)
2. No concurrent [interpretation](../vocabulary/canonical_terms.md#interpretation) with `status = 'running'` for this [source](../vocabulary/canonical_terms.md#source) (else `INTERPRETATION_IN_PROGRESS`)
3. User has not exceeded `interpretation_limit_month` (else `INTERPRETATION_QUOTA_EXCEEDED`)

## 6. Quota Enforcement (v0.2.0: Simple Hard-Coded Limit)

### 6.1 Interpretation Quota (Soft Limit)

In v0.2.0, quota enforcement is minimal:

```typescript
const INTERPRETATION_LIMIT = 100; // Hard-coded global limit per month

async function checkQuota(userId: string): Promise<boolean> {
  const count = await countInterpretationsThisMonth(userId);
  
  if (count >= INTERPRETATION_LIMIT) {
    logger.warn(`User ${userId} exceeded interpretation quota: ${count}/${INTERPRETATION_LIMIT}`);
    // Soft limit: log warning but allow (for now)
  }
  
  return true; // Always allow in v0.2.0
}
```

**Rationale:** Simple quota check validates the pattern before investing in strict enforcement.

### 6.2 Storage Quota

No storage quota enforcement in v0.2.0. Uploads always succeed (if storage backend succeeds).

### 6.3 Deferred: Strict Quota Enforcement

**See Section 7.2** for v0.3.0 plans:
- `storage_usage` table with per-user tracking
- Strict enforcement (reject on exceed)
- Per-plan limits (free, pro, enterprise)
- Billing month reset automation

## 7. Deferred Features (v0.3.0 Operational Hardening)

The following features are intentionally deferred to v0.3.0 to keep v0.2.0 minimal:

### 7.1 Upload Queue + Async Retry

**Deferred to v0.3.0.** In v0.2.0, storage uploads are synchronous only. If upload fails, [ingestion](../vocabulary/canonical_terms.md#ingestion) fails (no queue fallback).

**v0.3.0 will add:**
- `upload_queue` table for async retry
- Background worker with exponential backoff
- `storage_status = 'pending'` support

### 7.2 Storage Usage Tracking

**Deferred to v0.3.0.** In v0.2.0, quota enforcement is simple: hard-coded soft limit with logging only.

**v0.3.0 will add:**
- `storage_usage` table with per-user byte tracking
- Strict quota enforcement (reject on exceed)
- Billing month reset automation

### 7.3 Interpretation Timeout Handling

**Deferred to v0.3.0.** In v0.2.0, [interpretations](../vocabulary/canonical_terms.md#interpretation) have no timeout columns or heartbeat monitoring.

**v0.3.0 will add:**
- `timeout_at`, `heartbeat_at` columns to `interpretations`
- Stale [interpretation](../vocabulary/canonical_terms.md#interpretation) cleanup worker
- Automatic failure marking for hung jobs

**Rationale:** Validate the core [ingestion](../vocabulary/canonical_terms.md#ingestion) + correction loop before adding operational complexity.

## 8. MCP Tools (v0.2.0 Minimal Set)

### 8.1 `ingest()`

Unified [ingestion](../vocabulary/canonical_terms.md#ingestion) action for both unstructured and structured [source](../vocabulary/canonical_terms.md#source):

```typescript
ingest({
  // For unstructured source
  file_content?: string,       // Base64, <1MB
  file_path?: string,
  external_url?: string,
  mime_type?: string,
  file_name?: string,
  interpret?: boolean,         // Default: true
  interpretation_config?: { model?: string, extractor_type?: string },
  
  // For structured source
  entities?: Array<{
    entity_type: string,
    properties: object
  }>
})
→ {
  source_id: string,
  content_hash: string,
  storage_status: 'uploaded' | 'pending',
  deduplicated: boolean,
  interpretation?: {
    interpretation_id: string,
    entities: Array<{ entity_id: string, entity_type: string, fields: object }>,
    unknown_field_count: number,
    extraction_completeness: string,
    confidence: number
  } | null,
  // For structured source
  entities?: Array<{ entity_id: string, observation_id: string }>
}
```

- Unstructured [source](../vocabulary/canonical_terms.md#source) (files, URLs) → stored → [interpretation](../vocabulary/canonical_terms.md#interpretation) → structured [source](../vocabulary/canonical_terms.md#source) → [entity schema](../vocabulary/canonical_terms.md#entity-schema) processing → [observations](../vocabulary/canonical_terms.md#observation)
- Structured [source](../vocabulary/canonical_terms.md#source) (entities array) → stored → [entity schema](../vocabulary/canonical_terms.md#entity-schema) processing → [observations](../vocabulary/canonical_terms.md#observation)
- Validates against [entity schemas](../vocabulary/canonical_terms.md#entity-schema); rejects on schema violation
- Creates [observations](../vocabulary/canonical_terms.md#observation) with appropriate `source_priority`

### 8.2 `correct()`

For user corrections:

```typescript
correct({
  entity_id: string,
  field: string,
  value: any,
  reason?: string
})
→ { observation_id: string, priority: 1000 }
```

- Validates against [entity schema](../vocabulary/canonical_terms.md#entity-schema)
- Validates [entity](../vocabulary/canonical_terms.md#entity) belongs to user
- Creates correction [observation](../vocabulary/canonical_terms.md#observation) with `source_priority = 1000`, `specificity_score = 1.0`

## 9. Ingestion Validation Contract

### 9.1 ETL → State Layer Boundary

**Policy:** All AI-produced data MUST pass strict schema validation before [observations](../vocabulary/canonical_terms.md#observation) are written. The `schema_registry` is the single source of truth.

### 9.2 Validation Requirements

**For AI [Interpretation](../vocabulary/canonical_terms.md#interpretation) (via `interpretations`):**
1. **Schema Validation:** [Extracted](../vocabulary/canonical_terms.md#extraction) fields MUST match active [entity schema](../vocabulary/canonical_terms.md#entity-schema) version exactly
2. **Type Validation:** Field types MUST match [entity schema](../vocabulary/canonical_terms.md#entity-schema) definitions (string, number, date, etc.)
3. **Required Fields:** All required fields per [entity schema](../vocabulary/canonical_terms.md#entity-schema) MUST be present
4. **Unknown Field Routing:** Fields not in [entity schema](../vocabulary/canonical_terms.md#entity-schema) → `raw_fragments` (not silently dropped)
5. **[Provenance](../vocabulary/canonical_terms.md#provenance) Enforcement:** Every [observation](../vocabulary/canonical_terms.md#observation) MUST have valid `source_material_id` and `interpretation_id`

**For Structured [Source](../vocabulary/canonical_terms.md#source) (via `ingest()` with entities):**
1. **Schema Validation:** Properties MUST match registered [entity schema](../vocabulary/canonical_terms.md#entity-schema) for `entity_type`
2. **Type Validation:** Field types MUST match [entity schema](../vocabulary/canonical_terms.md#entity-schema) definitions
3. **Rejection Policy:** Invalid [source](../vocabulary/canonical_terms.md#source) is rejected with error code (not quarantined)

### 9.3 Failure Paths

| Validation Failure | Action | Error Code |
|-------------------|--------|------------|
| [Entity schema](../vocabulary/canonical_terms.md#entity-schema) not found | Reject | `SCHEMA_NOT_FOUND` |
| Invalid field type | Reject | `SCHEMA_VALIDATION_FAILED` |
| Missing required field | Reject | `SCHEMA_VALIDATION_FAILED` |
| Unknown [entity type](../vocabulary/canonical_terms.md#entity-type) | Route to generic fallback | N/A |

### 9.4 Provenance Enforcement

**Foreign Key Constraints:**

```sql
ALTER TABLE observations
  ADD CONSTRAINT fk_source_material_id FOREIGN KEY (source_material_id) REFERENCES sources(id),
  ADD CONSTRAINT fk_interpretation_id FOREIGN KEY (interpretation_id) REFERENCES interpretations(id);

ALTER TABLE raw_fragments
  ADD CONSTRAINT fk_source_material_id FOREIGN KEY (source_material_id) REFERENCES sources(id),
  ADD CONSTRAINT fk_interpretation_id FOREIGN KEY (interpretation_id) REFERENCES interpretations(id);
```

**NOT NULL Constraints:**
- `observations.source_material_id` — MUST link to [source](../vocabulary/canonical_terms.md#source)
- `observations.interpretation_id` — MUST link to [interpretation](../vocabulary/canonical_terms.md#interpretation) (for AI-derived; NULL for corrections and structured [source](../vocabulary/canonical_terms.md#source))
- `raw_fragments.source_material_id` — MUST link to [source](../vocabulary/canonical_terms.md#source)
- `raw_fragments.interpretation_id` — MUST link to [interpretation](../vocabulary/canonical_terms.md#interpretation)

### 9.5 Validation Service

```typescript
async function validateAndIngest(
  sourceMaterialId: string,
  extractedFields: Record<string, any>,
  entityType: string,
  interpretationId: string
): Promise<{ observations: Observation[], fragments: RawFragment[] }> {
  // 1. Load entity schema
  const entitySchema = await schemaRegistry.getEntitySchema(entityType);
  if (!entitySchema) {
    throw new Error(`SCHEMA_NOT_FOUND: ${entityType}`);
  }
  
  // 2. Separate known vs unknown fields
  const { validFields, unknownFields } = separateFields(extractedFields, entitySchema);
  
  // 3. Validate known fields
  const validationResult = validateFields(validFields, entitySchema);
  if (!validationResult.valid) {
    throw new Error(`SCHEMA_VALIDATION_FAILED: ${validationResult.errors.join(', ')}`);
  }
  
  // 4. Create observations for valid fields
  const observations = await createObservations(validFields, sourceMaterialId, interpretationId);
  
  // 5. Route unknown fields to raw_fragments
  const fragments = await createRawFragments(unknownFields, sourceMaterialId, interpretationId);
  
  return { observations, fragments };
}
```

### 9.6 Testing Requirements

**Integration Tests:**
1. **Valid [Source](../vocabulary/canonical_terms.md#source):** Verify [observation](../vocabulary/canonical_terms.md#observation) created with correct [provenance](../vocabulary/canonical_terms.md#provenance)
2. **Invalid Type:** Verify rejection with `SCHEMA_VALIDATION_FAILED`
3. **Unknown Fields:** Verify routing to `raw_fragments`
4. **Missing [Provenance](../vocabulary/canonical_terms.md#provenance):** Verify FK constraint violation
5. **Prompt Change Test:** Verify prompt/model changes do NOT silently alter [source](../vocabulary/canonical_terms.md#source) shapes without [entity schema](../vocabulary/canonical_terms.md#entity-schema) version bump

## 10. Agent Attribution in Provenance

### 10.1 Overview

Every durable write produced by the Neotoma server (observations, relationships,
sources, timeline events, interpretations) carries an **agent attribution**
block stamped into its existing JSON provenance / metadata / properties field.
This lets the Inspector and audit tooling answer "which agent wrote this?"
without requiring a schema migration or a new column.

The attribution contract is additive and fail-open: if AAuth headers are absent
or `clientInfo` on the MCP `initialize` call is generic, the record degrades
cleanly to `attribution_tier: "anonymous"` rather than failing.

See `.cursor/plans/aauth_neotoma_integration_cada30a5.plan.md` for the full
integration plan and `docs/proposals/agent-trust-framework.md` for the
historical context the AAuth integration supersedes.

### 10.2 Attribution Field Shape

The following keys may appear inside the existing provenance JSON on each
record type. All fields are optional; the tier is always set.

```json
{
  "agent_public_key": "…",
  "agent_algorithm": "ES256",
  "agent_sub": "aauth:local@you.github.io",
  "agent_iss": "https://you.github.io",
  "client_name": "cursor",
  "client_version": "0.45.2",
  "connection_id": "conn_…",
  "attribution_tier": "hardware"
}
```

| Field              | Source                                                   | Present when                      |
|--------------------|----------------------------------------------------------|-----------------------------------|
| `agent_public_key` | Verified RFC 9421 HTTP signing key (thumbprint)          | AAuth verified                    |
| `agent_algorithm`  | Signing algorithm (`ES256`, `EdDSA`, …)                  | AAuth verified                    |
| `agent_sub`        | `sub` claim of the agent token JWT                       | AAuth verified                    |
| `agent_iss`        | `iss` claim of the agent token JWT                       | AAuth verified                    |
| `client_name`      | MCP `initialize.clientInfo.name`                          | Client self-identifies on connect |
| `client_version`   | MCP `initialize.clientInfo.version`                       | Client self-identifies on connect |
| `connection_id`    | Existing OAuth connection / resolved token subject       | Request authenticated via OAuth   |
| `attribution_tier` | Derived — see below                                       | Always                            |

### 10.3 Trust Tiers

`attribution_tier` is one of four values, derived from the most trusted evidence
available on the request:

| Tier                | Derivation                                                                                  | Inspector rendering            |
|---------------------|---------------------------------------------------------------------------------------------|--------------------------------|
| `hardware`          | AAuth verified AND algorithm suggests a hardware-backed key (e.g. Secure Enclave, YubiKey)  | Shield icon, full colour       |
| `software`          | AAuth verified, software-only signing key                                                    | Key icon, full colour          |
| `unverified_client` | No AAuth, but `clientInfo.name` (and ideally `version`) were provided on MCP `initialize`    | Dotted outline, "self-reported"|
| `anonymous`         | No AAuth and no useful `clientInfo` (or generic values like `"mcp"` / `"client"`)            | Em-dash, no tooltip            |

Hardware-vs-software detection lives in
[`src/crypto/agent_identity.ts`](../../src/crypto/agent_identity.ts).

### 10.4 Where Attribution Is Stamped

Write paths record the attribution block on:

- **Observations** — inside `observations.metadata` (or the equivalent
  provenance JSON) via `mergeAttributionIntoProvenance`.
- **Relationships** — on `RelationshipSnapshot.provenance` when the
  relationship is created or its contributing observations change.
- **Sources** — on `sources.source_metadata` when upload or parse is
  initiated by an agent.
- **Interpretations** — on the `interpretations` metadata / config so the
  agent that ran the interpretation is visible even when the source was
  uploaded by a different agent.
- **Timeline events** — inside `event.properties`.

The stamp is applied via request-scoped `AsyncLocalStorage` context populated by
`src/middleware/aauth_verify.ts` and the MCP `initialize` handler in
`src/server.ts`. When no context is active, no attribution fields are emitted.

### 10.5 Anti-Spoofing Expectations

Clients MUST NOT fabricate another agent's `clientInfo` or reuse another
agent's public key. Neotoma does not currently reject spoofed `clientInfo`
during verification, but the attribution contract treats impersonation as a
policy breach. See
[`docs/developer/cli_agent_instructions.md`](../developer/cli_agent_instructions.md)
`[ATTRIBUTION & AGENT IDENTITY]` for the full contract.

## 11. Security Model

- **RLS**: Client keys (`anon`, `authenticated`) have SELECT-only access
- **MCP Server**: All mutations via `service_role`; user identity stamped into rows
- **Storage URLs**: Opaque, never returned to clients; reads via MCP server + ownership check
- **Cross-User Prevention**: All operations validate `user_id` match

## 12. Related Documents

- [`docs/subsystems/schema.md`](./schema.md) — Database schema (includes sources, interpretations tables)
- [`docs/subsystems/interpretations.md`](./interpretations.md) — Dedicated reference for the interpretations record type (lifecycle, status state machine, quality signals)
- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — [Observation](../vocabulary/canonical_terms.md#observation) layer
- [`docs/subsystems/relationships.md`](./relationships.md) — Typed graph edges between entities
- [`docs/subsystems/timeline_events.md`](./timeline_events.md) — Timeline event record type derived from sources
- [`docs/subsystems/entities.md`](./entities.md) — Canonical entity row that observations from this source describe
- [`docs/subsystems/entity_snapshots.md`](./entity_snapshots.md) — Reducer output that composes observations from this source into current truth
- [`docs/subsystems/ingestion/ingestion.md`](./ingestion/ingestion.md) — [Ingestion](../vocabulary/canonical_terms.md#ingestion) pipeline
- [`docs/subsystems/entity_merge.md`](./entity_merge.md) — [Entity](../vocabulary/canonical_terms.md#entity) merge mechanism
- [`docs/architecture/determinism.md`](../architecture/determinism.md) — Determinism doctrine

## 13. Agent Instructions

### When to Load This Document

Load `docs/subsystems/sources.md` when:
- Implementing [source](../vocabulary/canonical_terms.md#source) storage or retrieval
- Working with [interpretations](../vocabulary/canonical_terms.md#interpretation)
- Implementing deduplication logic
- Understanding [provenance](../vocabulary/canonical_terms.md#provenance) chain
- Implementing quota enforcement
- Working with upload queue

### Constraints Agents Must Enforce

1. **Content hash MUST use SHA-256**
2. **Deduplication MUST be per-user** (`user_id, content_hash` uniqueness)
3. **Reinterpretation MUST create NEW [observations](../vocabulary/canonical_terms.md#observation)** (never modify existing)
4. **Storage URLs MUST NOT be exposed to clients**
5. **Quota MUST be checked before [interpretation](../vocabulary/canonical_terms.md#interpretation)**
6. **All tables MUST have RLS enabled**

### Forbidden Patterns

- Modifying existing [observations](../vocabulary/canonical_terms.md#observation) during reinterpretation
- Exposing storage URLs to clients
- Skipping quota checks
- Cross-user [source](../vocabulary/canonical_terms.md#source) access
- Deleting [interpretations](../vocabulary/canonical_terms.md#interpretation) (archive instead)

### Worked Example: Gmail list → detail hydration

Illustrates the `Depth of capture` rule defined in `docs/developer/mcp/instructions.md` ([COMMUNICATION & DISPLAY]) and `docs/developer/cli_agent_instructions.md`. List/summary tool responses are index rows, not the final payload; hydrate via the detail endpoint before persisting so each `email_message` entity carries body content, not just headers.

**Flow** for a user prompt like *"retrieve last 5 emails from gmail"*:

1. **List call.** `search_emails(max_results=5)` returns 5 index rows with `id`, `thread_id`, `from`, `to`, `subject`, `snippet`, `date`. Do not persist these alone.
2. **Detail hydration.** For each id, call `read_email(message_id=<id>)` to retrieve `body_text`, `body_html`, `headers`, and attachment metadata. Scope cap: hydrate up to ~10 items per turn unless the user explicitly asks for a larger ingestion.
3. **Single store call.** Emit one `store_structured` with the user-phase recipe plus 5 extracted `email_message` entities. Each entity carries the detail fields (`from`, `to`, `subject`, `sent_at`, `body_text`, `body_html`, `snippet`, `thread_id`, `message_id`, `labels`, attachment descriptors) and preserves provenance:

   ```json
   {
     "entity_type": "email_message",
     "canonical_name": "<subject>",
     "message_id": "<gmail id>",
     "thread_id": "<thread id>",
     "from": "sender@example.com",
     "to": ["me@example.com"],
     "subject": "<subject>",
     "sent_at": "2026-04-22T10:00:00Z",
     "body_text": "<plain body>",
     "body_html": "<html body>",
     "data_source": "Gmail API GET users.messages.get <id> 2026-04-22",
     "api_response_data": {
       "list": { "id": "...", "snippet": "...", "date": "..." },
       "detail": { "payload": { ... }, "headers": [ ... ] }
     },
     "capture_depth": "full"
   }
   ```

4. **Embedded entity extraction.** Scan each hydrated body for first-class entities embedded in it (per the `Embedded entity extraction` rule in `[COMMUNICATION & DISPLAY]`). Append them to the same `store_structured` call alongside the containing `email_message`, with `source_quote` citing the verbatim body snippet and `REFERS_TO` edges from container → embedded. Examples:
   - Subscription billing email ("Your Netflix subscription: $15.49 charged on May 1") → one `transaction` (amount, currency, merchant, posted_at, recurrence) plus optionally a `subscription` entity (merchant, plan, billing_period, next_charge_at) when not already stored. If a prior `subscription` matches on merchant + billing period, call `correct` on the existing `entity_id` rather than minting a duplicate.
   - Meeting proposal ("Can we sync Thursday 3pm PT?") → `event` (proposed_start_at, attendees, title) plus a `task` ("Confirm Thursday 3pm sync with <counterparty>") linked to the counterparty `contact`.
   - Order confirmation with multiple line items → one `order_item` per line (capped at ~20 per container per the Depth-of-capture scope cap; surface the rest as a list and offer to continue).
   - Person mentioned in a thread not already a `contact` → emit a `contact` with `source_quote` and link via `REFERS_TO`.

   Store-shape sketch for the subscription case:

   ```json
   [
     { "entity_type": "email_message", "canonical_name": "Netflix: Your subscription renews May 1", ... },
     {
       "entity_type": "transaction",
       "canonical_name": "Netflix subscription charge 2026-05-01",
       "amount": 15.49,
       "currency": "USD",
       "counterparty": "Netflix",
       "posted_at": "2026-05-01",
       "recurrence": "monthly",
       "source_quote": "Your Netflix subscription: $15.49 will be charged on May 1, 2026.",
       "data_source": "Gmail API GET users.messages.get <id> 2026-04-22 (embedded)"
     }
   ]
   ```

   Relationships (batched in `store_structured.relationships`): `{ relationship_type: "REFERS_TO", source_index: <email_message idx>, target_index: <transaction idx> }`.

5. **Size cap.** If a detail body exceeds ~100 KB (large HTML newsletter, MIME bundle with inline images), persist it via the unstructured path (`file_content`+`mime_type` or `file_path` on `store_structured`; `--file-path` / `--file-content` on `neotoma store`) and link the structured `email_message` to the file entity with `EMBEDS` instead of inlining the body.
6. **Idempotent upgrade.** If any of the 5 `email_message` entities already exists from a prior summary-only store (canonical_name / message_id match), hydrate via `correct` on the same `entity_id` (or `neotoma edit <id>` on CLI) rather than creating a duplicate — see the `Existing-entity correction` rule under `[ENTITY TYPES & SCHEMA]`. The same rule applies to embedded entities: a `transaction` that matches a prior merchant + billing period should be corrected, not duplicated.
7. **Tool-capability fallback.** If no detail endpoint exists for a given list tool, persist the list row as-is and set `capture_depth: "summary_only"` so a later turn can enrich.
8. **Reply discipline.** For peek-style questions, the reply stays at summary level (sender, subject, date). Body content is persisted but not echoed back into chat beyond what answering requires — and the same discipline applies to embedded entities (mention the charge existed, do not paste the full payment snippet into chat unless the user asks for it).
