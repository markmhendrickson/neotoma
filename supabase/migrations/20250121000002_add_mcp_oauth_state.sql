-- Migration: Add MCP OAuth state table
-- Created: 2025-01-21
-- Description: Stores temporary OAuth state for PKCE flow (replaces in-memory Map)

-- ============================================================================
-- Table Creation
-- ============================================================================

-- Temporarily disable event trigger to avoid double schema prefix issue
ALTER EVENT TRIGGER trigger_auto_enable_rls_on_table DISABLE;
CREATE TABLE IF NOT EXISTS mcp_oauth_state (
  state TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
-- Add table comment
COMMENT ON TABLE mcp_oauth_state IS 'Temporary storage for OAuth PKCE state (expires after 10 minutes)';
COMMENT ON COLUMN mcp_oauth_state.state IS 'Random state token for CSRF protection';
COMMENT ON COLUMN mcp_oauth_state.connection_id IS 'Connection ID being authorized';
COMMENT ON COLUMN mcp_oauth_state.code_verifier IS 'PKCE code verifier (used to exchange authorization code for tokens)';
COMMENT ON COLUMN mcp_oauth_state.redirect_uri IS 'OAuth callback redirect URI';
COMMENT ON COLUMN mcp_oauth_state.expires_at IS 'When this state expires (10 minutes from creation)';
-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_state_expires 
  ON mcp_oauth_state(expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_state_connection 
  ON mcp_oauth_state(connection_id);
-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Note: RLS is automatically enabled by event trigger (20260120120000_enable_rls_by_default_for_all_tables.sql)
-- We only need to create policies here

-- OAuth state is managed by service role only (no direct user access)
DROP POLICY IF EXISTS "Service role full access - mcp_oauth_state" ON mcp_oauth_state;
CREATE POLICY "Service role full access - mcp_oauth_state" ON mcp_oauth_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- ============================================================================
-- Cleanup Function
-- ============================================================================

-- Function to clean up expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_mcp_oauth_states()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM mcp_oauth_state WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
COMMENT ON FUNCTION cleanup_expired_mcp_oauth_states IS 'Deletes expired OAuth states (call periodically or on access)';
-- Re-enable event trigger
ALTER EVENT TRIGGER trigger_auto_enable_rls_on_table ENABLE;
-- Ensure RLS is enabled (in case event trigger was disabled)
ALTER TABLE mcp_oauth_state ENABLE ROW LEVEL SECURITY;
