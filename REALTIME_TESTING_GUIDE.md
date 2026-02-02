# Real-time UI Updates - Testing Guide

## Overview

This guide provides comprehensive testing instructions for the real-time auto-update functionality that has been implemented across the Neotoma application.

## What Was Implemented

1. **Database Layer**: Enabled Supabase Realtime publications for all data tables
2. **Frontend Infrastructure**: Created RealtimeContext provider and custom hooks
3. **Component Updates**: Updated all data-viewing components to use real-time subscriptions
4. **Performance**: Added debouncing, error handling, and connection status indicator

## Manual Testing Checklist

### 1. Basic Real-time Updates

**Test: Entity List Auto-Update**

1. Open the app in two browser tabs/windows
2. Navigate to Entities page (`/entities`) in both tabs
3. In Tab 1: Add a new entity using MCP or quick entry
4. In Tab 2: Verify the new entity appears automatically without refresh
5. In Tab 1: Edit an entity
6. In Tab 2: Verify the changes appear automatically
7. In Tab 1: Delete an entity
8. In Tab 2: Verify the entity disappears automatically

**Expected Result**: All changes should appear in Tab 2 within 1 second.

**Test: Source Table Auto-Update**

1. Open Sources page (`/sources`) in two tabs
2. Upload a file in Tab 1
3. Verify the new source appears in Tab 2 automatically
4. Expected: Source appears within 1 second

**Test: Timeline Auto-Update**

1. Open Timeline page (`/timeline`) in two tabs
2. Add an entity with an event in Tab 1
3. Verify the event appears in Tab 2 automatically
4. Expected: Event appears within 1 second

**Test: Dashboard Stats Auto-Update**

1. Open Dashboard (`/`) in two tabs
2. Upload a file in Tab 1
3. Verify Dashboard stats update in Tab 2 (Sources count increases)
4. Add an entity in Tab 1
5. Verify Dashboard stats update in Tab 2 (Entities count increases)
6. Expected: Stats update within 1-2 seconds (includes 1s debounce)

### 2. Connection Status Indicator

**Test: Status Indicator Display**

1. Open any page in the app
2. Look for the status indicator in the header (top-right area)
3. Verify it shows "Live" with a green dot
4. Expected: Indicator visible and shows connected status

**Test: Disconnection Handling**

1. Open the app
2. Turn off network connection (airplane mode or disconnect WiFi)
3. Verify the status indicator shows "Disconnected" with a red dot
4. Turn network back on
5. Verify the indicator returns to "Live" with green dot
6. Expected: Status reflects connection state accurately

**Test: Error Display**

1. Hover over the status indicator when there's an error
2. Verify the tooltip shows error details
3. Expected: Error message displayed in tooltip

### 3. Multiple Data Types

**Test: All Data Types Update**

For each data type (Entities, Sources, Observations, Relationships, Timeline Events):

1. Open the respective list page in two tabs
2. Create/update/delete an item in Tab 1
3. Verify the change appears in Tab 2 automatically
4. Expected: All data types update in real-time

### 4. Filtering and Pagination

**Test: Filtered Views Update**

1. Open Entities page in two tabs
2. In Tab 2: Select a specific entity type filter (e.g., "invoice")
3. In Tab 1: Add a new entity of that type
4. In Tab 2: Verify the new entity appears in the filtered list
5. Expected: Filtered views update correctly

**Test: Pagination Behavior**

1. Open Entities page with pagination (50+ entities)
2. In Tab 2: Navigate to page 2
3. In Tab 1: Add a new entity
4. In Tab 2: Verify the new entity appears (or total count updates)
5. Expected: Real-time updates work across pages

### 5. Detail Views

**Test: Entity Detail Auto-Update**

1. Open an entity detail page (`/entity/{id}`) in two tabs
2. In Tab 1: Edit the entity (using MCP correct action)
3. In Tab 2: Verify the entity details update automatically
4. Expected: Detail view reflects changes instantly

**Test: Source Detail Auto-Update**

1. Open a source detail page in two tabs
2. Update the source in Tab 1
3. Verify changes appear in Tab 2
4. Expected: Source details update automatically

### 6. Multi-User Testing

**Test: User Isolation**

1. Open the app in two browsers (or incognito mode)
2. Sign in as different users in each browser
3. Add data as User 1
4. Verify User 2 does NOT see User 1's data
5. Expected: RLS policies ensure user isolation

### 7. Performance Testing

**Test: High-Frequency Updates**

1. Open Dashboard in one tab
2. Rapidly add multiple entities (5-10) via MCP
3. Verify Dashboard updates smoothly without excessive re-renders
4. Expected: Debouncing prevents excessive refetches (max 1 per second)

**Test: Large Dataset Performance**

1. Create 100+ entities
2. Open Entity List in two tabs
3. Add a new entity in Tab 1
4. Verify Tab 2 updates without lag
5. Expected: Real-time updates remain performant with large datasets

**Test: Memory Leaks**

1. Open the app
2. Navigate between pages multiple times
3. Open DevTools → Performance → Memory
4. Record memory usage over 5 minutes of navigation
5. Expected: No memory leaks, subscriptions cleaned up properly

### 8. Error Handling

**Test: Subscription Failure Recovery**

1. Open the app
2. Simulate network issues (throttle to offline in DevTools)
3. Make changes in another tab
4. Restore network
5. Expected: Subscriptions reconnect automatically, data syncs

**Test: Invalid Data Handling**

1. Monitor browser console for errors during testing
2. Expected: No uncaught errors, all errors logged gracefully

## Integration Testing (Optional)

Create automated tests for real-time hooks:

```typescript
// Example: tests/hooks/useRealtimeEntities.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { useRealtimeEntities } from "@/hooks/useRealtimeEntities";
import { vi } from "vitest";

// Mock Supabase and RealtimeContext
vi.mock("@/contexts/RealtimeContext", () => ({
  useRealtime: () => ({
    subscribe: vi.fn((config) => {
      // Simulate subscription
      return () => {}; // Unsubscribe function
    }),
    isConnected: true,
  }),
}));

describe("useRealtimeEntities", () => {
  it("should initialize with initial entities", () => {
    const initialEntities = [
      { id: "ent_1", entity_type: "invoice", canonical_name: "INV-001" },
    ];

    const { result } = renderHook(() =>
      useRealtimeEntities(initialEntities)
    );

    expect(result.current).toEqual(initialEntities);
  });

  it("should call onInsert when new entity is added", async () => {
    const onInsert = vi.fn();
    const initialEntities = [];

    const { result } = renderHook(() =>
      useRealtimeEntities(initialEntities, { onInsert })
    );

    // Simulate INSERT event
    // (This would require more sophisticated mocking of Supabase realtime)
  });
});
```

## Performance Metrics

Target metrics for real-time updates:

- **Latency**: Changes appear within 1 second
- **Debounce**: Dashboard updates max once per second
- **Memory**: No memory leaks over 30 minutes of usage
- **Network**: WebSocket connection stable, reconnects on failure
- **CPU**: No UI lag during real-time updates

## Troubleshooting

### Issue: Status indicator shows "Disconnected"

**Possible causes:**
- Network connection lost
- Supabase Realtime not enabled on database
- Authentication issues

**Solution:**
1. Check network connection
2. Verify Supabase Realtime is enabled: Run migration `20260128095102_enable_realtime.sql`
3. Check browser console for authentication errors

### Issue: Changes don't appear in other tabs

**Possible causes:**
- RLS policies blocking updates
- User ID not matching
- Subscription filter incorrect

**Solution:**
1. Check browser console for subscription errors
2. Verify RLS policies allow SELECT for user's data
3. Verify user_id filter is correct

### Issue: Too many refetches on Dashboard

**Possible causes:**
- Debouncing not working
- Multiple subscriptions triggering simultaneously

**Solution:**
1. Verify debounceMs is set to 1000 in Dashboard subscriptions
2. Check browser network tab for excessive API calls
3. Should see max 1 refetch per second

## Success Criteria

All tests should pass with these results:

- ✅ Real-time updates appear within 1 second
- ✅ Connection status indicator shows accurate state
- ✅ No polling mechanisms remain (except OAuth)
- ✅ RLS ensures user data isolation
- ✅ Dashboard updates with 1s debounce
- ✅ No memory leaks or performance issues
- ✅ Subscriptions clean up properly on unmount
- ✅ Error handling graceful, no crashes

## Next Steps After Testing

1. Monitor real-time performance in production
2. Add metrics for real-time latency
3. Consider adding retry logic for failed subscriptions
4. Add user preferences for enabling/disabling real-time updates
5. Consider adding notification sounds/badges for important updates
