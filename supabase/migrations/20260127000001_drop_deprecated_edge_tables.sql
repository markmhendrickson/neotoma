-- Migration: Drop deprecated tables
-- Date: 2025-01-27
-- Purpose: Remove legacy and deprecated tables that are no longer used
--          - Edge tables replaced by source-based equivalents
--          - Plaid integration tables (integration removed)
--          - External connector tables (integration removed)
-- Reference: docs/releases/v0.2.15/migrations/02_drop_legacy_tables.sql

-- ============================================================================
-- DROP DEPRECATED EDGE TABLES
-- ============================================================================

-- Drop deprecated record_entity_edges (replaced by source_entity_edges)
DROP TABLE IF EXISTS record_entity_edges CASCADE;

-- Drop deprecated record_event_edges (replaced by source_event_edges)
DROP TABLE IF EXISTS record_event_edges CASCADE;

-- ============================================================================
-- DROP DEPRECATED PLAID INTEGRATION TABLES
-- ============================================================================

-- Drop plaid_items (Plaid integration removed)
DROP TABLE IF EXISTS plaid_items CASCADE;

-- Drop plaid_sync_runs (Plaid integration removed)
DROP TABLE IF EXISTS plaid_sync_runs CASCADE;

-- ============================================================================
-- DROP DEPRECATED EXTERNAL CONNECTOR TABLES
-- ============================================================================

-- Drop external_connectors (external provider integrations removed)
DROP TABLE IF EXISTS external_connectors CASCADE;

-- Drop external_sync_runs (external provider integrations removed)
DROP TABLE IF EXISTS external_sync_runs CASCADE;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify tables are dropped (this will error if tables still exist, which is expected)
-- Uncomment to verify after running migration
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'record_entity_edges') THEN
--     RAISE EXCEPTION 'record_entity_edges still exists';
--   END IF;
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'record_event_edges') THEN
--     RAISE EXCEPTION 'record_event_edges still exists';
--   END IF;
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plaid_items') THEN
--     RAISE EXCEPTION 'plaid_items still exists';
--   END IF;
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plaid_sync_runs') THEN
--     RAISE EXCEPTION 'plaid_sync_runs still exists';
--   END IF;
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_connectors') THEN
--     RAISE EXCEPTION 'external_connectors still exists';
--   END IF;
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_sync_runs') THEN
--     RAISE EXCEPTION 'external_sync_runs still exists';
--   END IF;
-- END $$;
