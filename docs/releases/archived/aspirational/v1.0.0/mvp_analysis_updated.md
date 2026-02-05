# MVP Feature Status vs. Current Codebase — Updated Analysis

**Date:** 2026-01-19  
**Status:** Updated after documentation consistency fixes, pre-MVP release analysis, and release plan corrections (FU-301/302 renamed, FU-601 promoted to P0)

**Latest Update:** Release planning documents corrected to align with main objects per `docs/vocabulary/canonical_terms.md`. MVP UI now focuses on Source, Entity, Observation, Event instead of deprecated `records` table.

## Executive Summary

**Overall MVP Readiness:** ✅ **75% Complete** (13/20 features complete, 5 partial, 1 architectural gap)

**Key Findings:**
1. AI interpretation is **correctly implemented** and **architecturally compliant**. The architecture explicitly allows AI interpretation for unstructured files with full auditability and system-level idempotence.
2. **CRITICAL:** MVP UI plan has been **corrected** to focus on main objects (Source, Entity, Observation, Event) instead of deprecated `records` table. FU-301/302 renamed, FU-601 promoted to P0.

**Pre-MVP Release Foundation:** The MVP builds on 4 pre-MVP releases (v0.1.0, v0.2.0, v0.2.1, v0.2.15) that completed 41+ feature units, providing a solid foundation for MVP launch.

**Remaining Work:** 6.5-10.5 days (UI refactoring to main objects, FU-300 polish, FU-303 timeline, FU-601 entity explorer, FU-700 auth UI, FU-701 RLS fix)

---

## Pre-MVP Release Foundation

### v0.1.0 — Internal MCP Release (✅ ready_for_deployment)

**Status:** `ready_for_deployment`  
**Completed:** 26 Feature Units  
**Development Time:** 2-3 days (Dec 9-11, 2025)  
**Test Pass Rate:** 99.5% (373/375 overall, 146/146 v0.1.0 tests)

**MVP-Relevant Features Completed:**
- ✅ **FU-100:** File Analysis Service (rule-based extraction, LLM support)
- ✅ **FU-101:** Entity Resolution Service (hash-based IDs, DB persistence)
- ✅ **FU-102:** Event Generation Service (timeline events, DB persistence)
- ✅ **FU-103:** Graph Builder Service (transactional, integrity checks)
- ✅ **FU-105:** Search Service (deterministic ranking)
- ✅ **FU-050:** Event-Sourcing Foundation (event log, historical API)
- ✅ **FU-051:** Repository Abstractions (DB and file implementations)
- ✅ **FU-052:** Reducer Versioning (reducer registry)
- ✅ **FU-055:** Observation Storage Layer (tables and repositories)
- ✅ **FU-056:** Enhanced Reducer Engine (merge strategies)
- ✅ **FU-057:** Schema Registry Service (config-driven schemas)
- ✅ **FU-058:** Observation-Aware Ingestion (integrated into upload pipeline)
- ✅ **FU-059:** Relationship Types (relationships service)
- ✅ **FU-061:** MCP Actions for Observations (5 observation/relationship actions)
- ✅ **FU-200:** MCP Server Core
- ✅ **FU-201-206:** Core MCP Actions (store_record, retrieve_records, update_record, delete_record, upload_file, get_file_url)

**Key Achievements:**
- Core Truth Layer services operational
- Four-layer truth model foundation
- Event-sourcing infrastructure
- Observation architecture
- MCP server with 11 actions

---

### v0.2.0 — Minimal Ingestion + Correction Loop (✅ in_testing)

**Status:** `in_testing`  
**Completed:** 13 Feature Units  
**Development Time:** ~4 hours (single session, 2025-12-31)  
**Test Pass Rate:** 100% (11/11 integration tests passing)

**MVP-Relevant Features Completed:**
- ✅ **FU-110:** Sources Table Migration (content-addressed storage with RLS)
- ✅ **FU-111:** Interpretation Runs Table (versioned interpretation tracking)
- ✅ **FU-113:** Entity Extensions (user_id + merge tracking)
- ✅ **FU-114:** Observation Extensions (source_id linkage)
- ✅ **FU-115:** Raw Fragments Extensions (unknown field storage)
- ✅ **FU-116:** Entity Merges Table (audit log)
- ✅ **FU-120:** Raw Storage Service (SHA-256, synchronous storage)
- ✅ **FU-121:** Interpretation Service (schema validation, entity resolution, AI interpretation)
- ✅ **FU-122:** MCP ingest() Tool (core ingestion with AI interpretation)
- ✅ **FU-123:** MCP ingest_structured() Tool (pre-structured data)
- ✅ **FU-124:** MCP reinterpret() Tool (re-interpretation)
- ✅ **FU-125:** MCP correct() Tool (corrections with priority 1000)
- ✅ **FU-126:** MCP merge_entities() Tool (entity deduplication)
- ✅ **FU-134:** Query Updates (provenance, merge exclusion)

**Key Achievements:**
- Sources-first architecture fully implemented
- AI interpretation service operational (with audit trail)
- Content-addressed storage with deduplication
- Versioned interpretation runs
- Correction mechanism (priority-1000 observations)
- Entity merge capability
- Cross-user data isolation (RLS)

---

### v0.2.1 — Documentation Generation System (✅ complete)

**Status:** `complete`  
**Completed:** 2 Feature Units

**MVP-Relevant Features Completed:**
- ✅ **FU-300:** AI-Powered Documentation Analysis & Generation (documentation generator)
- ✅ **FU-301:** Static Documentation Web Server (landing page and routes)

**Key Achievements:**
- Documentation generation system operational
- Static documentation web server
- Search functionality

**Note:** FU-300 in v0.2.1 is documentation generation, not the UI design system (FU-300 in MVP is different)

---

### v0.2.15 — Complete Architecture Migration (✅ implemented, pending migrations)

**Status:** `implemented` (pending database migration application)  
**Completed:** Architecture migration, code cleanup

**MVP-Relevant Features Completed:**
- ✅ Unified `ingest()` action (replaces submit_payload, ingest_structured)
- ✅ Deprecated old MCP actions removed (~450 lines removed)
- ✅ New HTTP API endpoints (entity-based)
- ✅ Frontend API client updated
- ✅ Vocabulary updates (40+ docs updated)
- ✅ Table renames (interpretation_runs → interpretations)

**Key Achievements:**
- Unified ingestion API (single action for all source)
- Simplified MCP surface (62.5% reduction in ingestion actions)
- Code reduction (~450 lines removed)
- Architecture alignment (sources-first fully integrated)

**Pending:**
- Database migrations application
- Data migration script (Phase 4)
- Legacy cleanup (Phase 5, deferred to v0.2.16)

---

## MVP Feature Status with Pre-MVP Attribution

| Feature | MVP Requirement | Current Status | Pre-MVP Release | Architectural Compliance | Notes |
|---------|----------------|----------------|-----------------|--------------------------|-------|
| **AI Interpretation for Unstructured Files** | Allowed (auditable, idempotent) | ✅ **Complete** | v0.2.0 (FU-121) | ✅ **Compliant** | Interpretation service operational; config logged; idempotence enforced |
| **Rule-Based Extraction** | Available for structured data | ✅ **Complete** | v0.1.0 (FU-100) | ✅ **Compliant** | Rule-based patterns exist in `extraction/rules.ts` |
| **Four-Layer Truth Model** | Source → Interpretation → Observation → Entity Snapshot | ✅ **Complete** | v0.1.0 (FU-055-058) + v0.2.0 (FU-110-116) | ✅ **Compliant** | Fully implemented across v0.1.0 and v0.2.0 |
| **Sources-First Architecture** | Content-addressed storage, deduplication | ✅ **Complete** | v0.2.0 (FU-110, FU-120) | ✅ **Compliant** | SHA-256 hashing, per-user deduplication |
| **FU-101: Entity Resolution** | Deterministic hash-based IDs | ✅ **Complete** | v0.1.0 (FU-101) + v0.2.0 (FU-113) | ✅ **Compliant** | Hash-based IDs, normalization, user-scoped |
| **FU-102: Event Generation** | Deterministic timeline events | ✅ **Complete** | v0.1.0 (FU-102) | ✅ **Compliant** | Hash-based event IDs, schema-driven mapping |
| **FU-103: Graph Builder** | Transactional, integrity checks | ✅ **Complete** | v0.1.0 (FU-103) | ✅ **Compliant** | Orphan/cycle detection, transactional inserts |
| **FU-105: Search Service** | Deterministic ranking | ✅ **Complete** | v0.1.0 (FU-105) | ✅ **Compliant** | Rule-based scoring with tiebreakers |
| **Event-Sourcing Foundation** | Domain Events → Reducers → State | ✅ **Complete** | v0.1.0 (FU-050, FU-051) | ✅ **Compliant** | Event log, reducers, historical replay |
| **Observation Architecture** | Immutable observations, reducer snapshots | ✅ **Complete** | v0.1.0 (FU-055-058) + v0.2.0 (FU-114) | ✅ **Compliant** | Observations created, reducers compute snapshots, provenance tracked |
| **Schema Registry** | Config-driven schemas, versioning | ✅ **Complete** | v0.1.0 (FU-057) | ✅ **Compliant** | Schema registry operational, merge policies configured |
| **Interpretation Service** | AI interpretation with audit trail | ✅ **Complete** | v0.2.0 (FU-121) | ✅ **Compliant** | Uses LLM; config logged; idempotence via canonicalization |
| **Unified MCP `ingest()` Action** | Single action for all source | ✅ **Complete** | v0.2.0 (FU-122) + v0.2.15 (unified) | ✅ **Compliant** | Unified `store` action operational; supports unstructured + structured |
| **Correction Mechanism** | Priority-1000 observations | ✅ **Complete** | v0.2.0 (FU-125) | ✅ **Compliant** | Corrections override AI extraction |
| **Entity Merge** | Manual entity deduplication | ✅ **Complete** | v0.2.0 (FU-126) | ✅ **Compliant** | Entity merge with observation rewriting |
| **Local Storage** | Local-first, offline mode | ✅ **Complete** | v0.1.0 (implied) | ✅ **Compliant** | SQLite with encryption, sync, vectors |
| **FU-300: Design System** | UI foundation | 🔨 **Partial** | v0.2.1 (FU-300 docs) | ⚠️ **Needs review** | Documentation system complete; UI design system needs polish |
| **FU-301: Source List** | Browse/search source | 🔨 **Partial** | Prototype | ⚠️ **Needs refactor** | **RENAMED** from "Records List"; prototype uses deprecated `records` table; needs refactor to `sources` table |
| **FU-302: Source Detail** | Source + interpretations + observations | 🔨 **Partial** | Prototype | ⚠️ **Needs refactor** | **RENAMED** from "Record Detail"; prototype uses deprecated `records`; needs refactor to show four-layer truth model |
| **FU-303: Timeline View** | Chronological events | ⏳ **Not Started** | Prototype | ⚠️ **Missing** | Required for MVP (P0); prototype exists |
| **FU-304: File Upload UI** | Upload interface | 🔨 **Partial** | Prototype | ⚠️ **Incomplete** | Prototype exists; needs production integration |
| **FU-305: Dashboard** | Overview stats | ⏳ **Not Started** | Prototype | ⚠️ **Missing** | Prototype exists; P1 priority; needs stats on main objects (not records) |
| **FU-601: Entity Explorer** | Browse entities/relationships | ⏳ **Not Started** | Prototype | ⚠️ **Missing** | **PROMOTED to P0** (MVP-critical); prototype exists; validates entity resolution differentiator |
| **FU-700: Authentication UI** | Supabase Auth + UI | 🔨 **Partial** | None (new for MVP) | ⚠️ **Incomplete** | Auth integrated, no UI components |
| **FU-701: RLS Implementation** | User isolation, privacy-first | ⚠️ **Architectural gap** | v0.2.0 (partial) | ❌ **Non-compliant** | `records` table has permissive policy; violates privacy-first architecture |
| **Billing (FU-702)** | Stripe integration | ⏳ **Not Started** | None | N/A | Spec exists, no implementation |
| **Gmail Integration** | User-triggered attachment import | ⏳ **Not Started** | None | ❌ **Non-compliant** | **VIOLATES explicit control:** Allows bulk syncing without per-attachment approval; architecture requires "user approves all ingestion" |
| **Onboarding Flow** | Welcome modal, upload flow | ⏳ **Not Started** | None | N/A | Required for explicit user control |

---

## Pre-MVP Release Summary

| Release | Status | FUs Completed | Key MVP Contributions | Development Time |
|---------|--------|---------------|----------------------|------------------|
| **v0.1.0** | ✅ ready_for_deployment | 26 | Core services, event-sourcing, observation architecture, MCP server | 2-3 days |
| **v0.2.0** | ✅ in_testing | 13 | Sources-first architecture, AI interpretation, corrections, entity merge | ~4 hours |
| **v0.2.1** | ✅ complete | 2 | Documentation generation system | TBD |
| **v0.2.15** | ✅ implemented | Architecture migration | Unified ingest(), code cleanup | TBD |
| **Total** | | **41+ FUs** | **Complete foundation for MVP** | **~3-4 days** |

---

## MVP Feature Status Breakdown

### ✅ Complete from Pre-MVP Releases (13/20)

**From v0.1.0:**
1. ✅ File Analysis Service (FU-100)
2. ✅ Entity Resolution (FU-101)
3. ✅ Event Generation (FU-102)
4. ✅ Graph Builder (FU-103)
5. ✅ Search Service (FU-105)
6. ✅ Event-Sourcing Foundation (FU-050, FU-051)
7. ✅ Observation Architecture (FU-055-058)
8. ✅ Schema Registry (FU-057)
9. ✅ Relationship Types (FU-059)
10. ✅ MCP Server Core (FU-200)
11. ✅ Local Storage (implied)

**From v0.2.0:**
12. ✅ Sources-First Architecture (FU-110, FU-120)
13. ✅ AI Interpretation Service (FU-121)
14. ✅ Unified ingest() Action (FU-122)
15. ✅ Correction Mechanism (FU-125)
16. ✅ Entity Merge (FU-126)

**From v0.2.15:**
17. ✅ Unified API (architecture migration)

### 🔨 Partial (4/20)

**FU-300: Design System** — 🔨 Partial
- **Status:** Foundation exists, needs polish
- **Pre-MVP:** v0.2.1 completed documentation generation (different FU-300)
- **Remaining:** UI component library completion, Truth Layer boundary verification
- **Estimated:** 0.5 days

**FU-301: Source List** — 🔨 Partial (Needs Refactor)
- **Status:** Prototype exists, but uses deprecated `records` table
- **Pre-MVP:** None (new for MVP)
- **Evidence:** RecordsTable component in prototype (needs renaming and refactoring)
- **Remaining:** 
  - Rename component to SourceTable
  - Refactor DB queries from `records` to `sources` table
  - Update filters (mime_type, source_type instead of record type)
  - Update UI labels ("Source" not "Records")
- **Estimated:** 0.5-1 day (refactoring required)
- **Migration Note:** Renamed from "Records List View" per release plan update

**FU-302: Source Detail** — 🔨 Partial (Needs Refactor)
- **Status:** Prototype exists, but uses deprecated `records` table
- **Pre-MVP:** None (new for MVP)
- **Evidence:** RecordDetailsPanel in prototype (needs renaming and refactoring)
- **Remaining:**
  - Rename component to SourceDetail
  - Refactor to use `sources`, `interpretations`, `observations` tables
  - Show four-layer truth model (source → interpretation → observation → entity)
  - Display interpretation config (model, temperature, prompt_hash)
  - Display observations with provenance
  - Link to entities via observations
- **Estimated:** 1-1.5 days (refactoring required)
- **Migration Note:** Renamed from "Record Detail View" per release plan update

**FU-304: File Upload UI** — 🔨 Partial
- **Status:** Prototype exists, needs production integration
- **Pre-MVP:** None (new for MVP)
- **Evidence:** MockUploadUI component in prototype
- **Remaining:** Production API integration, real upload flow
- **Estimated:** 0.5 days

**FU-700: Authentication UI** — 🔨 Partial
- **Status:** Supabase Auth integrated, UI missing
- **Pre-MVP:** None (new for MVP)
- **Remaining:** Signup/signin forms, password reset, OAuth providers
- **Estimated:** 0.5-1 day

### ❌ Architectural Gaps (2/20)

**FU-701: RLS Implementation** — ❌ Non-compliant
- **Status:** RLS enabled but policy is permissive
- **Pre-MVP:** v0.2.0 enabled RLS on new tables, but `records` table policy is permissive
- **Issue:** `records` table policy allows all authenticated users to read all records
- **Required Fix:** Update policy to `USING (user_id = auth.uid())`
- **Estimated:** 1-2 days
- **Violates:** Privacy-first architecture, user data isolation

**Gmail Integration Design** — ❌ Non-compliant
- **Status:** Design violates explicit control principle
- **Pre-MVP:** None (not implemented)
- **Issue:** Current design allows bulk syncing (user selects labels → system ingests ALL matching attachments without per-attachment approval)
- **Violates:** 
  - "user approves all ingestion" (`docs/foundation/philosophy.md` Section 5.2)
  - "explicit, never automatic" (`docs/foundation/core_identity.md` Section 1)
- **Required Fix:**
  - User must approve EACH attachment individually before ingestion
  - Cannot bulk ingest based on label filter alone
  - Must show attachment list and require per-item approval
  - Each attachment requires explicit user action to ingest
- **Estimated:** Design change required (implementation TBD)
- **Note:** Explicitly excluded from MVP, but design must be corrected for future implementation

### ⏳ Not Started (6/20)

**FU-303: Timeline View** — ⏳ Not Started
- **Pre-MVP:** None (new for MVP)
- **Status:** Prototype exists, needs production implementation
- **Evidence:** Timeline view in prototype (`PrototypeApp.tsx`)
- **Remaining:** Production API integration, real event data binding
- **Priority:** P0 (included in MVP release plan)
- **Estimated:** 1-2 days
- **Note:** Required for MVP; explicitly listed in release plan

**FU-305: Dashboard** — ⏳ Not Started
- **Pre-MVP:** None (new for MVP)
- **Status:** Prototype exists, needs production implementation
- **Evidence:** `Dashboard` component in prototype
- **Remaining:** Production API integration, real stats
- **Priority:** P1 (recommended, not critical)
- **Estimated:** 0.5-1 day
- **Note:** P1 priority, may be deferred

**FU-601: Entity Explorer** — ⏳ Not Started
- **Pre-MVP:** None (new for MVP)
- **Status:** Prototype exists, NOT in MVP scope
- **Evidence:** `EntityExplorerView` component in prototype
- **Remaining:** Entity list view, entity detail view, relationship graph visualization
- **Priority:** P2 (NOT in MVP critical path)
- **Estimated:** 2-3 days
- **Note:** ✅ **RESOLVED** — FU-601 promoted to P0 in release plan update. Entity Explorer is now MVP-critical.

**Billing (FU-702)** — ⏳ Not Started
- **Pre-MVP:** None
- **Status:** Spec exists, no implementation
- **Evidence:** `docs/feature_units/completed/FU-702/billing_spec.md` exists
- **Remaining:** Stripe integration, subscription management
- **Note:** May be deferred post-MVP depending on business priorities

**Gmail Integration** — ⏳ Not Started
- **Pre-MVP:** None
- **Status:** OAuth test exists, no implementation
- **Evidence:** OAuth setup documented, no attachment import logic
- **Remaining:** User-triggered attachment import flow
- **Note:** Explicitly excluded from MVP per release plan

**Onboarding Flow** — ⏳ Not Started
- **Pre-MVP:** None
- **Status:** No implementation
- **Remaining:** Welcome modal, upload flow, first-run experience
- **Note:** Required for explicit user control principle

---

## Architectural Compliance Assessment

### ✅ Compliant Features (13/20)

**Core Architecture:**
1. **AI Interpretation** — ✅ Fully compliant (v0.2.0)
   - Uses interpretation service (`src/services/interpretation.ts`)
   - Interpretation config logged (model, temperature, prompt_hash, code_version)
   - System-level idempotence enforced (canonicalization + hashing)
   - Non-deterministic but auditable (per architecture)

2. **Four-Layer Truth Model** — ✅ Fully implemented (v0.1.0 + v0.2.0)
   - Source → Interpretation → Observation → Entity Snapshot
   - Provenance chain complete
   - Immutability preserved (reinterpretation creates NEW observations)

3. **Event-Sourcing** — ✅ Operational (v0.1.0)
   - Event log implemented
   - Reducers compute snapshots
   - Historical replay supported

4. **Truth Layer Boundaries** — ✅ Respected
   - No strategy/execution logic in Neotoma code
   - MCP actions are Truth Layer only
   - No violations detected

**Core Services:**
5. **Entity Resolution (FU-101)** — ✅ Complete (v0.1.0)
   - Hash-based deterministic IDs
   - User-scoped resolution
   - Normalization logic operational

6. **Event Generation (FU-102)** — ✅ Complete (v0.1.0)
   - Hash-based event IDs
   - Schema-driven field-to-event mapping
   - Timeline generation operational

7. **Graph Builder (FU-103)** — ✅ Complete (v0.1.0)
   - Transactional inserts
   - Orphan/cycle detection
   - Integrity checks operational

8. **Search Service (FU-105)** — ✅ Complete (v0.1.0)
   - Deterministic ranking
   - Rule-based scoring
   - Tiebreaker logic operational

**Infrastructure:**
9. **Schema Registry** — ✅ Complete (v0.1.0)
   - Config-driven schemas
   - Versioning support
   - Merge policies configured

10. **Observation Architecture** — ✅ Complete (v0.1.0 + v0.2.0)
    - Observations immutable
    - Reducers compute snapshots
    - Provenance tracking operational

11. **Unified MCP Action** — ✅ Complete (v0.2.0 + v0.2.15)
    - `store` action handles unstructured + structured
    - `interpret: true` parameter for AI interpretation
    - Supports file_content, file_path, and entities array

12. **Local Storage** — ✅ Complete (v0.1.0)
    - SQLite WASM implementation
    - Encryption support
    - Sync capabilities
    - Vector storage

13. **Sources-First Architecture** — ✅ Complete (v0.2.0)
    - Content-addressed storage (SHA-256)
    - Deduplication per user
    - Versioned interpretation runs
    - Complete provenance chain

### 🔨 Partial Features (4/20)

**FU-300: Design System** — 🔨 Partial
- **Status:** Foundation exists, needs polish
- **Pre-MVP:** v0.2.1 completed documentation generation (different scope)
- **Evidence:** shadcn/ui components integrated
- **Remaining:** UI polish, component library completion
- **Estimated:** 0.5 days
- **Architectural Compliance:** ⚠️ Needs review for Truth Layer boundaries

**FU-700: Authentication UI** — 🔨 Partial
- **Status:** Supabase Auth integrated, UI missing
- **Pre-MVP:** None (new for MVP)
- **Evidence:** Auth service operational, no UI components
- **Remaining:** Signup/signin forms, password reset, OAuth providers
- **Estimated:** 0.5-1 day
- **Architectural Compliance:** ⚠️ Required for explicit user control

### ❌ Architectural Gaps (2/20)

**FU-701: RLS Implementation** — ❌ Non-compliant
- **Status:** RLS enabled but policy is permissive
- **Pre-MVP:** v0.2.0 enabled RLS on new tables (sources, interpretations, observations, etc.)
- **Location:** `supabase/migrations/20260115130300_consolidate_records_policies.sql`
- **Issue:** `records` table policy allows all authenticated users to read all records:
  ```sql
  CREATE POLICY "Users read records" ON records
    FOR SELECT 
    USING (true); -- ❌ Allows all users to read all records
  ```
- **Required Fix:**
  ```sql
  CREATE POLICY "Users read records" ON records
    FOR SELECT 
    USING (user_id = auth.uid()); -- ✅ User-scoped access
  ```
- **Violates:**
  - `docs/foundation/core_identity.md`: "Privacy-First: User-controlled memory"
  - `docs/foundation/product_principles.md` Section 10.7: "Privacy Over Automation"
  - `docs/architecture/architecture.md` Section 7.1: "User can only access their own records"
- **Note:** `records` table is legacy (scheduled for removal in v0.2.16/v0.3.0), but if MVP still uses it, RLS must be fixed
- **Estimated:** 1-2 days (migration + policy updates + service updates + testing)

### ⏳ Not Started (6/20)

**FU-303: Timeline View** — ⏳ Not Started
- **Pre-MVP:** None (new for MVP)
- **Status:** Prototype exists, needs production implementation
- **Evidence:** Timeline view in prototype (`PrototypeApp.tsx`)
- **Remaining:** Production API integration, real event data binding
- **Priority:** P0 (included in MVP release plan)
- **Estimated:** 1-2 days
- **Note:** Required for MVP; explicitly listed in release plan

**FU-305: Dashboard** — ⏳ Not Started
- **Pre-MVP:** None (new for MVP)
- **Status:** Prototype exists, needs production implementation
- **Evidence:** `Dashboard` component in prototype
- **Remaining:** Production API integration, real stats
- **Priority:** P1 (recommended, not critical)
- **Estimated:** 0.5-1 day
- **Note:** P1 priority, may be deferred

**FU-303: Timeline View** — ⏳ Not Started
- **Pre-MVP:** None (new for MVP)
- **Status:** Prototype exists, needs production implementation
- **Evidence:** Timeline view in prototype (`PrototypeApp.tsx`)
- **Remaining:** Production API integration, real event data binding
- **Priority:** P0 (included in MVP release plan)
- **Estimated:** 1-2 days
- **Note:** Required for MVP; explicitly listed in release plan

**FU-305: Dashboard** — ⏳ Not Started
- **Pre-MVP:** None (new for MVP)
- **Status:** Prototype exists, needs production implementation
- **Evidence:** `Dashboard` component in prototype
- **Remaining:** Production API integration, real stats
- **Priority:** P1 (recommended, not critical)
- **Estimated:** 0.5-1 day
- **Note:** P1 priority, may be deferred

**FU-601: Entity Explorer** — ⏳ Not Started
- **Pre-MVP:** None (new for MVP)
- **Status:** Prototype exists, NOT in MVP scope
- **Evidence:** `EntityExplorerView` component in prototype
- **Remaining:** Entity list view, entity detail view, relationship graph visualization
- **Priority:** P2 (NOT in MVP critical path)
- **Estimated:** 2-3 days
- **Note:** ✅ **RESOLVED** — FU-601 promoted to P0 in release plan update. Entity Explorer is now MVP-critical.

**Billing (FU-702)** — ⏳ Not Started
- **Pre-MVP:** None
- **Status:** Spec exists, no implementation
- **Evidence:** `docs/feature_units/completed/FU-702/billing_spec.md` exists
- **Remaining:** Stripe integration, subscription management
- **Note:** May be deferred post-MVP depending on business priorities

**Gmail Integration** — ⏳ Not Started
- **Pre-MVP:** None
- **Status:** OAuth test exists, no implementation
- **Evidence:** OAuth setup documented, no attachment import logic
- **Remaining:** User-triggered attachment import flow
- **Note:** Explicitly excluded from MVP per release plan

**Onboarding Flow** — ⏳ Not Started
- **Pre-MVP:** None
- **Status:** No implementation
- **Remaining:** Welcome modal, upload flow, first-run experience
- **Note:** Required for explicit user control principle

---

## Pre-MVP Release Timeline

| Release | Date | Status | Key Achievement |
|---------|------|--------|-----------------|
| **v0.1.0** | Dec 9-11, 2025 | ✅ ready_for_deployment | Core Truth Layer services, event-sourcing, observation architecture |
| **v0.2.0** | Dec 31, 2025 | ✅ in_testing | Sources-first architecture, AI interpretation, corrections |
| **v0.2.1** | TBD | ✅ complete | Documentation generation system |
| **v0.2.15** | Jan 1, 2026 | ✅ implemented | Unified ingest(), architecture migration |
| **v1.0.0 (MVP)** | Jan 23, 2026 (target) | ⏳ planning | Public launch with UI, auth, RLS |

---

## Architectural Compliance Summary

| Architectural Goal | Status | Evidence | Pre-MVP Release |
|-------------------|--------|----------|-----------------|
| **Truth Layer boundaries** | ✅ Compliant | No strategy/execution logic; MCP actions are Truth Layer only | v0.1.0, v0.2.0 |
| **Determinism (where required)** | ✅ Compliant | Deterministic components (hashing, reducers, entity IDs) operational; AI interpretation explicitly non-deterministic but auditable | v0.1.0, v0.2.0 |
| **Idempotence (system-level)** | ✅ Compliant | AI interpretation enforces idempotence via canonicalization, hashing, deduplication (same source + config → same final state) | v0.2.0 |
| **Four-layer truth model** | ✅ Compliant | Source → Interpretation → Observation → Entity Snapshot fully implemented | v0.1.0, v0.2.0 |
| **Event-sourcing** | ✅ Compliant | Event log, reducers, historical replay operational | v0.1.0 |
| **Immutability** | ✅ Compliant | Observations immutable; snapshots computed via reducers | v0.1.0, v0.2.0 |
| **Provenance** | ✅ Compliant | Full chain: Snapshot → Observation → Interpretation (with config) → Source | v0.2.0 |
| **Schema-first processing** | ✅ Compliant | Schema registry operational; extraction schema-driven | v0.1.0 |
| **Explicit user control** | ⚠️ **Gap** | No auth UI (users can't sign up/sign in) | None (new for MVP) |
| **Privacy-first** | ⚠️ **Gap** | RLS incomplete on `records` table (if still in use) | v0.2.0 (partial) |

---

## Architecture Migration Status

The codebase has successfully migrated to sources-first architecture across pre-MVP releases:

✅ **Completed Migrations:**
- **v0.1.0:** Four-layer truth model foundation, observation architecture, event-sourcing
- **v0.2.0:** Sources-first architecture, interpretation service, content-addressed storage
- **v0.2.15:** Unified ingest() action, deprecated old MCP actions, vocabulary alignment

⚠️ **Legacy Components Still Present:**
- `records` table still exists (scheduled for removal in v0.2.16/v0.3.0)
- Legacy HTTP endpoints still present (marked deprecated in v0.2.15)
- Legacy `file_analysis.ts` functions still used by some endpoints

**Note:** MVP release plan (v1.0.0) may reference old architecture:
- Release plan mentions "records" and old MCP actions
- Should align with current sources-first architecture
- May need plan update to reflect v0.2.0+ changes

---

## Required Fixes for MVP

### ❌ Architectural Violations (Must Fix)

**1. Fix RLS Policy (FU-701)** — **CRITICAL**

**Priority:** P0 (MVP-critical for privacy-first architecture)

**Issue:** `records` table RLS policy is permissive, allowing all authenticated users to read all records.

**Pre-MVP Context:** v0.2.0 enabled RLS on new tables, but `records` table policy is permissive.

**Required Fix:**
- Update `records` table policy from `USING (true)` to `USING (user_id = auth.uid())`
- Ensure user-scoped data isolation
- Test with multiple users to verify isolation

**Files to Update:**
- `supabase/migrations/20260115130300_consolidate_records_policies.sql` (or create new migration)
- Update policy: `CREATE POLICY "Users read own records" ON records FOR SELECT USING (user_id = auth.uid());`

**Estimated:** 1-2 days

**2. Fix Gmail Integration Design** — **REQUIRED for Future Implementation**

**Priority:** P2 (not in MVP, but design must be corrected)

**Issue:** Current Gmail integration design violates explicit control principle by allowing bulk syncing without per-attachment approval.

**Architectural Violations:**
- **VIOLATES:** "user approves all ingestion" (`docs/foundation/philosophy.md` Section 5.2)
- **VIOLATES:** "explicit, never automatic" (`docs/foundation/core_identity.md` Section 1)

**Current (Non-Compliant) Design:**
- User selects label filters (e.g., "Receipts")
- System automatically ingests ALL attachments matching labels
- Single approval triggers bulk ingestion

**Required (Compliant) Design:**
- User selects label filters (e.g., "Receipts")
- System shows list of matching attachments
- User must approve EACH attachment individually
- Only approved attachments are ingested
- Each attachment requires explicit user action

**Files to Update:**
- Gmail integration implementation (when built) — Add approval UI for each attachment

**Estimated:** Design change (implementation TBD when Gmail integration is built)

**Note:** Gmail integration is explicitly excluded from MVP, but the design must be corrected before implementation to ensure architectural compliance.

---

## Required Implementation Work for MVP

### 1. Implement User-Scoped RLS (FU-701) — **CRITICAL**

**Priority:** P0 (blocks MVP launch)

**Issue:** `records` table RLS policy allows all authenticated users to read all records, violating privacy-first architecture.

**Pre-MVP Context:** v0.2.0 enabled RLS on all new tables (sources, interpretations, observations, etc.) with proper user-scoped policies. The `records` table (legacy) was not updated.

**Required Changes:**
1. Update `records` table policy: `USING (user_id = auth.uid())`
2. Verify all user-scoped tables have proper RLS
3. Test cross-user isolation
4. Update service layer to ensure `user_id` is set correctly

**Files to Update:**
- `supabase/migrations/20260115130300_consolidate_records_policies.sql` (or create new migration)
- Service layer code that queries `records` table
- MCP actions that access `records` table

**Estimated:** 1-2 days

### 2. Build Authentication UI (FU-700) — **REQUIRED**

**Priority:** P0 (blocks MVP launch)

**Issue:** Supabase Auth is integrated but no UI components exist. Users cannot sign up or sign in.

**Pre-MVP Context:** No pre-MVP release included authentication UI. This is new work for MVP.

**Required Components:**
1. Signup form (email/password)
2. Signin form (email/password)
3. Password reset flow
4. OAuth providers (Google, GitHub)
5. Auth state management in frontend

**Files to Create/Update:**
- `frontend/src/components/auth/SignupForm.tsx`
- `frontend/src/components/auth/SigninForm.tsx`
- `frontend/src/components/auth/PasswordReset.tsx`
- `frontend/src/components/auth/OAuthButtons.tsx`
- Frontend auth state management

**Estimated:** 0.5-1 day

### 3. Build Timeline View (FU-303) — **REQUIRED**

**Priority:** P0 (included in MVP release plan)

**Issue:** Timeline view is required for MVP but not implemented.

**Pre-MVP Context:** Prototype exists but needs production implementation.

**Required Work:**
1. Build Timeline View component
2. Integrate with event generation service (FU-102)
3. Implement chronological event display
4. Add filtering by date range and event type
5. Link events to source records

**Files to Create/Update:**
- `frontend/src/components/TimelineView.tsx`
- Timeline event API endpoints
- Event filtering logic

**Estimated:** 1-2 days

### 4. Refactor UI Components to Main Objects (FU-301, FU-302) — **REQUIRED**

**Priority:** P0 (included in MVP release plan)

**Issue:** UI components exist in prototype but use deprecated `records` table. Must refactor to use main objects (source, observations, interpretations).

**Pre-MVP Context:** Prototype has Records List and Record Detail, but they use deprecated `records` table. Must refactor to `sources` table and show four-layer truth model.

**Required Work:**

**FU-301: Source List**
1. Rename `RecordsTable.tsx` to `SourceTable.tsx`
2. Update DB queries from `records` to `sources` table
3. Update filters (mime_type, source_type, file_name instead of record type)
4. Update UI labels ("Source" not "Records")
5. Update tests to query `sources` table

**FU-302: Source Detail**
1. Rename `RecordDetailsPanel.tsx` to `SourceDetail.tsx`
2. Update to use `sources`, `interpretations`, `observations` tables
3. Add interpretation history section (show config: model, temperature, prompt_hash)
4. Add observations section (show provenance: which source + interpretation contributed which fields)
5. Update entity/event linking (via observations)
6. Update UI labels ("Source" not "Record")
7. Update tests to query correct tables

**Files to Update:**
- `frontend/src/components/RecordsTable.tsx` → `SourceTable.tsx` (rename + refactor)
- `frontend/src/components/RecordDetailsPanel.tsx` → `SourceDetail.tsx` (rename + refactor)
- Frontend API client (update endpoints)
- All references to "records" in UI code

**Estimated:** 1.5-2.5 days (refactoring required, not just integration)

### 5. Design System Polish (FU-300) — **RECOMMENDED**

**Priority:** P1 (recommended for MVP)

**Issue:** Design system foundation exists but needs polish.

**Pre-MVP Context:** v0.2.1 completed FU-300 for documentation generation (different scope). MVP FU-300 is UI design system.

**Required Work:**
1. Complete component library
2. Verify Truth Layer boundaries in UI components
3. Ensure consistent styling
4. Test accessibility

**Estimated:** 0.5 days

### 6. Build Entity Explorer (FU-601) — **REQUIRED**

**Priority:** P0 (MVP-critical, promoted from P2)

**Status:** ✅ **RESOLVED** — FU-601 promoted to P0 in release plan update

**Issue:** Entity resolution (FU-101) is MVP-critical competitive differentiator, but users couldn't see entities without Entity Explorer.

**Resolution:** FU-601 promoted from P2 to P0 in release plan. Entity Explorer is now MVP-critical.

**Required Work:**
1. Build Entity List view:
   - Browse entities by type (company, person, invoice, location, etc.)
   - Filter by entity type
   - Search by canonical name
   - Show entity count by type
2. Build Entity Detail view:
   - Display entity snapshot (current truth computed from observations)
   - Display observations (with provenance: which source contributed which fields)
   - Display relationships (PART_OF, REFERS_TO, SETTLES, etc.)
   - Link to source (via observations)
   - Show merge history (if entity was merged)
3. Basic relationship visualization (can defer advanced viz to post-MVP)
4. Update tests for entity browsing

**Files to Create/Update:**
- `frontend/src/components/EntityList.tsx` (new)
- `frontend/src/components/EntityDetail.tsx` (new)
- `frontend/src/components/EntityExplorerView.tsx` (prototype exists, needs production integration)
- Entity API endpoints
- Entity relationship queries

**Estimated:** 2-3 days

**Note:** Prototype exists (`EntityExplorerView.tsx`), needs production API integration and enhancement

### 7. Align MVP Plan with Current Architecture — **✅ COMPLETED**

**Priority:** P2 (documentation update)

**Status:** ✅ **COMPLETED** — Release plan updated to align with current architecture

**Completed Updates:**
1. ✅ Updated release plan to reference sources-first architecture
2. ✅ Renamed FU-301/302 to "Source List/Detail" (removed references to deprecated `records`)
3. ✅ Updated MCP action references to reflect unified `store` action
4. ✅ Updated acceptance criteria to reflect interpretation service
5. ✅ Promoted FU-601 to P0 (Entity Explorer now in MVP scope)

**Files Updated:**
- ✅ `docs/releases/v1.0.0/release_plan.md` — Updated P0 FU list, renamed FU-301/302, promoted FU-601
- ✅ `docs/specs/MVP_FEATURE_UNITS.md` — Updated FU-301/302/601 specs
- ✅ `docs/specs/MVP_OVERVIEW.md` — Updated UI description
- ✅ `docs/releases/v1.0.0/UI_REFACTORING_PLAN.md` — Created refactoring plan

**Note:** Implementation work remains (refactoring prototype to use main objects)

---

## Architectural Strengths

1. ✅ **Four-layer truth model fully operational** (v0.1.0 + v0.2.0) — Complete provenance chain
2. ✅ **Event-sourcing foundation complete** (v0.1.0) — Historical replay supported
3. ✅ **Observation architecture with provenance tracking** (v0.1.0 + v0.2.0) — Full audit trail
4. ✅ **Schema registry for config-driven evolution** (v0.1.0) — Flexible schema management
5. ✅ **Truth Layer boundaries respected** — No strategy/execution logic
6. ✅ **Deterministic components** (v0.1.0) — Entity resolution, event generation, search ranking
7. ✅ **AI interpretation support** (v0.2.0) — With auditability and idempotence
8. ✅ **Sources-first architecture** (v0.2.0) — Content-addressed, deduplicated storage
9. ✅ **Unified MCP action** (v0.2.0 + v0.2.15) — Single `ingest()` for all source types
10. ✅ **Correction mechanism** (v0.2.0) — Priority-1000 observations override AI
11. ✅ **Entity merge capability** (v0.2.0) — Manual deduplication with audit trail

---

## Summary

**Complete (13/20):** Core architecture, entity resolution, events, graph, search, MCP actions, observation architecture, event-sourcing, local storage, interpretation service, AI interpretation support, idempotence enforcement, sources-first architecture

**Partial (5/20):** Design system (needs polish), Source List (needs refactor from records), Source Detail (needs refactor from records), Upload UI (prototype), Auth UI (missing)

**Violations (2/20):** RLS on records table (must be fixed), Gmail integration design (non-compliant with explicit control)

**Not Started (6/20):** Timeline View (P0, required), Entity Explorer (P0, promoted from P2), Dashboard (P1), Billing, Gmail integration (❌ non-compliant design), Onboarding

**Pre-MVP Foundation:** 41+ feature units completed across 4 releases (v0.1.0, v0.2.0, v0.2.1, v0.2.15) providing solid foundation for MVP

**Estimated Remaining Work:** 6.5-10.5 days
- UI refactoring (FU-301/302): 1.5-2.5 days
- Entity Explorer (FU-601): 2-3 days
- Timeline View (FU-303): 1-2 days
- Auth UI (FU-700): 0.5-1 day
- RLS fix (FU-701): 1-2 days
- Design system polish (FU-300): 0.5 days

**✅ Planning Gaps RESOLVED:**
1. ✅ **FU-301/302 renamed** — Now "Source List/Detail" (release plan updated)
2. ✅ **FU-601 promoted to P0** — Entity Explorer now in MVP scope (release plan updated)
3. ⚠️ **Observation visibility** — Recommended P1 feature (add to Entity Detail view)
4. ✅ **MVP validates current architecture** — UI plan now focuses on main objects (source, entities, events)

**Architectural Assessment:** The codebase is architecturally sound. AI interpretation is correctly implemented with full auditability and system-level idempotence. 

**Architectural Violations:**
1. **RLS on records table** — Permissive policy violates privacy-first architecture
2. **Gmail integration design** — Bulk syncing without per-attachment approval violates "user approves all ingestion" principle

**Main gaps for MVP launch:**
- User isolation (RLS fix)
- Authentication UI
- UI refactoring to main objects

---

## ⚠️ Critical: MVP UI Focuses on Deprecated "Records" Instead of Main Objects

### The Problem

**According to `docs/vocabulary/canonical_terms.md`, the main objects are:**

1. **Source** — Raw data (structured/unstructured)
2. **Interpretation** — AI interpretation runs
3. **Observation** — Granular facts extracted from source
4. **Entity** — Canonical representations (person, company, location)
5. **Entity Snapshot** — Current truth for an entity (computed from observations)
6. **Relationship** — Typed connections between entities
7. **Event** — Timeline events from date fields
8. **Memory Graph** — Interconnected graph of all above

**Deprecated/Legacy Objects:**
- ❌ **Record** — Deprecated, being replaced by Source (to be removed in v0.3.0)
- ❌ **Capability** — Removed in v0.2.15, now part of entity schemas
- ❌ **Record Type** — Replaced by entity types

**Current MVP UI Plan focuses on DEPRECATED objects:**

| UI Feature | Object Focus | Status | Problem |
|------------|--------------|--------|---------|
| **FU-301: Source List** | ✅ **Source** (main object) | 🔨 Partial (needs refactor) | **RENAMED** from "Records List"; prototype uses deprecated `records` table |
| **FU-302: Source Detail** | ✅ **Source** (main object) | 🔨 Partial (needs refactor) | **RENAMED** from "Record Detail"; prototype uses deprecated `records` table |
| **FU-303: Timeline View** | ✅ **Events** (main object) | ⏳ Not Started | Correct object, needs implementation |
| **FU-304: File Upload UI** | ✅ **Source** (upload) | 🔨 Partial | Correct object, needs production integration |
| **FU-601: Entity Explorer** | ✅ **Entities** (main object) | ⏳ Not Started (P0) | **PROMOTED to P0**; now in MVP scope |

**UI for Main Objects Status:**
- 🔨 **Source** browsing — FU-301/302 renamed, needs refactor from `records` to `sources` table
- ⏳ **Entity** browsing — FU-601 promoted to P0, now in MVP scope, needs implementation
- ⚠️ **Observation** browsing — Not planned (recommended P1 feature)
- ⏳ **Entity Snapshot** viewing — Part of FU-601 (now P0), needs implementation
- ⏳ **Relationship** visualization — Part of FU-601 (now P0), needs implementation
- ⏳ **Event** browsing — FU-303 (P0), needs implementation

### The Architectural Discrepancy

**Architectural Decision (`docs/architecture/architectural_decisions.md` Section 8):**
> "Primary UX = entity lists, detail views, graphs of relationships"

**MVP Release Plan (`docs/releases/v1.0.0/release_plan.md`) — ✅ UPDATED:**
- ✅ **FU-601: Entity Explorer** **PROMOTED to P0** and **NOW included** in MVP scope
- ✅ P0 FUs in MVP: FU-100, FU-101, FU-102, FU-103, FU-105, FU-300, **FU-301, FU-302, FU-303, FU-304, FU-601**, FU-700, FU-701
- ✅ FU-301 and FU-302 **renamed** to "Source List/Detail" (focus on main objects)

**Current Status:**
- ✅ Prototype exists (`EntityExplorerView` component)
- ✅ Entity browsing UI implemented in prototype
- ✅ **Planning complete:** FU-601 now P0, FU-301/302 renamed
- ⚠️ **Implementation remaining:** Prototype needs refactoring to use main objects (not deprecated records)

### What MVP UI Should Provide (Per Canonical Terms)

**Main Objects Users Need to Browse:**

| Main Object | UI Feature | Current Status | Priority |
|-------------|-----------|----------------|----------|
| **Source** | Source List & Detail | 🔨 Partial (FU-301/302 renamed, needs refactor) | **P0 CRITICAL** |
| **Entity** | Entity List & Detail | ⏳ Not Started (FU-601 promoted to P0) | **P0 CRITICAL** |
| **Entity Snapshot** | Entity Detail (shows current truth) | ⏳ Not Started (part of FU-601, now P0) | **P0 CRITICAL** |
| **Observation** | Observation List (per entity) | ⚠️ Not Planned (recommended P1) | **P1** |
| **Relationship** | Relationship Graph | ⏳ Not Started (part of FU-601, now P0) | **P1** |
| **Event** | Timeline View | ⏳ Not Started (FU-303, P0) | **P0 CRITICAL** |
| **Interpretation** | Interpretation History | ❌ Not Planned | **P2** |

**Current MVP UI Plan (✅ CORRECTED in Release Plan):**
- 🔨 **FU-301: Source List** — **RENAMED** from "Records List" in release plan; prototype needs refactor to use `sources` table
- 🔨 **FU-302: Source Detail** — **RENAMED** from "Record Detail" in release plan; prototype needs refactor to show four-layer truth model
- ⏳ **FU-303: Timeline** — Correct (uses events), P0 in release plan, needs implementation
- 🔨 **FU-304: Upload** — Correct (uploads source), P0 in release plan, needs production integration
- ⏳ **FU-601: Entity Explorer** — **PROMOTED to P0** in release plan, now in MVP scope, needs implementation

**What MVP SHOULD Have:**

1. **Source List & Detail** (replace FU-301/302)
   - Browse/search source (files, structured data)
   - View source detail with interpretations
   - Uses `sources` table, not deprecated `records`

2. **Entity List & Detail** (FU-601, should be P0)
   - Browse/search entities (companies, people, locations)
   - View entity snapshots (current truth)
   - View observations (provenance)
   - View relationships

3. **Timeline View** (FU-303, correct)
   - Chronological events
   - Filter by entity, date range

4. **Dashboard** (FU-305)
   - Stats on source, entities, events
   - Not stats on deprecated "records"

### The Critical Gaps

**✅ Gap 1: RESOLVED — Release Plan Updated**
- ✅ FU-301 and FU-302 **renamed** to "Source List/Detail" in release plan
- ✅ Release plan specifies use of `sources` table (not deprecated `records`)
- ⚠️ **Implementation remaining:** Prototype still uses deprecated architecture; needs refactoring

**✅ Gap 2: RESOLVED — FU-601 Promoted to P0**
- ✅ Entity Explorer (FU-601) **promoted from P2 to P0** in release plan
- ✅ Now included in MVP scope
- ⚠️ **Implementation remaining:** Prototype exists, needs production implementation

**⚠️ Gap 3: Observation Visibility (P1 Recommended)**
- Observations are the core of the four-layer truth model
- No UI currently planned to view observations or provenance
- **Recommendation:** Add observations tab to Entity Detail view (P1 feature)
- Users need to inspect where entity snapshot fields came from

### Required Changes to MVP UI Plan

**CRITICAL: Fix UI to Use Main Objects, Not Deprecated Records**

**✅ 1. COMPLETED — Release Plan Updated:**

| Original (Incorrect) | Updated (Correct) | Status |
|---------------------|-------------------|--------|
| **FU-301: Records List View** | **FU-301: Source List View** | ✅ Renamed in release plan |
| Uses deprecated `records` table | Uses `sources` table | ⚠️ Prototype needs refactor |
| Browse "records" (deprecated) | Browse source (files, structured data) | ⚠️ Implementation remaining |
| | |
| **FU-302: Record Detail View** | **FU-302: Source Detail View** | ✅ Renamed in release plan |
| Shows record properties | Shows source + interpretations + observations | ⚠️ Prototype needs refactor |
| Uses deprecated `records` table | Uses `sources` + `interpretations` + `observations` | ⚠️ Implementation remaining |

**✅ 2. COMPLETED — FU-601 Promoted to P0:**

| Feature | Original Priority | Updated Priority | Status |
|---------|------------------|------------------|--------|
| **FU-601: Entity Explorer** | P2 (excluded) | **P0 (critical)** | ✅ Promoted in release plan |
| Rationale | N/A | Entity resolution is MVP-critical differentiator; users must see entities | ✅ Documented |

**3. Add Observation Browsing (P1):**

| Feature | Current Status | Should Be | Rationale |
|---------|----------------|-----------|-----------|
| **Observation List (per entity)** | Not planned | **P1** | Users need provenance visibility to understand where entity snapshot fields came from |

**4. Update Dashboard Stats (FU-305):**

| Current Focus | Should Focus On |
|---------------|-----------------|
| Record counts | Source counts |
| Record types | Entity counts by type |
| | Observation counts |
| | Interpretation runs |

### Recommended MVP UI Features (Corrected)

**P0 (Critical for MVP) — ✅ All in Release Plan:**
1. ✅ **Source List & Detail** (FU-301/302 renamed in release plan, needs refactor)
2. ✅ **Entity List & Detail** (FU-601 promoted to P0 in release plan, needs implementation)
3. ✅ **Timeline View** (FU-303, P0 in release plan, needs implementation)
4. ✅ **Upload UI** (FU-304, P0 in release plan, needs production integration)
5. ✅ **Authentication** (FU-700, P0 in release plan, needs UI components)
6. ✅ **RLS** (FU-701, P0 in release plan, needs policy fix)

**P1 (Recommended):**
1. ⏳ **Observation Browsing** (new, provenance visibility)
2. ⏳ **Dashboard** (FU-305, stats on main objects)
3. ⏳ **Relationship Visualization** (part of FU-601)

**P2 (Post-MVP):**
1. ⏳ **Interpretation History** (view past interpretation runs)
2. ⏳ **Entity Merge UI** (manual entity deduplication)

### Why This Matters

**✅ Planning Complete — Release Plan Updated:**
- ✅ FU-301/302 renamed to "Source List/Detail" (release plan updated)
- ✅ FU-601 promoted to P0 (release plan updated)
- ✅ MVP UI plan now focuses on main objects (source, entities, events)

**⚠️ Implementation Remaining:**
- ⚠️ Prototype still uses deprecated `records` table (needs refactoring)
- ⚠️ Entity Explorer not yet implemented (prototype exists, needs production)
- ⚠️ Timeline View not yet implemented (prototype exists, needs production)
- ⚠️ Observation browsing not yet planned (recommended P1 feature)

**With Correct MVP UI (After Implementation):**
- Users browse source (current architecture)
- Users see entities and entity snapshots (competitive differentiator)
- Users see observations (provenance and trust) — if P1 feature added
- Users understand the four-layer truth model
- MVP validates current architecture and main value proposition

---

## Next Steps

### CRITICAL: Complete MVP UI with Main Objects

**✅ Planning Complete:** Release plan updated to focus on main objects (FU-301/302 renamed, FU-601 promoted to P0)

**Remaining Implementation Work:**

1. **Refactor FU-301/302 to Source** (1.5-2.5 days)
   - Rename components and update DB queries from `records` to `sources`
   - Show four-layer truth model (source → interpretation → observation → entity)
   - Display interpretations and observations with provenance

2. **Build Entity Explorer (FU-601)** (2-3 days)
   - Entity list and detail views
   - Show entity snapshots with observations
   - Display relationships
   - Link to source

3. **Build Timeline View (FU-303)** (1-2 days)
   - Chronological events display
   - Filter by date range and event type
   - Link events to source

4. **Fix RLS policy (FU-701)** (1-2 days)
   - Update `records` table policy to user-scoped
   - Critical for privacy-first architecture

5. **Build authentication UI (FU-700)** (0.5-1 day)
   - Signup/signin forms
   - Password reset
   - OAuth providers

6. **Polish design system (FU-300)** (0.5 days)
   - Component library completion
   - Truth Layer boundary verification

7. **Add observation browsing** (1-2 days, P1 recommended)
   - Add observations tab to Entity Detail
   - Show provenance chain

8. **Update Dashboard (FU-305)** (0.5-1 day, P1)
   - Stats on main objects (source, entities, observations, events)
   - Not stats on deprecated records

9. **Run integration tests** — Validate end-to-end flows with main objects
10. **Deploy to staging** — Full validation before production

### Estimated Total Remaining Work

**P0 (Critical for MVP):**
- UI refactoring (FU-301/302): 1.5-2.5 days
- Entity Explorer (FU-601): 2-3 days
- Timeline View (FU-303): 1-2 days
- Auth UI (FU-700): 0.5-1 day
- RLS fix (FU-701): 1-2 days
- Design system polish (FU-300): 0.5 days
- **P0 Total:** 6.5-11 days

**P1 (Recommended):**
- Observation browsing: 1-2 days
- Dashboard updates: 0.5-1 day
- **P1 Total:** 1.5-3 days

**Grand Total:** 8-14 days (P0 + P1)

**Note:** Planning documents updated. Implementation work remains.

---

## References

- **Architecture:** `docs/architecture/determinism.md` — Determinism doctrine
- **Implementation:** `src/services/interpretation.ts` — Interpretation service
- **MCP Spec:** `docs/specs/MCP_SPEC.md` — Unified `ingest()` action
- **Release Plan:** `docs/releases/v1.0.0/release_plan.md` — MVP coordination
- **Status:** `docs/releases/v1.0.0/status.md` — Live status tracking
- **Pre-MVP Releases:**
  - v0.1.0: `docs/releases/v0.1.0/status.md`
  - v0.2.0: `docs/releases/v0.2.0/status.md`
  - v0.2.1: `docs/releases/v0.2.1/status.md`
  - v0.2.15: `docs/releases/v0.2.15/status.md`
