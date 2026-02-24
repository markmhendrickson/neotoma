# Neotoma MVP Execution Plan
**Note:** This document describes the execution plan for **MVP (Release v1.0.0)**. For the canonical **Release workflow pattern** that applies to MVP and all future releases, see [`docs/feature_units/standards/release_workflow.md`](../feature_units/standards/release_workflow.md).
**Use this document for:** MVP-specific strategic decisions, tactical execution details, and historical context.
**Use release_workflow.md for:** Understanding the general Release orchestration pattern (multi-FU coordination, dependency resolution, batching, integration testing) that MVP follows.
## Strategic Decision: Build on Top of Existing Implementation
### Recommendation: **Build on Top**
The existing codebase has a **solid foundation** (100% complete) and **working MCP layer** (100% complete), which are the hardest and most critical parts. The missing MVP features are mostly **additive** rather than requiring architectural changes. Rebuilding would waste 2-3 weeks of solid infrastructure work.
### What's Already Complete
#### ✅ Phase 0: Foundation (100% Complete)
- **Database Schema:** Complete with all tables, RLS policies, indexes
- **Crypto Infrastructure:** X25519/Ed25519, envelope encryption, request verification
- **Configuration:** Environment management, record types, Plaid config
**Value:** These are foundational and would take 1-2 weeks to rebuild correctly.
#### ✅ Phase 2: MCP Layer (100% Complete)
- **All 8 MVP MCP actions:** store_record, retrieve_records, update_record, delete_record, upload_file, get_file_url, provider integrations
- **MCP Server Core:** Tool registration, validation, WebSocket bridge
- **Request/Response handling:** Error envelopes, structured responses
**Value:** This is the **core differentiator** for MVP. Rebuilding would take 2-3 weeks and risk breaking AI integrations.
#### 🔨 Phase 3: UI Layer (57% Complete)
- **Records List View:** Functional with search, filtering, pagination
- **Record Detail View:** Functional side panel
- **Chat/AI Panel:** Fully functional with file upload
- **UI Foundation:** Component library, theming, routing (partial — design system implementation in progress)
**Value:** Core UI components work. Missing pieces: design system completion, timeline, upload UI.
#### 🔨 Phase 1: Core Services (33% Complete)
- **File Analysis:** 🔨 Needs Update (uses OpenAI LLM; MUST be replaced with rule-based extraction per NEOTOMA_MANIFEST.md)
- **Embedding Service:** Complete
- **Search Service:** Partial (needs deterministic ranking)
- **Entity Resolution:** Partial (extraction exists, needs canonical IDs)
- **Event Generation:** Partial (date extraction exists, needs event mapping)
- **Graph Builder:** Partial (basic inserts exist, needs integrity)
**Value:** Core extraction logic exists but MUST be updated to remove LLM and use rule-based extraction. Missing pieces are enhancements, not rewrites.
### What Needs to Be Done (MVP Gaps)
**P0 Critical Path (11-12 Feature Units):**
1. **FU-100:** Update file analysis (remove LLM, implement rule-based extraction, PDFDocument fallback per NEOTOMA_MANIFEST.md)
2. **FU-300:** Complete design system implementation (fonts, typography, component styles per `docs/ui/design_system.md`)
3. **FU-101:** Complete entity resolution (add canonical ID generation)
4. **FU-102:** Complete event generation (add event type mapping)
5. **FU-103:** Harden graph builder (add transactional inserts, integrity checks)
6. **FU-105:** Add deterministic ranking to search
7. **FU-303:** Build timeline view UI
8. **FU-304:** Dedicated upload UI (extract from ChatPanel)
9. **FU-400-403:** Onboarding flow (4 FUs, all new)
10. **FU-700:** Authentication UI (OAuth integration)
11. **FU-701:** RLS Implementation (enforce user isolation)
**Estimated Effort:** 11-14 days for MVP gaps (includes design system completion) + 1-2 days cleanup = **2-3 weeks total**
### Post-MVP Features to Disable/Flag
**Before MVP Launch (1-2 days cleanup):**
1. **LLM Extraction:** MUST be removed (violates NEOTOMA_MANIFEST.md MVP constraint)
2. **Semantic Search:** Disable or mark experimental (explicitly post-MVP per spec)
3. **Plaid Integration:** Disable or mark experimental (explicitly post-MVP per FU-207)
4. **CSV Processing:** Keep but document as beyond MVP scope
5. **Record Comparison:** Keep (isolated, low maintenance)
6. **Record Summaries:** Keep (helpful, low maintenance)
**Rationale:** MVP spec explicitly lists semantic search and Plaid as post-MVP. LLM extraction MUST be removed per NEOTOMA_MANIFEST.md which states "No LLM extraction (MVP constraint; rule-based only)". These should be disabled or clearly marked experimental for MVP launch to avoid confusion.
### Why Not Build from Scratch?
**From Scratch Would:**
- ❌ Waste 2-3 weeks rebuilding foundation (database, crypto, MCP)
- ❌ High risk of breaking MCP integrations that already work
- ❌ No working UI to test against during development
- ❌ Lose battle-tested code (crypto, file analysis, embeddings)
- ❌ Delay MVP launch by 2-3 weeks minimum
- ❌ Higher risk of introducing bugs in critical infrastructure
**Time Comparison:**
- **From Scratch:** 5-6 weeks total
- **Build on Top:** 2-3 weeks total
**Decision:** Build on top wins on time, risk, and foundation quality.
## Execution Strategy Principles
### When to Use Cloud Agents
**Cloud agents excel at:**
- ✅ Boilerplate generation (components, schemas, types)
- ✅ Test scaffolding (unit, integration, E2E templates)
- ✅ Pattern replication (similar to existing components)
- ✅ Documentation updates (cross-referencing, consistency)
- ✅ Configuration changes (low-risk)
- ✅ UI component implementation (following established patterns)
- ✅ Spec writing (following templates)
- ✅ Refactoring (extracting upload from ChatPanel, etc.)
**Use cloud agents for:**
- Low-to-medium complexity Feature Units
- Feature Units with clear patterns/templates
- UI work following established design system
- Test writing and scaffolding
- Documentation updates
### When to Use Manual Development
**Manual development required for:**
- 🔒 **High-risk decisions** (schema migrations, RLS policies, security)
- 🔒 **Architectural choices** (entity ID generation algorithm, ranking algorithm)
- 🔒 **Complex integrations** (Stripe billing, OAuth flows requiring careful review)
- 🔒 **Critical path debugging** (graph integrity, determinism violations)
- 🔒 **Spec design** (initial spec creation for novel features)
- 🔒 **Review and approval** (all high-risk FUs require human review)
**Use manual development for:**
- High-risk Feature Units (schema, security, graph integrity)
- Novel algorithms requiring iterative design
- Initial spec creation for complex features
- Final review and approval of all work
### Hybrid Approach (Recommended)
**Most Feature Units use hybrid:**
1. **Human:** Write initial spec (or review agent-generated spec)
2. **Agent:** Implement code following spec
3. **Human:** Review implementation (especially high-risk)
4. **Agent:** Fix issues from review
5. **Human:** Final approval and merge
## Cursor Commands Reference
**Complete Feature Unit Creation Workflow:** See `docs/feature_units/standards/creating_feature_units.md` for detailed workflow with 4 interactive checkpoints.
### Available Commands
| Command                        | Use Case                                             | When to Use                                                                               |
| ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Create New Feature Unit**    | Scaffold FU spec, manifest, test dirs (Checkpoint 0) | Starting any new Feature Unit                                                             |
| **Create Prototype**           | Build interactive prototype (after Checkpoint 0)     | After spec + UX complete, before implementation (UI FUs only)                             |
| **Run Feature Workflow**       | Implement Feature Unit after prototype approval      | Implementing any FU (primary command)                                                     |
| **Final Review**               | Present implementation for approval (Checkpoint 3)   | After implementation, before merge                                                        |
| **Fix Feature Bug**            | Classify and fix bugs using error protocol           | When tests fail or bugs discovered                                                        |
| **Modify Subsystem**           | Safely modify subsystems (schema, ingestion, etc.)   | When changing subsystem architecture                                                      |
| **Ingestion Flow Development** | Design/modify ingestion pipelines                    | FU-100, FU-205, ingestion-related work                                                    |
| **UI Workflow**                | (Legacy: Use new checkpoint-based workflow instead)  | Replaced by Create New Feature Unit (spec + UX) → Create Prototype → Run Feature Workflow |
### Command Usage Patterns
**For new Feature Unit (autonomous with checkpoints):**
1. Use **Create New Feature Unit** → interactive spec + UX creation (Checkpoint 0, includes UX questions if UI changes present)
2. If UI changes: Use **Create Prototype** → build prototype (autonomous)
3. If UI changes: Review and approve prototype (Checkpoint 1)
4. Use **Run Feature Workflow** → implement after spec/prototype approval
5. Use **Final Review** → present for approval before merge (Checkpoint 2)
**For UI Feature Units:**
1. Use **Create New Feature Unit** → collect spec + UX requirements together (Checkpoint 0)
2. Use **Create Prototype** → build interactive prototype with mocked APIs (autonomous)
3. Review and approve prototype (Checkpoint 1)
4. Use **Run Feature Workflow** → implement after prototype approval
5. Use **Final Review** → present for final approval (Checkpoint 2)
**For subsystem changes:**
1. Use **Modify Subsystem** (requires detailed plan + approval)
2. Use **Run Feature Workflow** for dependent FUs
**For ingestion work:**
1. Use **Create New Feature Unit** → dependency validation → **Run Feature Workflow**
2. Use **Ingestion Flow Development** for ingestion-specific planning (if needed)
**Important Notes:**
- **All Feature Unit creation includes dependency validation** — creation is rejected if required dependencies are not yet implemented (status must be ✅ Complete)
- **UI Feature Units** must follow: Create New Feature Unit (spec + UX) → Create Prototype → Review → Run Feature Workflow → Final Review
- **Non-UI Feature Units** follow: Create New Feature Unit → Run Feature Workflow → Final Review
- The legacy **UI Workflow** command is replaced by the new checkpoint-based workflow
## Execution Sequence
### Phase 0: Foundation (✅ COMPLETE)
**Status:** All infrastructure complete
- FU-000: Database Schema ✅
- FU-001: Crypto Infrastructure ✅
- FU-002: Configuration Management ✅
**Action:** No work required.
### Phase 1: Core Services (Domain Layer)
**Goal:** Complete entity resolution, event generation, graph builder, deterministic search.
#### FU-100: File Analysis Service Update (Remove LLM, Add Rule-Based Extraction)
- **Priority:** **P0 BLOCKER** — MVP cannot launch until LLM extraction removed
- **Execution:** Hybrid (Human spec review → Agent implementation → Human review)
- **Cursor Command:** `Create New Feature Unit` → `Modify Subsystem` with `subsystem=ingestion` → `Run Feature Workflow` with `feature_id=FU-100` → `Final Review`
- **Manual Time:** 2-3h (rule-based detection pattern review, extraction regex approval)
- **Agent Time:** 8-10h (remove LLM code, implement rule-based detection, implement regex extractors, update fallback)
- **Risk:** High (core extraction logic, breaking change, MVP launch blocker)
- **Dependencies:** FU-000 ✅
**Steps:**
1. **Agent:** Use `Create New Feature Unit` with `feature_id=FU-100` → dependency validation passes (FU-000 ✅)
2. **Agent:** If spec doesn't exist, interactively collect spec details (Checkpoint 0)
3. **Human:** Review rule-based schema detection patterns (per `docs/subsystems/ingestion/ingestion.md` section 5 and `docs/subsystems/record_types.md` section 7)
4. **Human:** Approve regex patterns for field extraction per schema type (per `docs/subsystems/record_types.md` section 4)
5. **Agent:** Use `Modify Subsystem` to plan ingestion changes
6. **Human:** Approve removal of OpenAI LLM calls
7. **Agent:** Use `Run Feature Workflow` to implement:
   - Remove **ALL** `openai.chat.completions.create()` calls from `src/services/file_analysis.ts`
   - Implement multi-pattern schema detection (2+ patterns required, per `record_types.md`)
   - Implement rule-based field extraction (regex parsers per schema type, per `record_types.md`)
   - Update `normalizeRecordType()` to return `'document'` for unrecognized types (generic fallback, not PDFDocument)
   - Remove custom type sanitization (only canonical application types from `record_types.md`)
   **5a. Agent:** Implement extraction functions for ALL 16 MVP types:
   - Financial: `invoice`, `receipt`, `transaction`, `statement`, `account` (5 types)
   - Productivity: `note`, `document`, `message`, `task`, `project`, `event` (6 types)
   - Knowledge: `contact`, `dataset` (2 types)
   - Legal: `contract` (1 type)
   - Travel: `travel_document` (1 type)
   - Identity: `identity_document` (1 type)
   - Reference `docs/subsystems/record_types.md` Section 4 for field extraction patterns
   **5b. Agent:** Ensure all extraction functions include `schema_version: "1.0"` in returned properties
   **5c. Agent:** Add field validation function that:
   - Filters out fields not defined for assigned type (per `record_types.md` Section 4)
   - Stores unknown fields in `extraction_metadata.unknown_fields`
   - Logs warnings for filtered fields and missing required fields in `extraction_metadata.warnings`
   - Always includes `schema_version: "1.0"` in properties
   - Stores record with only valid fields (does NOT reject entire record)
   - Reference `docs/subsystems/schema.md` Section 3.3 for `extraction_metadata` structure
   **5d. Agent:** Clean up `src/config/record_types.ts`:
   - Remove non-MVP types: `budget`, `subscription`, `goal`
   - Remove health types: `exercise`, `measurement`, `meal`, `sleep_session`
   - Remove non-MVP types: `media_asset`, `dataset_row`
   - Update `normalizeRecordType()` to reject non-MVP types (fallback to `'document'`)
   - Remove `sanitizeCustomType()` function
   **5e. Agent:** Add database constraint to prevent `type` column updates:
   ```sql
   CREATE OR REPLACE FUNCTION prevent_type_update()
   RETURNS TRIGGER AS $$
   BEGIN
     IF OLD.type IS DISTINCT FROM NEW.type THEN
       RAISE EXCEPTION 'Cannot update records.type after initial assignment';
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   CREATE TRIGGER prevent_records_type_update
   BEFORE UPDATE ON records
   FOR EACH ROW
   EXECUTE FUNCTION prevent_type_update();
   ```
   **5f. Agent:** Add application-layer validation in record creation/update logic to prevent `type` mutations
   **5g. Agent:** Verify code uses application-level types only (grep for schema family names in code logic)
8. **Agent:** Write tests (determinism tests per acceptance criteria below)
9. **Human:** Review extraction logic (high-risk, core functionality)
10. **Agent:** Use `Final Review` to present implementation for approval (Checkpoint 3)
11. **Human:** Final approval and merge
**Acceptance Criteria (MUST PASS FOR MVP LAUNCH):**
1. **Zero LLM calls:** `grep -r "openai.chat.completions.create" src/services/` returns zero results
2. **Determinism proof:** Same file uploaded 100 times → 100 identical extractions (same `type`, same `properties`, same order)
3. **Multi-pattern matching:** Schema detection uses 2+ pattern matches for all non-fallback types
4. **Canonical types only:** All extracted types match `docs/subsystems/record_types.md` application types (no custom types)
5. **Fallback correctness:** Unrecognized documents → `type = 'document'` (not `null`, not custom type)
6. **Test coverage:** 100% coverage of extraction paths (unit tests for all type detection patterns)
7. **Performance:** Extraction latency < 10s P95 (same as before LLM removal)
8. **Schema versioning:** All `properties` include `schema_version: "1.0"` field
9. **Field validation:** Unknown fields filtered to `extraction_metadata.unknown_fields` with warnings logged; records still created with valid fields only
10. **Complete extractors:** All 16 MVP application types have extraction functions implemented (not just invoice, contract, document)
11. **Type catalog alignment:** Only MVP types from manifest present (remove non-MVP types from `src/config/record_types.ts`)
12. **Extraction metadata:** All records include `extraction_metadata` JSONB with quality indicators, unknown fields, and warnings
13. **Immutability:** Database trigger prevents `type` column mutations after initial assignment
14. **Two-tier enforcement:** Code uses application-level types only (`invoice`, `receipt`), never schema family names (`Financial`, `Productivity`) in database or API
15. **Missing required fields:** Records with missing required fields are stored but warnings logged in `extraction_metadata.warnings` for data quality tracking
**Critical Constraints (per NEOTOMA_MANIFEST.md):**
- **MUST NOT use LLM extraction** (MVP constraint; rule-based only)
- **MUST use deterministic extraction** (same input → same output, always)
- **MUST fallback to `document`** for unrecognized types (not custom types, not null)
- **MUST be schema-first** (type-driven extraction rules per `record_types.md`)
- **MUST use multi-pattern matching** (2+ patterns for non-fallback types)
**Related Documentation:**
- Field extraction patterns: `docs/subsystems/record_types.md` Section 4
- Schema detection patterns: `docs/subsystems/record_types.md` Section 7
- Layered storage model: `docs/subsystems/schema.md` Section 3.11 and `docs/architecture/schema_handling.md`
- Implementation compliance: `docs/specs/IMPLEMENTATION_OVERWRITE_GUIDE.md` Sections 4-6
#### FU-100.5: Schema Compliance Verification
- **Priority:** **P0 BLOCKER** — Must complete before MVP launch
- **Execution:** Hybrid (Agent verification → Human review)
- **Cursor Command:** `Run Feature Workflow` with verification checks
- **Manual Time:** 1-2h (compliance review)
- **Agent Time:** 3-4h (automated checks, fixes)
- **Risk:** Medium (compliance verification)
- **Dependencies:** FU-100 ✅
**Verification Checklist:**
1. **Schema versioning audit:**
   - [ ] All 16 extractor functions include `schema_version: "1.0"`
   - [ ] Test: Upload sample of each type → verify `properties.schema_version` exists
   - [ ] Validation: Reject records missing `schema_version` before DB insert
2. **Complete extraction coverage:**
   - [ ] Verify extractor exists for each of 16 MVP types
   - [ ] Test: Each type has unit test with sample extraction
   - [ ] Verify required fields extracted per `record_types.md` Section 4
3. **Field validation:**
   - [ ] Unknown fields filtered to `extraction_metadata.unknown_fields`
   - [ ] Warnings logged for filtered fields and missing required fields
   - [ ] Test: Attempt to extract unknown field → appears in `extraction_metadata`, not `properties`
   - [ ] Test: Valid fields pass validation and appear in `properties`
4. **Type catalog alignment:**
   - [ ] Audit `src/config/record_types.ts`: only MVP types present
   - [ ] Verify non-MVP types removed or marked post-MVP
   - [ ] Test: `normalizeRecordType('budget')` → returns `'document'` (fallback)
5. **Extraction metadata:**
   - [ ] All records include `extraction_metadata` JSONB
   - [ ] Unknown fields preserved when present
   - [ ] Warnings logged for missing required fields
   - [ ] Quality indicators present (fields_extracted_count, fields_filtered_count)
6. **Two-tier system enforcement:**
   - [ ] Grep codebase: no schema family names (`Financial`, `Productivity`) in code logic
   - [ ] Verify database queries use application types only
   - [ ] Verify API responses use application types only
7. **Immutability enforcement:**
   - [ ] Database trigger prevents `type` updates (from step 5e)
   - [ ] Application layer rejects `type` mutations in update operations
   - [ ] Test: Attempt to update `records.type` → fails (DB + app layer)
8. **Multi-pattern matching:**
   - [ ] All non-fallback type detections use 2+ patterns
   - [ ] Test: Each detection function verified to match 2+ patterns
   - [ ] Reference: `record_types.md` Section 7 patterns
9. **Determinism extended verification:**
   - [ ] Test: Same file uploaded 100 times → identical `type`, `properties`, field order
   - [ ] Test: Regex extractors handle edge cases (whitespace, case sensitivity)
   - [ ] Test: Date parsing deterministic (same input → same ISO 8601 output)
**Verification Commands:**
```bash
# Schema versioning check
grep -r "extractFieldsFor" src/services/ | xargs grep -L "schema_version"
# Type catalog check (should return 0 non-MVP types)
grep -E "(budget|subscription|goal|exercise|measurement|meal|sleep_session|media_asset|dataset_row)" src/config/record_types.ts
# Two-tier check (should return 0 schema family names in code)
grep -rE "\"Financial\"|\"Productivity\"|\"Knowledge\"|\"Legal\"|\"Travel\"|\"Identity\"" src/ --exclude-dir=node_modules | grep -v "// documentation"
# Immutability check (should have trigger)
grep -r "prevent_type_update\|prevent_records_type_update" migrations/
# Field validation check
grep -r "validateFieldsForType\|validateExtractedFields" src/services/
# Extraction metadata check
grep -r "extraction_metadata" src/services/ | grep -E "unknown_fields|warnings"
```
**Expected Results:** All verification commands should pass with zero violations (except comments/docs).
**Schema Catalog Expansion (per `docs/specs/GENERAL_REQUIREMENTS.md`):**
During FU-100 implementation, the initial schema catalog should be fleshed out **within Tier 1 (and selectively Tier 2)** by:
- Deriving additional Tier 1 schema types from representative real-world sample files (e.g., files in user import directories)
- Adding only high-leverage Tier 2 schemas clearly needed for MVP ICPs
- Always preserving determinism, explainability, and schema-first constraints
This expansion happens as part of FU-100 implementation (add new types to `record_types.ts`, add detection patterns, add extraction rules, add tests). New schemas beyond initial expansion are added via separate Feature Units post-MVP.
#### FU-106: Chat Transcript to JSON CLI Tool
**Note:** This Feature Unit is **excluded from MVP (v1.0.0)** and will be delivered in **Internal Release v0.2.0** (pre-MVP).
- **Execution:** Mostly Agent (Human spec review → Agent implementation → Human review)
- **Cursor Command:** `Create New Feature Unit` → `Run Feature Workflow` → `Final Review`
- **Manual Time:** 1-1.5h (spec design, review output format)
- **Agent Time:** 4-6h (CLI implementation, format parsers, tests)
- **Risk:** Low (standalone tool, outside Truth Layer)
- **Dependencies:** None (can be developed in parallel)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` with `feature_id=FU-106` → no dependencies
2. **Agent:** Collect spec interactively (Checkpoint 0): CLI for chat transcript → JSON conversion
3. **Human:** Review spec and output JSON format requirements
4. **Agent:** Use `Run Feature Workflow` to implement:
   - CLI script in `scripts/chat-to-json.ts` (Node.js)
   - Parsers for common export formats (ChatGPT JSON, HTML, text)
   - LLM-based interpretation (OpenAI/Anthropic API calls allowed, outside Truth Layer)
   - Interactive field mapping/correction mode
   - JSON output in standard record format (one file per record with type, properties, file_urls)
   - Documentation and usage examples
5. **Agent:** Write tests:
   - Unit: Format parsers for each supported export type
   - Integration: Full CLI workflow (transcript → JSON → validate structure)
   - E2E: CLI output → Neotoma JSON ingestion (verify deterministic ingestion)
6. **Human:** Review CLI implementation at Checkpoint 2 (Final Review)
7. **Agent:** Update after human feedback
8. **Human:** Approve for merge
**Output:** Standalone CLI tool that users run: `npm run chat-to-json -- input.json output_dir/`
**Rationale:** Chat transcripts require non-deterministic interpretation that violates Truth Layer constraints. Separating this into a pre-processing CLI preserves Truth Layer determinism while enabling chat transcript ingestion.
#### FU-101: Entity Resolution
- **Execution:** Hybrid (Human spec review → Agent implementation → Human review)
- **Cursor Command:** `Create New Feature Unit` → `Run Feature Workflow` → `Final Review`
- **Manual Time:** 1.5-2.5h (spec design, migration review, algorithm approval)
- **Agent Time:** 6-8h (implementation, tests)
- **Risk:** High (new table, deterministic IDs, migration)
- **Dependencies:** FU-100 ✅ (must be completed first)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` with `feature_id=FU-101` → dependency validation (FU-100 must be ✅ Complete)
2. **Agent:** If spec doesn't exist, interactively collect spec details (Checkpoint 0)
3. **Human:** Review/approve entity ID generation algorithm (hash-based deterministic)
4. **Agent:** Use `Run Feature Workflow` to implement entity table, normalization, ID generation
5. **Human:** Review migration script (high-risk)
6. **Agent:** Write tests (unit, integration, property-based)
7. **Agent:** Use `Final Review` to present implementation (Checkpoint 2)
8. **Human:** Final approval and merge
**Schema Compliance Requirements:**
- Entity extraction MUST follow rules from `docs/subsystems/record_types.md` Section 5
- Verify entity fields per type match manifest specification
- Entity extraction uses fields from `properties` only (not `extraction_metadata.unknown_fields`)
- Ensure entity extraction is deterministic (same entity text → same entity ID)
#### FU-102: Event Generation
- **Execution:** Hybrid (Human spec review → Agent implementation → Human review)
- **Cursor Command:** `Create New Feature Unit` → `Run Feature Workflow` → `Final Review`
- **Manual Time:** 1.5-2.5h (spec design, migration review)
- **Agent Time:** 5-7h (implementation, tests)
- **Risk:** Medium-High (new table, date extraction logic)
- **Dependencies:** FU-100 ✅ (must be completed first)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` with `feature_id=FU-102` → dependency validation (FU-100 must be ✅ Complete)
2. **Agent:** If spec doesn't exist, interactively collect spec details (Checkpoint 0)
3. **Human:** Review/approve event type mapping (date_issued → InvoiceIssued)
4. **Agent:** Use `Run Feature Workflow` to implement events table, date extraction, event ID generation
5. **Human:** Review migration script
6. **Agent:** Write tests
7. **Agent:** Use `Final Review` to present implementation (Checkpoint 2)
8. **Human:** Final approval and merge
**Schema Compliance Requirements:**
- Event generation MUST follow rules from `docs/subsystems/record_types.md` Section 6
- Verify event type mappings per type match manifest specification
- Event generation uses date fields from `properties` only (deterministic source)
- Ensure event generation is deterministic (same record + date field → same event ID)
#### FU-103: Graph Builder Hardening
- **Execution:** Hybrid (Agent implementation → Human review)
- **Cursor Command:** `Create New Feature Unit` → `Run Feature Workflow` → `Final Review`
- **Manual Time:** 1.5-2h (integrity logic review)
- **Agent Time:** 3-4h (transaction wrapping, integrity checks)
- **Risk:** High (data integrity)
- **Dependencies:** FU-101, FU-102 (both must be ✅ Complete)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` with `feature_id=FU-103` → dependency validation (FU-101, FU-102 must be ✅ Complete)
2. **Agent:** If spec doesn't exist, interactively collect spec details (Checkpoint 0)
3. **Agent:** Use `Run Feature Workflow` to harden graph builder (transactional inserts, orphan detection, cycle detection)
4. **Human:** Review integrity enforcement logic
5. **Agent:** Write property-based tests (no orphans, no cycles)
6. **Agent:** Use `Final Review` to present implementation (Checkpoint 2)
7. **Human:** Final approval and merge
#### FU-105: Deterministic Search
- **Execution:** Hybrid (Agent implementation → Human review)
- **Cursor Command:** `Run Feature Workflow` with `feature_id=FU-105`
- **Manual Time:** 1-1.5h (ranking algorithm review)
- **Agent Time:** 2-3h (ranking algorithm, tiebreakers, tests)
- **Risk:** Medium (determinism critical)
- **Dependencies:** FU-104 ✅
**Steps:**
1. **Agent:** Use `Run Feature Workflow` to add deterministic ranking
2. **Agent:** Implement ranking algorithm with tiebreakers
3. **Human:** Review ranking logic
4. **Agent:** Write property tests (100 runs → same order)
5. **Human:** Final review
**Phase 1 Total:** 5.5-7.5h manual, 16-22h agent
### Phase 2: MCP Layer (✅ COMPLETE)
**Status:** All 8 MVP MCP actions implemented (Plaid actions FU-207 moved to post-MVP)
- FU-200 through FU-206, FU-208 ✅ (FU-207 Plaid post-MVP)
**Action:** No work required.
**Note:** FU-207 (Plaid MCP) exists but is post-MVP. Will be disabled/flagged during cleanup phase.
### Phase 3: UI Layer
**Goal:** Complete design system implementation, timeline view, upload UI, dashboard, settings.
#### FU-300: Design System Implementation (Complete)
- **Execution:** Hybrid (Agent verification → Human review)
- **Cursor Command:** Manual verification + fixes
- **Manual Time:** 0.25-0.5h (review)
- **Agent Time:** 3-4h (verification and fixes to match design system)
- **Risk:** Low (styling only)
- **Dependencies:** None
- **Priority:** P0 (must be complete before building new UI components)
**Steps:**
1. **Agent:** Verify all components use Inter font (UI) and JetBrains Mono (monospace)
2. **Agent:** Verify typography scale matches design system (h1-h4, body, small, mono sizes)
3. **Agent:** Verify component styles match design system (button padding, input height, badge radius, table styling)
4. **Agent:** Verify color palette matches design system (light/dark mode)
5. **Agent:** Verify spacing scale is used consistently
6. **Agent:** Verify design system preview (`/design-system`) displays all components correctly
7. **Human:** Review and approve
8. **Agent:** Fix any discrepancies found
**Reference:** `docs/ui/design_system.md`
**Acceptance Criteria:**
- All UI components match design system specifications
- Design system preview accessible at `/design-system` and displays all components correctly
- Fonts, typography, colors, spacing, and component styles verified
#### FU-303: Timeline View
- **Execution:** Cloud Agent (UI pattern established)
- **Cursor Command:** `Create New Feature Unit` (spec + UX) → `Create Prototype` → `Run Feature Workflow` → `Final Review`
- **Manual Time:** 0.5-1h (UX input, prototype review)
- **Agent Time:** 5-6h (prototype, component, virtualization, tests)
- **Risk:** Medium (UI complexity)
- **Dependencies:** FU-102 ✅ (events must exist and be completed)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` with `feature_id=FU-303` → dependency validation (FU-102 must be ✅ Complete)
2. **Agent:** If spec doesn't exist, interactively collect spec details (Checkpoint 0)
3. **Agent:** Use `Create Prototype` to build interactive prototype with mocked APIs (autonomous, after Checkpoint 0)
4. **Human:** Review and approve prototype (Checkpoint 1) — chronological sorting, date grouping, interaction patterns
5. **Agent:** Use `Run Feature Workflow` to implement TimelineView component with virtualization
6. **Agent:** Write component + E2E tests
7. **Agent:** Use `Final Review` to present implementation (Checkpoint 2)
8. **Human:** Final approval and merge
#### FU-304: File Upload UI
- **Execution:** Cloud Agent (refactoring + enhancement)
- **Cursor Command:** `Create New Feature Unit` (spec + UX) → `Create Prototype` → `Run Feature Workflow` → `Final Review`
- **Manual Time:** 0.5-1h (UX input, prototype review)
- **Agent Time:** 4-5h (prototype, refactor + bulk upload features)
- **Risk:** Medium (bulk upload complexity)
- **Dependencies:** FU-205 ✅ (must be completed first)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` with `feature_id=FU-304` → dependency validation (FU-205 must be ✅ Complete)
2. **Agent:** If spec doesn't exist, interactively collect spec details (Checkpoint 0)
3. **Agent:** Use `Create Prototype` to build interactive prototype with mocked APIs (autonomous, after Checkpoint 0)
4. **Human:** Review and approve prototype (Checkpoint 1) — bulk upload flow, queue management, progress tracking
5. **Agent:** Use `Run Feature Workflow` to refactor upload from ChatPanel, create dedicated upload page, add bulk upload features
6. **Agent:** Write tests (component, E2E with 50+ files)
7. **Agent:** Use `Final Review` to present implementation (Checkpoint 2)
8. **Human:** Final approval and merge
#### FU-305: Dashboard View
- **Execution:** Cloud Agent (straightforward aggregation UI)
- **Cursor Command:** `Create New Feature Unit` (spec + UX) → `Create Prototype` → `Run Feature Workflow` → `Final Review`
- **Manual Time:** 0.25-0.5h (quick review)
- **Agent Time:** 3-4h (dashboard component, stats widgets)
- **Risk:** Low
- **Dependencies:** FU-300 (design system must be complete), FU-202 ✅
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Implement stats widgets, recent records, quick actions
3. **Human:** Quick review
4. **Agent:** Write tests
5. **Human:** Approval
#### FU-306: Settings UI
- **Execution:** Cloud Agent (form UI)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-306`
- **Manual Time:** 0.25-0.5h (quick review)
- **Agent Time:** 3-4h (settings page, locale selector, theme toggle)
- **Risk:** Low
- **Dependencies:** FU-300 ✅
- **Priority:** P2 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Implement locale selector, theme toggle, integrations list
3. **Human:** Quick review
4. **Agent:** Write tests
5. **Human:** Approval
**Phase 3 Total:** 1.5-3h manual, 15-19h agent (minimal MVP: FU-303, FU-304 only)
### Phase 4: Onboarding Flow
**Goal:** Complete onboarding experience (welcome → processing → results → state).
#### FU-400: Onboarding Welcome Screen
- **Execution:** Cloud Agent (static content)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-400`
- **Manual Time:** 0.25-0.5h (copy review)
- **Agent Time:** 2-3h (welcome component)
- **Risk:** Low
- **Dependencies:** FU-300 ✅
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Implement welcome message, value prop, CTA
3. **Human:** Review copy (activation-focused)
4. **Agent:** Write tests
5. **Human:** Approval
#### FU-401: Onboarding Processing Indicator
- **Execution:** Cloud Agent (progress UI)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-401`
- **Manual Time:** 0.25-0.5h (UX review)
- **Agent Time:** 2-3h (progress component, accessibility)
- **Risk:** Low
- **Dependencies:** FU-205 ✅
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Implement step-by-step progress, live regions
3. **Human:** Review UX (no black box)
4. **Agent:** Write tests
5. **Human:** Approval
#### FU-402: Onboarding Extraction Results
- **Execution:** Cloud Agent (data display)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-402`
- **Manual Time:** 0.5-1h (UX review)
- **Agent Time:** 3-4h (results component, entity highlighting)
- **Risk:** Low-Medium
- **Dependencies:** FU-302 ✅, FU-401
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Implement field display, entity highlighting, CTAs
3. **Human:** Review UX (activation metrics focus)
4. **Agent:** Write tests
5. **Human:** Approval
#### FU-403: Onboarding State Management
- **Execution:** Cloud Agent (state hook)
- **Cursor Command:** `Run Feature Workflow` with `feature_id=FU-403`
- **Manual Time:** 0.25-0.5h (state design review)
- **Agent Time:** 2-3h (state hook, persistence)
- **Risk:** Low
- **Dependencies:** FU-400, FU-401, FU-402
**Steps:**
1. **Agent:** Use `Run Feature Workflow` to create state management
2. **Agent:** Implement useOnboardingState hook, localStorage, milestones
3. **Human:** Review state design
4. **Agent:** Write tests
5. **Human:** Approval
**Phase 4 Total:** 1.25-2.5h manual, 9-13h agent
### Phase 5: Integrations
**Goal:** Complete provider connector UI (Gmail only). X, Instagram, and Plaid moved to post-MVP.
#### FU-500: Plaid Link UI
- **Status:** Post-MVP (Tier 3+ use case)
- **Priority:** Post-MVP
- **Rationale:** Plaid (live bank transaction sync) serves Tier 3+ ICPs (Cross-Border Solopreneurs, Agentic Portfolio) better than Tier 1. Tier 1 needs document upload (PDF invoices/receipts/statements), not live account connections.
- **Execution:** Deferred to post-MVP
- **Note:** FU-207 (Plaid MCP) exists but is also post-MVP. Will be disabled/flagged during cleanup phase.
#### FU-501: Provider Connectors UI
- **Execution:** Hybrid (Agent implementation → Human review)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-501`
- **Manual Time:** 1.5-2h (multiple OAuth flows review)
- **Agent Time:** 5-6h (provider catalog, OAuth per provider)
- **Risk:** Medium-High (multiple providers, OAuth complexity)
- **Dependencies:** FU-208 ✅, FU-300 ✅
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Implement catalog, connect buttons, OAuth flow (Gmail only)
3. **Human:** Review OAuth flow (Gmail)
4. **Agent:** Write tests
5. **Human:** Final approval
**Note:** X and Instagram provider UIs are post-MVP. Only Gmail connector UI is required for MVP as it aligns with Tier 1 ICP needs (document import from email attachments).
**Phase 5 Total (MVP):** 1.5-2h manual, 5-6h agent (reduced scope: Gmail only; X, Instagram, Plaid moved to post-MVP)
### Phase 6: Search and Discovery
**Goal:** Complete advanced search UI.
#### FU-600: Advanced Search UI
- **Execution:** Cloud Agent (enhancement to existing)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-600`
- **Manual Time:** 0.5-1h (filter UX review)
- **Agent Time:** 4-5h (filter panel, search mode toggle)
- **Risk:** Low-Medium
- **Dependencies:** FU-105, FU-301 ✅
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Add filter panel, search mode toggle, auto-complete
3. **Human:** Review UX
4. **Agent:** Write tests
5. **Human:** Approval
**Note:** Semantic search (post-MVP) will be disabled during cleanup phase.
**Phase 6 Total:** 0.5-1h manual, 4-5h agent
### Phase 7: Auth and Multi-User
**Goal:** Complete authentication, RLS, billing (revenue critical).
#### FU-700: Authentication UI
- **Execution:** Hybrid (Human spec review → Agent implementation → Human review)
- **Cursor Command:** `Create New Feature Unit` (spec + UX) → `Create Prototype` → `Run Feature Workflow` → `Final Review`
- **Manual Time:** 1.5-2h (UX input, prototype review, auth security review)
- **Agent Time:** 4-5h (prototype, OAuth integration, forms)
- **Risk:** High (security)
- **Dependencies:** None
**Steps:**
1. **Agent:** Use `Create New Feature Unit` with `feature_id=FU-700` → dependency validation passes
2. **Agent:** If spec doesn't exist, interactively collect spec details (Checkpoint 0)
3. **Human:** Review auth spec (OAuth integration)
4. **Agent:** Use `Create Prototype` to build interactive prototype with mocked APIs (autonomous, after Checkpoint 0)
5. **Human:** Review and approve prototype (Checkpoint 1) — auth flows, security patterns
6. **Agent:** Use `Run Feature Workflow` to implement signup/signin forms, password reset, OAuth
7. **Human:** Review security (session management, token validation)
8. **Agent:** Write tests (integration, E2E)
9. **Agent:** Use `Final Review` to present implementation (Checkpoint 2)
10. **Human:** Final approval and merge
#### FU-701: RLS Implementation
- **Execution:** Hybrid (Human migration design → Agent implementation → Human review)
- **Cursor Command:** `Modify Subsystem` with `subsystem=schema` → `Run Feature Workflow`
- **Manual Time:** 2-2.5h (migration design, RLS policy review)
- **Agent Time:** 5-6h (schema migration, RLS policies, query updates)
- **Risk:** High (data isolation, migration)
- **Dependencies:** FU-700, FU-000 ✅
**Steps:**
1. **Human:** Design migration (add user_id, backfill strategy)
2. **Agent:** Use `Modify Subsystem` to plan schema changes
3. **Human:** Approve migration plan
4. **Agent:** Use `Run Feature Workflow` to implement
5. **Agent:** Create migration, RLS policies, update queries
6. **Human:** Review migration script (high-risk)
7. **Agent:** Write multi-user isolation tests
8. **Human:** Final approval
#### FU-703: Local Storage / Offline Mode
- **Status:** ✅ Complete (existing implementation)
- **Location:** `frontend/src/store/`, `frontend/src/worker/`, `frontend/src/utils/local_files.ts`
- **Implementation:**
  - SQLite WASM with OPFS VFS for persistent local storage
  - Encrypted local datastore (end-to-end encryption)
  - WebWorker RPC for isolated datastore operations
  - Local file processing and storage
  - Chat message persistence (encrypted localStorage)
- **Action:** No work required. Already complete.
#### FU-702: Billing and Subscription Management
- **Execution:** Hybrid (Human spec design → Agent implementation → Human review)
- **Cursor Command:** `Run Feature Workflow` with `feature_id=FU-702`
- **Manual Time:** 2-3.5h (Stripe integration design, pricing review)
- **Agent Time:** 12-16h (Stripe integration, UI, usage tracking)
- **Risk:** Medium-High (revenue critical, payment processing)
- **Dependencies:** FU-700, FU-701
- **Priority:** P1 (revenue critical, but not required for minimal MVP)
**Steps:**
1. **Human:** Design billing spec (Stripe integration, pricing plans)
2. **Agent:** Use `Create New Feature Unit` → `Run Feature Workflow`
3. **Agent:** Implement Stripe integration (subscriptions, webhooks)
4. **Agent:** Implement billing UI (subscription management, invoices)
5. **Human:** Review Stripe integration (payment security)
6. **Agent:** Write tests (integration with Stripe test mode)
7. **Human:** Final approval
**Phase 7 Total:** 6-8h manual, 21-27h agent (minimal MVP: FU-700, FU-701 only; FU-703 already complete)
### Phase 8: Observability
**Goal:** Complete metrics, analytics, logging.
#### FU-800: Technical Metrics (Prometheus)
- **Execution:** Hybrid (Agent implementation → Human review)
- **Cursor Command:** `Run Feature Workflow` with `feature_id=FU-800`
- **Manual Time:** 1.5-2h (metrics design review)
- **Agent Time:** 6-8h (Prometheus client, instrumentation, dashboards)
- **Risk:** Low-Medium (cross-cutting)
- **Dependencies:** All FUs (instrumentation)
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Run Feature Workflow` to instrument metrics
2. **Agent:** Add Prometheus client, instrument 8 MVP MCP actions, ingestion, search
3. **Human:** Review metrics design (required metrics from METRICS_REQUIREMENTS.md)
4. **Agent:** Set up Grafana dashboards
5. **Agent:** Write tests
6. **Human:** Approval
#### FU-803: Product Analytics (PostHog)
- **Execution:** Cloud Agent (event tracking)
- **Cursor Command:** `Run Feature Workflow` with `feature_id=FU-803`
- **Manual Time:** 0.5-1h (event design review)
- **Agent Time:** 3-4h (PostHog integration, event tracking, dashboards)
- **Risk:** Low
- **Dependencies:** FU-700 (user identification)
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Run Feature Workflow` to integrate PostHog
2. **Agent:** Track user events (signup, upload, extraction, etc.)
3. **Agent:** Set up funnels, retention cohorts, dashboards
4. **Human:** Review event design (activation, retention metrics)
5. **Agent:** Write tests
6. **Human:** Approval
#### FU-801: Structured Logging
- **Execution:** Cloud Agent (refactoring)
- **Cursor Command:** `Run Feature Workflow` with `feature_id=FU-801`
- **Manual Time:** 0.5-1h (logging design review)
- **Agent Time:** 4-5h (Winston/Pino, PII filtering, trace_id)
- **Risk:** Low-Medium
- **Dependencies:** None
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Run Feature Workflow` to refactor logging
2. **Agent:** Add structured logging, PII filtering, trace_id injection
3. **Human:** Review PII filtering (privacy)
4. **Agent:** Write tests
5. **Human:** Approval
**Phase 8 Total:** 2.5-4h manual, 13-17h agent
### Phase 9: Polish and Hardening
**Goal:** Complete error handling, loading states, empty states, A11y.
#### FU-900: Error Handling UI
- **Execution:** Cloud Agent (polish)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-900`
- **Manual Time:** 0.25-0.5h (quick review)
- **Agent Time:** 2-3h (error boundary, enhanced messages)
- **Risk:** Low
- **Dependencies:** FU-300 ✅
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Add error boundary, retry mechanisms
3. **Human:** Quick review
4. **Agent:** Write tests
5. **Human:** Approval
#### FU-901: Loading States
- **Execution:** Cloud Agent (polish)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-901`
- **Manual Time:** 0.25-0.5h (quick review)
- **Agent Time:** 2-3h (skeleton loaders, spinners)
- **Risk:** Low
- **Dependencies:** FU-300 ✅
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Implement skeleton loaders, consistent spinners
3. **Human:** Quick review
4. **Agent:** Write tests
5. **Human:** Approval
#### FU-902: Empty States
- **Execution:** Cloud Agent (polish)
- **Cursor Command:** `UI Workflow` with `feature_id=FU-902`
- **Manual Time:** 0.25-0.5h (quick review)
- **Agent Time:** 2-3h (empty state components)
- **Risk:** Low
- **Dependencies:** FU-300 ✅
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Create New Feature Unit` → `Create Prototype` → `Run Feature Workflow` (following new workflow)
2. **Agent:** Implement empty states for all views
3. **Human:** Quick review
4. **Agent:** Write tests
5. **Human:** Approval
#### FU-903: A11y Audit
- **Execution:** Hybrid (Agent audit → Human review → Agent fixes)
- **Cursor Command:** `Run Feature Workflow` with `feature_id=FU-903`
- **Manual Time:** 1-1.5h (A11y review)
- **Agent Time:** 5-6h (jest-axe, fixes across components)
- **Risk:** Low-Medium
- **Dependencies:** All UI FUs
- **Priority:** P1 (not required for minimal MVP)
**Steps:**
1. **Agent:** Use `Run Feature Workflow` to run A11y audit
2. **Agent:** Install jest-axe, run on all components
3. **Human:** Review violations
4. **Agent:** Fix violations, keyboard nav audit
5. **Human:** Final review
6. **Agent:** Write tests
7. **Human:** Approval
**Phase 9 Total:** 1.75-3h manual, 11-15h agent
### Cleanup Phase: Disable Post-MVP Features
**Goal:** Disable or flag post-MVP features before MVP launch.
**Estimated Effort:** 1-2 days
**Tasks:**
1. **Remove LLM Extraction (FU-100):**
   - Remove all `openai.chat.completions.create()` calls from `src/services/file_analysis.ts`
   - Replace with rule-based schema detection (regex patterns)
   - Replace with rule-based field extraction (regex parsers per schema)
   - Update `normalizeRecordType()` to return `'document'` for unrecognized types
   - Remove custom type sanitization
   - Document as "rule-based extraction only in MVP" in ingestion docs
   - **Rationale:** Violates NEOTOMA_MANIFEST.md MVP constraint "No LLM extraction (MVP constraint; rule-based only)"
2. **Disable Semantic Search:**
   - Add feature flag `ENABLE_SEMANTIC_SEARCH=false`
   - Update `/retrieve_records` to skip semantic search when flag is false
   - Remove semantic search mode toggle from UI (FU-600)
   - Document as "post-MVP feature" in API docs
3. **Disable Plaid Integration:**
   - Add feature flag `ENABLE_PLAID=false`
   - Hide Plaid endpoints or return 503 with "post-MVP feature" message
   - Document FU-207 and FU-500 as post-MVP
4. **Disable X and Instagram Integrations:**
   - Add feature flags `ENABLE_X_INTEGRATION=false` and `ENABLE_INSTAGRAM_INTEGRATION=false`
   - Hide X/Instagram provider endpoints or return 503 with "post-MVP feature" message
   - Remove X/Instagram from provider catalog display (Gmail only for MVP)
   - Document X/Instagram as post-MVP in provider documentation
5. **Document CSV Processing:**
   - Add note in API docs: "CSV processing is beyond MVP scope but available"
   - Keep functionality enabled (useful, low maintenance)
6. **Keep Record Comparison & Summaries:**
   - Keep enabled (isolated, helpful, low maintenance)
   - Document as "beyond MVP scope" if needed
**Steps:**
1. **Agent:** Remove LLM extraction from file analysis (FU-100 implementation)
2. **Agent:** Add feature flags for semantic search, Plaid, X, and Instagram
3. **Agent:** Update code to respect flags
4. **Agent:** Update API documentation
5. **Human:** Review flag implementation and LLM removal
6. **Agent:** Write tests for flag behavior and rule-based extraction determinism
7. **Human:** Final approval
## Execution Summary
### Minimal MVP (P0 Only, Multi-User Support)
**Remaining Work:**
- Phase 1: FU-101, FU-102, FU-103, FU-105
- Phase 3: FU-303, FU-304
- Phase 4: FU-400, FU-401, FU-402, FU-403
- Phase 7: FU-700, FU-701 (FU-703 Local Storage / Offline Mode already complete)
- Cleanup: Disable post-MVP features
**Total Estimates:**
- **Manual Time:** 10-17h (spec design, reviews, approvals)
- **Agent Time:** 43-57h (implementation, tests)
- **Cleanup Time:** 1-2 days (disable post-MVP features)
- **Calendar:** 5-7 days + 1-2 days cleanup = **7-9 days total**
**Execution Order:**
1. Week 1: Phase 1 (Core Services) — 7.5-10.5h manual, 24-32h agent (includes FU-100)
2. Week 2: Phase 3 + Phase 4 + Phase 7 (UI, Onboarding, Auth) — 4.5-9.5h manual, 27-35h agent
3. Cleanup: Disable post-MVP features, verify LLM removal — 1-2 days
### Full MVP (P0 + P1, Multi-User Support)
**Additional Work:**
- Phase 3: FU-305, FU-306
- Phase 5: FU-501 (FU-500 Plaid UI moved to post-MVP)
- Phase 6: FU-600
- Phase 7: FU-702 (billing, revenue critical)
- Phase 8: FU-800, FU-801, FU-803
- Phase 9: FU-900, FU-901, FU-902, FU-903
- Cleanup: Disable post-MVP features
**Total Estimates:**
- **Manual Time:** 19-30.5h (includes billing review, FU-500 removed)
- **Agent Time:** 74-99h (full implementation, FU-500 removed)
- **Cleanup Time:** 1-2 days (disable post-MVP features)
- **Calendar:** 10-13 days + 1-2 days cleanup = **12-15 days total**
**Execution Order:**
1. Week 1: Phase 1 (Core Services)
2. Week 2: Phase 3 + Phase 4 + Phase 7 (UI, Onboarding, Auth, RLS)
3. Week 3: Phase 5 + Phase 6 + Phase 7 (Provider Integrations, Search, Billing)
4. Week 4: Phase 8 + Phase 9 (Observability, Polish)
5. Cleanup: Disable post-MVP features
## Daily Execution Workflow
### Typical Day (8-Hour Agent Workday)
**Morning (2-3 hours):**
1. **Human:** Review previous day's work, approve/reject
2. **Agent:** Fix issues from review (if any)
3. **Agent:** Start next Feature Unit using appropriate Cursor command
**Midday (3-4 hours):**
1. **Agent:** Continue implementation
2. **Agent:** Write tests
3. **Human:** Quick check-in (if high-risk FU)
**Afternoon (2-3 hours):**
1. **Agent:** Complete implementation, update docs
2. **Human:** Review completed work (especially high-risk)
3. **Agent:** Address review feedback
**End of Day:**
1. **Human:** Approve completed FUs
2. **Agent:** Prepare next day's work (scaffold next FU if needed)
## Risk Mitigation
### High-Risk Feature Units
| FU     | Risk               | Mitigation                                      |
| ------ | ------------------ | ----------------------------------------------- |
| FU-101 | Schema migration   | Human reviews migration script before execution |
| FU-102 | Schema migration   | Human reviews migration script before execution |
| FU-103 | Graph integrity    | Human reviews integrity enforcement logic       |
| FU-701 | RLS migration      | Human designs migration, reviews policies       |
| FU-702 | Payment processing | Human reviews Stripe integration, security      |
**Process:**
1. **Human:** Design/review spec for high-risk FU
2. **Agent:** Implement following spec
3. **Human:** Review implementation (especially migrations, security)
4. **Agent:** Fix issues
5. **Human:** Final approval before merge
## Parallelization Strategy
### Can Execute in Parallel
- Phase 4 (onboarding) + Phase 5 (provider integrations) — independent
- Phase 6 (search UI) + Phase 8 (observability) — independent
- Phase 9 FUs — mostly independent polish work
### Cannot Parallelize
- FU-101 → FU-103 (entity resolution must complete before graph builder)
- FU-102 → FU-303 (events must exist before timeline UI)
- FU-103 → FU-105 (graph must be stable before search ranking)
- FU-700 → FU-701 (auth must exist before RLS)
- FU-701 → FU-702 (RLS must exist before billing)
**With 2 Cursor agents in parallel:** Could reduce calendar time by 25-35%.
## Success Criteria
### MVP Launch Readiness
**Technical:**
- [ ] All P0 Feature Units complete (including FU-700, FU-701 for multi-user, FU-703 local storage already complete)
- [ ] All critical path tests passing (100% coverage)
- [ ] Graph integrity verified (0 orphans, 0 cycles)
- [ ] Multi-user isolation verified (RLS policies tested)
- [ ] Bulk upload tested (50+ files)
- [ ] Local storage / offline mode verified (FU-703 already complete)
- [ ] Post-MVP features disabled/flagged (semantic search, Plaid)
**Product:**
- [ ] Onboarding flow complete
- [ ] Core workflows functional (upload → extraction → timeline → AI query)
- [ ] Empty states handled
- [ ] Error states handled with retry
**Revenue (Full MVP only):**
- [ ] Billing and subscription management functional (FU-702)
- [ ] Pricing plans configured (individual: €250–€1,250/month, team: €500–€2,500/month)
## References
**Primary Documents:**
- [`docs/specs/MVP_OVERVIEW.md`](./MVP_OVERVIEW.md) — Product context
- [`docs/specs/MVP_FEATURE_UNITS.md`](./MVP_FEATURE_UNITS.md) — Complete FU inventory with strategic planning (use for planning/estimates)
- [`docs/specs/METRICS_REQUIREMENTS.md`](./METRICS_REQUIREMENTS.md) — Success criteria
- [`docs/specs/IMPLEMENTATION_OVERWRITE_GUIDE.md`](./IMPLEMENTATION_OVERWRITE_GUIDE.md) — **Required code changes to comply with manifest**
- [`docs/private/strategy/implementation_overlap_analysis.md`](../private/strategy/implementation_overlap_analysis.md) — Detailed implementation analysis
**Cursor Commands:**
- `.cursor/commands/create_feature_unit.md` — Scaffold new FU with spec + UX (Checkpoint 0, includes UX if UI changes)
- `.cursor/commands/create_prototype.md` — Build interactive prototype (after Checkpoint 0, UI FUs only)
- `.cursor/commands/run_feature_workflow.md` — Implement FU after spec/prototype approval
- `.cursor/commands/final_review.md` — Present implementation for approval (Checkpoint 2)
- `.cursor/commands/fix_feature_bug.md` — Bug fixing
- `.cursor/commands/modify-subsystem.md` — Subsystem changes
- `.cursor/commands/ingestion-flow.md` — Ingestion work planning
**Standards:**
- [`docs/feature_units/standards/feature_unit_spec.md`](../feature_units/standards/feature_unit_spec.md) — Spec template
- [`docs/feature_units/standards/execution_instructions.md`](../feature_units/standards/execution_instructions.md) — Implementation flow
- [`docs/feature_units/standards/error_protocol.md`](../feature_units/standards/error_protocol.md) — Error handling
**Implementation Compliance:**
- [`docs/specs/IMPLEMENTATION_OVERWRITE_GUIDE.md`](./IMPLEMENTATION_OVERWRITE_GUIDE.md) — **CRITICAL: Required code changes to comply with manifest**
## Agent Instructions
### When to Load This Document
Load when:
- Starting MVP execution in Cursor
- Determining execution strategy for a Feature Unit
- Sequencing work across phases
- Understanding manual vs agent responsibilities
### Required Co-Loaded Documents
- `docs/specs/MVP_FEATURE_UNITS.md` (complete FU inventory, estimates, dependencies — use for planning)
- `docs/specs/MVP_OVERVIEW.md` (product context)
- `.cursor/commands.json` (available commands)
### Constraints
1. **Always use Cursor commands** for Feature Unit work (don't skip scaffolding)
2. **Human review required** for all high-risk FUs (schema, security, graph)
3. **Follow execution order** (respect dependencies)
4. **Hybrid approach** (human spec/review + agent implementation) for most FUs
5. **Disable post-MVP features** before launch (semantic search, Plaid)
6. **MUST overwrite non-compliant code** (see `docs/specs/IMPLEMENTATION_OVERWRITE_GUIDE.md`)
### Forbidden Patterns
- Starting implementation without spec (use `Create New Feature Unit` first — includes dependency validation)
- Creating Feature Units with unimplemented dependencies (validation will reject)
- Skipping UX input and prototype for UI Feature Units (UX collected in Checkpoint 0, then Create Prototype → Review)
- Skipping human review for high-risk FUs (specs, migrations, security)
- Parallelizing dependent FUs (wait for dependencies to be ✅ Complete)
- Using manual development for boilerplate work (use agents)
- Launching with post-MVP features enabled (semantic search, Plaid)
- **Preserving non-compliant code** (LLM extraction, custom types, semantic search)
- Adding feature flags to conditionally enable manifest violations
