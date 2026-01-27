# Proposals

This directory contains future work proposals that have been migrated from `.cursor/plans/` for later consideration.

## Directory Structure

- `*.md` - Active proposals for future implementation
- `archived/` - Completed proposals that have been implemented

## Proposal Format

Each proposal follows this structure:

```yaml
---
title: "Proposal Name"
status: "proposal|in_progress|implemented"
source_plan: "original-plan-filename.plan.md"
migrated_date: "YYYY-MM-DD"
priority: "p0|p1|p2|p3"
estimated_effort: "description"
---
```

See `PROPOSAL_TEMPLATE.md` for the complete format.

## Proposal Lifecycle

1. **proposal** - Migrated from plan, awaiting prioritization
2. **in_progress** - Implementation has started
3. **implemented** - Completed and moved to `archived/`

## How Proposals Are Created

Proposals are automatically migrated from `.cursor/plans/` during the `/commit` workflow. The migration:

- Reviews all plans for relevance (pending todos, architecture alignment)
- Converts relevant plans to proposal format
- Archives completed plans
- Removes obsolete/duplicate plans

## Manual Migration

To manually migrate plans: `/migrate_plans`

## References

- Original plans: `.cursor/plans/`
- Migration command: `.cursor/commands/migrate_plans.md`
- Proposal template: `PROPOSAL_TEMPLATE.md`
