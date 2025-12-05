# Manifest Alignment Summary
*(MVP Plan Updates to Match NEOTOMA_MANIFEST.md)*

---

## Changes Made

### 1. MVP_FEATURE_UNITS.md

**FU-100: File Analysis Service**
- Status: Changed from "✅ Complete" to "🔨 Needs Update"
- Added manifest constraints section
- Added implementation notes requiring LLM removal
- Updated deliverables to specify rule-based extraction only
- Added PDFDocument fallback requirement
- Updated tests to include determinism property tests (100 runs)

**FU-105: Search Service**
- Removed semantic search from deliverables
- Added manifest constraints section
- Added implementation notes requiring semantic search removal
- Updated deliverables to structured + full-text only
- Added deterministic ranking requirement with tiebreakers

**FU-600: Advanced Search UI**
- Removed search mode toggle (keyword/semantic/both)
- Added manifest constraints section
- Added implementation notes to remove semantic search UI
- Updated deliverables to structured filters only

**Summary Table:**
- Updated FU-100 status to "🔨 Needs Update"

---

### 2. MVP_EXECUTION_PLAN.md

**Phase 1 Updates:**
- Updated status: "File Analysis: 🔨 Needs Update (uses OpenAI LLM; MUST be replaced)"
- Added FU-100 as first P0 task in execution sequence
- Added detailed FU-100 execution steps with LLM removal instructions

**Critical Path Updates:**
- Added FU-100 to P0 critical path (was missing)
- Updated estimates to include FU-100 (8-10h agent time, 2-3h human time)

**Cleanup Phase:**
- Added LLM removal as first cleanup task
- Added explicit steps to remove OpenAI calls
- Updated cleanup verification to include LLM removal

**Execution Strategy:**
- Added "Critical: Implementation Must Overwrite to Match Manifest" section
- Listed specific violations requiring overwrites
- Added explicit instructions that agents MUST overwrite non-compliant code

**Estimates Updated:**
- Minimal MVP: 12-20h manual (was 10-17h), 51-67h agent (was 43-57h)
- Full MVP: 21-33.5h manual (was 19-30.5h), 82-109h agent (was 74-99h)
- Calendar: 8-10 days (was 7-9 days) for minimal, 13-16 days (was 12-15 days) for full

**References:**
- Added link to IMPLEMENTATION_OVERWRITE_GUIDE.md

**Constraints:**
- Added constraint #6: MUST overwrite non-compliant code

**Forbidden Patterns:**
- Added: Preserving non-compliant code
- Added: Adding feature flags to conditionally enable manifest violations

---

### 3. MVP_OVERVIEW.md

**Post-MVP Section:**
- Added note: "Current implementation uses LLM but MUST be removed for MVP per manifest"

**Extraction Section:**
- Updated to emphasize "regex-based, no LLM"
- Updated to list Tier 1 ICP-aligned schema types

---

### 4. FUNCTIONAL_REQUIREMENTS.md

**Schema Requirements:**
- Replaced legacy types (FinancialRecord, IdentityDocument, etc.)
- Added Tier 1 ICP-aligned types organized by category
- Added rationale section linking schema types to Tier 1 ICP workflows

---

### 5. schema.md (docs/subsystems/)

**JSONB Examples:**
- Added Contract example (section 3.5)
- Added Message (Email/Chat) example (section 3.6)
- Added Document example (section 3.7)
- Added Note example (section 3.8)
- Updated fallback example to use "document" (section 3.9)
- Updated section numbering (3.10 for querying)
- Added Tier 1 ICP use cases for each schema type

---

### 6. ingestion.md (docs/subsystems/ingestion/)

**Schema Detection:**
- Updated `detectSchemaType()` example to use Tier 1 ICP types
- Changed return values from `FinancialRecord` → `invoice`, `receipt`, etc.
- Updated fallback from `PDFDocument` → `document`
- Added Tier 1 ICP alignment note

**Schema Registry:**
- Updated to show `CANONICAL_TYPES` array
- Updated to show `SCHEMA_FIELDS` mapping
- Added `FALLBACK_TYPE = 'document'`

**Field Extraction:**
- Updated extractors to use Tier 1 ICP type names
- Added `extractFieldsForContract()`, `extractFieldsForDocument()`, etc.
- Added implementation note: "No LLM calls permitted in MVP"

---

### 7. NEW: IMPLEMENTATION_OVERWRITE_GUIDE.md

**Created comprehensive overwrite guide with:**
- Specific violations requiring overwrites
- Current code that MUST be removed/changed
- Required replacement code
- Feature Unit execution checklists
- Verification tests
- Cleanup phase grep commands
- Agent instructions emphasizing overwrite requirement

---

## Manifest Compliance Summary

### Violations Identified

| Violation | Location | Manifest Line | Fix Required | FU |
|-----------|----------|---------------|--------------|-----|
| LLM Extraction | `src/services/file_analysis.ts` | 125, 393, 789 | Remove OpenAI calls, add regex | FU-100 |
| Custom Types | `src/config/record_types.ts` | 497, 505 | Return `'document'` fallback only | FU-100 |
| Semantic Search | `src/actions.ts` (if present) | 394, 590 | Disable vector similarity | FU-105 |
| Semantic UI Toggle | Search components (if present) | 394 | Remove mode toggle | FU-600 |

### Compliance Actions

**MUST Overwrite:**
- `analyzeFileForRecord()` — Replace LLM with regex
- `normalizeRecordType()` — Replace custom types with `'document'` fallback
- `retrieve_records()` — Remove semantic search
- Search UI — Remove semantic mode toggle

**MUST Remove:**
- All `openai.chat.completions.create()` calls
- `sanitizeCustomType()` function
- Vector similarity queries
- Semantic search mode UI

**MUST Add:**
- Rule-based schema detection (regex patterns)
- Rule-based field extractors per schema type
- Determinism tests (100 runs → same output)

---

## Execution Priority

**Before Any Other Feature Units:**
1. Execute FU-100 to remove LLM and implement rule-based extraction
2. Verify determinism tests pass (100 runs → same output)
3. Verify no OpenAI calls in codebase

**During Execution:**
- FU-100 blocks FU-101 (entity resolution depends on extraction)
- FU-100 blocks FU-102 (event generation depends on extraction)
- FU-105 must remove semantic search
- FU-600 must remove semantic UI

**Before Launch:**
- Verify all overwrites complete
- Run cleanup verification (grep commands in IMPLEMENTATION_OVERWRITE_GUIDE.md)
- Confirm 100% manifest compliance

---

## Agent Instructions

### Loading Order for Feature Unit Execution

1. Load `docs/NEOTOMA_MANIFEST.md` (architectural truth)
2. Load `docs/specs/IMPLEMENTATION_OVERWRITE_GUIDE.md` (required changes)
3. Load `docs/specs/MVP_EXECUTION_PLAN.md` (execution sequence)
4. Load `docs/specs/MVP_FEATURE_UNITS.md` (feature inventory)
5. Load relevant subsystem docs (e.g., `docs/subsystems/ingestion/ingestion.md` for FU-100)

### When Executing FU-100, FU-105, FU-600

**DO:**
- **OVERWRITE** non-compliant code completely
- Replace with manifest-compliant implementations
- Write determinism tests
- Verify no external API calls during extraction

**DO NOT:**
- Preserve LLM code "for compatibility"
- Add feature flags to conditionally enable violations
- Keep custom type logic "for flexibility"
- Implement hybrid approaches (rule-based + LLM)

**The manifest is absolute. Implementation adapts, not the manifest.**

---

## References

**Primary Compliance Documents:**
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Architectural constraints
- [`docs/specs/IMPLEMENTATION_OVERWRITE_GUIDE.md`](./IMPLEMENTATION_OVERWRITE_GUIDE.md) — Required code changes

**Updated Planning Documents:**
- [`docs/specs/MVP_FEATURE_UNITS.md`](./MVP_FEATURE_UNITS.md) — Feature inventory with compliance notes
- [`docs/specs/MVP_EXECUTION_PLAN.md`](./MVP_EXECUTION_PLAN.md) — Execution sequence with overwrite instructions

**Updated Schema Documents:**
- [`docs/specs/FUNCTIONAL_REQUIREMENTS.md`](./FUNCTIONAL_REQUIREMENTS.md) — Tier 1 ICP schema types
- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Schema examples with Tier 1 ICP use cases
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Rule-based detection patterns

---

**Status:** All MVP planning documents now align with NEOTOMA_MANIFEST.md. Implementation overwrites will occur during Feature Unit execution.




