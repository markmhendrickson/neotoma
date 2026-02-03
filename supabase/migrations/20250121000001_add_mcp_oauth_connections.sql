-- Migration: Add MCP OAuth connections table
-- Created: 2025-01-21
-- Description: Stores MCP OAuth connections with refresh tokens for long-lived MCP server authentication

-- ============================================================================
-- Table Creation
-- ============================================================================

-- Temporarily disable event trigger to avoid double schema prefix issue
ALTER EVENT TRIGGER trigger_auto_enable_rls_on_table DISABLE;
CREATE TABLE IF NOT EXISTS mcp_oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  client_name TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
-- Add table comment
COMMENT ON TABLE mcp_oauth_connections IS 'Stores MCP OAuth connections with encrypted refresh tokens for long-lived authentication';
COMMENT ON COLUMN mcp_oauth_connections.connection_id IS 'Human-readable connection ID used in MCP client configuration (e.g., "cursor-2025-01-15-abc123")';
COMMENT ON COLUMN mcp_oauth_connections.refresh_token IS 'Encrypted Supabase refresh token for obtaining access tokens';
COMMENT ON COLUMN mcp_oauth_connections.access_token IS 'Cached access token (optional, for performance)';
COMMENT ON COLUMN mcp_oauth_connections.access_token_expires_at IS 'When the cached access token expires';
COMMENT ON COLUMN mcp_oauth_connections.client_name IS 'Optional name of MCP client (e.g., "Cursor", "Claude Code")';
COMMENT ON COLUMN mcp_oauth_connections.revoked_at IS 'Timestamp when connection was revoked (soft delete)';
-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_connections_user 
  ON mcp_oauth_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_connections_connection_id 
  ON mcp_oauth_connections(connection_id);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_connections_active 
  ON mcp_oauth_connections(user_id, revoked_at) 
  WHERE revoked_at IS NULL;
-- Partial unique index for active connections (replaces inline constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_oauth_connections_unique_active
  ON mcp_oauth_connections(user_id, connection_id)
  WHERE revoked_at IS NULL;
-- ============================================================================
-- Row Level Security (RLS) - REQUIRED FOR ALL TABLES
-- ============================================================================

-- Note: RLS is automatically enabled by event trigger (20260120120000_enable_rls_by_default_for_all_tables.sql)
-- We only need to create policies here

-- Users can manage their own MCP connections
DROP POLICY IF EXISTS "Users manage own MCP connections" ON mcp_oauth_connections;
CREATE POLICY "Users manage own MCP connections" ON mcp_oauth_connections
  FOR ALL USING (user_id = auth.uid());
-- Service role has full access
DROP POLICY IF EXISTS "Service role full access - mcp_oauth_connections" ON mcp_oauth_connections;
CREATE POLICY "Service role full access - mcp_oauth_connections" ON mcp_oauth_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Re-enable event trigger
ALTER EVENT TRIGGER trigger_auto_enable_rls_on_table ENABLE;
-- Ensure RLS is enabled (in case event trigger was disabled)
ALTER TABLE mcp_oauth_connections ENABLE ROW LEVEL SECURITY;
