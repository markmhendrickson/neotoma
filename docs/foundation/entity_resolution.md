# Entity Resolution Doctrine

_(How Entities Are Identified and Canonicalized)_

---

## Purpose

This document defines the doctrine for entity resolution: how entities are identified, normalized, and assigned canonical IDs.

---

## 15.1 Entity ID Generation (Deterministic)

```typescript
function generateEntityId(
  entityType: string,
  canonicalName: string,
  userId: string
): string {
  const normalized = normalizeEntityValue(entityType, canonicalName);
  const hash = sha256(`${userId}:${entityType}:${normalized}`);
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

**Same `(user_id, entity_type, canonical_name)` → same ID.** Different users can produce the same canonical name without colliding because the user_id namespaces the deterministic hash.

---

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

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/foundation/data_models.md`](./data_models.md) — Data models
- [`docs/subsystems/record_types.md`](../subsystems/record_types.md) — Record types

