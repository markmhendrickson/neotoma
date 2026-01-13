# Schema Handling Architecture
## 1. Three-Layer Storage Model
Neotoma uses a **three-layer storage model** to reconcile two requirements:
1. **Preserve all extracted data** (users can upload any [source material](#source-material) without data loss)
2. **Maintain deterministic [entity schemas](#entity-schema)** (structured, queryable truth layer)
### Layer 1: `raw_text` (Immutable Original)
**Purpose:** Store the original extracted text exactly as extracted.
**Characteristics:**
- Immutable after [storing](#storing) (per NEOTOMA_MANIFEST.md Section 5.4)
- Full [source material](#source-material) preserved
- Used for re-[extraction](#extraction) if [entity schemas](#entity-schema) evolve
**Storage:** Stored with [source material](#source-material) in the `sources` table
### Layer 2: `properties` ([Entity Schema](#entity-schema)-Compliant, Deterministic)
**Purpose:** Store only fields that match the assigned [entity schema](#entity-schema) definition.
**Characteristics:**
- [Entity schema](#entity-schema)-compliant fields only
- Deterministic (same input → same output)
- Queryable via JSONB indexes
- Must include `schema_version: "1.0"`
- Used for [entity](#entity) [extraction](#extraction), [event](#event) generation, structured queries
**Storage:** Stored in [observations](#observation) `fields` JSONB column
**Example:**
```json
{
  "schema_version": "1.0",
  "invoice_number": "INV-001",
  "amount": 1500.00,
  "currency": "USD",
  "date_issued": "2024-01-15T00:00:00Z",
  "vendor_name": "Acme Corp"
}
```
### Layer 3: `extraction_metadata` (Preservation Layer)
**Purpose:** Store unknown fields, validation warnings, and [extraction](#extraction) quality metrics.
**Characteristics:**
- Unknown fields ([extracted](#extraction) but not in [entity schema](#entity-schema) definition)
- Validation warnings (missing required fields, unknown fields)
- [Extraction](#extraction) quality metrics (fields_extracted_count, fields_filtered_count)
- Used for debugging, quality tracking, future [entity schema](#entity-schema) expansion
**Storage:** Stored in [observations](#observation) or [raw_fragments](#raw-fragments) table
**Example:**
```json
{
  "unknown_fields": {
    "purchase_order": "PO-789",
    "internal_cost_center": "CC-456"
  },
  "warnings": [
    {
      "type": "unknown_field",
      "field": "purchase_order",
      "message": "Field 'purchase_order' not defined for type 'invoice' - preserved in extraction_metadata"
    }
  ],
  "extraction_quality": {
    "fields_extracted_count": 7,
    "fields_filtered_count": 2,
    "matched_patterns": ["invoice_number_pattern", "amount_due_pattern"]
  }
}
```
### Why Three Layers?
**Problem:** Users want to upload any [source material](#source-material) without losing data, but we need deterministic [entity schemas](#entity-schema) for queries and AI reasoning.
**Solution:**
- `raw_text`: Never loses [source material](#source-material)
- `properties`: Maintains [entity schema](#entity-schema) compliance for deterministic queries
- `extraction_metadata`: Preserves everything else for future use
**Benefits:**
1. **Zero data loss:** All [extracted](#extraction) data preserved somewhere
2. **[Entity schema](#entity-schema) compliance:** `properties` contains only valid [entity schema](#entity-schema) fields
3. **Determinism:** Same input → same `properties` structure
4. **Queryability:** Structured queries use `properties` (indexed)
5. **Explainability:** Warnings explain what was filtered and why
6. **Future evolution:** Unknown fields available for [entity schema](#entity-schema) expansion
## 2. Field Validation Pattern
### [Extraction](#extraction) and Validation Flow
```typescript
function extractAndValidate(
  rawText: string,
  detectedEntityType: string
): {
  properties: Record<string, unknown>;
  extraction_metadata: ExtractionMetadata;
} {
  // 1. [Extract](#extraction) ALL fields (including unknown ones)
  const allExtracted = extractAllFields(rawText, detectedEntityType);
  
  // 2. Get [entity schema](#entity-schema) definition for detected [entity type](#entity-type)
  const entitySchema = getEntitySchema(detectedEntityType);
  
  // 3. Partition into structured vs unknown
  const { structured, unknown } = partitionFields(allExtracted, entitySchema);
  
  // 4. Validate required fields
  const warnings = validateRequired(structured, entitySchema);
  
  // 5. Build structured properties ([entity schema](#entity-schema)-compliant only)
  const properties = {
    schema_version: "1.0",
    ...structured
  };
  
  // 6. Build [extraction](#extraction) metadata (preservation layer)
  const extraction_metadata: ExtractionMetadata = {
    ...(Object.keys(unknown).length > 0 && { unknown_fields: unknown }),
    ...(warnings.length > 0 && { warnings }),
    extraction_quality: {
      fields_extracted_count: Object.keys(allExtracted).length,
      fields_filtered_count: Object.keys(unknown).length,
      matched_patterns: getMatchedPatterns(rawText, detectedEntityType)
    }
  };
  
  return { properties, extraction_metadata };
}
```
### Partition Logic
**Function:** Separate [extracted](#extraction) fields into [entity schema](#entity-schema)-compliant vs unknown
**Rules:**
- Fields defined in [entity schema](#entity-schema) definition → `structured` → `properties`
- Fields not defined in [entity schema](#entity-schema) definition → `unknown` → `extraction_metadata.unknown_fields`
- Missing required fields → warning in `extraction_metadata.warnings`
- Unknown fields → warning in `extraction_metadata.warnings`
**Example:**
```typescript
// [Extracted](#extraction): { invoice_number, amount, purchase_order, internal_cost_center }
// [Entity schema](#entity-schema) definition for 'invoice': { invoice_number, amount, currency, date_issued }
// Partition result:
// structured: { invoice_number, amount } → goes to properties
// unknown: { purchase_order, internal_cost_center } → goes to extraction_metadata.unknown_fields
```
### Validation Rules
**MUST:**
- Always create [observation](#observation) (never reject entire [source material](#source-material))
- Filter unknown fields to `extraction_metadata.unknown_fields`
- Log warnings for filtered fields and missing required fields
- Include `schema_version: "1.0"` in all `properties`
- Preserve all [extracted](#extraction) data (in `properties` or `extraction_metadata`)
**MUST NOT:**
- Reject [observations](#observation) due to unknown fields
- Reject [observations](#observation) due to missing optional fields
- Store unknown fields in `properties`
- Modify or guess field values
## 3. [Extraction](#extraction) Metadata Usage
### Query Patterns
**Structured queries (use `properties`):**
```sql
-- Find invoices from Acme Corp
SELECT * FROM observations
WHERE entity_type = 'invoice'
  AND fields @> '{"vendor_name": "Acme Corp"}'::jsonb;
```
**Quality monitoring (use `extraction_metadata`):**
```sql
-- Find [observations](#observation) with [extraction](#extraction) issues
SELECT * FROM raw_fragments
WHERE fragment_type = 'unknown_field';
```
**[Entity schema](#entity-schema) evolution data (use `extraction_metadata`):**
```sql
-- Find [observations](#observation) with unknown fields (potential [entity schema](#entity-schema) expansion candidates)
SELECT * FROM raw_fragments
WHERE fragment_type = 'unknown_field';
```
### [Entity](#entity) and [Event](#event) [Extraction](#extraction)
**Important:** [Entity](#entity) [extraction](#extraction) and [event](#event) generation MUST use fields from `properties` only, NOT from `extraction_metadata.unknown_fields`.
**Rationale:**
- [Entities](#entity) and [events](#event) must be deterministic and [entity schema](#entity-schema)-compliant
- Unknown fields are not yet part of the [entity schema](#entity-schema) definition
- Future [entity schema](#entity-schema) expansion can migrate `unknown_fields` to `properties` and then [extract](#extraction) [entities](#entity)/[events](#event)
**Example:**
```typescript
// [Entity](#entity) [extraction](#extraction) from invoice
const vendorName = properties.vendor_name; // ✅ Use this
// NOT: extraction_metadata.unknown_fields.vendor_name // ❌ Don't use this
```
## 4. Migration and Evolution
### When [Entity Schemas](#entity-schema) Evolve
**Additive Evolution Only:**
- New fields added to [entity schema](#entity-schema) definition
- Existing [observations](#observation) retain old `schema_version`
- New [observations](#observation) use new `schema_version`
- Application handles both versions gracefully
### Future: Automatic [Entity Schema](#entity-schema) Expansion
Unknown fields in `extraction_metadata.unknown_fields` can be analyzed to suggest [entity schema](#entity-schema) expansions:
- Pattern detection across multiple [observations](#observation)
- User approval for [entity schema](#entity-schema) changes
- Deterministic [entity schema](#entity-schema) fingerprinting
- See `docs/architecture/schema_expansion.md` (post-MVP)
## 5. Related Documentation
- **[Entity schema](#entity-schema) structure:** `docs/subsystems/schema.md` Section 2.9
- **[Entity schema](#entity-schema) definitions:** `docs/subsystems/schema_registry.md`
- **Validation rules:** `docs/subsystems/schema.md` Section 1.2
- **Manifest constraints:** `docs/NEOTOMA_MANIFEST.md` Sections 5.4, 12.2, 14.4
- **Canonical vocabulary:** `docs/vocabulary/canonical_terms.md`
## Agent Instructions
### When to Load This Document
Load `docs/architecture/schema_handling.md` when:
- Implementing field extraction and validation logic
- Understanding how unknown fields are preserved
- Designing queries that need to access unknown fields
- Planning schema evolution strategies
### Constraints Agents Must Enforce
1. **Always preserve data:** Unknown fields MUST go to `extraction_metadata` or `raw_fragments`, never discarded
2. **Never reject [observations](#observation):** [Observations](#observation) MUST be created even with missing required fields (warn only)
3. **[Entity schema](#entity-schema) compliance:** Only [entity schema](#entity-schema)-defined fields in `properties`
4. **Determinism:** Same input → same `properties` structure always
5. **[Entity](#entity)/[Event](#event) [extraction](#extraction):** Use `properties` only, not `extraction_metadata`
**END OF DOCUMENT**
