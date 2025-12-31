# Implementation Decision Log: FU-100
**Generated:** 2025-12-14T05:55:55.293Z
## Overview
This log documents implementation decisions made for FU-100 and how each requirement from the specification was addressed.
## Implementation Decisions
### Decision 1: Rule-based schema detection (regex patterns per schema type)
**Requirement:** Rule-based schema detection (regex patterns per schema type)
**Location:** Neotoma MVP Feature Units — Execution Plan > Execution Order and Dependencies > Phase 1: Core Services (Domain Layer) > FU-100: File Analysis Service, line 345
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 2: Rule-based field extraction (regex parsers per schema)
**Requirement:** Rule-based field extraction (regex parsers per schema)
**Location:** Neotoma MVP Feature Units — Execution Plan > Execution Order and Dependencies > Phase 1: Core Services (Domain Layer) > FU-100: File Analysis Service, line 346
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 3: PDFDocument fallback (not custom sanitized types)
**Requirement:** PDFDocument fallback (not custom sanitized types)
**Location:** Neotoma MVP Feature Units — Execution Plan > Execution Order and Dependencies > Phase 1: Core Services (Domain Layer) > FU-100: File Analysis Service, line 347
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 4: code changes to comply with manifest**
**Requirement:** code changes to comply with manifest**
**Location:** Neotoma MVP Feature Units — Execution Plan > Detailed Documentation References, line 1789
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 5: Assign type deterministically (same raw_text → same type)
**Requirement:** Assign type deterministically (same raw_text → same type)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 991
**Type:** must
**Category:** integration
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 6: Use multi-pattern matching (2+ patterns for non-fallback typ...
**Requirement:** Use multi-pattern matching (2+ patterns for non-fallback types)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 992
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 7: Fallback to `document` if no type matches 2+ patterns
**Requirement:** Fallback to `document` if no type matches 2+ patterns
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 993
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 8: Never change type after initial assignment (immutable)
**Requirement:** Never change type after initial assignment (immutable)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 994
**Type:** must
**Category:** database
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 9: Use LLM for type detection (MVP constraint)
**Requirement:** Use LLM for type detection (MVP constraint)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 998
**Type:** must_not
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 10: Guess type based on filename only
**Requirement:** Guess type based on filename only
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 999
**Type:** must_not
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 11: Assign custom types not in this catalog
**Requirement:** Assign custom types not in this catalog
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 1000
**Type:** must_not
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 12: Extract only fields defined for assigned type into `properti...
**Requirement:** Extract only fields defined for assigned type into `properties`
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1006
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 13: Store unknown fields (not defined in schema) in `extraction_...
**Requirement:** Store unknown fields (not defined in schema) in `extraction_metadata.unknown_fields`
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1007
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 14: Use deterministic extraction (regex, parsing; no LLM in MVP)
**Requirement:** Use deterministic extraction (regex, parsing; no LLM in MVP)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1008
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 15: Validate extracted values (e.g., dates must be parseable)
**Requirement:** Validate extracted values (e.g., dates must be parseable)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1009
**Type:** must
**Category:** validation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 16: Include `schema_version: "1.0"` in all JSONB properties
**Requirement:** Include `schema_version: "1.0"` in all JSONB properties
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1010
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 17: Always create record (never reject entire record due to unkn...
**Requirement:** Always create record (never reject entire record due to unknown or missing fields)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1011
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 18: Log warnings for filtered unknown fields in `extraction_meta...
**Requirement:** Log warnings for filtered unknown fields in `extraction_metadata.warnings`
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1012
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 19: Log warnings for missing required fields in `extraction_meta...
**Requirement:** Log warnings for missing required fields in `extraction_metadata.warnings`
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1013
**Type:** must
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 20: Store unknown fields in `properties` (must go to `extraction...
**Requirement:** Store unknown fields in `properties` (must go to `extraction_metadata.unknown_fields`)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1017
**Type:** must_not
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 21: Reject records due to unknown fields
**Requirement:** Reject records due to unknown fields
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1018
**Type:** must_not
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 22: Reject records due to missing optional fields
**Requirement:** Reject records due to missing optional fields
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1019
**Type:** must_not
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 23: Infer fields not present in raw_text
**Requirement:** Infer fields not present in raw_text
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1020
**Type:** must_not
**Category:** implementation
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
### Decision 24: Modify extracted fields after initial extraction (immutable)
**Requirement:** Modify extracted fields after initial extraction (immutable)
**Location:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1021
**Type:** must_not
**Category:** database
**Implementation approach:** [To be filled during implementation]
**Files changed:** [To be filled during implementation]
**Code references:** [To be filled during implementation]
**Verification:** [To be filled during compliance check]
**Status:** ⏳ Pending
## Summary
- **Total Requirements:** 24
- **Implemented:** 0
- **Partially Implemented:** 0
- **Not Implemented:** 24
- **Deferred:** 0
