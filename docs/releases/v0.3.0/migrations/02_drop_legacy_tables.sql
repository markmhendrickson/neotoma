-- Migration: Drop legacy record-based tables for v0.3.0
-- Created: 2025-01-01
-- Description: Remove legacy records table and associated structures after migration
-- WARNING: This is a destructive migration. Ensure data is migrated before running.

-- ============================================================================
-- SAFETY CHECK: Verify migration is complete before running this
-- ============================================================================

-- This migration should only be run after:
-- 1. All records have been migrated to sources
-- 2. All graph edges have been migrated
-- 3. All timeline events have been updated
-- 4. Frontend has been updated to use new endpoints
-- 5. Full database backup has been taken

-- Recommended verification queries to run BEFORE this migration:
--
-- 1. Check for unmigrated records:
--    SELECT COUNT(*) FROM records WHERE id NOT IN (
--      SELECT provenance->>'migrated_from_record_id' FROM sources
--      WHERE provenance->>'migrated_from_record_id' IS NOT NULL
--    );
--
-- 2. Check for timeline events still using source_record_id:
--    SELECT COUNT(*) FROM timeline_events WHERE source_record_id IS NOT NULL AND source_id IS NULL;
--
-- 3. Check for observations still using source_payload_id:
--    SELECT COUNT(*) FROM observations WHERE source_payload_id IS NOT NULL AND source_id IS NULL;

-- ============================================================================
-- DROP FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Drop constraints from timeline_events
ALTER TABLE timeline_events DROP CONSTRAINT IF EXISTS timeline_events_source_record_id_fkey;
ALTER TABLE timeline_events DROP CONSTRAINT IF EXISTS timeline_events_source_check;

-- Drop constraints from raw_fragments
ALTER TABLE raw_fragments DROP CONSTRAINT IF EXISTS raw_fragments_record_id_fkey;

-- Drop constraints from relationships
ALTER TABLE relationships DROP CONSTRAINT IF EXISTS relationships_source_record_id_fkey;

-- Drop constraints from record_relationships
ALTER TABLE record_relationships DROP CONSTRAINT IF EXISTS record_relationships_source_id_fkey;
ALTER TABLE record_relationships DROP CONSTRAINT IF EXISTS record_relationships_target_id_fkey;

-- Drop constraints from record_entity_edges
ALTER TABLE record_entity_edges DROP CONSTRAINT IF EXISTS record_entity_edges_record_id_fkey;

-- Drop constraints from record_event_edges
ALTER TABLE record_event_edges DROP CONSTRAINT IF EXISTS record_event_edges_record_id_fkey;

-- ============================================================================
-- DROP DEPRECATED TABLES
-- ============================================================================

-- Drop graph edge tables (replaced by source_entity_edges, source_event_edges)
DROP TABLE IF EXISTS record_entity_edges;
DROP TABLE IF EXISTS record_event_edges;

-- Drop record relationships table
DROP TABLE IF EXISTS record_relationships;

-- Drop main records table
DROP TABLE IF EXISTS records;

-- ============================================================================
-- DROP DEPRECATED COLUMNS
-- ============================================================================

-- Drop source_record_id from timeline_events (replaced by source_id)
ALTER TABLE timeline_events DROP COLUMN IF EXISTS source_record_id;

-- Drop record_id from raw_fragments (replaced by source_id)
ALTER TABLE raw_fragments DROP COLUMN IF EXISTS record_id;

-- Drop source_record_id from relationships
ALTER TABLE relationships DROP COLUMN IF EXISTS source_record_id;

-- Drop source_payload_id from observations (replaced by source_id)
ALTER TABLE observations DROP COLUMN IF EXISTS source_payload_id;

-- ============================================================================
-- UPDATE CONSTRAINTS
-- ============================================================================

-- Make source_id NOT NULL in timeline_events (now required)
ALTER TABLE timeline_events ALTER COLUMN source_id SET NOT NULL;

-- Make source_id NOT NULL in raw_fragments (now required)
ALTER TABLE raw_fragments ALTER COLUMN source_id SET NOT NULL;

-- ============================================================================
-- CLEANUP COMMENTS
-- ============================================================================

COMMENT ON TABLE timeline_events IS 'Timeline events generated from sources (v0.3.0+)';
COMMENT ON COLUMN timeline_events.source_id IS 'Source that generated this event';

COMMENT ON TABLE raw_fragments IS 'Unknown fields from interpretation runs (v0.3.0+)';
COMMENT ON COLUMN raw_fragments.source_id IS 'Source that contained this fragment';

-- ============================================================================
-- VERIFICATION QUERIES (Run after migration)
-- ============================================================================

-- Verify no orphaned data:
-- 
-- 1. All timeline events have valid source_id:
--    SELECT COUNT(*) FROM timeline_events WHERE source_id IS NULL;
--    -- Should return 0
--
-- 2. All raw_fragments have valid source_id:
--    SELECT COUNT(*) FROM raw_fragments WHERE source_id IS NULL;
--    -- Should return 0
--
-- 3. All observations have valid source_id:
--    SELECT COUNT(*) FROM observations WHERE source_id IS NULL;
--    -- Should return 0
--
-- 4. Verify tables are dropped:
--    SELECT table_name FROM information_schema.tables 
--    WHERE table_name IN ('records', 'record_relationships', 'record_entity_edges', 'record_event_edges');
--    -- Should return 0 rows

