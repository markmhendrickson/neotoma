# Entity Resolution Doctrine
## 15.1 Entity ID Generation (Deterministic)
```typescript
function generateEntityId(
  entityType: string,
  canonicalName: string,
  tenantSalt?: string, // optional — see tenant-scoping below
): string {
  const normalized = normalizeEntityValue(entityType, canonicalName);
  const basis = tenantSalt
    ? `tenant:${tenantSalt}:${entityType}:${normalized}`
    : `${entityType}:${normalized}`;
  const hash = sha256(basis);
  return `ent_${hash.substring(0, 24)}`;
}
function normalizeEntityValue(entityType: string, raw: string): string {
  let normalized = raw.trim().toLowerCase();
  if (entityType === "company") {
    // Remove common suffixes deterministically
    normalized = normalized.replace(
      /\s+(inc|llc|ltd|corp|corporation)\.?$/i,
      ""
    );
  }
  return normalized;
}
```
**Default (single-tenant): same name → same ID, globally. No duplicates.** Persisted `canonical_name` is produced by `formatCanonicalNameForStorage` in `src/services/entity_resolution.ts` (same structural rules as `normalizeEntityValue`, casing preserved); entity IDs still hash `normalizeEntityValue` only.

**Tenant-scoped ids (opt-in).** `entities.id` is a global primary key, so without a salt two tenants writing the same `(entity_type, canonical_name)` collide on one row. For multi-tenant deployments (the public sandbox) `generateEntityId` accepts an optional `tenantSalt`, supplied by `entityIdTenantSalt(userId)` at every recompute site (resolver, identifier lookup, snapshot collision guard, entity split). The salt is applied when `isSandboxMode()` is true **or** `NEOTOMA_TENANT_SCOPED_ENTITY_IDS` is truthy (`1`/`true`/`yes`), and omitted otherwise — so single-tenant prod ids are unchanged (no migration, no id churn). Toggling the gate on a persistent store would strand existing rows, so it is intended to be set once per deployment. See [`docs/subsystems/sandbox_deployment.md`](../subsystems/sandbox_deployment.md).
## 15.2 Entity Rules
Entity IDs MUST be:
- Canonical (globally unique representation)
- Stable (never change once created)
- Deduplicated (same name → same entity)
- Rule-based (deterministic normalization)
- Traced to observed text (not inferred)
Entities MUST NOT:
- Be inferred (only extracted from fields)
- Be LLM-generated
- Be renamed post-creation
- Mutate types (person → company forbidden)
**Entities survive across documents and sessions.**
## 15.3 Single-Token Prefix-Match Pass

When an entity is resolved and its canonical name reduces to a **single token** (e.g. `"Simon"`), the resolver runs an additional scan against same-type entities in the database before returning.

**When it fires:** Only for single-token canonical names. Multi-token inputs (e.g. `"Simon Bergeron"`) skip this pass entirely.

**What it returns:** Up to 25 existing entities of the same `entity_type` whose canonical name (a) has more than one token and (b) shares the same first token as the input. These are returned as `prefix_duplicate_candidates` on the resolver trace and surfaced in the `store` response as `prefix_duplicate_candidates[]`. Example: resolving `"Simon"` when `"Simon Bergeron"` already exists surfaces `"Simon Bergeron"` as a candidate.

**Surface, don't merge doctrine:** The pass is read-only. The resolving entity is still created (no auto-merge). Candidates are surfaced for operator or agent review. This preserves the deterministic, immutable contract of the State Layer — merges require explicit operator action.

**Cap behaviour:** Results are capped at 25 candidates, ordered by `candidate_entity_id` ascending (deterministic). When the cap fires, every returned candidate carries `truncated: true` and `matched_count: <total>` so callers can distinguish "exactly 25 matches" from "25+ matches".

**Performance note:** Each single-token resolution executes one additional DB scan filtered by `entity_type`, `user_id`, `ilike("canonical_name", "<token> %")`, `is("merged_to_entity_id", null)`, and `limit(2000)`. See `src/services/duplicate_detection.ts` for the analogous query pattern used by the duplicate-detection pass.

## 15.4 Company Entity Resolution (Leads Graph Join Key)

`contact.organization` (and any future free-text org field wired the same way) resolves to a canonical `company` entity instead of staying a bare string, so "who do we have connected at company X" is a deterministic graph query rather than a substring search over contact records.

**Resolution order** (`src/services/company_resolution.ts#resolveCompanyEntity`), conservative — exact before fuzzy, fuzzy before create:

1. **Normalize.** The raw org string is normalized with the same rules already applied to every `company`/`organization` canonical name (`normalizeEntityValue`/`formatCanonicalNameForStorage` in `entity_resolution.ts`): lowercase, strip trailing legal-entity suffixes (Inc/LLC/Ltd/Corp/Corporation/Co/Company/Limited/PLC/GmbH/SA/AG/Pty/Pvt), collapse whitespace, strip punctuation. This alone collapses case/suffix/whitespace variants — `"Contoso8 LLC"`, `"Contoso8, Inc."`, `"CONTOSO8"` all normalize to `"contoso8"` and hash to the same deterministic `entity_id` with zero fuzzy scanning.
2. **Exact-normalized match.** `resolveEntityWithTrace({entityType:"company", ...})` — deterministic get-or-create keyed on the normalized canonical_name, probed with `commit:false` first so a miss can fall through to fuzzy matching before any row is written.
3. **Fuzzy pre-check** (only reached when step 2 is about to create a new row): scan existing `company` entities for the tenant and score each against the normalized input with `stringSimilarity` (Levenshtein distance normalized to `[0,1]`, `src/services/duplicate_detection.ts`, reused rather than reimplemented). The best-scoring candidate at or above `COMPANY_FUZZY_MATCH_THRESHOLD` (default **0.88** — stricter than the generic duplicate-detector default of 0.85, since collapsing two distinct companies is worse than missing a collapse) wins over creating a new entity. Deterministic tie-break: lower `entity_id` wins.
4. **Create.** Only when neither an exact nor a fuzzy match is found does a new `company` entity get created, via the same deterministic resolver used in step 2 (so its `entity_id` is reproducible from the normalized name).

**Threshold calibration** (measured against the Levenshtein-normalized `stringSimilarity`): `"contoso8"` vs `"contoso 8"` (space-separated near-duplicate) scores `0.889` — collapses. `"contoso8"` vs `"contoso9"` (a different company, one digit off) scores `0.875` — stays separate. The 0.88 floor sits directly between these two measured cases.

**Contact -> company linking.** The `contact` schema declares `organization` as a `reference_fields` entry with `target_entity_type: "company"`, `relationship_type: "works_at"`, and `resolve_target: true` (`schema_definitions.ts`). `resolve_target: true` is a general opt-in on `SchemaDefinition.reference_fields` (`schema_registry.ts`): a plain reference field only links to an *existing* target and skips when none is found ("we do not invent targets" — the pre-existing default); `resolve_target: true` instead calls a resolver that may create the target. Today only `target_entity_type: "company"` has a resolver wired (`resolveCompanyEntity`); other target types with `resolve_target: true` fall back to skip-if-missing with a one-time warning so a misconfigured schema fails loud in logs. The auto-link hook (`schema_reference_linking.ts#autoLinkReferenceFields`, invoked from both `actions.ts#storeStructuredForApi` and `server.ts#storeStructuredInternal`) only resolves/creates the target when the store call actually commits (`commit: true`) — a `store --plan`/dry-run never writes a company entity.

**Company query (read path).** `src/services/company_query.ts#queryContactsAtCompany` answers "who do we have connected at company X": it resolves the company name read-only (exact-normalized, then the same fuzzy pass — never creating), then reads live `works_at` edges pointing at that company entity (`relationshipsService.getRelationshipsForEntity(companyId, "incoming")`) and returns the linked contacts. Read-only by design: a query that silently minted a company entity would violate the State-Layer rule against inference on a read path. When no company matches (exact or fuzzy), the result reports `company: null` and an empty contact list rather than guessing.

**Not yet done / follow-ups:** no MCP tool wraps `queryContactsAtCompany` yet — it is an internal service function only, callable from other TypeScript modules but not yet exposed as an `mcp__*` tool in `tool_definitions.ts`. Existing contacts stored before this schema change do not retroactively get a `works_at` edge; see the gated backfill script `scripts/backfill_contact_company_links.ts` (dry-run by default, never auto-run).
