# Implementation Overwrite Guide

_(Manifest Compliance — Code Changes Required for MVP)_

---

## Purpose

This document identifies specific code that MUST be **overwritten** to comply with NEOTOMA_MANIFEST.md. The current implementation violates manifest constraints and must be corrected during Feature Unit execution.

**This is not a suggestion—these are REQUIRED changes.**

---

## Critical Violations Requiring Overwrite

### 1. LLM Extraction (MANIFEST VIOLATION)

**Violation:** `src/services/file_analysis.ts` uses OpenAI LLM for field extraction

**Manifest Constraint:**

- Line 125: "No randomness. No nondeterminism. No LLM extraction (MVP)."
- Line 393: "No LLM extraction (MVP constraint; rule-based only)"
- Line 789: "Extraction MUST be rule-based (regex, parsing; no LLM)"

**Current Code (MUST REMOVE):**

```typescript
// src/services/file_analysis.ts lines 232-240
const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  temperature: 0.1,
  max_tokens: 1200,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
});
```

**Required Replacement:**

```typescript
// Rule-based schema detection
function detectSchemaType(rawText: string, fileName?: string): string {
  const lowerText = rawText.toLowerCase();
  const lowerName = (fileName || "").toLowerCase();

  // Invoice detection
  if (
    (/invoice/i.test(rawText) && /amount|total|due/i.test(rawText)) ||
    lowerName.includes("invoice")
  ) {
    return "invoice";
  }

  // Receipt detection
  if (
    (/receipt/i.test(rawText) && /amount|total|merchant/i.test(rawText)) ||
    lowerName.includes("receipt")
  ) {
    return "receipt";
  }

  // Contract detection
  if (
    (/contract|agreement/i.test(rawText) &&
      /parties|effective date|terms/i.test(rawText)) ||
    lowerName.includes("contract") ||
    lowerName.includes("agreement")
  ) {
    return "contract";
  }

  // Travel document detection
  if (
    (/flight|itinerary|boarding pass/i.test(rawText) &&
      /departure|arrival|airline/i.test(rawText)) ||
    lowerName.includes("flight") ||
    lowerName.includes("itinerary")
  ) {
    return "travel_document";
  }

  // Identity document detection
  if (
    (/passport|driver.?s? license|id card/i.test(rawText) &&
      /date of birth|nationality/i.test(rawText)) ||
    lowerName.includes("passport") ||
    lowerName.includes("license")
  ) {
    return "identity_document";
  }

  // Message/Email detection
  if (
    (/from:|to:|subject:/i.test(rawText) && /sent:|received:/i.test(rawText)) ||
    lowerName.includes("email") ||
    lowerName.includes("message")
  ) {
    return "message";
  }

  // Note detection
  if (
    lowerName.includes("note") ||
    lowerName.includes("memo") ||
    rawText.length < 5000
  ) {
    return "note";
  }

  // Fallback to generic document
  return "document";
}

// Rule-based field extraction per schema type
function extractFieldsForInvoice(rawText: string): Record<string, unknown> {
  return {
    schema_version: "1.0",
    invoice_number: extractInvoiceNumber(rawText),
    amount_due: extractAmount(rawText),
    currency: extractCurrency(rawText) || "USD",
    due_date: extractDate(rawText, "due|payable"),
    vendor: extractVendorName(rawText),
    status: extractPaymentStatus(rawText) || "unpaid",
  };
}

function extractFieldsForContract(rawText: string): Record<string, unknown> {
  return {
    schema_version: "1.0",
    contract_number: extractContractNumber(rawText),
    effective_date: extractDate(rawText, "effective|commence"),
    expiration_date: extractDate(rawText, "expir|terminat"),
    status: "active",
  };
}

function extractFieldsForDocument(rawText: string): Record<string, unknown> {
  return {
    schema_version: "1.0",
    title: extractTitle(rawText),
    summary: extractFirstSentence(rawText),
    source: "upload",
  };
}

// Helper functions (regex-based)
function extractInvoiceNumber(text: string): string | null {
  const match = text.match(/invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i);
  return match ? match[1] : null;
}

function extractAmount(text: string): number | null {
  const match = text.match(/total|amount\s*:?\s*\$?([0-9,]+\.?\d{0,2})/i);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}

function extractDate(text: string, pattern: string): string | null {
  const regex = new RegExp(
    `${pattern}\\s*:?\\s*(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})`,
    "i"
  );
  const match = text.match(regex);
  if (match) {
    const d = new Date(match[1]);
    return !isNaN(d.getTime()) ? d.toISOString() : null;
  }
  return null;
}

function extractVendorName(text: string): string | null {
  const match = text.match(
    /(?:vendor|from|billed by)\s*:?\s*([A-Za-z0-9\s]+)/i
  );
  return match ? match[1].trim() : null;
}
```

**Overwrite Action:**

- Replace `analyzeFileForRecord()` function entirely
- Remove all OpenAI imports and initialization
- Remove `openai.chat.completions.create()` calls
- Implement rule-based extractors per schema type
- See `docs/subsystems/ingestion/ingestion.md` section 5-6 for patterns

---

### 2. Custom Type Sanitization (MANIFEST VIOLATION)

**Violation:** `src/config/record_types.ts` allows custom sanitized types

**Manifest Constraint:**

- Line 497: "PDFDocument: Fallback for unrecognized documents"
- Line 505: "Unrecognized documents → PDFDocument fallback"

**Current Code (MUST CHANGE):**

```typescript
// src/config/record_types.ts lines 222-245
export function normalizeRecordType(
  input?: string | null
): RecordTypeResolution {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return { type: "unknown", match: "default" };
  }

  const lower = trimmed.toLowerCase();
  const canonical = aliasMap.get(lower);
  if (canonical) {
    return {
      type: canonical.id,
      match: lower === canonical.id ? "canonical" : "alias",
      definition: canonical,
      alias: lower === canonical.id ? undefined : trimmed,
    };
  }

  const sanitized = sanitizeCustomType(trimmed); // ← VIOLATES MANIFEST
  if (!sanitized) {
    return { type: "unknown", match: "default" };
  }

  return { type: sanitized, match: "custom" }; // ← VIOLATES MANIFEST
}
```

**Required Replacement:**

```typescript
export function normalizeRecordType(
  input?: string | null
): RecordTypeResolution {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return { type: "document", match: "default" }; // ← Fallback to 'document', not 'unknown'
  }

  const lower = trimmed.toLowerCase();
  const canonical = aliasMap.get(lower);
  if (canonical) {
    return {
      type: canonical.id,
      match: lower === canonical.id ? "canonical" : "alias",
      definition: canonical,
      alias: lower === canonical.id ? undefined : trimmed,
    };
  }

  // Unrecognized type → fallback to 'document' (PDFDocument equivalent)
  return { type: "document", match: "default" }; // ← No custom types allowed in MVP
}
```

**Overwrite Action:**

- Replace `normalizeRecordType()` function
- Remove `sanitizeCustomType()` helper (no longer needed)
- Change all unrecognized types to fallback to `'document'`
- Remove `'unknown'` type (use `'document'` instead)

---

### 3. Semantic Search (MANIFEST VIOLATION)

**Violation:** Search implementation may include vector similarity search

**Manifest Constraint:**

- Line 394: "No semantic search (MVP; structured search only)"
- Line 590: "search — Structured search (no semantic in MVP)"

**Current Code (IF EXISTS, MUST DISABLE):**

Check `src/actions.ts` in `retrieve_records` implementation for:

- Vector similarity queries (`embedding <-> query_vector`)
- Hybrid search combining structured + semantic
- Embedding-based ranking

**Required Action:**

```typescript
// MVP: Structured filters + full-text only
async function searchRecords(query: {
  type?: string;
  search?: string; // Full-text keyword search
  properties?: Record<string, unknown>;
  limit?: number;
}) {
  let dbQuery = supabase.from("records").select("*");

  // Structured filters
  if (query.type) {
    dbQuery = dbQuery.eq("type", query.type);
  }

  if (query.properties) {
    dbQuery = dbQuery.contains("properties", query.properties);
  }

  // Full-text search (NO semantic/vector search)
  if (query.search) {
    dbQuery = dbQuery.textSearch("raw_text", query.search);
  }

  // Deterministic ordering (with tiebreakers)
  dbQuery = dbQuery.order("created_at", { ascending: false });
  dbQuery = dbQuery.order("id", { ascending: true }); // Tiebreaker

  if (query.limit) {
    dbQuery = dbQuery.limit(query.limit);
  }

  const { data, error } = await dbQuery;
  // ... error handling

  return data;
}
```

**Overwrite Action:**

- Disable all vector similarity queries in `retrieve_records`
- Remove embedding-based ranking
- Use structured filters + full-text only
- Add deterministic tiebreakers (created_at DESC, id ASC)

---

### 4. Schema Versioning Enforcement (MANIFEST VIOLATION)

**Violation:** Extracted properties may not include `schema_version`

**Manifest Constraint:**

- Section 12.2: "Versioned (`schema_version` in JSONB)"
- Section 14.4: "Include `schema_version` if structure evolves"
- `record_types.md` Section 9: "All `records.properties` JSONB fields MUST include `schema_version`"

**Required:** All extraction functions must return `schema_version: "1.0"` in properties

**Example Pattern:**

```typescript
function extractFieldsForInvoice(rawText: string): Record<string, unknown> {
  return {
    schema_version: "1.0", // ← REQUIRED
    invoice_number: extractInvoiceNumber(rawText),
    amount: extractAmount(rawText),
    currency: extractCurrency(rawText) || "USD",
    date_issued: extractDate(rawText, "issued"),
    // ... other fields
  };
}
```

**Overwrite Action:**

- Update ALL extraction functions to include `schema_version: "1.0"`
- Add validation to reject records missing `schema_version` before DB insert
- Update tests to verify `schema_version` presence

**Verification:**

```bash
# Should return zero results (all extractors include schema_version)
grep -r "extractFieldsFor" src/services/ | xargs grep -L "schema_version"
```

---

### 5. Extraction Metadata Preservation (REQUIRED FOR DATA PRESERVATION)

**Requirement:** Unknown fields must be preserved in `extraction_metadata` to prevent data loss

**Manifest Constraint:**

- Users must be able to upload any file without losing associated data
- Unknown fields must be preserved for future schema expansion

**Current Code (MUST IMPLEMENT):**

Unknown fields are currently discarded. They MUST be preserved in `extraction_metadata.unknown_fields`.

**Required Implementation:**

```typescript
interface ExtractionMetadata {
  unknown_fields?: Record<string, unknown>;
  warnings?: Array<{
    type: "missing_required" | "unknown_field" | "validation_error";
    field?: string;
    message: string;
    value?: unknown;
  }>;
  extraction_quality: {
    fields_extracted_count: number;
    fields_filtered_count: number;
    matched_patterns?: string[];
  };
}

function extractAndValidate(
  rawText: string,
  detectedType: string
): {
  properties: Record<string, unknown>;
  extraction_metadata: ExtractionMetadata;
} {
  // Extract all fields (including unknown)
  const allExtracted = extractAllFields(rawText, detectedType);
  const typeDefinition = getTypeDefinition(detectedType);

  // Partition into structured vs unknown
  const { structured, unknown } = partitionFields(allExtracted, typeDefinition);

  // Validate required fields
  const warnings = validateRequired(structured, typeDefinition);

  // Build structured properties (schema-compliant only)
  const properties = {
    schema_version: "1.0",
    ...structured,
  };

  // Build extraction metadata (preservation layer)
  const extraction_metadata: ExtractionMetadata = {
    ...(Object.keys(unknown).length > 0 && { unknown_fields: unknown }),
    ...(warnings.length > 0 && { warnings }),
    extraction_quality: {
      fields_extracted_count: Object.keys(allExtracted).length,
      fields_filtered_count: Object.keys(unknown).length,
      matched_patterns: getMatchedPatterns(rawText, detectedType),
    },
  };

  return { properties, extraction_metadata };
}
```

**Overwrite Action:**

- Add `extraction_metadata` column to `records` table (migration)
- Implement field partitioning logic (structured vs unknown)
- Store unknown fields in `extraction_metadata.unknown_fields`
- Store warnings in `extraction_metadata.warnings`
- Always create records (never reject due to unknown fields)

**Database Migration:**

```sql
ALTER TABLE records ADD COLUMN IF NOT EXISTS extraction_metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_records_extraction_warnings
  ON records USING GIN ((extraction_metadata->'warnings'));

CREATE INDEX IF NOT EXISTS idx_records_unknown_fields
  ON records USING GIN ((extraction_metadata->'unknown_fields'));
```

**References:**

- `docs/subsystems/schema.md` Section 3.11
- `docs/architecture/schema_handling.md`

---

### 6. Type Catalog Cleanup (MANIFEST VIOLATION)

**Violation:** `src/config/record_types.ts` includes non-MVP types

**Manifest Constraint:**

- Section 14.2: MVP Application Types list (16 types only)
- Section 14.4: "Unrecognized documents → `document` fallback (generic)"
- Non-MVP types must be removed or marked post-MVP

**Types to Remove:**

- `budget` (not in MVP catalog)
- `subscription` (not in MVP catalog)
- `goal` (not in MVP catalog)
- Health types: `exercise`, `measurement`, `meal`, `sleep_session` (not in MVP)
- `media_asset` (not in MVP catalog)
- `dataset_row` (not in MVP catalog)

**MVP Types (Keep These 16):**

- Financial: `invoice`, `receipt`, `transaction`, `statement`, `account`
- Productivity: `note`, `document`, `message`, `task`, `project`, `event`
- Knowledge: `contact`, `dataset`
- Legal: `contract`
- Travel: `travel_document`
- Identity: `identity_document`

**Required Action:**

```typescript
// REMOVE these types from definitions array:
// - budget
// - subscription
// - goal
// - exercise, measurement, meal, sleep_session
// - media_asset
// - dataset_row

// Update normalizeRecordType() to reject non-MVP types:
export function normalizeRecordType(
  input?: string | null
): RecordTypeResolution {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return { type: "document", match: "default" }; // Fallback to 'document'
  }

  const lower = trimmed.toLowerCase();
  const canonical = aliasMap.get(lower);
  if (canonical) {
    // Verify it's an MVP type
    const mvpTypes = ["invoice", "receipt" /* ... all 16 MVP types ... */];
    if (mvpTypes.includes(canonical.id)) {
      return {
        type: canonical.id,
        match: lower === canonical.id ? "canonical" : "alias",
        definition: canonical,
        alias: lower === canonical.id ? undefined : trimmed,
      };
    }
  }

  // Unrecognized type → fallback to 'document'
  return { type: "document", match: "default" };
}

// DELETE sanitizeCustomType() function (no longer needed)
```

**Overwrite Action:**

- Remove non-MVP type definitions from `definitions` array
- Update `normalizeRecordType()` to reject non-MVP types (fallback to `'document'`)
- Remove `sanitizeCustomType()` function
- Update tests to verify fallback behavior

**Verification:**

```bash
# Should return zero results (no non-MVP types)
grep -E "(budget|subscription|goal|exercise|measurement|meal|sleep_session|media_asset|dataset_row)" src/config/record_types.ts
```

---

## Feature Unit Execution Instructions

**Related Documentation:**

- Layered storage model: `docs/architecture/schema_handling.md`
- Extraction metadata structure: `docs/subsystems/schema.md` Section 3.11
- Field extraction patterns: `docs/subsystems/record_types.md` Section 4
- Schema detection patterns: `docs/subsystems/record_types.md` Section 7
- Validation rules: `docs/subsystems/record_types.md` Section 10
- FU-100 specification: `docs/specs/MVP_EXECUTION_PLAN.md` FU-100
- FU-100.5 verification: `docs/specs/MVP_EXECUTION_PLAN.md` FU-100.5

### FU-100: File Analysis Service Update

**Execute via:** `Modify Subsystem` with `subsystem=ingestion` → `Run Feature Workflow` with `feature_id=FU-100`

**Overwrite Checklist:**

- [ ] Remove `import OpenAI from 'openai'` from `src/services/file_analysis.ts`
- [ ] Remove `openai` client initialization
- [ ] **OVERWRITE** `analyzeFileForRecord()` with rule-based implementation
- [ ] Implement `detectSchemaType()` using regex patterns (see ingestion.md section 5)
- [ ] Implement schema-specific extractors for ALL 16 MVP types:
  - Financial (5): `extractFieldsForInvoice()`, `extractFieldsForReceipt()`, `extractFieldsForTransaction()`, `extractFieldsForStatement()`, `extractFieldsForAccount()`
  - Productivity (6): `extractFieldsForNote()`, `extractFieldsForDocument()`, `extractFieldsForMessage()`, `extractFieldsForTask()`, `extractFieldsForProject()`, `extractFieldsForEvent()`
  - Knowledge (2): `extractFieldsForContact()`, `extractFieldsForDataset()`
  - Legal (1): `extractFieldsForContract()`
  - Travel (1): `extractFieldsForTravelDocument()`
  - Identity (1): `extractFieldsForIdentityDocument()`
- [ ] Ensure ALL extractors include `schema_version: "1.0"` in returned properties
- [ ] Implement field validation function that partitions fields (structured vs unknown)
- [ ] Add database migration for `extraction_metadata` column
- [ ] Store unknown fields in `extraction_metadata.unknown_fields`
- [ ] Store warnings in `extraction_metadata.warnings`
- [ ] Update `fallbackTypeFromName()` to return `'document'` instead of custom types
- [ ] **OVERWRITE** `normalizeRecordType()` in `src/config/record_types.ts`
- [ ] Remove non-MVP types from `src/config/record_types.ts` (budget, subscription, goal, health types, media_asset, dataset_row)
- [ ] Remove `sanitizeCustomType()` function
- [ ] Change `'unknown'` fallback to `'document'`
- [ ] Add database trigger to prevent `type` column updates
- [ ] Add application-layer validation to prevent `type` mutations
- [ ] Verify code uses application types only (grep for schema family names)
- [ ] Write determinism tests: same file → same output (100 runs)

**Test Verification:**

```typescript
// Property-based test
test("file analysis is deterministic", async () => {
  const buffer = fs.readFileSync("test/fixtures/invoice.pdf");
  const results = [];

  // Run 100 times
  for (let i = 0; i < 100; i++) {
    const result = await analyzeFileForRecord({
      buffer,
      fileName: "invoice.pdf",
    });
    results.push(result);
  }

  // All results must be identical
  expect(
    results.every(
      (r) =>
        r.type === results[0].type &&
        JSON.stringify(r.properties) === JSON.stringify(results[0].properties)
    )
  ).toBe(true);
});
```

---

### FU-105: Search Service Update

**Execute via:** `Run Feature Workflow` with `feature_id=FU-105`

**Overwrite Checklist:**

- [ ] Review `src/actions.ts` `retrieve_records` implementation
- [ ] If vector similarity search exists, **DISABLE** it for MVP
- [ ] Remove `embedding <-> query_vector` queries
- [ ] Remove hybrid search (structured + semantic)
- [ ] Keep only: structured filters + full-text keyword search
- [ ] Add deterministic ranking with tiebreakers:
  - [ ] Primary: `created_at DESC`
  - [ ] Tiebreaker: `id ASC`
- [ ] Write property test: same query → same order (100 runs)

---

### FU-600: Advanced Search UI Update

**Execute via:** `UI Workflow` with `feature_id=FU-600`

**Overwrite Checklist:**

- [ ] Review search UI components for semantic search toggles
- [ ] **REMOVE** any "semantic", "hybrid", or "vector" search mode toggles
- [ ] Keep only: keyword search + structured filters
- [ ] Update UI copy to reflect structured search only

---

## Verification After Overwrites

### Unit Tests (MUST PASS)

```typescript
// No LLM calls in extraction
test("file analysis makes no external API calls", async () => {
  const mockFetch = jest.spyOn(global, "fetch");

  await analyzeFileForRecord({ buffer, fileName: "test.pdf" });

  expect(mockFetch).not.toHaveBeenCalled();
});

// Only canonical types + document fallback
test("unrecognized types fallback to document", () => {
  expect(normalizeRecordType("foobar").type).toBe("document");
  expect(normalizeRecordType("custom_report").type).toBe("document");
  expect(normalizeRecordType("").type).toBe("document");
});

// Deterministic extraction
test("same input produces same output", async () => {
  const results = await Promise.all(
    Array(100)
      .fill(null)
      .map(() => analyzeFileForRecord({ buffer, fileName: "test.pdf" }))
  );

  const first = JSON.stringify(results[0]);
  expect(results.every((r) => JSON.stringify(r) === first)).toBe(true);
});
```

---

## Cleanup Phase: Final Verification

**Before MVP Launch:**

1. **Grep for violations:**

   ```bash
   # No LLM calls
   grep -r "openai.chat" src/
   grep -r "gpt-4" src/
   grep -r "chat.completions" src/

   # No semantic search
   grep -r "vector_cosine_ops" src/actions.ts
   grep -r "embedding <->" src/actions.ts
   grep -r "similarity" src/actions.ts

   # No custom types
   grep -r "sanitizeCustomType" src/
   grep -r "match: 'custom'" src/

   # Schema versioning (should have schema_version in all extractors)
   grep -r "extractFieldsFor" src/services/ | xargs grep -L "schema_version"

   # Extraction metadata (should have extraction_metadata usage)
   grep -r "extraction_metadata" src/services/ | grep -E "unknown_fields|warnings"

   # Non-MVP types (should return zero)
   grep -E "(budget|subscription|goal|exercise|measurement|meal|sleep_session|media_asset|dataset_row)" src/config/record_types.ts
   ```

2. **Expected Results:** All greps should return ZERO matches (except comments/docs)

3. **Run Determinism Tests:**

   ```bash
   npm test -- --grep="deterministic"
   npm test -- --grep="same input same output"
   ```

4. **Manual Verification:**
   - Upload same PDF 10 times → verify same type + fields every time
   - Upload unrecognized document → verify type is `'document'`, not custom
   - Search without semantic mode → verify structured filters only

---

## Agent Instructions

### When Executing FU-100, FU-105, FU-600

**DO:**

- **OVERWRITE** existing code that violates manifest
- Replace LLM calls with regex patterns
- Replace custom type logic with `'document'` fallback
- Write determinism tests (100 runs → same output)

**DO NOT:**

- Keep LLM code "for post-MVP migration"
- Keep custom types "for flexibility"
- Preserve "backward compatibility" with non-compliant code
- Add feature flags to "conditionally enable" violations

**The manifest is absolute. Code MUST comply, not adapt.**

---

## Summary of Required Overwrites

| File                            | Function                 | Current Behavior               | Required Behavior                             | FU     |
| ------------------------------- | ------------------------ | ------------------------------ | --------------------------------------------- | ------ |
| `src/services/file_analysis.ts` | `analyzeFileForRecord()` | Uses OpenAI LLM                | Rule-based regex extraction                   | FU-100 |
| `src/services/file_analysis.ts` | Extraction functions     | Missing `schema_version`       | Include `schema_version: "1.0"` in all        | FU-100 |
| `src/services/file_analysis.ts` | Field validation         | Unknown fields discarded       | Store in `extraction_metadata.unknown_fields` | FU-100 |
| `src/config/record_types.ts`    | `normalizeRecordType()`  | Returns custom sanitized types | Returns `'document'` for unrecognized         | FU-100 |
| `src/config/record_types.ts`    | `sanitizeCustomType()`   | Sanitizes custom types         | **DELETE** (not needed)                       | FU-100 |
| `src/config/record_types.ts`    | Type definitions         | Includes non-MVP types         | Remove non-MVP types                          | FU-100 |
| `supabase/schema.sql`           | `records` table          | Missing `extraction_metadata`  | Add `extraction_metadata` JSONB column        | FU-100 |
| `src/actions.ts`                | `retrieve_records()`     | May include semantic search    | Structured + keyword only                     | FU-105 |
| UI search components            | Search mode toggle       | May include semantic option    | Keyword + filters only                        | FU-600 |

**Total Files to Overwrite:** 4-5 files + database migration

**Estimated Effort:** 10-14 agent hours (FU-100, includes complete extractors, validation, metadata) + 2-3 agent hours (FU-105) + 1-2 agent hours (FU-600) = **13-19 hours total**

---

## Rationale

The current implementation was built before the manifest was finalized. The manifest represents the **canonical architectural truth**. When implementation diverges from manifest, **implementation must change**, not the manifest.

This is not technical debt—this is architectural compliance.

---

## References

- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Architectural constraints (Sections 5.4, 12.2, 14.4)
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Rule-based detection patterns (section 5)
- [`docs/subsystems/record_types.md`](../subsystems/record_types.md) — Type catalog, field patterns (Sections 4, 7, 9, 10)
- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Database schema, extraction metadata (Section 3.11)
- [`docs/architecture/schema_handling.md`](../architecture/schema_handling.md) — Layered storage model, validation patterns
- [`docs/specs/MVP_EXECUTION_PLAN.md`](./MVP_EXECUTION_PLAN.md) — Feature Unit execution sequence (FU-100, FU-100.5, FU-101, FU-102)
- [`docs/specs/MVP_FEATURE_UNITS.md`](./MVP_FEATURE_UNITS.md) — FU-100, FU-105, FU-600 specifications
