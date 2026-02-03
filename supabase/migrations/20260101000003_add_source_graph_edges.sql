-- Migration: Add source-based graph edges for v0.2.15
-- Purpose: Replace record-based edges with source material-based edges
-- Reference: docs/releases/v0.2.15/release_plan.md Phase 3

-- ============================================================================
-- 1. Create source_entity_edges table
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_entity_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  edge_type TEXT NOT NULL DEFAULT 'EXTRACTED_FROM',
  interpretation_id UUID REFERENCES interpretations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);
-- Indexes for source_entity_edges
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_source ON source_entity_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_entity ON source_entity_edges(entity_id);
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_user ON source_entity_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_source_entity_edges_interpretation ON source_entity_edges(interpretation_id);
-- RLS for source_entity_edges
ALTER TABLE source_entity_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own source_entity_edges" ON source_entity_edges
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access to source_entity_edges" ON source_entity_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- ============================================================================
-- 2. Create source_event_edges table
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_event_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'GENERATED_FROM',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);
-- Indexes for source_event_edges
CREATE INDEX IF NOT EXISTS idx_source_event_edges_source ON source_event_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_source_event_edges_event ON source_event_edges(event_id);
CREATE INDEX IF NOT EXISTS idx_source_event_edges_user ON source_event_edges(user_id);
-- RLS for source_event_edges
ALTER TABLE source_event_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own source_event_edges" ON source_event_edges
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role full access to source_event_edges" ON source_event_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- ============================================================================
-- 3. Update timeline_events table to support source_id
-- ============================================================================

-- Add source_id column (nullable for backward compatibility)
ALTER TABLE timeline_events 
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id);
-- Make source_record_id nullable (for backward compatibility during migration)
-- Note: Will be removed in v0.2.16 after full migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'timeline_events' AND column_name = 'source_record_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE timeline_events ALTER COLUMN source_record_id DROP NOT NULL;
  END IF;
END $$;
-- Add index for source_id
CREATE INDEX IF NOT EXISTS idx_timeline_events_source ON timeline_events(source_id);
-- ============================================================================
-- 4. Update observations table to use source_material_id
-- ============================================================================

-- Add source_material_id column (alias to source_id for clarity)
-- Note: This is a documentation-level change; the column is already named source_id in the database
-- We're just adding a comment to clarify the terminology alignment
COMMENT ON COLUMN observations.source_id IS 'References sources(id) - stores source material ID for provenance tracking';
-- Add interpretation_id column reference comment
COMMENT ON COLUMN observations.interpretation_id IS 'References interpretations(id) - tracks which interpretation extracted this observation';
-- ============================================================================
-- 5. Update relationships table to use source_material_id
-- ============================================================================

-- Rename source_record_id to source_material_id for clarity
-- Check if column exists first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'relationships' AND column_name = 'source_record_id'
  ) THEN
    ALTER TABLE relationships RENAME COLUMN source_record_id TO source_material_id;
  END IF;
END $$;
-- Add index if not exists
CREATE INDEX IF NOT EXISTS idx_relationships_source_material ON relationships(source_material_id);
-- ============================================================================
-- 6. Update raw_fragments table column comments
-- ============================================================================

COMMENT ON COLUMN raw_fragments.source_id IS 'References sources(id) - stores source material ID where fragment was found';
COMMENT ON COLUMN raw_fragments.interpretation_id IS 'References interpretations(id) - tracks which interpretation found this fragment';
