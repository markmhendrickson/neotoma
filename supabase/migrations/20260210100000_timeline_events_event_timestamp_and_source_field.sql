-- Migration: Add event_timestamp and source_field to timeline_events
-- Created: 2026-02-10
-- Description: Align timeline_events with API/code (event_timestamp, source_field). Backfill from occurred_at if present.

-- Add event_timestamp if missing (code and schema doc use this name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'event_timestamp'
  ) THEN
    ALTER TABLE timeline_events ADD COLUMN event_timestamp TIMESTAMPTZ;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'occurred_at'
    ) THEN
      UPDATE timeline_events SET event_timestamp = occurred_at WHERE event_timestamp IS NULL;
    END IF;
    UPDATE timeline_events SET event_timestamp = COALESCE(event_timestamp, created_at, NOW()) WHERE event_timestamp IS NULL;
    ALTER TABLE timeline_events ALTER COLUMN event_timestamp SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_timeline_events_event_timestamp ON timeline_events(event_timestamp DESC);
  END IF;
END $$;

-- Add source_field if missing (field that generated the event)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'timeline_events' AND column_name = 'source_field'
  ) THEN
    ALTER TABLE timeline_events ADD COLUMN source_field TEXT;
  END IF;
END $$;
