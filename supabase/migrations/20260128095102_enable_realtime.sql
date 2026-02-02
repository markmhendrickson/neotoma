-- Migration: Enable Realtime publications for all data tables
-- Created: 2026-01-28
-- Description: Enables Supabase Realtime subscriptions for core data tables and sets REPLICA IDENTITY for UPDATE/DELETE tracking

-- Enable Realtime on core data tables
ALTER PUBLICATION supabase_realtime ADD TABLE entities;
ALTER PUBLICATION supabase_realtime ADD TABLE sources;
ALTER PUBLICATION supabase_realtime ADD TABLE observations;
ALTER PUBLICATION supabase_realtime ADD TABLE entity_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE relationships;
ALTER PUBLICATION supabase_realtime ADD TABLE timeline_events;
ALTER PUBLICATION supabase_realtime ADD TABLE interpretations;
ALTER PUBLICATION supabase_realtime ADD TABLE records;
ALTER PUBLICATION supabase_realtime ADD TABLE raw_fragments;

-- Set REPLICA IDENTITY for UPDATE/DELETE tracking
-- FULL mode sends complete row data for UPDATE and DELETE events
ALTER TABLE entities REPLICA IDENTITY FULL;
ALTER TABLE sources REPLICA IDENTITY FULL;
ALTER TABLE observations REPLICA IDENTITY FULL;
ALTER TABLE entity_snapshots REPLICA IDENTITY FULL;
ALTER TABLE relationships REPLICA IDENTITY FULL;
ALTER TABLE timeline_events REPLICA IDENTITY FULL;
