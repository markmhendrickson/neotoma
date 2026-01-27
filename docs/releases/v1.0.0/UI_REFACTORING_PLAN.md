# MVP UI Refactoring Plan — Align with Main Objects

## Purpose

This document outlines the required UI refactoring to align MVP with main objects per `docs/vocabulary/canonical_terms.md` instead of deprecated `records` architecture.

## Critical Issues Identified

**Date:** 2026-01-19

**Issue:** MVP UI plan (FU-301, FU-302) references deprecated `records` table that will be removed in v0.3.0. MVP UI must use main objects: Source, Entity, Observation, Event.

**Impact:** 
- MVP validates deprecated architecture instead of current architecture
- Users cannot see main objects (entities, observations)
- Competitive differentiator (entity resolution) not visible to users

## Main Objects (Per Canonical Terms)

**Core Objects Users Need to Browse:**

1. **Source** — Raw data (files, structured JSON)
2. **Entity** — Canonical representations (companies, people, invoices)
3. **Entity Snapshot** — Current truth for an entity (computed from observations)
4. **Observation** — Granular facts with provenance
5. **Relationship** — Typed connections between entities
6. **Event** — Timeline events from date fields
7. **Interpretation** — AI interpretation runs with config

**Deprecated Objects (DO NOT USE):**
- ❌ **Record** — Replaced by Source (removed in v0.3.0)
- ❌ **Record Type** — Replaced by Entity Type
- ❌ **Capability** — Removed in v0.2.15

## Required Changes

### 1. FU-301: Rename and Refactor to Source List

**Current (Incorrect):**
- Name: "Records List View"
- Uses: `records` table (deprecated)
- Shows: Record types, properties

**Target (Correct):**
- Name: "Source List View"
- Uses: `sources` table
- Shows: Sources (files, structured data)
- Filters: By mime type, source type, date range
- Search: Across source content

**Required Work:**
1. Rename component from `RecordsTable` to `SourceTable`
2. Update DB queries from `records` table to `sources` table
3. Update filters (mime_type, source_type, file_name)
4. Update UI labels ("Source" not "Records")
5. Update tests to query `sources` table

**Estimated:** 0.5-1 day

### 2. FU-302: Rename and Refactor to Source Detail

**Current (Incorrect):**
- Name: "Record Detail View"
- Uses: `records` table (deprecated)
- Shows: Record metadata, properties

**Target (Correct):**
- Name: "Source Detail View"
- Uses: `sources`, `interpretations`, `observations` tables
- Shows:
  - Source metadata (content_hash, mime_type, file_name, created_at)
  - Interpretations (AI runs with model, temperature, prompt_hash)
  - Observations (extracted facts with provenance)
  - Linked entities (from observations)
  - Linked events (timeline)

**Required Work:**
1. Rename component from `RecordDetailsPanel` to `SourceDetail`
2. Update DB queries:
   - Load source from `sources` table
   - Load interpretations from `interpretations` table
   - Load observations from `observations` table
3. Add interpretation history section (show config for each run)
4. Add observations section (show provenance: which source + interpretation contributed which fields)
5. Update entity/event linking (via observations)
6. Update UI labels ("Source" not "Record")
7. Update tests to query correct tables

**Estimated:** 1-1.5 days

### 3. FU-601: Promote to P0 and Implement Entity Explorer

**Current Status:**
- Priority: P2 (excluded from MVP)
- Status: Not Started (prototype exists)

**Target:**
- Priority: **P0 (MVP-critical)**
- Status: Implement for MVP

**Rationale:**
- Entity resolution (FU-101) is MVP-critical competitive differentiator
- Users must see entities to validate value proposition
- Architecture document says "Primary UX = entity lists, detail views"

**Required Work:**
1. Implement Entity List view:
   - Browse entities by type (company, person, invoice, location, etc.)
   - Filter by entity type
   - Search by canonical name
   - Show entity count by type
2. Implement Entity Detail view:
   - Display entity snapshot (current truth)
   - Display observations (with provenance: which source contributed which fields)
   - Display relationships (PART_OF, REFERS_TO, SETTLES, etc.)
   - Link to source (via observations)
   - Show merge history (if entity was merged)
3. Basic relationship visualization (can defer advanced viz to post-MVP)
4. Update tests for entity browsing

**Estimated:** 2-3 days

### 4. Add Observation Browsing (P1, Recommended)

**Current Status:** Not planned

**Target:** P1 feature for provenance visibility

**Required Work:**
1. Add "Observations" tab to Entity Detail view
2. List all observations for an entity
3. Show observation fields + source priority
4. Link to source (via source_material_id)
5. Link to interpretation (via interpretation_id, if applicable)
6. Show observed_at timestamp

**Estimated:** 1-2 days

### 5. Update Dashboard Stats (FU-305)

**Current (Incorrect):**
- Stats on "records" (deprecated)

**Target (Correct):**
- Stats on main objects:
  - Sources count (total files + structured data)
  - Entity count by type (companies, people, invoices, etc.)
  - Observation count
  - Interpretation count
  - Event count (timeline)

**Required Work:**
1. Update dashboard queries to use correct tables
2. Add entity count by type widget
3. Add observation count widget
4. Update "Recent items" to show recent source (not records)

**Estimated:** 0.5-1 day

## Total Estimated Work

**UI Refactoring:**
- FU-301 rename/refactor: 0.5-1 day
- FU-302 rename/refactor: 1-1.5 days
- FU-601 Entity Explorer: 2-3 days
- Observation browsing (P1): 1-2 days
- Dashboard updates: 0.5-1 day

**Total:** 4.5-8.5 days

**Plus existing MVP work:**
- FU-303 Timeline: 1-2 days
- FU-700 Auth UI: 0.5-1 day
- FU-701 RLS fix: 1-2 days
- FU-300 polish: 0.5 days

**Revised Total MVP Work:** 7-14 days

## Migration Strategy

### Phase 1: Rename and Update Queries (1-2 days)

1. Rename FU-301 component and update queries to `sources`
2. Rename FU-302 component and update queries to `sources` + `interpretations` + `observations`
3. Update all UI labels from "Records" to "Source"
4. Run tests to verify correct tables used

### Phase 2: Implement Entity Explorer (2-3 days)

1. Build Entity List view
2. Build Entity Detail view
3. Add relationship display
4. Link entities to source (via observations)
5. Run tests for entity browsing

### Phase 3: Add Observation Visibility (1-2 days, P1)

1. Add observations tab to Entity Detail
2. Link observations to source and interpretations
3. Show provenance chain

### Phase 4: Update Dashboard (0.5-1 day)

1. Update stats to use main objects
2. Add entity count by type
3. Update recent items list

## Success Criteria

**MVP UI is successful when:**

1. ✅ No references to deprecated `records` table in UI code
2. ✅ Source List uses `sources` table
3. ✅ Source Detail shows interpretations and observations
4. ✅ Entity List shows entities by type
5. ✅ Entity Detail shows entity snapshots with provenance
6. ✅ Dashboard shows stats for main objects
7. ✅ All tests use correct tables (no `records`)
8. ✅ Users can browse source, entities, and timeline
9. ✅ Users can see provenance (where entity snapshot fields came from)
10. ✅ Users can validate entity resolution competitive differentiator

## Related Documents

- **Analysis:** `docs/releases/v1.0.0/mvp_analysis_updated.md` — Detailed analysis of current vs. target state
- **Vocabulary:** `docs/vocabulary/canonical_terms.md` — Main objects and deprecated terms
- **Release Plan:** `docs/releases/v1.0.0/release_plan.md` — Updated with corrected FU list
- **Feature Units:** `docs/specs/MVP_FEATURE_UNITS.md` — Updated FU-301, FU-302, FU-601 specs
- **Architecture:** `docs/architecture/sources_first_ingestion_final.md` — Current architecture

## Notes

**Critical:** This refactoring is mandatory for MVP. Without it:
- MVP validates deprecated architecture (records table removed in v0.3.0)
- Users cannot see main competitive differentiator (entity resolution)
- Users cannot understand provenance (where data came from)
- MVP does not demonstrate current architecture

**Priority:** This work should be prioritized over nice-to-have polish items.
