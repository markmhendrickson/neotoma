# Invalid Connection ID Handling

## Purpose

Ensures users see a reconnection option when their configured X-Connection-Id is invalid or expired, instead of just showing "No tools, prompts, or resources".

## Problem

When a user has an invalid or expired X-Connection-Id in their Cursor MCP configuration:

1. The MCP server initialization would catch the "connection not found" error
2. Return an unauthenticated response (with Connect button capabilities)
3. However, `listTools()` and `listResources()` would silently fail and return empty arrays
4. Cursor would show "No tools, prompts, or resources" with green status
5. User would not know they need to reconnect

## Solution

### Changes Made

#### 1. Enhanced Error Detection in Initialize Handler

**File:** `src/server.ts`

**Initialize handler:**
- Added explicit detection of "connection not found" errors
- When invalid connection ID is detected during initialization, **throws `McpError`** to prevent successful connection
- This causes Cursor to show an error state, allowing user to fix configuration
- Clear error message instructs user to remove invalid X-Connection-Id from mcp.json

**`listTools()` and `listResources()` handlers:**
- Enhanced error detection and logging for invalid connection IDs
- Do NOT throw errors (to avoid "Error - Show Output" state)
- Rely on initialize handler to prevent connection with invalid credentials

**Code pattern (initialize handler):**
```typescript
} catch (error: any) {
  const isConnectionNotFound =
    error.message?.includes("Connection not found") ||
    error.message?.includes("connection_id") ||
    error.code === "OAUTH_CONNECTION_NOT_FOUND";

  if (isConnectionNotFound) {
    logger.error(
      `[MCP Server] Invalid or expired X-Connection-Id: ${connectionId}. Throwing error to prevent initialization and trigger reconnection.`
    );
    // Throw the error to prevent successful initialization
    // This will cause Cursor to show error state and allow reconnection
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Invalid or expired connection ID. Please remove the X-Connection-Id header from your mcp.json and click Connect to authenticate.",
      { reason: "connection_expired", connectionId }
    );
  }
  // For other auth failures, return unauthenticated response
  return this.getUnauthenticatedResponse();
}
```

#### 2. Improved Error Messages and Logging

**File:** `src/server.ts`

**All handlers:**
- Added specific detection of connection not found errors
- Logs clear messages distinguishing invalid connections from other auth failures
- Initialize handler throws error to prevent connection
- listTools/listResources log but don't throw (to avoid double error states)

#### 3. Updated Unauthenticated Messages

**File:** `docs/developer/mcp/unauthenticated.md`

**Before:**
- "Authentication needed. Use the Connect button to sign in."

**After:**
- "Authentication needed or expired. Use the Connect button to sign in."
- Longer description mentions expired X-Connection-Id specifically

## User Experience Flow

### Before Changes

1. User has invalid X-Connection-Id in mcp.json
2. Cursor shows "neotoma" with green status
3. Shows "No tools, prompts, or resources"
4. No indication of what's wrong or how to fix

### After Changes

1. User has invalid X-Connection-Id in mcp.json
2. Initialize detects invalid connection and throws `McpError`
3. Cursor shows error state: "Invalid or expired connection ID. Please remove the X-Connection-Id header from your mcp.json and click Connect to authenticate."
4. User removes invalid X-Connection-Id from `.cursor/mcp.json`
5. User restarts Cursor or waits for auto-reconnection
6. Cursor shows Connect button
7. User clicks Connect to complete OAuth flow and get new valid connection ID

## Testing

### Manual Test

1. Configure invalid X-Connection-Id in `.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "neotoma": {
         "url": "http://localhost:8080/mcp",
         "headers": {
           "X-Connection-Id": "invalid-connection-id-12345"
         }
       }
     }
   }
   ```

2. Restart Cursor
3. Check MCP server status - should show error with Connect button
4. Click Connect to re-authenticate
5. Should complete OAuth flow and get new valid connection ID

### Expected Behavior

- Invalid connection ID triggers initialization failure
- Cursor shows error state with clear message instructing user to remove X-Connection-Id
- User manually removes invalid header from `.cursor/mcp.json`
- After removal and Cursor restart, Connect button appears
- User completes OAuth flow to get new valid connection ID
- Tools/resources appear normally after successful authentication

## Error Codes

The solution detects connection not found errors by checking:

1. Error message contains "Connection not found"
2. Error message contains "connection_id"
3. Error code is "OAUTH_CONNECTION_NOT_FOUND"

This matches the errors thrown by `getAccessTokenForConnection()` in `src/services/mcp_oauth.ts`.

## Related Files

- `src/server.ts` - Main MCP server implementation
- `src/services/mcp_oauth.ts` - OAuth connection management
- `docs/developer/mcp/unauthenticated.md` - Unauthenticated state messages
- `.cursor/mcp.json` - User's MCP configuration

## How to Fix Invalid Connection ID

When you see the error "Invalid or expired connection ID" in Cursor:

1. **Open your MCP configuration:**
   - Location: `~/.cursor/mcp.json` (or `.cursor/mcp.json` in your workspace)

2. **Remove or comment out the invalid X-Connection-Id:**
   ```json
   {
     "mcpServers": {
       "neotoma": {
         "url": "http://localhost:8080/mcp",
         "headers": {
           // "X-Connection-Id": "invalid-id-here"  // Remove this line
         }
       }
     }
   }
   ```

3. **Restart Cursor** or wait for it to auto-reconnect

4. **Click the Connect button** when it appears

5. **Complete the OAuth flow** to get a new valid connection ID

The new connection ID will be automatically saved and you won't need to manually configure it.

## Related Issues

This fixes the issue where users with expired connection IDs would see "No tools, prompts, or resources" with no clear indication of what was wrong or how to fix it.
