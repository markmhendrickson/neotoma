# FU-100 Compliance Report

**Generated:** 2025-12-14T05:55:55.634Z

## Summary

- **Total Requirements:** 24
- **✅ Passed:** 14
- **❌ Failed:** 10
- **Compliance Rate:** 58.3%

## Requirements Status

| Requirement | Location | Status | Evidence | Gap |
|------------|----------|--------|----------|-----|
| Rule-based schema detection (regex patterns per schema type) | Neotoma MVP Feature Units — Execution Plan > Execution Order and Dependencies > Phase 1: Core Services (Domain Layer) > FU-100: File Analysis Service | ✅ Pass | src/__fixtures__/helpers.ts:      schema_version: "1.0",; src/__fixtures__/helpers.ts:      schema_version: "1.0", | - |
| Rule-based field extraction (regex parsers per schema) | Neotoma MVP Feature Units — Execution Plan > Execution Order and Dependencies > Phase 1: Core Services (Domain Layer) > FU-100: File Analysis Service | ✅ Pass | src/__fixtures__/validation.ts: * Validate fixture has required schema_version field; src/__fixtures__/validation.ts:    errors.push("Missing or invalid schema_version field"); | - |
| PDFDocument fallback (not custom sanitized types) | Neotoma MVP Feature Units — Execution Plan > Execution Order and Dependencies > Phase 1: Core Services (Domain Layer) > FU-100: File Analysis Service | ✅ Pass | src/config/plaid.ts:function parseCommaSeparated(value: string | undefined, fallback: string[]): string[] {; src/config/plaid.ts:  if (!value) return fallback; | - |
| code changes to comply with manifest** | Neotoma MVP Feature Units — Execution Plan > Detailed Documentation References | ❌ Fail | - | Required but not found in codebase. Expected: code changes to comply with manifest** |
| Assign type deterministically (same raw_text → same type) | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation | ❌ Fail | - | Required but not found in codebase. Expected: Assign type deterministically (same raw_text → same type) |
| Use multi-pattern matching (2+ patterns for non-fallback types) | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation | ❌ Fail | - | Required but not found in codebase. Expected: Use multi-pattern matching (2+ patterns for non-fallback types) |
| Fallback to `document` if no type matches 2+ patterns | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation | ❌ Fail | - | Required but not found in codebase. Expected: Fallback to `document` if no type matches 2+ patterns |
| Never change type after initial assignment (immutable) | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation | ❌ Fail | - | Required but not found in codebase. Expected: Never change type after initial assignment (immutable) |
| Use LLM for type detection (MVP constraint) | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation | ❌ Fail | - | Required but not found in codebase. Expected: Use LLM for type detection (MVP constraint) |
| Guess type based on filename only | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation | ✅ Pass | src/services/entity_resolution.ts:  // Extract based on schema type; src/services/file_analysis.ts: * Analyze file using rule-based extraction (FU-100) | - |
| Assign custom types not in this catalog | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation | ✅ Pass | src/__fixtures__/helpers.ts: * Provides helper functions to generate fixture records for all record types; src/__fixtures__/types.ts: * Defines types for all fixture structures to ensure type safety. | - |
| Extract only fields defined for assigned type into `properties` | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/validation.ts:      if (fixture.gain_loss_usd === undefined); src/__fixtures__/validation.ts:      // Contract has optional required fields | - |
| Store unknown fields (not defined in schema) in `extraction_metadata.unknown_... | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/helpers.ts:  defaults: Record<string, unknown>,; src/__fixtures__/helpers.ts:  overrides?: Partial<Record<string, unknown>> | - |
| Use deterministic extraction (regex, parsing; no LLM in MVP) | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ❌ Fail | - | Required but not found in codebase. Expected: Use deterministic extraction (regex, parsing; no LLM in MVP) |
| Validate extracted values (e.g., dates must be parseable) | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ❌ Fail | - | Required but not found in codebase. Expected: Validate extracted values (e.g., dates must be parseable) |
| Include `schema_version: "1.0"` in all JSONB properties | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ❌ Fail | - | Required but not found in codebase. Expected: Include `schema_version: "1.0"` in all JSONB properties |
| Always create record (never reject entire record due to unknown or missing fi... | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/helpers.ts: * Provides helper functions to generate fixture records for all record types; src/__fixtures__/helpers.ts:function createFixture( | - |
| Log warnings for filtered unknown fields in `extraction_metadata.warnings` | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/helpers.ts:  defaults: Record<string, unknown>,; src/__fixtures__/helpers.ts:  overrides?: Partial<Record<string, unknown>> | - |
| Log warnings for missing required fields in `extraction_metadata.warnings` | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/validation.ts:      // Contract has optional required fields; src/crypto/envelope.ts: * Serialize envelope for signing (excludes signature fields) | - |
| Store unknown fields in `properties` (must go to `extraction_metadata.unknown... | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/helpers.ts:  defaults: Record<string, unknown>,; src/__fixtures__/helpers.ts:  overrides?: Partial<Record<string, unknown>> | - |
| Reject records due to unknown fields | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/helpers.ts: * Provides helper functions to generate fixture records for all record types; src/__fixtures__/helpers.ts:  defaults: Record<string, unknown>, | - |
| Reject records due to missing optional fields | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/helpers.ts: * Provides helper functions to generate fixture records for all record types; src/config/record_types.ts:    description: "People and organization records.", | - |
| Infer fields not present in raw_text | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ✅ Pass | src/__fixtures__/validation.ts:      // Contract has optional required fields; src/config/plaid.ts:export type PlaidEnvironment = z.infer<typeof plaidEnvSchema>; | - |
| Modify extracted fields after initial extraction (immutable) | Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation | ❌ Fail | - | Required but not found in codebase. Expected: Modify extracted fields after initial extraction (immutable) |

## Implementation Gaps

1. **Critical Gap:** code changes to comply with manifest**
   - **Requirement:** Neotoma MVP Feature Units — Execution Plan > Detailed Documentation References, line 1789
   - **Current:** Not implemented
   - **Required:** code changes to comply with manifest**
   - **Files to modify:** [To be determined based on requirement]

2. **Critical Gap:** Assign type deterministically (same raw_text → same type)
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 991
   - **Current:** Not implemented
   - **Required:** Assign type deterministically (same raw_text → same type)
   - **Files to modify:** [To be determined based on requirement]

3. **Critical Gap:** Use multi-pattern matching (2+ patterns for non-fallback typ...
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 992
   - **Current:** Not implemented
   - **Required:** Use multi-pattern matching (2+ patterns for non-fallback types)
   - **Files to modify:** [To be determined based on requirement]

4. **Critical Gap:** Fallback to `document` if no type matches 2+ patterns
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 993
   - **Current:** Not implemented
   - **Required:** Fallback to `document` if no type matches 2+ patterns
   - **Files to modify:** [To be determined based on requirement]

5. **Critical Gap:** Never change type after initial assignment (immutable)
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 994
   - **Current:** Not implemented
   - **Required:** Never change type after initial assignment (immutable)
   - **Files to modify:** [To be determined based on requirement]

6. **Critical Gap:** Use LLM for type detection (MVP constraint)
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.1 Type Assignment Validation, line 998
   - **Current:** Not implemented
   - **Required:** Use LLM for type detection (MVP constraint)
   - **Files to modify:** [To be determined based on requirement]

7. **Critical Gap:** Use deterministic extraction (regex, parsing; no LLM in MVP)
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1008
   - **Current:** Not implemented
   - **Required:** Use deterministic extraction (regex, parsing; no LLM in MVP)
   - **Files to modify:** [To be determined based on requirement]

8. **Critical Gap:** Validate extracted values (e.g., dates must be parseable)
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1009
   - **Current:** Not implemented
   - **Required:** Validate extracted values (e.g., dates must be parseable)
   - **Files to modify:** [To be determined based on requirement]

9. **Critical Gap:** Include `schema_version: "1.0"` in all JSONB properties
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1010
   - **Current:** Not implemented
   - **Required:** Include `schema_version: "1.0"` in all JSONB properties
   - **Files to modify:** [To be determined based on requirement]

10. **Critical Gap:** Modify extracted fields after initial extraction (immutable)
   - **Requirement:** Neotoma Record Types — Canonical Type Catalog > 10. Validation Rules > 10.2 Field Extraction Validation, line 1021
   - **Current:** Not implemented
   - **Required:** Modify extracted fields after initial extraction (immutable)
   - **Files to modify:** [To be determined based on requirement]


## Recommendations

The following requirements need to be implemented before FU-100 can be marked as complete:

- code changes to comply with manifest**
- Assign type deterministically (same raw_text → same type)
- Use multi-pattern matching (2+ patterns for non-fallback types)
- Fallback to `document` if no type matches 2+ patterns
- Never change type after initial assignment (immutable)
- Use LLM for type detection (MVP constraint)
- Use deterministic extraction (regex, parsing; no LLM in MVP)
- Validate extracted values (e.g., dates must be parseable)
- Include `schema_version: "1.0"` in all JSONB properties
- Modify extracted fields after initial extraction (immutable)


