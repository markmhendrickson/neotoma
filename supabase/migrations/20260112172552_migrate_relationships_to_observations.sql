-- Migration: Migrate existing relationships to relationship observations
-- Purpose: Convert existing relationships to observation-based architecture
-- Reference: docs/.cursor/plans/relationship_snapshots_implementation_af6be12b.plan.md

-- Note: This is a data migration. The actual migration logic is handled by
-- scripts/migrate-relationships-to-observations.ts which should be run manually.
-- This SQL file exists to document the migration in the migrations history.

-- The TypeScript migration script will:
-- 1. Read all existing relationships from relationships table
-- 2. Create relationship_observations for each relationship
-- 3. Compute and create relationship_snapshots

-- To run the migration:
-- $ npm run ts-node scripts/migrate-relationships-to-observations.ts

COMMENT ON TABLE relationship_observations IS 'Migration from relationships table to observation-based architecture completed via scripts/migrate-relationships-to-observations.ts';
