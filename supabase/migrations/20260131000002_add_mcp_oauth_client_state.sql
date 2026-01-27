-- Migration: Add client_state to mcp_oauth_state for Cursor OAuth flow
-- Created: 2026-01-31
-- Description: Store client's OAuth state param so we can redirect back to Cursor with correct state

ALTER TABLE mcp_oauth_state
  ADD COLUMN IF NOT EXISTS client_state TEXT;

COMMENT ON COLUMN mcp_oauth_state.client_state IS 'Client state param (e.g. Cursor) to return in redirect_uri callback';
