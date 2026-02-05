-- Migration: Drop legacy tables and record-based columns
-- Created: 2026-02-03
-- Description: Remove legacy record-based tables and deprecated tables with no backward support.

-- ============================================================================
-- DROP LEGACY TABLES (CASCADE TO REMOVE DEPENDENT CONSTRAINTS)
-- ============================================================================

DROP TABLE IF EXISTS records CASCADE;
DROP TABLE IF EXISTS record_relationships CASCADE;
DROP TABLE IF EXISTS record_entity_edges CASCADE;
DROP TABLE IF EXISTS record_event_edges CASCADE;
DROP TABLE IF EXISTS entity_event_edges CASCADE;
DROP TABLE IF EXISTS state_events CASCADE;
DROP TABLE IF EXISTS relationships CASCADE;
DROP TABLE IF EXISTS payload_submissions CASCADE;
DROP TABLE IF EXISTS interpretation_runs CASCADE;

-- ============================================================================
-- DROP LEGACY COLUMNS THAT REFERENCE RECORDS
-- ============================================================================

ALTER TABLE timeline_events
  DROP COLUMN IF EXISTS source_record_id;

ALTER TABLE observations
  DROP COLUMN IF EXISTS source_payload_id;

ALTER TABLE observations
  DROP COLUMN IF EXISTS source_record_id;
