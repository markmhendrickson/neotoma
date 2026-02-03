-- Migration: Enable Realtime publications for all data tables
-- Created: 2026-01-28
-- Description: Enables Supabase Realtime subscriptions for core data tables and sets REPLICA IDENTITY for UPDATE/DELETE tracking

-- Enable Realtime on core data tables (guarded)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entities') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'entities'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.entities';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sources') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'sources'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sources';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'observations') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'observations'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.observations';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entity_snapshots') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'entity_snapshots'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.entity_snapshots';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'relationships') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'relationships'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.relationships';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'timeline_events') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'timeline_events'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.timeline_events';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'interpretations') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'interpretations'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.interpretations';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'records') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'records'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.records';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'raw_fragments') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_rel pr
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
          AND n.nspname = 'public'
          AND c.relname = 'raw_fragments'
      ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.raw_fragments';
      END IF;
    END IF;
  END IF;
END $$;

-- Set REPLICA IDENTITY for UPDATE/DELETE tracking
-- FULL mode sends complete row data for UPDATE and DELETE events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entities') THEN
    ALTER TABLE entities REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sources') THEN
    ALTER TABLE sources REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'observations') THEN
    ALTER TABLE observations REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entity_snapshots') THEN
    ALTER TABLE entity_snapshots REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'relationships') THEN
    ALTER TABLE relationships REPLICA IDENTITY FULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'timeline_events') THEN
    ALTER TABLE timeline_events REPLICA IDENTITY FULL;
  END IF;
END $$;
