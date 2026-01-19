# LLM Extraction Removal — Migration to Rule-Based Extraction

**⚠️ OUTDATED DOCUMENT:** This document describes a historical migration and is no longer accurate. The architecture has evolved (v0.2.0+) to allow AI interpretation for unstructured files via the interpretation service with full auditability and system-level idempotence. See `docs/architecture/determinism.md` for current extraction approach.

## Purpose
Documents the **historical removal of LLM-based extraction** from early prototypes and replacement with the interpretation service pattern that provides AI interpretation with auditability and idempotence guarantees.
## Why LLM Extraction Was Initially Implemented
### Original Rationale
LLM extraction was initially implemented for:
1. **Flexibility:** Handle diverse document formats without explicit rules
2. **Field extraction accuracy:** LLM could "understand" context and extract fields intelligently
3. **Rapid prototyping:** Faster initial implementation than building comprehensive regex libraries
### Problems Discovered
1. **Nondeterminism:** Same file → different extractions across runs (unacceptable per manifest)
2. **Cost:** API costs for every file upload (unsustainable at scale)
3. **Latency:** LLM API calls add 2-5s per document (poor UX)
4. **Architectural violation:** Violates NEOTOMA_MANIFEST.md section 5.1 (Determinism Above All)
5. **Testing impossibility:** Cannot write deterministic tests for LLM outputs
6. **Trust erosion:** Users cannot trust extraction results if they change on re-upload
## Why Rule-Based Extraction is Required for MVP
### Architectural Alignment
`docs/NEOTOMA_MANIFEST.md` section 5.1:
> **Determinism Above All**
>
> A given input MUST always produce identical output:
>
> - Same raw_text → same extracted_fields
> - Same entity name → same entity_id
> - Same date field → same event_id
> - Same query + same DB state → same search order
> - Same file uploaded twice → same record (deduplicated)
>
> **No randomness. No nondeterminism. No LLM extraction (MVP).**
### MVP Success Criteria
MVP requires:
- **Determinism:** Same file uploaded 100 times → 100 identical extractions
- **Testability:** Unit tests can verify extraction output
- **Performance:** Fast, local extraction (no API calls)
- **Cost:** Zero per-document API costs
- **Trust:** Users can rely on consistent behavior
### Post-MVP Path
LLM extraction **may** be added post-MVP with:
- Deterministic fallback for ambiguous cases
- Caching to ensure same input → same output within session
- Explicit user opt-in ("Use AI-assisted extraction?")
- A/B testing to measure accuracy vs determinism tradeoffs
**Current Approach (v0.2.0+):** AI interpretation for unstructured files via interpretation service (auditable, idempotent).
## Migration Path
### Phase 1: Remove LLM Code (FU-100)
**Target Files:**
- `src/services/file_analysis.ts` (primary extraction service)
- Any other files calling `openai.chat.completions.create()`
**Actions:**
1. Remove all OpenAI client initialization
2. Remove all `openai.chat.completions.create()` calls
3. Remove LLM prompt templates
4. Remove any LLM-dependent logic
**Verification:**
```bash
# Must return zero results after removal
grep -r "openai.chat.completions.create" src/services/
grep -r "OpenAI" src/services/ | grep -v "// OpenAI API (removed)" # Comments OK
```
### Phase 2: Implement Multi-Pattern Schema Detection
**Pattern:** Documents must match **2 or more patterns** for a given type to be classified as that type.
**Rationale:** Multi-pattern matching reduces false positives while maintaining high accuracy.
**Implementation Location:** `src/services/file_analysis.ts` (or dedicated schema detection service)
**Example Implementation:**
```typescript
// Complete detection patterns from docs/subsystems/record_types.md section 7
const SCHEMA_DETECTION_PATTERNS = {
  invoice: [
    /invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /bill\s*to:/i,
    /amount\s*due:/i,
    /invoice\s*date/i,
    /payment\s*terms/i,
  ],
  receipt: [
    /receipt/i,
    /thank\s*you\s*for\s*your\s*purchase/i,
    /items?\s*purchased/i,
    /total\s*amount/i,
    /payment\s*method/i,
  ],
  // ... (complete patterns in record_types.md)
};
function detectSchemaType(rawText: string): string {
  const matchCounts: Record<string, number> = {};
  // Count pattern matches for each type
  for (const [type, patterns] of Object.entries(SCHEMA_DETECTION_PATTERNS)) {
    matchCounts[type] = patterns.filter((pattern) =>
      pattern.test(rawText)
    ).length;
  }
  // Find types with 2+ matches
  const candidates = Object.entries(matchCounts)
    .filter(([_, count]) => count >= 2)
    .sort(([_, countA], [__, countB]) => countB - countA);
  // Return type with most matches, or fallback to 'document'
  if (candidates.length > 0) {
    return candidates[0][0];
  }
  return "document"; // Generic fallback
}
```
**Testing:**
```typescript
describe("detectSchemaType", () => {
  it("detects invoice with 2+ pattern matches", () => {
    const text = `
      INVOICE #INV-2024-001
      Bill To: Customer Corp
      Amount Due: $1,500.00
    `;
    // Run 100 times, verify determinism
    for (let i = 0; i < 100; i++) {
      expect(detectSchemaType(text)).toBe("invoice");
    }
  });
  it("falls back to document when < 2 patterns match", () => {
    const text = "This is a generic document.";
    expect(detectSchemaType(text)).toBe("document");
  });
});
```
### Phase 3: Implement Rule-Based Field Extraction
**Pattern:** Use regex and parsing for field extraction per schema type.
**Implementation:** Per-type extraction functions (see `docs/subsystems/record_types.md` section 4)
**Example: Invoice Field Extraction**
```typescript
interface InvoiceFields {
  invoice_number: string;
  amount: number;
  currency: string;
  date_issued: string; // ISO 8601
  vendor_name?: string;
  customer_name?: string;
}
function extractInvoiceFields(rawText: string): InvoiceFields {
  const patterns = {
    invoice_number: /invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    amount: /(?:amount|total)[\s:]*\$?\s*([\d,]+\.?\d*)/i,
    date_issued: /(?:date|issued)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    vendor_name: /(?:from|vendor|seller)[\s:]*([A-Za-z0-9\s&.,]+)/i,
  };
  const fields: Partial<InvoiceFields> = {};
  // Extract invoice_number (required)
  const invoiceMatch = rawText.match(patterns.invoice_number);
  if (!invoiceMatch) {
    throw new Error("Missing required field: invoice_number");
  }
  fields.invoice_number = invoiceMatch[1];
  // Extract amount (required)
  const amountMatch = rawText.match(patterns.amount);
  if (!amountMatch) {
    throw new Error("Missing required field: amount");
  }
  fields.amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  // Default currency (could be extracted with pattern)
  fields.currency = "USD";
  // Extract date (required)
  const dateMatch = rawText.match(patterns.date_issued);
  if (!dateMatch) {
    throw new Error("Missing required field: date_issued");
  }
  fields.date_issued = parseDateToISO8601(dateMatch[1]);
  // Extract vendor_name (optional)
  const vendorMatch = rawText.match(patterns.vendor_name);
  if (vendorMatch) {
    fields.vendor_name = vendorMatch[1].trim();
  }
  return fields as InvoiceFields;
}
function parseDateToISO8601(dateString: string): string {
  // Parse various date formats deterministically
  // Return ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
  // Implementation details omitted for brevity
}
```
**Testing:**
```typescript
describe("extractInvoiceFields", () => {
  const sampleInvoice = `
    INVOICE #INV-2024-001
    From: Acme Corp
    Bill To: Customer Corp
    Amount Due: $1,500.00
    Invoice Date: 01/15/2024
  `;
  it("extracts all fields deterministically", () => {
    const expected = {
      invoice_number: "INV-2024-001",
      amount: 1500.0,
      currency: "USD",
      date_issued: "2024-01-15T00:00:00Z",
      vendor_name: "Acme Corp",
    };
    // Run 100 times, verify determinism
    for (let i = 0; i < 100; i++) {
      expect(extractInvoiceFields(sampleInvoice)).toEqual(expected);
    }
  });
  it("throws error when required fields missing", () => {
    const incomplete = "Just some text";
    expect(() => extractInvoiceFields(incomplete)).toThrow(
      "Missing required field"
    );
  });
});
```
### Phase 4: Update Fallback Logic
**Old Behavior (with LLM):**
- LLM attempts to classify unknown documents
- Custom types may be generated (e.g., "ResearchPaper", "Memo")
**New Behavior (rule-based):**
- Multi-pattern matching for known types
- Fallback to `'document'` (generic) if < 2 patterns match
- No custom types (only canonical types from `record_types.md`)
**Implementation:**
```typescript
function normalizeRecordType(detectedType: string): string {
  const CANONICAL_TYPES = [
    "invoice",
    "receipt",
    "transaction",
    "statement",
    "account",
    "note",
    "document",
    "message",
    "task",
    "project",
    "event",
    "contact",
    "dataset",
    "contract",
    "travel_document",
    "identity_document",
  ];
  if (CANONICAL_TYPES.includes(detectedType)) {
    return detectedType;
  }
  // Fallback to generic document
  return "document";
}
```
### Phase 5: Comprehensive Testing
**Determinism Tests (Critical):**
```typescript
describe("End-to-End Determinism", () => {
  const testFiles = [
    "./fixtures/invoice-sample-001.pdf",
    "./fixtures/receipt-sample-001.jpg",
    "./fixtures/contract-sample-001.pdf",
  ];
  for (const file of testFiles) {
    it(`produces identical extraction for ${file} across 100 runs`, async () => {
      const results = [];
      for (let i = 0; i < 100; i++) {
        const result = await ingestFile(file);
        results.push(result);
      }
      // Verify all results identical
      const firstResult = JSON.stringify(results[0]);
      for (const result of results) {
        expect(JSON.stringify(result)).toBe(firstResult);
      }
    });
  }
});
```
**Coverage Tests:**
```typescript
describe("Schema Detection Coverage", () => {
  // Test all application types
  const typeFixtures = {
    invoice: "./fixtures/invoice-sample-001.pdf",
    receipt: "./fixtures/receipt-sample-001.jpg",
    transaction: "./fixtures/transaction-sample-001.pdf",
    // ... (complete list)
  };
  for (const [type, fixture] of Object.entries(typeFixtures)) {
    it(`correctly detects type: ${type}`, async () => {
      const result = await ingestFile(fixture);
      expect(result.type).toBe(type);
    });
  }
  it("falls back to document for unrecognized files", async () => {
    const result = await ingestFile("./fixtures/unknown-document.pdf");
    expect(result.type).toBe("document");
  });
});
```
## Migration Checklist
**Pre-Migration:**
- [ ] Review `docs/subsystems/record_types.md` (complete type catalog)
- [ ] Review `docs/subsystems/ingestion/ingestion.md` section 5 (detection patterns)
- [ ] Create test fixtures for all application types
- [ ] Document expected extraction output per fixture
**Implementation:**
- [ ] Remove all LLM code (`grep -r "openai.chat" src/` returns zero)
- [ ] Implement multi-pattern schema detection (2+ patterns required)
- [ ] Implement rule-based field extraction per type (all types from `record_types.md`)
- [ ] Update fallback logic (unrecognized → `'document'`)
- [ ] Remove custom type sanitization
**Testing:**
- [ ] Determinism tests pass (100 runs → 100 identical results)
- [ ] Coverage tests pass (all application types detected correctly)
- [ ] Fallback tests pass (unrecognized → `'document'`)
- [ ] Performance tests pass (extraction < 10s P95)
- [ ] Integration tests pass (end-to-end ingestion pipeline)
**Verification:**
- [ ] Zero LLM API calls in codebase
- [ ] All extraction outputs deterministic
- [ ] All types match `record_types.md` catalog
- [ ] MVP launch criteria met
## Rollback Plan (If Needed)
**Note:** Rollback **NOT RECOMMENDED** — rule-based extraction is required for MVP.
However, if critical issues arise:
1. **Preserve LLM code in Git history:**
   - Tag commit before LLM removal: `git tag pre-llm-removal`
   - LLM code can be restored from history if needed
2. **Revert Process:**
   ```bash
   git revert <commit-hash-of-llm-removal>
   npm test
   ```
3. **Post-Revert Actions:**
   - Add deterministic caching to LLM calls (cache results by content hash)
   - Add explicit user opt-in for LLM extraction
   - Mark as experimental/post-MVP feature
   - Continue working on rule-based extraction for MVP path
**Recommendation:** Do NOT rollback. Fix forward with improved rule-based patterns.
## Post-MVP: Hybrid Approach
After MVP launch, consider **hybrid approach**:
1. **Primary:** Rule-based extraction (default, deterministic)
2. **Fallback:** LLM-assisted extraction for ambiguous cases (user opt-in)
3. **Caching:** Cache LLM results by content hash for determinism
4. **Validation:** Compare LLM output vs rule-based output, flag discrepancies
5. **User Control:** Allow users to choose extraction method per document type
**Criteria for LLM Re-Introduction:**
- Deterministic caching implemented (content hash → LLM result mapping)
- User opt-in required (no surprise nondeterminism)
- A/B testing shows accuracy improvement > 10% vs rule-based
- Cost model validated (LLM cost per document acceptable at scale)
## References
- `docs/NEOTOMA_MANIFEST.md` section 5.1 — Determinism Above All
- `docs/subsystems/record_types.md` — Complete type catalog, extraction rules
- `docs/subsystems/ingestion/ingestion.md` section 5 — Schema detection patterns
- `docs/specs/MVP_EXECUTION_PLAN.md` FU-100 — Implementation plan
- `docs/architecture/determinism.md` — Determinism requirements
## Agent Instructions
### When to Load This Document
Load `docs/migration/llm_extraction_removal.md` when:
- Implementing FU-100 (LLM removal)
- Modifying schema detection logic
- Modifying field extraction logic
- Debugging extraction nondeterminism
- Planning post-MVP LLM re-introduction
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (determinism requirements)
- `docs/subsystems/record_types.md` (type catalog, extraction rules)
- `docs/subsystems/ingestion/ingestion.md` (ingestion pipeline)
- `docs/specs/MVP_EXECUTION_PLAN.md` (FU-100 details)
### Constraints Agents Must Enforce
1. **Zero LLM calls in MVP:** Code MUST NOT call `openai.chat.completions.create()` or equivalent
2. **Determinism required:** Same file → same extraction, always (100 runs → 100 identical results)
3. **Multi-pattern matching:** Schema detection MUST use 2+ pattern matches for non-fallback types
4. **Canonical types only:** Extracted types MUST match `record_types.md` application types
5. **Fallback correctness:** Unrecognized documents → `type = 'document'` (not custom types)
### Forbidden Patterns
- Using LLM for extraction in MVP
- Adding nondeterministic logic to extraction
- Generating custom types not in `record_types.md`
- Skipping determinism tests (100-run tests required)
- Caching LLM results without explicit user opt-in (post-MVP only)
### Validation Checklist
- [ ] Zero LLM calls in codebase (`grep -r "openai.chat"` returns zero)
- [ ] Determinism tests pass (100 runs → identical results)
- [ ] Multi-pattern matching implemented (2+ patterns required)
- [ ] Canonical types only (all match `record_types.md`)
- [ ] Fallback to `document` for unrecognized types
- [ ] Performance < 10s P95 (same as or better than LLM version)
- [ ] All application types have test fixtures and expected outputs
- [ ] MVP launch criteria met
**END OF MIGRATION GUIDE**
