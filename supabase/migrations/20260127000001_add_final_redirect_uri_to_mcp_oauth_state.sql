-- Migration: Add final_redirect_uri to mcp_oauth_state
-- Created: 2026-01-27
-- Description: Store client's final redirect URI (e.g., cursor://) so we can redirect back to Cursor after OAuth callback

ALTER TABLE mcp_oauth_state
  ADD COLUMN IF NOT EXISTS final_redirect_uri TEXT;

COMMENT ON COLUMN mcp_oauth_state.final_redirect_uri IS 'Client final redirect URI (e.g., cursor://anysphere.cursor-mcp/oauth/callback) to redirect to after OAuth callback completes';
