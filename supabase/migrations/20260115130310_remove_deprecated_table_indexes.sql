-- Migration: Remove Indexes on Deprecated Tables
-- Created: 2026-01-15
-- Description: Removes unused indexes on deprecated tables (entity_event_edges, state_events)
--              These tables are deprecated and will be dropped, so indexes are unnecessary

-- ============================================================================
-- Remove indexes on deprecated tables
-- ============================================================================

-- entity_event_edges table (deprecated)
DROP INDEX IF EXISTS idx_entity_event_edges_entity;
DROP INDEX IF EXISTS idx_entity_event_edges_event;
DROP INDEX IF EXISTS idx_entity_event_edges_user;

-- state_events table (deprecated)
DROP INDEX IF EXISTS idx_state_events_entity;
DROP INDEX IF EXISTS idx_state_events_event;
DROP INDEX IF EXISTS idx_state_events_timestamp;
DROP INDEX IF EXISTS idx_state_events_user;

-- ============================================================================
-- Summary
-- ============================================================================
-- Removed indexes on deprecated tables that will be dropped
-- These indexes were never used and are no longer needed
-- Expected result: unused_index count reduced by ~7-10 issues
