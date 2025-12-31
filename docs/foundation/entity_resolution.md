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
**Same name → same ID, globally. No duplicates.**
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
