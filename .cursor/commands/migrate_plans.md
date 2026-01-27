# migrate_plans

Automatically review all plans in `.cursor/plans/`, determine relevance, and migrate relevant ones to `docs/proposals/` for future consideration.

## Purpose

This command:
1. Reviews all plan files in `.cursor/plans/`
2. Determines which plans are still relevant (pending work, architecture aligned)
3. Migrates relevant plans to `docs/proposals/` with appropriate format
4. Archives completed plans to `docs/proposals/archived/`
5. Generates a migration report

## Usage

**Standalone execution:**
```
/migrate_plans
```

**Automatic execution:**
- Runs automatically during `/commit` workflow (after security audit, before staging)
- Can be disabled in `foundation-config.yaml`

## Configuration

Enable/disable in `foundation-config.yaml`:

```yaml
development:
  commit:
    migrate_plans: true  # Enable automatic plan migration during commit
    migrate_plans_config:
      proposals_dir: "docs/proposals"
      archive_completed: true
      auto_remove_obsolete: false
      relevance_check:
        check_architecture: true
        check_completion: true
        check_duplicates: true
```

## Relevance Criteria

The migration command analyzes plan **content** (not just todos) to determine implementation status:

### Implementation Analysis

For each plan, the command:

1. **Extracts implementation items** from plan content:
   - File paths (`src/services/...`, `supabase/migrations/...`)
   - Function names (`createDeletionObservation`, `generateRecordSummary`)
   - API endpoints (`/gdpr_delete`, `/store_record`)
   - Database tables/columns (`CREATE TABLE`, `ALTER TABLE`)
   - Services (`src/services/deletion.ts`)

2. **Checks if items exist** in the codebase:
   - Files: Checks if file exists
   - Functions: Searches codebase for function definitions
   - Migrations: Finds migration files matching patterns
   - Endpoints: Searches `actions.ts` and `server.ts`
   - Tables/Columns: Checks `schema.sql`

3. **Calculates completion percentage**:
   - `found_items / total_items * 100`
   - Example: 18/31 items found = 58% complete

### Plan Classification

**Migrated to Proposals** (0-79% complete):
- Not implemented or partially implemented
- Represents future work

**Archived** (80-100% complete):
- Mostly or fully implemented
- Work is done, archived for reference

**Obsolete**:
- Duplicate versions (keep most recent)
- Architecture conflicts (detected via manual review)

**Manual Review**:
- No implementation items found AND no todos
- Ambiguous status requiring human judgment

## Execution Instructions

### Step 1: Initialize

1. **Set up directories:**
   ```bash
   PLANS_DIR=".cursor/plans"
   PROPOSALS_DIR="docs/proposals"
   ARCHIVED_DIR="docs/proposals/archived"
   REPORT_FILE="docs/proposals/MIGRATION_REPORT.md"
   
   mkdir -p "$PROPOSALS_DIR"
   mkdir -p "$ARCHIVED_DIR"
   ```

2. **Get all plan files:**
   ```bash
   PLAN_FILES=$(find "$PLANS_DIR" -name "*.plan.md" -type f | sort)
   
   if [ -z "$PLAN_FILES" ]; then
     echo "No plan files found in $PLANS_DIR"
     exit 0
   fi
   
   PLAN_COUNT=$(echo "$PLAN_FILES" | wc -l | tr -d ' ')
   echo "Found $PLAN_COUNT plan file(s) to review"
   ```

### Step 2: Analyze Each Plan

For each plan file:

1. **Extract metadata:**
   ```bash
   # Get plan filename
   PLAN_BASENAME=$(basename "$PLAN_FILE")
   PLAN_NAME_RAW=$(grep "^name:" "$PLAN_FILE" | head -1 | sed 's/^name: *//' | tr -d '"')
   
   # Count todos by status
   PENDING_COUNT=$(grep -c "status: pending" "$PLAN_FILE" 2>/dev/null || echo "0")
   COMPLETED_COUNT=$(grep -c "status: completed" "$PLAN_FILE" 2>/dev/null || echo "0")
   IN_PROGRESS_COUNT=$(grep -c "status: in_progress" "$PLAN_FILE" 2>/dev/null || echo "0")
   TOTAL_COUNT=$((PENDING_COUNT + COMPLETED_COUNT + IN_PROGRESS_COUNT))
   ```

2. **Analyze implementation status:**
   - Extract implementation items from plan content (files, functions, migrations, endpoints)
   - Check if items exist in codebase
   - Calculate completion percentage: `found_items / total_items`
   - Use implementation analysis as primary method
   - Fall back to todos if no implementation items found

3. **Determine relevance:**
   ```bash
   if [ "$COMPLETION_PERCENTAGE" -ge 80 ]; then
     # 80%+ complete - archive
     RELEVANCE="implemented"
     ACTION="archive"
   elif [ "$COMPLETION_PERCENTAGE" -gt 0 ]; then
     # Partially implemented - migrate
     RELEVANCE="partial"
     ACTION="migrate"
   elif [ "$TOTAL_COUNT" -gt 0 ]; then
     # Has todos but no implementation items - use todos
     if [ "$PENDING_COUNT" -gt 0 ] || [ "$IN_PROGRESS_COUNT" -gt 0 ]; then
       RELEVANCE="pending"
       ACTION="migrate"
     else
       RELEVANCE="completed"
       ACTION="archive"
     fi
   else
     # No implementation items AND no todos - manual review
     RELEVANCE="unknown"
     ACTION="skip"
   fi
   ```

3. **Check for duplicates:**
   ```bash
   # Look for multiple versions of same plan (e.g., v8, v9, v10, v11, v12)
   PLAN_BASE=$(echo "$PLAN_BASENAME" | sed 's/-v[0-9]\+\|_v[0-9]\+//')
   DUPLICATES=$(echo "$PLAN_FILES" | grep -c "$PLAN_BASE" || echo "0")
   
   if [ "$DUPLICATES" -gt 1 ]; then
     # Multiple versions exist - keep only the most recent
     LATEST_VERSION=$(echo "$PLAN_FILES" | grep "$PLAN_BASE" | tail -1)
     if [ "$PLAN_FILE" != "$LATEST_VERSION" ]; then
       ACTION="remove"
       RELEVANCE="duplicate"
     fi
   fi
   ```

### Step 3: Execute Action

For each plan based on determined action:

**Action: migrate** (relevant plan with pending work)

1. **Generate proposal filename:**
   ```bash
   # Convert plan name to kebab-case
   PROPOSAL_NAME=$(echo "$PLAN_NAME_RAW" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')
   PROPOSAL_FILE="$PROPOSALS_DIR/${PROPOSAL_NAME}.md"
   ```

2. **Convert plan to proposal format:**
   - Read plan content (skip frontmatter)
   - Generate new proposal frontmatter with metadata
   - Add Proposal Context section
   - Preserve all technical content
   - Update any broken references

3. **Write proposal file:**
   ```bash
   # Create proposal with:
   # - New frontmatter (no todos)
   # - Proposal Context section
   # - Original plan content
   ```

4. **Log migration:**
   ```bash
   echo "✓ Migrated: $PLAN_BASENAME → $PROPOSAL_FILE"
   MIGRATED_PLANS+=("$PLAN_BASENAME → $(basename "$PROPOSAL_FILE")")
   MIGRATED_COUNT=$((MIGRATED_COUNT + 1))
   ```

**Action: archive** (completed plan)

1. **Generate archive filename:**
   ```bash
   ARCHIVE_FILE="$ARCHIVED_DIR/${PLAN_BASENAME}"
   ```

2. **Convert and archive:**
   - Similar to migrate, but save to archived directory
   - Mark status as "implemented" in frontmatter

3. **Log archival:**
   ```bash
   echo "✓ Archived: $PLAN_BASENAME → $ARCHIVE_FILE"
   ARCHIVED_PLANS+=("$PLAN_BASENAME")
   ARCHIVED_COUNT=$((ARCHIVED_COUNT + 1))
   ```

**Action: remove** (obsolete/duplicate)

1. **Log for removal:**
   ```bash
   echo "⚠ Obsolete: $PLAN_BASENAME (reason: $RELEVANCE)"
   REMOVED_PLANS+=("$PLAN_BASENAME - $RELEVANCE")
   REMOVED_COUNT=$((REMOVED_COUNT + 1))
   ```

2. **Note:** Plans are NOT automatically deleted - only logged for manual review

**Action: skip** (unknown status or edge case)

1. **Log for manual review:**
   ```bash
   echo "⚠ Requires manual review: $PLAN_BASENAME (status: $RELEVANCE)"
   MANUAL_REVIEW+=("$PLAN_BASENAME - $RELEVANCE")
   ```

### Step 4: Generate Migration Report

After processing all plans:

1. **Create report file:**
   ```bash
   cat > "$REPORT_FILE" << 'EOF'
   # Plan Migration Report
   
   Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
   
   ## Summary
   
   - Migrated to Proposals: ${MIGRATED_COUNT}
   - Archived (Completed): ${ARCHIVED_COUNT}
   - Obsolete (Logged): ${REMOVED_COUNT}
   - Requires Manual Review: ${#MANUAL_REVIEW[@]}
   
   ## Migrated to Proposals
   
   ${MIGRATED_PLANS[@]}
   
   ## Archived (Completed)
   
   ${ARCHIVED_PLANS[@]}
   
   ## Obsolete (Logged for Removal)
   
   ${REMOVED_PLANS[@]}
   
   ## Requires Manual Review
   
   ${MANUAL_REVIEW[@]}
   EOF
   ```

2. **Display summary:**
   ```bash
   echo ""
   echo "Migration complete:"
   echo "  Migrated: $MIGRATED_COUNT"
   echo "  Archived: $ARCHIVED_COUNT"
   echo "  Obsolete: $REMOVED_COUNT"
   echo "  Manual review: ${#MANUAL_REVIEW[@]}"
   echo ""
   echo "Report: $REPORT_FILE"
   ```

### Step 5: Auto-Stage (When Called from Commit)

If running as part of commit workflow:

```bash
# Stage migrated proposals
if [ -d "$PROPOSALS_DIR" ]; then
  git add "$PROPOSALS_DIR"/*.md 2>/dev/null || true
  git add "$PROPOSALS_DIR"/archived/*.md 2>/dev/null || true
  git add "$REPORT_FILE" 2>/dev/null || true
fi

# Log for commit message
if [ "$MIGRATED_COUNT" -gt 0 ] || [ "$ARCHIVED_COUNT" -gt 0 ]; then
  echo ""
  echo "📝 Staged proposal files for commit"
fi
```

## Plan to Proposal Conversion

### Frontmatter Transformation

**Input (Plan):**
```yaml
---
name: Schema Evolution Scaling
overview: "Implement scaling improvements..."
todos:
  - id: task1
    content: "Task description"
    status: pending
---
```

**Output (Proposal):**
```yaml
---
title: "Schema Evolution Scaling"
status: "proposal"
source_plan: "schema_evolution_scaling_777f1fc8.plan.md"
migrated_date: "2026-01-22"
priority: "p0"
estimated_effort: "P0: 4 days, P1: 4 days, P2: 8 days"
---
```

### Content Transformation

**Add Proposal Context section after frontmatter:**

```markdown
## Proposal Context

This proposal was migrated from `.cursor/plans/[filename]` on [date].

**Original Status:** [X pending, Y completed, Z in_progress] / [total todos]
**Relevance:** [Why this is still relevant]
**Architecture Alignment:** Verified against docs/foundation/ and docs/architecture/
**Completion Status:** [N%] complete at time of migration

---

[Original plan content continues]
```

## Architecture Alignment Check

To determine if a plan is architecturally aligned:

1. **Check for obsolete references:**
   - References to removed tables/services
   - References to deprecated patterns
   - Conflicts with current architecture docs

2. **Key docs to check against:**
   - `docs/foundation/core_identity.md`
   - `docs/foundation/philosophy.md`
   - `docs/architecture/architecture.md`
   - `docs/architecture/architectural_decisions.md`

3. **Red flags:**
   - Plan contradicts Truth Layer boundaries
   - Plan assumes features explicitly marked as "not in MVP"
   - Plan depends on removed/deprecated systems

## Edge Cases

1. **Malformed frontmatter:**
   - Log warning: "⚠ Cannot parse frontmatter in [filename]"
   - Add to manual review list
   - Skip migration

2. **Missing todos:**
   - Treat as "unknown status"
   - Add to manual review list
   - Don't auto-migrate

3. **Conflicting architecture:**
   - Flag for manual review
   - Don't auto-migrate
   - Log reason in report

4. **Very old plans:**
   - Check file modification date
   - If >6 months old and not modified, likely obsolete
   - Add to manual review list

5. **Plans referencing deleted files:**
   - Update references if possible
   - Note broken references in Proposal Context section

## Error Handling

- **Non-blocking:** Migration errors don't block commit workflow
- **Logging:** All errors logged to migration report
- **Graceful degradation:** If migration fails, commit proceeds with warning

## Examples

### Example 1: Relevant Plan with Pending Work

**Input:** `schema_evolution_scaling_777f1fc8.plan.md`
- 8 todos total, 0 completed, 8 pending
- Architecture: Aligns with current schema system

**Action:** Migrate to `docs/proposals/schema-evolution-scaling.md`

**Output:** Proposal file with:
- Frontmatter: `status: "proposal", priority: "p0"`
- Proposal Context: "8/8 todos pending, aligns with current schema architecture"
- Full technical content preserved

### Example 2: Completed Plan

**Input:** `complete_mvp_implementation_2ebb6b9d.plan.md`
- 15 todos total, 15 completed, 0 pending
- All work done

**Action:** Archive to `docs/proposals/archived/complete-mvp-implementation.md`

**Output:** Archived proposal file with:
- Frontmatter: `status: "implemented"`
- Proposal Context: "15/15 todos completed, fully implemented"

### Example 3: Duplicate Plan

**Input:** `sources-first-ingestion-v8.plan.md`, `v9.plan.md`, `v10.plan.md`, `v11.plan.md`, `v12-final.plan.md`
- Multiple versions of same plan

**Action:** Migrate only `v12-final.plan.md`, mark others as obsolete

**Output:** 
- Migrated: `docs/proposals/sources-first-ingestion.md`
- Obsolete: v8-v11 logged for manual removal

## Integration with Commit Workflow

When run during `/commit`:

1. **Executes after security audit** (clean state)
2. **Before staging changes** (proposals included in commit)
3. **Auto-stages proposals** (no manual git add needed)
4. **Includes in commit message** (migration summary added)

## Commit Message Integration

If plans are migrated during commit, add section:

```markdown
## Plan Migration

Migrated [N] plan(s) to proposals:
- [plan-name] → docs/proposals/[proposal-name]
- ...

Archived [N] completed plan(s):
- [plan-name] → docs/proposals/archived/[plan-name]
- ...

See docs/proposals/MIGRATION_REPORT.md for details.
```

## Testing

To test the migration:

1. Run `/migrate_plans` standalone
2. Check `docs/proposals/` for migrated files
3. Review `docs/proposals/MIGRATION_REPORT.md`
4. Verify proposal format matches template
5. Check that no plans were incorrectly classified

## Notes

- **Non-destructive:** Original plans remain in `.cursor/plans/` (not deleted automatically)
- **Additive:** Proposals are new files, existing work unchanged
- **Reviewable:** All actions logged in migration report
- **Configurable:** Can be disabled or customized via config
