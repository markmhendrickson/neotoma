# Entity Resolution Doctrine
## 15.1 Entity ID Generation (Deterministic)
```typescript
function generateEntityId(entityType: string, canonicalName: string): string {
  const normalized = normalizeEntityValue(entityType, canonicalName);
  const hash = sha256(`${entityType}:${normalized}`);
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
**Same name → same ID, globally. No duplicates.** Persisted `canonical_name` is produced by `formatCanonicalNameForStorage` in `src/services/entity_resolution.ts` (same structural rules as `normalizeEntityValue`, casing preserved); entity IDs still hash `normalizeEntityValue` only.
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
