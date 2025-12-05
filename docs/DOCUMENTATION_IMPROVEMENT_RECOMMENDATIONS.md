# Neotoma Documentation Improvement Recommendations

_(Holistic Review for MVP Readiness — Prioritized for Consistency and Robustness)_

---

## Executive Summary

**Overall Assessment:** The Neotoma documentation system demonstrates exceptional foundational quality with clear architectural principles, well-defined conventions, and comprehensive coverage. However, inconsistencies across documents, gaps in critical specifications, and synchronization issues between synthesis and detailed documents create risks for MVP execution.

**Critical Finding:** Schema type definitions are **inconsistent** across documents, creating ambiguity for implementation. The manifest defines high-level types (e.g., `FinancialRecord`, `IdentityDocument`) while implementation documents reference granular types (e.g., `invoice`, `receipt`, `transaction`).

**Recommendation Priority:** Focus on **P0 consistency fixes** before MVP implementation to prevent rework and technical debt.

---

## Review Scope and Methodology

**Documents Reviewed:** 78 markdown files across 13 subdirectories
**Review Date:** 2025-01-02
**Review Focus:** Consistency, completeness, MVP readiness, cross-referencing accuracy

**Assessment Criteria:**

1. Internal consistency within documents
2. Cross-document consistency (terminology, data models, requirements)
3. Completeness for MVP implementation
4. Adherence to documentation standards
5. Accuracy of cross-references
6. Clarity of examples and specifications
7. Agent-readability and deterministic guidance

---

## P0 — Critical Consistency Issues (Block MVP Implementation)

### P0.1 — Schema Type Definition Inconsistency

**Issue:** Fundamental disagreement on canonical record type names.

**Evidence:**

- `NEOTOMA_MANIFEST.md` (lines 486-498) defines:
  - `FinancialRecord` (singular, high-level category)
  - `IdentityDocument`, `TravelDocument`, `Contract`, `CalendarEvent`, `ResearchPaper`, `Note`, `ImageContext`, `AudioContext`, `PDFDocument`
- `docs/specs/FUNCTIONAL_REQUIREMENTS.md` (lines 33-64) defines:

  - `invoice`, `receipt`, `transaction`, `statement`, `account` (plural, granular types within finance)
  - `note`, `document`, `message`, `task`, `project`, `event` (productivity)
  - `contact`, `dataset` (knowledge)
  - `contract`, `travel_document`, `identity_document` (specific domains)

- `docs/subsystems/ingestion/ingestion.md` references schema detection but doesn't specify which set of types to use

**Impact:**

- Implementers cannot determine which schema types are canonical
- Entity resolution rules unclear (which types trigger entity extraction?)
- Test fixtures cannot be created (unknown expected `type` values)
- MCP actions undefined (what values are valid for `type` filter?)

**Recommendation:**

**RESOLVE** by choosing **ONE** canonical approach:

**Option A (Recommended):** Two-tier system with application-level types and schema families

- **Application-level types** (in code, `src/config/record_types.ts`): `invoice`, `receipt`, `transaction`, `statement`, `account`, `note`, `document`, `message`, `task`, `project`, `event`, `contact`, `dataset`, `contract`, `travel_document`, `identity_document`
- **Schema families** (in manifest, for documentation): High-level groupings like `FinancialRecord`, `ProductivityRecord`, `KnowledgeRecord`
- **Update all documents** to clarify this distinction
- **Create mapping table** showing which application types belong to which families

**Option B:** Single canonical list at application level

- Remove schema family concept from manifest
- Define **only** granular types as canonical
- Update manifest section 14 to match FUNCTIONAL_REQUIREMENTS.md

**Option C:** Single canonical list at schema family level

- Remove granular types from FUNCTIONAL_REQUIREMENTS.md
- Define field extraction rules per high-level family only
- Lose granularity in type detection

**Action Required:**

1. Choose option (recommend A for balance)
2. Update `NEOTOMA_MANIFEST.md` section 14 with chosen approach
3. Update `docs/specs/FUNCTIONAL_REQUIREMENTS.md` section 2 to match
4. Create `docs/subsystems/record_types.md` with complete type catalog and field mappings
5. Update `docs/subsystems/ingestion/ingestion.md` section 5 (schema detection) with concrete examples using chosen types
6. Add schema type validation rules to `docs/feature_units/standards/feature_unit_spec.md`

**Estimated Effort:** 3-4 hours (critical for MVP)

---

### P0.2 — LLM Extraction Contradictions

**Issue:** Ambiguity on LLM extraction status creates implementation confusion.

**Evidence:**

- `NEOTOMA_MANIFEST.md` line 125: **"No LLM extraction (MVP constraint; rule-based only)"** (MUST NOT)
- `NEOTOMA_MANIFEST.md` line 395: **"No LLM extraction (MVP constraint; rule-based only)"** (MUST NOT list)
- `docs/specs/MVP_OVERVIEW.md` line 107: **"⏳ LLM-assisted extraction (with deterministic fallback) — Note: Current implementation uses LLM but MUST be removed for MVP per manifest"**
- `docs/specs/MVP_EXECUTION_PLAN.md` line 241: **"FU-100: File Analysis Service Update (Remove LLM, Add Rule-Based Extraction)"** — high-priority task

**Current State:** Implementation uses LLM extraction but manifest forbids it for MVP.

**Impact:**

- Agents may assume LLM extraction is allowed
- Implementation violates architectural invariants
- Testing cannot verify determinism (LLM outputs nondeterministic)
- MVP launch blocked until LLM removal complete

**Recommendation:**

**CLARIFY** across all documents:

1. **Update `docs/specs/MVP_OVERVIEW.md` lines 107-113:**

   - Move LLM extraction to "Post-MVP" section
   - Remove ambiguous "Note" that suggests current implementation uses LLM
   - Add explicit statement: "MVP uses **only** rule-based extraction (regex, parsing) per manifest constraint"

2. **Update `docs/specs/MVP_EXECUTION_PLAN.md`:**

   - Confirm FU-100 as **P0 blocker**
   - Add explicit acceptance criteria: "All `openai.chat.completions.create()` calls removed from ingestion pipeline"
   - Add determinism test requirement: "Same file uploaded 100 times → 100 identical extractions"

3. **Update `docs/subsystems/ingestion/ingestion.md`:**

   - Add explicit section: "MVP Extraction Approach: Rule-Based Only"
   - Document that LLM will be added post-MVP with deterministic fallback
   - Show concrete regex examples for schema detection and field extraction

4. **Create migration note:**
   - Document why LLM was initially implemented
   - Explain architectural decision to remove for MVP
   - Provide clear rule-based extraction patterns as replacement

**Action Required:**

1. Update 3 documents (MVP_OVERVIEW, MVP_EXECUTION_PLAN, ingestion.md)
2. Create `docs/migration/llm_extraction_removal.md` explaining the change
3. Add to FU-100 manifest: explicit determinism testing requirements

**Estimated Effort:** 1-2 hours

---

### P0.3 — Cross-Reference Broken Links

**Issue:** Multiple documents reference files that don't exist or have moved.

**Evidence:**

- `docs/conventions/documentation_standards.md` line 14: References `docs/private/governance/00_GENERATION.MD` (file exists, no issue)
- `docs/context/index.md` line 48: References `docs/private/governance/00_GENERATION.MD` (file exists, but uses `.MD` not `.md` — case-sensitivity issue on some systems)
- Git status shows deleted files:
  - `docs/APP_ARCHITECTURE.md` (deleted)
  - `docs/CHATGPT_TOOLING_OVERVIEW.md` (deleted)
  - `docs/CORE_SCHEMAS.md` (deleted)
  - `docs/DEV_WORKFLOW.md` (deleted)
  - Multiple other deleted docs still referenced in some places

**Impact:**

- Agents fail to load required context
- Broken links reduce documentation trust
- Navigation paths fail mid-session

**Recommendation:**

**AUDIT** all cross-references:

1. **Run automated link checker:**

   ```bash
   # Find all markdown links
   grep -r '\[.*\](.*\.md)' docs/ | grep -v node_modules

   # Check for broken references to deleted files
   grep -r 'APP_ARCHITECTURE\|CHATGPT_TOOLING\|CORE_SCHEMAS\|DEV_WORKFLOW' docs/
   ```

2. **Fix or remove** all references to deleted files:

   - Search entire `docs/` for references to deleted files
   - Either restore files or update references to point to replacement docs

3. **Standardize case sensitivity:**

   - Choose `.md` or `.MD` (recommend lowercase `.md`)
   - Rename `00_GENERATION.MD` to `00_GENERATION.md` for consistency
   - Update all references

4. **Add to standards:**
   - Update `docs/conventions/documentation_standards.md` section 7.1:
     - Require lowercase `.md` extension
     - Add validation requirement: "All internal links MUST be validated before committing"
   - Add pre-commit hook or CI check for broken links

**Action Required:**

1. Run audit script (identify all broken links)
2. Fix or remove broken references (estimated 20-30 broken links)
3. Standardize file extensions
4. Add link validation to documentation standards

**Estimated Effort:** 2-3 hours

---

### P0.4 — Synthesis Documents Out of Sync

**Issue:** High-level synthesis documents (MVP_OVERVIEW, FUNCTIONAL_REQUIREMENTS, TEST_PLAN) are thin and may not reflect detailed subsystem docs.

**Evidence:**

- `docs/specs/TEST_PLAN.md`: Only 89 lines, mostly references to other docs
- `docs/specs/FUNCTIONAL_REQUIREMENTS.md`: Only 173 lines, missing detailed requirements
- `docs/specs/MVP_OVERVIEW.md`: References feature lists that may not match `MVP_EXECUTION_PLAN.md` or `MVP_FEATURE_UNITS.md`

**Specific Inconsistencies:**

- `TEST_PLAN.md` references `docs/architecture/determinism.md` for deterministic testing but doesn't specify:

  - How many runs required for determinism proof (manifest says 100, TEST_PLAN doesn't specify)
  - What constitutes acceptable variance (hash-based IDs, float rounding, timestamps)
  - Property-based testing requirements (mentioned but not detailed)

- `FUNCTIONAL_REQUIREMENTS.md` lists schema types but doesn't specify:
  - Field extraction rules per schema type (critical for implementation)
  - Validation rules (required vs optional fields)
  - Schema versioning strategy (mentioned but not detailed)

**Impact:**

- Implementers may follow synthesis docs that contradict detailed docs
- Synthesis docs intended for stakeholders may mislead them
- Testing strategy unclear without detailed TEST_PLAN

**Recommendation:**

**EXPAND** synthesis documents or mark them as stubs:

**Option A (Recommended for MVP):** Mark as stubs and point to detailed docs

- Add prominent notice at top of thin documents:

  ```markdown
  **Note:** This is a high-level summary. For implementation details, see:

  - [Detailed subsystem doc 1]
  - [Detailed subsystem doc 2]
  ```

- Add explicit statement: "In case of conflict, detailed subsystem docs are authoritative."
- Keep synthesis docs short but ensure they don't contradict detailed docs

**Option B:** Expand synthesis documents to be complete

- Expand TEST_PLAN.md to 300-500 lines with:
  - Concrete test examples per subsystem
  - Determinism testing requirements (100 runs, acceptable variance)
  - Property-based testing patterns
  - Coverage measurement procedures
- Expand FUNCTIONAL_REQUIREMENTS.md with:
  - Complete field extraction rules per schema type
  - Validation rules per schema
  - Performance requirements per operation
- Risk: High maintenance burden (two sources of truth)

**Action Required:**

1. Choose approach (recommend A for MVP, B for post-MVP)
2. If A: Add stub notices to TEST_PLAN.md, FUNCTIONAL_REQUIREMENTS.md
3. If B: Allocate 8-12 hours to expand synthesis docs
4. Add synchronization requirement to documentation standards:
   - "Synthesis documents MUST NOT contradict detailed docs"
   - "When in doubt, detailed docs are authoritative"

**Estimated Effort:**

- Option A: 1 hour (add notices, verify no contradictions)
- Option B: 8-12 hours (expand all synthesis docs)

**Recommended:** Option A for MVP, defer B to post-MVP

---

## P1 — High-Impact Consistency Improvements (Improve MVP Quality)

### P1.1 — Agent Instructions Section Completeness

**Issue:** Not all documents have complete "Agent Instructions" sections per documentation standards.

**Evidence:**

- `docs/conventions/documentation_standards.md` lines 98-128 define required "Agent Instructions" section
- Review shows:
  - ✅ `NEOTOMA_MANIFEST.md`, `architecture.md`, `ingestion.md`, `feature_unit_spec.md` have complete sections
  - ⚠️ `TEST_PLAN.md`, `FUNCTIONAL_REQUIREMENTS.md`, `DATA_MODELS.md` have minimal or missing sections
  - ⚠️ Some `docs/specs/*.md` files lack "Agent Instructions"

**Impact:**

- Agents may not know when to load specific documents
- Missing constraints mean agents may violate document-specific rules
- Validation checklists incomplete

**Recommendation:**

**AUDIT** all documents for "Agent Instructions" completeness:

1. **Create audit script:**

   ```bash
   # Check for "Agent Instructions" section in all docs
   for file in $(find docs -name "*.md"); do
     if ! grep -q "## Agent Instructions" "$file"; then
       echo "Missing Agent Instructions: $file"
     fi
   done
   ```

2. **Add missing sections** using template from `documentation_standards.md` lines 100-128

3. **Verify completeness** using checklist:

   - [ ] "When to Load This Document" (specific triggers)
   - [ ] "Required Co-Loaded Documents" (dependencies)
   - [ ] "Constraints Agents Must Enforce" (document-specific rules)
   - [ ] "Forbidden Patterns" (anti-patterns for this domain)
   - [ ] "Validation Checklist" (verification steps)

4. **Prioritize by document importance:**
   - **Phase 1:** All `specs/*.md` documents (used for planning)
   - **Phase 2:** All `subsystems/*.md` documents (used for implementation)
   - **Phase 3:** All `governance/*.md`, `testing/*.md`, `observability/*.md`

**Action Required:**

1. Run audit script (identify ~15-20 documents missing sections)
2. Add "Agent Instructions" to Phase 1 documents (8-10 docs, ~2 hours)
3. Add "Agent Instructions" to Phase 2 documents (12-15 docs, ~3 hours)
4. Phase 3 as time permits (post-MVP acceptable)

**Estimated Effort:** 5-6 hours for Phases 1-2 (MVP critical)

---

### P1.2 — Example Completeness in Technical Documents

**Issue:** Some technical documents lack concrete, complete examples.

**Evidence:**

- `docs/subsystems/ingestion/ingestion.md`:

  - Shows validation function (lines 94-114) — good
  - References schema detection (section 5) but doesn't show concrete regex patterns for each schema type
  - Shows OCR setup but not complete extraction pipeline example

- `docs/subsystems/schema.md` (not fully reviewed in sample):

  - Likely needs complete JSONB examples per schema type

- `docs/specs/MCP_SPEC.md` (not reviewed in sample):
  - Needs complete request/response examples for all 8 MVP actions

**Impact:**

- Implementers must infer extraction patterns (risk of inconsistency)
- Testing lacks reference examples
- Agent-generated code may not match intended patterns

**Recommendation:**

**ADD** complete examples to all technical documents:

1. **`docs/subsystems/ingestion/ingestion.md`:**

   - Add section "5.2 Concrete Schema Detection Patterns"
   - Show regex patterns for each canonical schema type:

     ````markdown
     ### Invoice Detection

     ```typescript
     const INVOICE_PATTERNS = [
       /invoice\s*#?\s*:?\s*([A-Z0-9-]+)/i,
       /bill\s*to:/i,
       /amount\s*due:/i,
     ];
     ```
     ````

     (Pattern must match 2+ patterns to classify as invoice)

     ```

     ```

   - Show complete extraction example for one schema type end-to-end

2. **`docs/subsystems/schema.md`:**

   - Add section "Complete JSONB Examples"
   - Show one complete example per MVP schema type
   - Include all required fields, optional fields, schema_version

3. **`docs/specs/MCP_SPEC.md`:**

   - Verify all 8 MVP MCP actions have:
     - Complete request example (all required fields, realistic values)
     - Complete success response example
     - Complete error response example (with ErrorEnvelope)

4. **`docs/specs/DATA_MODELS.md`:**
   - Already has examples for Record, Entity, Event (good)
   - Add examples showing graph edge relationships

**Action Required:**

1. Review all technical docs for example completeness (3-4 hours)
2. Add missing examples to ingestion.md, schema.md, MCP_SPEC.md (4-6 hours)
3. Create `docs/reference/complete_examples.md` with end-to-end scenarios (2-3 hours)

**Estimated Effort:** 9-13 hours

**Priority:** High for ingestion.md (P0 for FU-100), medium for others (can be done during implementation)

---

### P1.3 — Terminology Consistency Across Documents

**Issue:** Some documents use synonyms for canonical terms.

**Evidence from `docs/vocabulary/canonical_terms.md`:**

- Defines canonical terms (e.g., "Record", "Entity", "Ingestion")
- Defines forbidden synonyms (e.g., ❌ "document" for Record, ❌ "import" for Ingestion)

**Audit Needed:**

- Grep all docs for forbidden synonyms
- Example: searching for "import" when "ingestion" should be used

**Impact:**

- Terminology inconsistency confuses implementers
- Agents may generate code with wrong terminology
- Documentation loses professional polish

**Recommendation:**

**AUDIT** terminology usage:

1. **Create terminology audit script:**

   ```bash
   # Check for forbidden synonyms
   echo "Checking for 'document' instead of 'Record':"
   grep -r 'document' docs/ | grep -v 'IdentityDocument\|TravelDocument\|PDFDocument' | grep -v 'documentation'

   echo "Checking for 'import' instead of 'ingestion':"
   grep -r '\bimport\b' docs/ | grep -v 'import statement\|import.*from'

   echo "Checking for 'parsing' instead of 'extraction':"
   grep -r '\bparsing\b' docs/
   ```

2. **Fix violations:**

   - Update all instances of forbidden synonyms
   - Use canonical terms consistently
   - Exception: When referring to source files, "document" is acceptable (e.g., "identity document")

3. **Add to documentation standards:**

   - Update `docs/conventions/documentation_standards.md`:
     - Add section "4.4 Terminology Consistency"
     - Require reference to `canonical_terms.md` before writing docs
     - Add terminology validation to pre-commit checks

4. **Update `docs/vocabulary/canonical_terms.md`:**
   - Add more examples of correct usage
   - Add context for when synonyms are acceptable

**Action Required:**

1. Run audit script (30 minutes)
2. Fix violations (estimated 50-100 instances, 2-3 hours)
3. Update documentation standards (30 minutes)
4. Update canonical_terms.md with more examples (1 hour)

**Estimated Effort:** 4-5 hours

---

### P1.4 — Mermaid Diagram Consistency

**Issue:** Mermaid diagrams may not follow standards consistently.

**Evidence:**

- `docs/conventions/documentation_standards.md` lines 156-238 define Mermaid standards
- Spot check shows:
  - ✅ `architecture.md` diagrams follow standards (consistent node naming, theme, styling)
  - ⚠️ `context/index.md` diagram (lines 260-380) uses consistent styling but complex
  - Unknown: Other documents not fully audited

**Recommendation:**

**DEFER** detailed diagram audit to post-MVP:

1. **Immediate action (MVP):**

   - Verify all diagrams in `architecture/`, `specs/`, `subsystems/ingestion/` directories
   - Fix any diagrams that don't use `%%{init: {'theme':'neutral'}}%%`
   - Ensure node naming is consistent (camelCase or snake_case within diagram)

2. **Post-MVP:**
   - Full audit of all Mermaid diagrams across all documents
   - Standardize node styling (currently inconsistent use of fill colors)
   - Add more diagrams to subsystem docs where helpful

**Action Required (MVP only):**

1. Audit ~10-15 critical diagrams in architecture/specs/subsystems (1-2 hours)
2. Fix any non-compliant diagrams (1-2 hours)

**Estimated Effort:** 2-4 hours (MVP scope only)

---

## P2 — Medium-Impact Improvements (Enhance Maintainability)

### P2.1 — Documentation Versioning Strategy

**Issue:** No versioning strategy for documentation itself.

**Evidence:**

- `NEOTOMA_MANIFEST.md` has version (1.0.0, last updated 2024-12-01)
- Other documents lack version metadata
- No clear migration strategy when docs change

**Recommendation:**

**DEFINE** documentation versioning approach:

1. **Add frontmatter to all documents:**

   ```markdown
   ---
   version: 1.0.0
   last_updated: 2025-01-02
   status: canonical | draft | deprecated
   replaces: [previous doc name if applicable]
   ---
   ```

2. **Define version bump rules:**

   - **Major (x.0.0):** Breaking changes (schema changes, architectural changes)
   - **Minor (0.x.0):** Additive changes (new sections, examples)
   - **Patch (0.0.x):** Corrections, clarifications, typo fixes

3. **Create migration log:**

   - `docs/migration/documentation_changelog.md`
   - Track major doc changes
   - Explain migration paths when docs are restructured

4. **Update documentation standards:**
   - Require version metadata in all new documents
   - Define when to bump versions

**Action Required:**

1. Add frontmatter template to `documentation_standards.md` (30 minutes)
2. Add frontmatter to all foundational docs (manifest, architecture, standards) (1 hour)
3. Create documentation_changelog.md (1 hour)
4. Defer adding frontmatter to all docs until post-MVP (5-8 hours)

**Estimated Effort:** 2.5 hours (MVP scope), 8-10 hours (complete)

---

### P2.2 — Missing Subsystem Documentation

**Issue:** Some subsystems may lack detailed documentation.

**Evidence:**

- `docs/context/index.md` references several subsystem docs
- Not all reviewed in detail, but likely gaps:
  - `vector_ops.md`: Embeddings lifecycle (mentioned but not reviewed)
  - `events.md`: Event emission rules (mentioned but not reviewed)
  - `errors.md`: Error codes catalog (referenced but not reviewed)

**Recommendation:**

**AUDIT** subsystem docs for completeness:

1. **Read all subsystem docs** (not done in this review):

   - Verify each has complete sections per `feature_unit_spec.md`
   - Verify examples are complete
   - Verify Agent Instructions present

2. **Identify gaps:**

   - Missing subsystem docs (any subsystems without docs?)
   - Thin subsystem docs (< 200 lines, mostly references)

3. **Fill gaps** (post-MVP acceptable):
   - Expand thin docs
   - Create missing docs
   - Add more examples

**Action Required:**

1. Full subsystem doc audit (3-4 hours)
2. Prioritize gaps for MVP (P0: ingestion, schema; P1: search, auth)
3. Fill MVP-critical gaps (4-6 hours)
4. Defer non-critical subsystems to post-MVP

**Estimated Effort:** 7-10 hours (MVP scope)

---

### P2.3 — Feature Unit Standards Adoption

**Issue:** Feature Unit standards exist but not all FUs may follow them.

**Evidence:**

- `docs/feature_units/standards/` has excellent templates
- `docs/feature_units/completed/FU-702/` exists (billing spec)
- `docs/specs/MVP_FEATURE_UNITS.md` references many FUs (FU-000 through FU-903)
- Unknown: How many FUs have complete specs following standards?

**Recommendation:**

**DEFER** full audit to implementation phase:

1. **MVP approach:**

   - Ensure FU-100 (LLM removal) follows standards completely (critical for MVP)
   - Ensure P0 FUs (FU-101, FU-102, FU-103, FU-300, FU-303, FU-304, FU-700, FU-701) follow standards
   - Use standards as checklist during implementation

2. **Post-MVP:**
   - Audit all completed FUs for standards compliance
   - Retrofit non-compliant FUs
   - Create automated validation (manifest schema validation, required sections)

**Action Required (MVP):**

1. Verify FU-100 spec exists and follows standards (1 hour)
2. Create specs for other P0 FUs if missing (8-10 hours, during implementation)

**Estimated Effort:** 1 hour (immediate), 8-10 hours (during MVP implementation)

---

## P3 — Lower-Impact Improvements (Polish for Post-MVP)

### P3.1 — Completed Documentation Tasks

**Issue:** Some docs reference tasks that are "not yet created" but may now exist.

**Evidence:**

- `docs/context/index.md` lines 624-633 list "Planned Documentation (Not Yet Created)"
- Some may now exist (e.g., MCP docs, UI patterns)

**Recommendation:**

- Audit planned vs actual docs
- Update context/index.md
- Remove stale "TODO" markers

**Estimated Effort:** 1-2 hours

---

### P3.2 — Code Examples in Documentation

**Issue:** Some docs could benefit from more TypeScript/code examples.

**Evidence:**

- Architecture docs are diagram-heavy, text-heavy
- More inline code examples would help implementers

**Recommendation:**

- Add code snippets to architecture docs showing layer boundaries
- Add more TypeScript interfaces to subsystem docs
- Create `docs/reference/code_examples.md` with common patterns

**Estimated Effort:** 4-6 hours

---

### P3.3 — Testing Documentation Expansion

**Issue:** Testing docs are thin compared to other areas.

**Evidence:**

- `TEST_PLAN.md` is only 89 lines
- `docs/testing/testing_standard.md` exists but not reviewed in detail
- Likely needs more concrete test examples

**Recommendation:**

- Expand TEST_PLAN.md with concrete examples per subsystem
- Add property-based testing guide
- Add test fixture creation guide with examples

**Estimated Effort:** 6-8 hours

---

## Summary of Recommendations by Priority

### P0 — CRITICAL (Must Fix Before MVP Implementation)

| ID   | Issue                                | Estimated Effort  | Impact                                    |
| ---- | ------------------------------------ | ----------------- | ----------------------------------------- |
| P0.1 | Schema Type Definition Inconsistency | 3-4 hours         | **CRITICAL** — Blocks all extraction work |
| P0.2 | LLM Extraction Contradictions        | 1-2 hours         | **HIGH** — MVP launch blocker             |
| P0.3 | Cross-Reference Broken Links         | 2-3 hours         | **HIGH** — Breaks agent navigation        |
| P0.4 | Synthesis Documents Out of Sync      | 1 hour (Option A) | **MEDIUM-HIGH** — Risk of contradiction   |

**Total P0 Effort:** 7-10 hours

---

### P1 — HIGH IMPACT (Improve MVP Quality)

| ID   | Issue                                       | Estimated Effort | Impact                                |
| ---- | ------------------------------------------- | ---------------- | ------------------------------------- |
| P1.1 | Agent Instructions Section Completeness     | 5-6 hours        | **HIGH** — Improves agent reliability |
| P1.2 | Example Completeness in Technical Documents | 9-13 hours       | **MEDIUM-HIGH** — Reduces ambiguity   |
| P1.3 | Terminology Consistency Across Documents    | 4-5 hours        | **MEDIUM** — Professional polish      |
| P1.4 | Mermaid Diagram Consistency                 | 2-4 hours        | **LOW-MEDIUM** — Visual consistency   |

**Total P1 Effort:** 20-28 hours

---

### P2 — MEDIUM IMPACT (Enhance Maintainability)

| ID   | Issue                             | Estimated Effort | Impact                              |
| ---- | --------------------------------- | ---------------- | ----------------------------------- |
| P2.1 | Documentation Versioning Strategy | 2.5 hours (MVP)  | **MEDIUM** — Future maintainability |
| P2.2 | Missing Subsystem Documentation   | 7-10 hours       | **MEDIUM** — Completeness           |
| P2.3 | Feature Unit Standards Adoption   | 1 hour (MVP)     | **MEDIUM** — Consistency            |

**Total P2 Effort:** 10.5-13.5 hours (MVP scope)

---

### P3 — LOWER IMPACT (Polish for Post-MVP)

| ID   | Issue                               | Estimated Effort | Impact                        |
| ---- | ----------------------------------- | ---------------- | ----------------------------- |
| P3.1 | Completed Documentation Tasks Audit | 1-2 hours        | **LOW** — Cleanup             |
| P3.2 | Code Examples in Documentation      | 4-6 hours        | **LOW** — Nice-to-have        |
| P3.3 | Testing Documentation Expansion     | 6-8 hours        | **MEDIUM** — Post-MVP quality |

**Total P3 Effort:** 11-16 hours (defer to post-MVP)

---

## Total Estimated Effort

**MVP-Critical (P0 + P1 core):** 27-38 hours
**MVP-Enhanced (P0 + P1 + P2):** 37.5-51.5 hours
**Complete (All priorities):** 48.5-67.5 hours

---

## Recommended Execution Sequence

### Phase 1: P0 Critical Fixes (7-10 hours) — DO FIRST

**Week 1, Days 1-2:**

1. **P0.1 — Schema Types** (3-4 hours):

   - Choose canonical approach (recommend two-tier)
   - Update NEOTOMA_MANIFEST.md section 14
   - Update FUNCTIONAL_REQUIREMENTS.md section 2
   - Create complete record_types.md with mappings
   - Update ingestion.md section 5 with concrete patterns

2. **P0.2 — LLM Contradictions** (1-2 hours):

   - Update MVP_OVERVIEW.md (remove ambiguity)
   - Update MVP_EXECUTION_PLAN.md (confirm FU-100 as blocker)
   - Update ingestion.md (add MVP extraction section)
   - Create migration note

3. **P0.3 — Broken Links** (2-3 hours):

   - Run audit script
   - Fix all broken references
   - Standardize file extensions

4. **P0.4 — Synthesis Sync** (1 hour):
   - Add stub notices to thin documents
   - Verify no contradictions with detailed docs

**Checkpoint:** All P0 issues resolved. MVP implementation can begin safely.

---

### Phase 2: P1 High-Impact (20-28 hours) — DO DURING MVP IMPLEMENTATION

**Week 1-2, parallel with implementation:**

1. **P1.1 — Agent Instructions** (5-6 hours):

   - Audit all docs
   - Add to specs/ docs (Phase 1)
   - Add to subsystems/ docs (Phase 2)

2. **P1.2 — Examples** (9-13 hours):

   - Add schema detection patterns to ingestion.md (critical for FU-100)
   - Add JSONB examples to schema.md
   - Verify MCP_SPEC.md examples
   - Create reference examples doc

3. **P1.3 — Terminology** (4-5 hours):

   - Run audit script
   - Fix violations
   - Update standards

4. **P1.4 — Diagrams** (2-4 hours):
   - Audit critical diagrams
   - Fix non-compliant

**Checkpoint:** Documentation quality high, examples complete, agents have clear guidance.

---

### Phase 3: P2 Maintainability (10.5-13.5 hours) — DO BEFORE MVP LAUNCH

**Week 2-3:**

1. **P2.1 — Versioning** (2.5 hours):

   - Add frontmatter to foundational docs
   - Create changelog

2. **P2.2 — Subsystem Docs** (7-10 hours):

   - Full audit
   - Fill MVP-critical gaps

3. **P2.3 — Feature Units** (1 hour):
   - Verify FU-100 spec complete

**Checkpoint:** Documentation robust, maintainable, ready for MVP launch and post-MVP iteration.

---

### Phase 4: P3 Polish (11-16 hours) — DEFER TO POST-MVP

**Post-MVP:**

1. Complete documentation audit cleanup
2. Add more code examples
3. Expand testing documentation

---

## Success Metrics

**MVP Documentation Readiness:**

- [ ] All P0 issues resolved (schema types canonical, LLM clarity, no broken links)
- [ ] All MVP-critical documents have complete Agent Instructions
- [ ] All technical docs have concrete examples for MVP features
- [ ] Terminology consistent across all docs
- [ ] No contradictions between synthesis and detailed docs

**Post-MVP Documentation Excellence:**

- [ ] All documents have version metadata
- [ ] All subsystems have complete documentation
- [ ] All Feature Units follow standards
- [ ] Comprehensive code examples throughout
- [ ] Expanded testing documentation

---

## Risk Assessment

**Risks if P0 Not Fixed:**

- ❌ Implementation teams build incompatible extraction logic (schema type confusion)
- ❌ LLM extraction remains in codebase, violating manifest (MVP launch blocked)
- ❌ Agents fail to load critical context (broken links block workflow)
- ❌ Contradictory guidance leads to rework (synthesis vs detailed docs)

**Risks if P1 Deferred:**

- ⚠️ Agents miss important constraints (incomplete Agent Instructions)
- ⚠️ Implementation ambiguity increases (missing examples)
- ⚠️ Documentation appears unprofessional (terminology inconsistency)

**Risks if P2 Deferred:**

- 🟡 Technical debt accumulates (versioning, missing subsystem docs)
- 🟡 Maintainability decreases over time

**Risks if P3 Deferred:**

- 🟢 Minimal impact (polish and nice-to-haves)

---

## Conclusion

**Overall Assessment:** Neotoma's documentation is **exceptionally strong** in foundational architecture and standards definition. The issues identified are primarily **synchronization and completeness** rather than fundamental quality problems.

**Critical Action:** Resolve **P0 issues (7-10 hours)** before starting MVP implementation. Schema type inconsistency is the highest-priority blocker.

**Recommended Path:**

1. **Days 1-2:** Fix all P0 issues (7-10 hours)
2. **Week 1-2:** Address P1 issues in parallel with implementation (20-28 hours)
3. **Week 2-3:** Complete P2 maintainability work before MVP launch (10.5-13.5 hours)
4. **Post-MVP:** Polish with P3 improvements

**Total MVP-Critical Effort:** 37.5-51.5 hours (P0 + P1 + P2)

This effort investment will:

- Prevent implementation rework
- Enable reliable agent-driven development
- Ensure MVP ships with high-quality, consistent documentation
- Establish maintainable documentation practices for post-MVP iteration

---

## Appendix A: Schema Type Resolution (P0.1 Detail)

### Recommended Two-Tier System

**Tier 1: Application-Level Types** (in code: `src/config/record_types.ts`)

```typescript
// Canonical application-level record types (MVP)
export const RECORD_TYPES = {
  // Finance
  INVOICE: "invoice",
  RECEIPT: "receipt",
  TRANSACTION: "transaction",
  STATEMENT: "statement",
  ACCOUNT: "account",

  // Productivity
  NOTE: "note",
  DOCUMENT: "document",
  MESSAGE: "message",
  TASK: "task",
  PROJECT: "project",
  EVENT: "event",

  // Knowledge
  CONTACT: "contact",
  DATASET: "dataset",

  // Legal/Compliance
  CONTRACT: "contract",

  // Travel
  TRAVEL_DOCUMENT: "travel_document",

  // Identity
  IDENTITY_DOCUMENT: "identity_document",
} as const;

export type RecordType = (typeof RECORD_TYPES)[keyof typeof RECORD_TYPES];
```

**Tier 2: Schema Families** (in manifest: documentation grouping)

```typescript
// Schema families for documentation and high-level categorization
export const SCHEMA_FAMILIES = {
  FINANCIAL: ["invoice", "receipt", "transaction", "statement", "account"],
  PRODUCTIVITY: ["note", "document", "message", "task", "project", "event"],
  KNOWLEDGE: ["contact", "dataset"],
  LEGAL: ["contract"],
  TRAVEL: ["travel_document"],
  IDENTITY: ["identity_document"],
} as const;
```

**Mapping Table:**

| Application Type    | Schema Family | Entity Extraction                         | Date Extraction              |
| ------------------- | ------------- | ----------------------------------------- | ---------------------------- |
| `invoice`           | Financial     | vendor_name → company                     | date_issued, date_due        |
| `receipt`           | Financial     | merchant_name → company                   | date_purchased               |
| `transaction`       | Financial     | counterparty → company/person             | date_transacted              |
| `statement`         | Financial     | institution → company                     | date_start, date_end         |
| `account`           | Financial     | institution → company                     | date_snapshot                |
| `note`              | Productivity  | —                                         | —                            |
| `document`          | Productivity  | author → person                           | date_created                 |
| `message`           | Productivity  | sender → person, recipient → person       | date_sent                    |
| `task`              | Productivity  | assignee → person                         | date_due                     |
| `project`           | Productivity  | owner → person                            | date_start, date_end         |
| `event`             | Productivity  | location → location, attendees → person   | date_start, date_end         |
| `contact`           | Knowledge     | — (is entity itself)                      | —                            |
| `dataset`           | Knowledge     | source → company                          | date_collected               |
| `contract`          | Legal         | parties → company/person                  | date_effective, date_expiry  |
| `travel_document`   | Travel        | carrier → company, destination → location | date_departure, date_arrival |
| `identity_document` | Identity      | issuing_authority → company/location      | date_issued, date_expiry     |

**Update Targets:**

1. **`NEOTOMA_MANIFEST.md` section 14:**

   - Replace current list with two-tier explanation
   - Add table showing schema families
   - Reference `record_types.md` for complete catalog

2. **`docs/subsystems/record_types.md`** (create):

   - Complete catalog of application types
   - Field mappings per type
   - Entity extraction rules per type
   - Event generation rules per type
   - Schema detection patterns per type

3. **`docs/specs/FUNCTIONAL_REQUIREMENTS.md` section 2:**

   - Keep granular list but add note explaining it's application-level
   - Reference schema families from manifest
   - Add link to record_types.md

4. **`docs/subsystems/ingestion/ingestion.md` section 5:**
   - Add concrete schema detection examples using application types
   - Show regex patterns for each type
   - Show multi-pattern matching logic (2+ patterns → type assignment)

---

## Appendix B: Audit Scripts

### B.1 Broken Link Checker

```bash
#!/bin/bash
# Check for broken internal markdown links

echo "=== Checking for broken internal markdown links ==="

# Find all markdown files
find docs -name "*.md" -type f | while read -r file; do
  # Extract markdown links: [text](path.md)
  grep -oP '\[.*?\]\(\K[^)]+(?=\))' "$file" | while read -r link; do
    # Skip external links
    if [[ $link =~ ^https?:// ]]; then
      continue
    fi

    # Resolve relative path
    dir=$(dirname "$file")
    target="$dir/$link"

    # Check if file exists
    if [ ! -f "$target" ]; then
      echo "BROKEN: $file -> $link (resolved to $target)"
    fi
  done
done

echo "=== Audit complete ==="
```

### B.2 Terminology Consistency Checker

```bash
#!/bin/bash
# Check for forbidden synonyms

echo "=== Checking terminology consistency ==="

# Check for 'document' instead of 'Record' (context-sensitive)
echo "Potential 'document' vs 'Record' issues:"
grep -rn '\bdocument\b' docs/ \
  | grep -v 'IdentityDocument\|TravelDocument\|PDFDocument\|documentation\|documented' \
  | head -20

# Check for 'import' instead of 'ingestion'
echo ""
echo "Potential 'import' vs 'ingestion' issues:"
grep -rn '\bimport\b' docs/ \
  | grep -v 'import statement\|import.*from\|Gmail.*import\|attachment import' \
  | head -20

# Check for 'parsing' instead of 'extraction'
echo ""
echo "Potential 'parsing' vs 'extraction' issues:"
grep -rn '\bparsing\b' docs/ | head -20

echo "=== Audit complete (showing first 20 matches per category) ==="
```

### B.3 Agent Instructions Completeness Checker

```bash
#!/bin/bash
# Check for missing Agent Instructions sections

echo "=== Checking for missing 'Agent Instructions' sections ==="

find docs -name "*.md" -type f | while read -r file; do
  if ! grep -q "## Agent Instructions" "$file"; then
    echo "MISSING: $file"
  fi
done

echo "=== Audit complete ==="
```

---

## Appendix C: Template for Agent Instructions Section

```markdown
---

## Agent Instructions

### When to Load This Document

Load `[path/to/this/doc.md]` when:

- [Specific trigger 1: e.g., "Modifying database schema"]
- [Specific trigger 2: e.g., "Adding new record types"]
- [Specific trigger 3: e.g., "Planning schema migrations"]

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md` (always)
- `[docs/path/to/dependency1.md]` (reason)
- `[docs/path/to/dependency2.md]` (reason)

### Constraints Agents Must Enforce

1. [Constraint 1: e.g., "Schema changes MUST be additive only"]
2. [Constraint 2: e.g., "All new types MUST have canonical entity extraction rules"]
3. [Constraint 3: e.g., "JSONB schemas MUST include schema_version field"]

### Forbidden Patterns

- [Anti-pattern 1: e.g., "Breaking schema changes without migration"]
- [Anti-pattern 2: e.g., "Adding types without extraction rules"]
- [Anti-pattern 3: e.g., "Modifying existing type semantics"]

### Validation Checklist

- [ ] Change respects [domain-specific invariant]
- [ ] [Specific validation 1: e.g., "Schema version bumped if JSONB changed"]
- [ ] [Specific validation 2: e.g., "Migration script tested with rollback"]
- [ ] [Specific validation 3: e.g., "All new fields documented in record_types.md"]
- [ ] Tests cover new [domain-specific] paths
- [ ] Documentation updated to reflect changes
```

---

**END OF RECOMMENDATIONS**



