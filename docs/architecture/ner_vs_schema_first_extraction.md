# NER vs Schema-First Extraction in Neotoma

## Scope

This document covers:
- Why Neotoma does NOT use traditional Named Entity Recognition (NER)
- Schema-first extraction architecture
- Architectural constraints against probabilistic NER
- How entity resolution works instead
- Potential future NER integration patterns

This document does NOT cover:
- NER implementation details (not used)
- Complete extraction pipeline (see `docs/subsystems/ingestion/ingestion.md`)
- Entity resolution implementation (see `docs/foundation/entity_resolution.md`)
- Observation architecture (see `docs/subsystems/observation_architecture.md`)

## 1. Current State: NER is NOT Used in MVP

Neotoma deliberately **does not use** traditional NER (Named Entity Recognition) in its MVP. Instead, it uses:

### 1.1 Schema-First Extraction (Not NER)

**What it is**: Rule-based, deterministic field extraction guided by entity schemas

**How it works**:
- Files are interpreted using AI models (GPT-4o-mini)
- Entity schemas define extraction rules that specify which fields to extract
- Extraction is deterministic within the system (same source + same interpretation config → same observations)

**Key difference from NER**: Rather than using ML models to detect "person", "company", "location" entities in unstructured text, Neotoma uses schema-driven extraction rules.

### 1.2 Entity Resolution (Deterministic, Hash-Based)

From `src/services/entity_resolution.ts`:

```typescript
function generateEntityId(entityType: string, canonicalName: string): string {
  const normalized = normalizeEntityValue(entityType, canonicalName);
  const hash = sha256(`${entityType}:${normalized}`);
  return `ent_${hash.substring(0, 24)}`;
}
```

**Key architectural principle**: Same entity name → same entity ID globally, using deterministic normalization and hashing, NOT probabilistic NER models.

## 2. Three-Layer Truth Model

Neotoma uses this architecture:

```
Source → Interpretation (AI) → Observation → Entity Snapshot
```

**Layers:**
- **Source**: Raw content (PDFs, images, structured JSON)
- **Interpretation**: AI-based extraction with config logging (model, temperature, prompt hash)
- **Observation**: Granular facts extracted from sources
- **Entity Snapshot**: Deterministic reducer output representing current truth

### 2.1 Where AI is Used (vs. Where NER Would Be)

**AI interpretation is used for**:
- Extracting structured fields from unstructured documents (invoices, receipts, contracts)
- Converting raw text into schema-compliant observations
- But NOT for probabilistic entity detection

**NER would typically be used for**:
- Detecting named entities ("Apple Inc.", "Steve Jobs", "Cupertino") in running text
- Classifying entities by type (PERSON, ORG, LOCATION)
- Probabilistic, non-deterministic entity boundaries

## 3. Architectural Constraints Against Traditional NER

From `docs/foundation/philosophy.md`:

### 3.1 Determinism Above All

**Constraint**: "A given operation MUST always produce the same final state"

**Why this blocks NER**:
- NER models are inherently probabilistic and non-deterministic
- Same text → different entity boundaries/classifications across runs
- Neotoma achieves system-level determinism through canonicalization + hashing + deduplication

### 3.2 Schema-First Processing

**Constraint**: "All extraction, linking, and event creation derive from: schema_type → extraction rules → extracted_fields → entities + events"

**Why this blocks NER**:
- NER is typically schema-agnostic and bottom-up (detect entities first, classify later)
- Neotoma is schema-first and top-down (schema defines what to extract)
- Entity types are determined by schema, not by ML classification

### 3.3 Provenance and Auditability

**Requirement**: Every observation links to both `source_id` (what raw content) and `interpretation_id` (how it was extracted)

**How this shapes extraction**:
- Interpretation config is logged (model, temperature, prompt_hash)
- This provides auditability without claiming replay determinism
- NER would need similar config logging but couldn't provide deterministic replay

## 4. What Replaces NER

### 4.1 Schema-First AI Interpretation

```
Entity Schema → Extraction Rules → AI Interpretation → Structured Fields
```

**Example**: Invoice schema defines fields like `vendor_name`, `customer_name`, `amount`. AI interprets the invoice to extract these specific fields, not to discover arbitrary entities.

### 4.2 Rule-Based Entity Normalization

From `src/services/entity_resolution.ts`:

```typescript
function normalizeEntityValue(entityType: string, raw: string): string {
  let normalized = raw.trim().toLowerCase();
  
  // Remove common suffixes for companies
  if (entityType === "company" || entityType === "organization") {
    normalized = normalized
      .replace(/\s+(inc|llc|ltd|corp|corporation|co|company|limited)\.?$/i, "")
      .trim();
  }
  
  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}
```

**Deterministic canonicalization**: Same entity name → same normalized form → same entity ID

### 4.3 Hash-Based Entity Resolution

```typescript
const entityId = generateEntityId(entityType, canonicalName);
// Same entityType + canonicalName → same entityId globally
```

**Benefits**:
- Deterministic entity IDs
- Global deduplication (same entity across multiple documents)
- No probabilistic matching required

### 4.4 Reducer-Based Snapshot Computation

```
Observations → Reducer (merge policies) → Entity Snapshot
```

**Deterministic merging**: Multiple observations about same entity → single deterministic snapshot

## 5. Architectural Comparison

| Aspect | Traditional NER | Neotoma Schema-First |
|--------|----------------|---------------------|
| **Entity Detection** | Bottom-up (find entities in text) | Top-down (schema defines entities) |
| **Determinism** | Probabilistic, non-deterministic | System-level deterministic (canonicalization + hashing) |
| **Entity Types** | ML classification (PERSON, ORG, LOC) | Schema-defined (invoice, company, person) |
| **Entity IDs** | Generated or probabilistic matching | Hash-based, deterministic |
| **Provenance** | Model-specific, opaque | Source + Interpretation + Observation chain |
| **Auditability** | Model outputs, hard to explain | Full config logging, explainable |
| **Reprocessing** | Non-deterministic re-extraction | Reinterpretation creates NEW observations |

## 6. If NER Were Added (Post-MVP)

Traditional NER could potentially be used for:

### 6.1 Entity Discovery

**Use case**: Finding entities in unstructured text that aren't captured by schema-driven extraction

**Example**: User uploads free-form notes mentioning companies, people, locations that don't fit a specific schema

**Integration pattern**:
- NER runs as separate interpretation pass
- Creates observations with `source_priority: 0` (lowest, AI interpretation)
- Logs NER model/config in `interpretation_id`
- Does NOT claim deterministic replay

### 6.2 Relationship Discovery

**Use case**: Detecting relationships between entities mentioned in documents

**Example**: "John Smith works at Acme Corp" → relationship between person and company

**Integration pattern**:
- NER detects entities + relations
- Creates relationship observations
- Links to source + interpretation for provenance

### 6.3 Enhanced Search

**Use case**: Finding entities by type across all documents

**Example**: "Find all companies mentioned in my documents"

**Integration pattern**:
- NER provides entity type tags
- Indexed for search
- Maintains provenance chain

### 6.4 Required Adaptations

Any NER integration would need to:

1. **Respect the three-layer model**: Source → Interpretation → Observation → Snapshot
2. **Log NER model/config** for provenance (`interpretation_id` with model, temperature, prompt_hash)
3. **Not claim deterministic replay** (AI outputs vary)
4. **Maintain system-level idempotence** through canonicalization + hashing + deduplication
5. **Use low source priority** (`source_priority: 0`) so user corrections override
6. **Support reinterpretation** (new NER model → new observations, old preserved)

## 7. Verifiable Domain Principle

**Why Neotoma avoids probabilistic NER**:

Neotoma creates a **verifiable domain** for personal data where same operations produce same final states. This enables:
- Reliable, consistent results LLMs can depend on
- No hallucinations or duplicates
- Reproducible, explainable outputs
- Tamper-evident records (hash-based IDs)

Traditional probabilistic NER would violate this principle:
- Non-deterministic entity detection
- Varying entity boundaries across runs
- Probabilistic entity matching
- Unexplainable ML classifications

**Solution**: System-level idempotence through:
- Canonicalization (normalize, sort, round)
- Hashing (create deterministic identity)
- Deduplication (prevent duplicates)

## Agent Instructions

### When to Load This Document

Load this document when:
- Understanding why Neotoma doesn't use NER
- Comparing NER vs schema-first extraction
- Evaluating NER integration for post-MVP
- Explaining entity resolution to stakeholders

### Required Co-Loaded Documents

- `docs/foundation/philosophy.md` — Determinism and schema-first principles
- `docs/foundation/entity_resolution.md` — Entity ID generation and normalization
- `docs/subsystems/observation_architecture.md` — Three-layer truth model
- `docs/subsystems/ingestion/ingestion.md` — Extraction pipeline

### Constraints Agents Must Enforce

1. **Do NOT implement traditional NER in MVP** (violates determinism constraints)
2. **Use schema-first extraction** (entity types from schemas, not ML)
3. **Generate deterministic entity IDs** (hash-based, not probabilistic)
4. **Log all interpretation config** (model, temperature, prompt_hash)
5. **Maintain system-level idempotence** (canonicalization + hashing)

### Forbidden Patterns

- ❌ Using probabilistic NER models for entity detection in MVP
- ❌ Generating non-deterministic entity IDs
- ❌ Bottom-up entity discovery without schema guidance
- ❌ Claiming replay determinism for AI interpretation
- ❌ Skipping interpretation config logging

### Validation Checklist

- [ ] Schema-first extraction (not NER-based)
- [ ] Deterministic entity ID generation (hash-based)
- [ ] Interpretation config logged (model, temperature, prompt_hash)
- [ ] System-level idempotence maintained
- [ ] Provenance chain complete (Source → Interpretation → Observation → Snapshot)
- [ ] No probabilistic entity matching in MVP
