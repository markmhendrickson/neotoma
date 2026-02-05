# Release v0.3.0: Reconciliation Release

**Release Type**: Internal / Not Marketed  
**Purpose**: Document actual current state of codebase after period of untracked development  
**Status**: `completed`  
**Date**: 2025-02-05

---

## Purpose

This release serves as a **reconciliation point** between documented releases and actual codebase state. During late 2024 and early 2025, significant development work occurred outside the formal release process, resulting in a gap between documented releases and actual implementation.

v0.3.0 establishes a clean baseline by:
- Documenting what's actually implemented in the codebase
- Archiving aspirational/planning releases that don't reflect reality
- Creating an accurate foundation for future release planning

---

## What's Actually Implemented

Based on analysis of commits, migrations, and code since v0.2.15:

### Core Infrastructure

1. **Schema Registry System**
   - `schema_registry` table and service
   - Automatic schema detection and recommendation
   - Schema metadata and versioning
   - Schema icon service

2. **Sources-First Architecture**
   - `sources` table as primary ingestion entity
   - `interpretations` table (renamed from `interpretation_runs`)
   - Source graph edges (`source_entity_edges`, `source_event_edges`)
   - Raw storage service with SHA-256 deduplication
   - Interpretation service with schema validation

3. **Observations Architecture**
   - Observation-based data model
   - `raw_fragments` for unknown fields
   - Entity snapshots computed from observations
   - Relationship observations
   - Idempotency keys for sources and observations

4. **Entity System**
   - Entity resolution service
   - Entity queries and filtering
   - Entity merges tracking
   - Cross-source entity resolution

5. **Auto-Enhancement System**
   - Auto-enhancement processor
   - Field eligibility checking
   - Enhancement blacklisting
   - Enhancement tracking

6. **MCP Integration**
   - Unified `ingest()` action
   - OAuth flow for external MCP tools
   - MCP authentication and authorization
   - Parquet MCP resources specification

7. **Frontend**
   - React frontend with Vite
   - Entity detail view
   - Source detail view and table
   - Settings dialog
   - Quick entry dialogs (contact, event, task, transaction)
   - Design system with light/dark mode
   - Style guide component

8. **CLI**
   - Neotoma CLI (`neotoma` command)
   - Local development and testing tools
   - Migration runner
   - Database inspection utilities

9. **Infrastructure**
   - Supabase integration
   - Row-level security (RLS) policies
   - Realtime subscriptions
   - Foundation submodule for shared development processes
   - Pre-commit hooks (security audit, linting, cursor rules sync)
   - CI/CD with GitHub Actions

### Database Migrations Applied

Recent migrations show:
- Schema metadata tables
- Realtime enablement
- Fragment type → entity type rename
- MCP OAuth client state
- RLS and search path fixes
- Auth uid fixes
- Legacy table and column drops
- `created_at` addition to raw_fragments
- Idempotency keys for sources and observations

### Documentation

- Comprehensive foundation documents
- Architecture documentation
- Subsystem documentation
- Canonical vocabulary established
- Developer guides (getting started, MCP setup, CLI reference)
- Cursor rules and commands organized
- Design system documentation

---

## What's NOT Implemented

Based on archived aspirational releases:

- **Chat Transcript CLI** (was planned for v0.4.0)
- **Operational Hardening** (was planned for v0.3.0 - different from this v0.3.0)
- **Vector search optimization** (HNSW index migration)
- **Advanced query capabilities**
- **Full MVP feature set** (was planned for v1.0.0)
- **Multi-user collaboration**
- **Advanced timeline features**

---

## Key Commits Since v0.2.15

- `50294fd` - Update CLI, migrations, and docs/UI alignment
- `3643777` - Consolidate cursor rules, expand design system docs, add snapshot monitoring
- `204f25c` - Migrate generic development rules to foundation and add major implementation work
- `417f898` - Refactor schema registry and entity queries with raw_fragments support
- `e5d3c7b` - Improve test quality, fix auto-enhancement bugs, optimize database
- `6589a63` - Add parquet MCP resources specification
- `695658e` - FU-110: Implement v0.2.0 sources-first ingestion architecture
- `e6cba1b` - FU-MIGRATION-001: Migrate cursor commands and rules to foundation system
- `41a68e2` - Extract generic Cursor rules to foundation

---

## Technical Debt Acknowledged

This release acknowledges several areas of technical debt:

1. **Feature Unit tracking** - Not all work was documented in Feature Units
2. **Test coverage** - Integration tests may be outdated or incomplete
3. **Documentation sync** - Some docs may not reflect actual implementation
4. **Migration state** - Some migrations may be pending application
5. **Uncommitted changes** - 262 files with uncommitted changes that need review

---

## Next Steps

### Immediate (Post-Reconciliation)

1. **Review uncommitted changes** (262 files)
   - Determine which changes should be committed
   - Identify which changes are experimental/temporary
   - Clean up working directory

2. **Apply pending migrations**
   - Verify all migrations are applied to dev database
   - Verify all migrations are applied to production database

3. **Audit test suite**
   - Run full test suite
   - Identify broken/outdated tests
   - Update or remove tests as needed

4. **Update documentation**
   - Audit all subsystem docs for accuracy
   - Update architecture docs to match implementation
   - Document any undocumented features

### Near-Term (Next Release Planning)

1. **Plan v0.4.0 realistically**
   - Based on actual current state (v0.3.0)
   - Follow proper release process
   - Define clear scope and acceptance criteria

2. **Establish release discipline**
   - Follow Feature Unit workflow
   - Document all changes in release plans
   - Keep README updated with accurate status

3. **Prioritize technical debt**
   - Test coverage improvements
   - Documentation sync
   - Code cleanup

---

## Archived Releases

The following aspirational releases have been archived to `docs/releases/archived/aspirational/`:

- v0.4.0 (Intelligence + Housekeeping)
- v0.5.0 (Planning)
- v0.9.0 (Planning)
- v1.0.0 (MVP)
- v2.0.0 (Planning)
- v2.1.0 (Planning)
- v2.2.0 (HNSW Vector Search)

These can be revisited for future planning but do not represent actual implementation.

---

## Lessons Learned

1. **Release discipline is critical** - Even in solo/rapid development, maintaining release tracking prevents this type of drift
2. **Commit early, commit often** - 262 uncommitted changes make it hard to understand what's ready vs experimental
3. **Documentation as you go** - Retroactive documentation is harder and less accurate
4. **Feature Unit workflow works** - When followed, it provides clear tracking and prevents drift

---

## References

- Previous release: v0.2.15 (implemented)
- Archived aspirational releases: `docs/releases/archived/aspirational/`
- Foundation documents: `docs/foundation/`
- Architecture documentation: `docs/architecture/`

---

**Status**: This release is marked as `completed` because it represents the current actual state of the codebase, not a future goal. It is a documentation-only release that establishes a baseline for future development.
