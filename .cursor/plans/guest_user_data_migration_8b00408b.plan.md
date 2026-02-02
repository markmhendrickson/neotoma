---
name: Guest User Data Migration
overview: Implement automatic migration of guest user data to authenticated user accounts upon sign in or sign up, ensuring all user-scoped data is transferred atomically with proper error handling and user feedback.
todos:
  - id: "1"
    content: Create database migration function in supabase/migrations/ for atomic guest-to-authenticated user data migration
    status: pending
  - id: "2"
    content: Create backend API endpoint POST /api/auth/migrate-guest-data in src/actions.ts
    status: pending
  - id: "3"
    content: Create frontend migration service frontend/src/services/userMigration.ts
    status: pending
  - id: "4"
    content: Update SigninForm.tsx to trigger migration after successful sign-in
    status: pending
  - id: "5"
    content: Update SignupForm.tsx to trigger migration after successful sign-up
    status: pending
  - id: "6"
    content: Add integration tests for migration functionality
    status: pending
  - id: "7"
    content: Test migration with real data and verify all tables are updated correctly
    status: pending
isProject: false
---

# Guest User Data Migration Implementation Plan

## Recommendation: Application-Level Migration with Database Function

**Recommended Approach:** Application-level migration triggered in sign-in/sign-up handlers, using a secure database function for atomic updates. This provides:

- Better user experience (loading states, error messages)
- Explicit control (aligns with Neotoma's privacy-first principles)
- Transactional safety (database function ensures atomicity)
- Easier debugging and monitoring

**Alternative Considered:** Database triggers were rejected because Supabase Auth doesn't provide a reliable "user transition" event, and application-level control is preferred for Neotoma's architecture.

## Implementation Steps

### 1. Create Database Migration Function

**File:** `supabase/migrations/YYYYMMDDHHMMSS_migrate_guest_user_data.sql`

Create a secure database function that migrates all user-scoped data atomically:

```sql
-- Migration: Guest user data migration function
-- Purpose: Atomically migrate all guest user data to authenticated user

CREATE OR REPLACE FUNCTION migrate_guest_user_data(
  guest_user_id UUID,
  authenticated_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  migration_result JSONB;
  table_counts JSONB := '{}'::JSONB;
  total_migrated INTEGER := 0;
BEGIN
  -- Validate inputs
  IF guest_user_id IS NULL OR authenticated_user_id IS NULL THEN
    RAISE EXCEPTION 'Both guest_user_id and authenticated_user_id must be provided';
  END IF;

  IF guest_user_id = authenticated_user_id THEN
    RAISE EXCEPTION 'Guest and authenticated user IDs must be different';
  END IF;

  -- Check if guest user is actually anonymous
  -- (Optional: verify via auth.users metadata if needed)

  -- Migrate all user-scoped tables
  -- Core data tables
  UPDATE records SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{records}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE sources SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{sources}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE entities SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{entities}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE observations SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{observations}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE entity_snapshots SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{entity_snapshots}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  -- Relationship tables
  UPDATE relationships SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{relationships}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE relationship_observations SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{relationship_observations}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE relationship_snapshots SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{relationship_snapshots}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  -- Graph edges
  UPDATE source_entity_edges SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{source_entity_edges}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE source_event_edges SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{source_event_edges}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  -- Timeline and interpretation
  UPDATE timeline_events SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{timeline_events}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE interpretations SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{interpretations}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE raw_fragments SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{raw_fragments}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  -- User-specific configuration
  UPDATE schema_registry SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{schema_registry}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE schema_recommendations SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{schema_recommendations}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE field_blacklist SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{field_blacklist}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  UPDATE auto_enhancement_queue SET user_id = authenticated_user_id WHERE user_id = guest_user_id;
  GET DIAGNOSTICS table_counts = jsonb_set(table_counts, '{auto_enhancement_queue}', to_jsonb(ROW_COUNT));
  total_migrated := total_migrated + ROW_COUNT;

  -- Note: mcp_oauth_connections should NOT be migrated (connection-specific)

  -- Return migration summary
  migration_result := jsonb_build_object(
    'success', true,
    'total_migrated', total_migrated,
    'table_counts', table_counts,
    'guest_user_id', guest_user_id,
    'authenticated_user_id', authenticated_user_id
  );

  RETURN migration_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback is automatic in PostgreSQL
    RAISE EXCEPTION 'Migration failed: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION migrate_guest_user_data(UUID, UUID) TO authenticated;
```

**Key Points:**

- Uses `SECURITY DEFINER` to bypass RLS during migration
- Atomic transaction (all or nothing)
- Returns detailed migration summary
- Validates inputs before proceeding

### 2. Create Backend API Endpoint

**File:** `src/actions.ts` (add new endpoint)

Create an endpoint that calls the migration function:

```typescript
// POST /api/auth/migrate-guest-data
app.post("/api/auth/migrate-guest-data", async (req, res) => {
  const { guestUserId } = req.body;

  // Get authenticated user from session
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return res.status(401).json({ error: "Invalid authentication" });
  }

  const authenticatedUserId = user.id;

  // Validate guest user ID
  if (!guestUserId || typeof guestUserId !== "string") {
    return res.status(400).json({ error: "guestUserId is required" });
  }

  // Prevent self-migration
  if (guestUserId === authenticatedUserId) {
    return res.status(400).json({ error: "Cannot migrate to same user" });
  }

  try {
    // Call migration function using service role (bypasses RLS)
    const { data, error } = await getServiceRoleClient().rpc("migrate_guest_user_data", {
      guest_user_id: guestUserId,
      authenticated_user_id: authenticatedUserId,
    });

    if (error) {
      logError(error, "Guest Data Migration");
      return res.status(500).json({
        error: "Migration failed",
        details: error.message,
      });
    }

    res.json({
      success: true,
      result: data,
    });
  } catch (err) {
    logError(err, "Guest Data Migration");
    res.status(500).json({
      error: "Migration failed",
      details: err instanceof Error ? err.message : String(err),
    });
  }
});
```

### 3. Create Frontend Migration Service

**File:** `frontend/src/services/userMigration.ts`

Create a service to handle migration logic:

```typescript
/**
 * User Migration Service
 * Handles migration of guest user data to authenticated user
 */

import { supabase } from "@/lib/supabase";

export interface MigrationResult {
  success: boolean;
  total_migrated: number;
  table_counts: Record<string, number>;
  guest_user_id: string;
  authenticated_user_id: string;
}

export async function migrateGuestUserData(guestUserId: string): Promise<MigrationResult> {
  const session = await supabase.auth.getSession();

  if (!session.data.session) {
    throw new Error("No active session");
  }

  const token = session.data.session.access_token;

  const response = await fetch("/api/auth/migrate-guest-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ guestUserId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Migration failed");
  }

  const data = await response.json();
  return data.result;
}
```

### 4. Update Sign-In Form

**File:** `frontend/src/components/auth/SigninForm.tsx`

Add migration logic to sign-in handler:

```typescript
import { migrateGuestUserData } from "@/services/userMigration";

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setLoading(true);

  try {
    const { supabase } = await import("@/lib/supabase");

    // Get guest user ID before sign in
    const {
      data: { session: guestSession },
    } = await supabase.auth.getSession();
    const guestUserId = guestSession?.user?.id;
    const isGuestUser = guestSession?.user?.is_anonymous === true;

    // Sign in as authenticated user
    const { data, error: signinError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signinError) {
      // ... existing error handling
      throw new Error(errorMessage);
    }

    if (data?.user) {
      // Migrate guest data if user was previously a guest
      if (isGuestUser && guestUserId && guestUserId !== data.user.id) {
        try {
          await migrateGuestUserData(guestUserId);
          console.log("[Sign In] Guest data migrated successfully");
        } catch (migrationError) {
          // Log but don't block sign-in
          console.error("[Sign In] Guest data migration failed:", migrationError);
          // Optionally show a warning to user
        }
      }

      if (onSuccess) {
        onSuccess();
      }
    }
  } catch (err) {
    // ... existing error handling
  } finally {
    setLoading(false);
  }
};
```

### 5. Update Sign-Up Form

**File:** `frontend/src/components/auth/SignupForm.tsx`

Add migration logic to sign-up handler (similar to sign-in):

```typescript
import { migrateGuestUserData } from "@/services/userMigration";

const handleSubmit = async (e: React.FormEvent) => {
  // ... existing validation

  try {
    const { supabase } = await import("@/lib/supabase");

    // Get guest user ID before sign up
    const {
      data: { session: guestSession },
    } = await supabase.auth.getSession();
    const guestUserId = guestSession?.user?.id;
    const isGuestUser = guestSession?.user?.is_anonymous === true;

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
    });

    // ... existing error handling

    if (data?.user && data.session) {
      // Migrate guest data if user was previously a guest
      if (isGuestUser && guestUserId && guestUserId !== data.user.id) {
        try {
          await migrateGuestUserData(guestUserId);
          console.log("[Sign Up] Guest data migrated successfully");
        } catch (migrationError) {
          console.error("[Sign Up] Guest data migration failed:", migrationError);
        }
      }

      // ... existing success handling
    }
  } catch (err) {
    // ... existing error handling
  }
};
```

### 6. Update AuthContext for Migration State

**File:** `frontend/src/contexts/AuthContext.tsx`

Add migration state tracking (optional, for UI feedback):

```typescript
interface AuthContextType {
  // ... existing fields
  isMigrating: boolean;
  migrationError: Error | null;
}

// In AuthProvider, track migration state during auth state changes
const [isMigrating, setIsMigrating] = useState(false);
const [migrationError, setMigrationError] = useState<Error | null>(null);
```

### 7. Add Migration Tests

**File:** `tests/integration/user_migration.test.ts`

Create integration tests:

```typescript
describe("Guest User Data Migration", () => {
  it("should migrate all user-scoped data from guest to authenticated user", async () => {
    // Create guest user
    // Create authenticated user
    // Create test data for guest user
    // Call migration function
    // Verify all data belongs to authenticated user
  });

  it("should handle migration errors gracefully", async () => {
    // Test error scenarios
  });

  it("should not migrate if guest and authenticated IDs are the same", async () => {
    // Test validation
  });
});
```

## Tables Requiring Migration

Based on schema analysis, these tables have `user_id` and require migration:

1.  **Core Data:**

                                                - `records`
                                                - `sources`
                                                - `entities`
                                                - `observations`
                                                - `entity_snapshots`

2.  **Relationships:**

                                                - `relationships`
                                                - `relationship_observations`
                                                - `relationship_snapshots`

3.  **Graph Edges:**

                                                - `source_entity_edges`
                                                - `source_event_edges`

4.  **Timeline & Interpretation:**

                                                - `timeline_events`
                                                - `interpretations`
                                                - `raw_fragments`

5.  **User Configuration:**

                                                - `schema_registry` (user-specific schemas)
                                                - `schema_recommendations`
                                                - `field_blacklist`
                                                - `auto_enhancement_queue`

**Note:** `mcp_oauth_connections` should NOT be migrated (connection-specific to the authenticated session).

## Error Handling Strategy

1. **Migration failures don't block sign-in/sign-up** - User can still authenticate
2. **Log all migration errors** for debugging
3. **Optional user notification** - Show warning if migration fails (non-blocking)
4. **Retry mechanism** - Allow manual retry via UI if needed

## Security Considerations

1. **Function uses `SECURITY DEFINER`** - Runs with elevated privileges to bypass RLS
2. **Input validation** - Prevents self-migration and invalid inputs
3. **Authentication required** - Only authenticated users can trigger migration
4. **Guest user verification** - Optional: verify guest user is actually anonymous

## User Experience

1. **Silent migration** - Happens automatically, no user action required
2. **Non-blocking** - Sign-in/sign-up proceeds even if migration fails
3. **Optional loading state** - Show "Migrating your data..." if migration takes time
4. **Error recovery** - Allow manual retry if migration fails

## Testing Checklist

- [ ] Migration function handles all tables correctly
- [ ] Migration is atomic (all or nothing)
- [ ] Sign-in triggers migration when guest user exists
- [ ] Sign-up triggers migration when guest user exists
- [ ] Migration doesn't block authentication on failure
- [ ] Error handling works correctly
- [ ] RLS policies still work after migration
- [ ] No data loss during migration
- [ ] Concurrent migration attempts handled correctly

## Future Enhancements

1. **Migration status tracking** - Store migration state to prevent duplicate migrations
2. **Partial migration recovery** - Handle cases where migration partially completes
3. **Migration UI** - Show migration progress and allow manual retry
4. **Migration audit log** - Track all migrations for debugging
