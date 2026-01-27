# MCP OAuth Migrations - Manual Application Guide

## Status: ✅ Fixed

**Update:** The Supabase CLI issue has been fixed. Migrations now apply automatically via `npm run migrate`.

This guide is kept as a backup for manual application if needed.

## Previous Issue (Now Fixed)

The Supabase migration runner was encountering an error when applying the MCP OAuth migrations automatically due to an event trigger bug that caused double schema prefix errors.

**Error (fixed):**
```
ERROR: relation "public.public.mcp_oauth_connections" does not exist
```

**Solution:** Migration `20250121000000_fix_rls_event_trigger.sql` fixes the event trigger, and migrations `20250121000001` and `20250121000002` temporarily disable the trigger during table creation to avoid conflicts.

## Manual Migration Steps

### Step 1: Open Supabase Dashboard SQL Editor

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Click "New Query"

### Step 2: Apply Migration 1 - MCP OAuth Connections Table

Copy and paste this entire SQL into the editor and run:

```sql
-- Migration: Add MCP OAuth connections table
-- Created: 2025-01-21

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

COMMENT ON TABLE mcp_oauth_connections IS 'Stores MCP OAuth connections with encrypted refresh tokens for long-lived authentication';
COMMENT ON COLUMN mcp_oauth_connections.connection_id IS 'Human-readable connection ID used in MCP client configuration';
COMMENT ON COLUMN mcp_oauth_connections.refresh_token IS 'Encrypted Supabase refresh token for obtaining access tokens';
COMMENT ON COLUMN mcp_oauth_connections.access_token IS 'Cached access token (optional, for performance)';
COMMENT ON COLUMN mcp_oauth_connections.client_name IS 'Optional name of MCP client (e.g., "Cursor", "Claude Code")';

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_connections_user 
  ON mcp_oauth_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_connections_connection_id 
  ON mcp_oauth_connections(connection_id);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_connections_active 
  ON mcp_oauth_connections(user_id, revoked_at) 
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_oauth_connections_unique_active
  ON mcp_oauth_connections(user_id, connection_id)
  WHERE revoked_at IS NULL;

ALTER TABLE mcp_oauth_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own MCP connections" ON mcp_oauth_connections
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Service role full access - mcp_oauth_connections" ON mcp_oauth_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Verify:** Check that the table was created:

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'mcp_oauth_connections' 
ORDER BY ordinal_position;
```

Expected: 10 columns listed.

### Step 3: Apply Migration 2 - MCP OAuth State Table

Copy and paste this entire SQL into the editor and run:

```sql
-- Migration: Add MCP OAuth state table
-- Created: 2025-01-21

CREATE TABLE IF NOT EXISTS mcp_oauth_state (
  state TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE mcp_oauth_state IS 'Temporary storage for OAuth PKCE state (expires after 10 minutes)';
COMMENT ON COLUMN mcp_oauth_state.state IS 'Random state token for CSRF protection';
COMMENT ON COLUMN mcp_oauth_state.connection_id IS 'Connection ID being authorized';
COMMENT ON COLUMN mcp_oauth_state.code_verifier IS 'PKCE code verifier (used to exchange authorization code for tokens)';

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_state_expires 
  ON mcp_oauth_state(expires_at);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_state_connection 
  ON mcp_oauth_state(connection_id);

ALTER TABLE mcp_oauth_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access - mcp_oauth_state" ON mcp_oauth_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

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
```

**Verify:** Check that the table was created:

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'mcp_oauth_state' 
ORDER BY ordinal_position;
```

Expected: 6 columns listed.

### Step 4: Verify Both Tables

Run this query to confirm both tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('mcp_oauth_connections', 'mcp_oauth_state')
ORDER BY table_name;
```

Expected output:
```
 table_name               
--------------------------
 mcp_oauth_connections
 mcp_oauth_state
```

### Step 5: Test Migrations

After applying both migrations, test that they work:

```sql
-- Test insert into mcp_oauth_connections
INSERT INTO mcp_oauth_connections (
  user_id, 
  connection_id, 
  refresh_token
) VALUES (
  auth.uid(), -- Your user ID
  'test-connection-123',
  'encrypted-test-token'
);

-- Verify insert
SELECT connection_id, created_at 
FROM mcp_oauth_connections 
WHERE connection_id = 'test-connection-123';

-- Clean up test
DELETE FROM mcp_oauth_connections 
WHERE connection_id = 'test-connection-123';
```

## Next Steps

After successfully applying both migrations:

1. **Restart backend server:**
   ```bash
   # Stop current dev server (Ctrl+C)
   npm run dev:full
   ```

2. **Test OAuth flow:**
   - Go to http://localhost:5195
   - Sign in
   - Navigate to MCP Setup → OAuth Connection tab
   - Create a test connection

3. **Run integration tests:**
   ```bash
   npm test -- tests/integration/mcp_oauth_flow.test.ts
   ```

4. **Verify:** All integration tests should pass

## Troubleshooting

### "permission denied for schema auth"

Make sure you're using the service role key or running as superuser.

### "policy already exists"

Safe to ignore - policies may already exist from previous migration attempts.

### Tables still don't exist

1. Check you're connected to the correct database
2. Verify SQL ran without errors
3. Check table list: `\dt` in psql or query information_schema

## Related Documentation

- `docs/developer/mcp_oauth_manual_steps.md` - Complete deployment guide
- `docs/developer/mcp_oauth_implementation.md` - Technical details
- `MCP_OAUTH_IMPLEMENTATION_COMPLETE.md` - Implementation summary
