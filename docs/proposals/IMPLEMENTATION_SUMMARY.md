# Plan Migration Implementation Summary

**Implemented:** 2026-01-22
**Status:** Complete

## Overview

Successfully implemented an automated plan migration system that integrates with the `/commit` workflow. The system automatically reviews plans in `.cursor/plans/`, determines relevance, and migrates them to `docs/proposals/` for future consideration.

## What Was Implemented

### 1. Standalone Command

**File:** `.cursor/commands/migrate_plans.md`

- Command specification with relevance criteria
- Step-by-step migration process
- Proposal format specification
- Integration points with commit workflow

### 2. Commit Workflow Integration

**File:** `.cursor/commands/commit.md`

- Added plan migration step after security audit, before staging
- Auto-stages migrated proposals for inclusion in commits
- Includes migration summary in commit messages
- Non-blocking (if migration fails, commit proceeds)

### 3. Migration Script

**File:** `scripts/migrate_plans.ts`

- TypeScript implementation with proper YAML parsing
- Handles both frontmatter and legacy plan formats
- Extracts metadata (name, overview, todos)
- Counts todos by status (pending, completed, in_progress)
- Detects duplicates (multiple versions of same plan)
- Converts plans to proposal format
- Generates migration reports

### 4. Directory Structure

**Created:**
- `docs/proposals/` - Active proposals
- `docs/proposals/archived/` - Completed proposals
- `docs/proposals/README.md` - Directory documentation
- `docs/proposals/PROPOSAL_TEMPLATE.md` - Template for proposal format

### 5. NPM Scripts

**Added to `package.json`:**
- `npm run migrate:plans` - Run migration
- `npm run migrate:plans:dry-run` - Preview without changes

### 6. Configuration

**Added to `foundation-config.yaml`:**
```yaml
development:
  commit:
    migrate_plans: true
    migrate_plans_config:
      proposals_dir: "docs/proposals"
      archive_completed: true
      auto_remove_obsolete: false
```

## Migration Results

**First Migration Run (2026-01-22):**

- ✅ **8 proposals migrated** (plans with pending work)
- ✅ **1 proposal archived** (completed plan)
- ✅ **2 obsolete identified** (duplicate versions)
- ⚠️ **11 require manual review** (no todos to determine status)

### Migrated Proposals

1. `schema-evolution-scaling.md` (8 pending todos, P0 priority)
2. `agent-trust-framework.md` (11 pending todos)
3. `dual-path-inference-based-ingestion.md` (19 pending todos)
4. `raw-first-ingestion-architecture.md` (13 pending todos)
5. `sources-first-ingestion-v10.md` (7 pending todos)
6. `test-coverage-gap-analysis.md` (7 pending todos)
7. `document-v023-release.md` (5 pending, 9 completed)
8. `plan-migration-command-integrated-with-commit.md` (9 pending - meta!)

### Archived

1. `complete_mvp_implementation_2ebb6b9d.md` (15/15 todos completed)

## Features

### Relevance Detection

- Counts todos by status
- Identifies pending work
- Detects completed plans for archival
- Finds duplicate versions (v8, v9, v10, etc.)

### Format Conversion

- Removes todo tracking from proposals
- Adds proposal-specific metadata
- Adds Proposal Context section explaining migration
- Preserves all technical content
- Updates references where needed

### Automatic Integration

- Runs during `/commit` after security audit
- Auto-stages created proposals
- Includes migration summary in commit message
- Non-blocking (doesn't stop commits if migration fails)

## Usage

### Manual Migration

```bash
npm run migrate:plans
```

or

```
/migrate_plans
```

### Automatic Migration

Runs automatically during `/commit` if enabled in `foundation-config.yaml`.

### Dry Run

```bash
npm run migrate:plans:dry-run
```

Preview what would be migrated without creating files.

## Next Steps

1. **Review migrated proposals** in `docs/proposals/` directory
2. **Manually review plans** flagged for manual review (11 files)
3. **Remove obsolete plans** from `.cursor/plans/` (v8, v11 duplicates)
4. **Prioritize proposals** for future implementation
5. **Update proposals** if any need architecture alignment fixes

## Implementation Notes

### Parser Handles

- ✅ YAML frontmatter with todos
- ✅ Legacy plans without frontmatter
- ✅ Multiple todo statuses (pending, completed, in_progress)
- ✅ Plans without todos (flagged for manual review)
- ✅ Malformed frontmatter (graceful error handling)

### Duplicate Detection

- Identifies versioned plans (v8, v9, v10, etc.)
- Keeps only the most recent version
- Marks others as obsolete

### Archive Logic

- Archives plans with 100% completed todos
- Marks as `status: "implemented"` in frontmatter
- Saves to `docs/proposals/archived/`

## Testing

Migration tested on 22 plan files:
- ✅ Parsing works for all formats
- ✅ Relevance detection accurate
- ✅ Conversion format correct
- ✅ Report generation works
- ✅ Auto-staging works
- ✅ Integration with commit workflow verified

## Files Modified

1. `.cursor/commands/migrate_plans.md` (created)
2. `.cursor/commands/commit.md` (updated)
3. `scripts/migrate_plans.ts` (created)
4. `package.json` (added scripts)
5. `foundation-config.yaml` (added config)
6. `docs/proposals/README.md` (created)
7. `docs/proposals/PROPOSAL_TEMPLATE.md` (created)

## References

- Migration report: `docs/proposals/MIGRATION_REPORT.md`
- Command spec: `.cursor/commands/migrate_plans.md`
- Implementation: `scripts/migrate_plans.ts`
- Proposals directory: `docs/proposals/`
