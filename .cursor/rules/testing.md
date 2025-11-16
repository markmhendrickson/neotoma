# Testing Rule

## Automatic Browser Testing for User-Facing Changes

Whenever you make changes to user-facing code (frontend components, hooks, UI logic), you MUST automatically test the changes in a browser to verify they work correctly.

## When to Test

Test automatically when modifying:
- `frontend/src/components/**` - Any React components
- `frontend/src/hooks/**` - Custom React hooks
- `frontend/src/store/**` - Datastore and state management
- `frontend/src/worker/**` - WebWorker code
- `frontend/src/bridge/**` - Bridge/communication code
- `frontend/src/utils/**` - Utility functions used by UI
- `frontend/src/App.tsx` - Main app component
- `frontend/index.html` - HTML structure
- `vite.config.ts` - Build configuration affecting UI

## Testing Process

1. **Check if dev server is running:**
   - Use branch-based port from `scripts/get-branch-ports.js`
   - Check if server responds at `http://localhost:{PORT}/health` or similar
   - If not running, start it: `npm run dev:ui` (in background)

2. **Open browser and navigate:**
   - Use browser MCP tools to navigate to `http://localhost:{PORT}`
   - Wait for page to fully load (check for ready state)

3. **Test relevant functionality:**
   - **For key management changes:** Test key generation, display, export, import, regeneration
   - **For datastore changes:** Test record loading, querying, searching
   - **For component changes:** Test component rendering, interactions, dialogs
   - **For hook changes:** Test hook behavior, state updates, side effects
   - **For worker changes:** Test worker initialization, RPC calls, error handling

4. **Check for errors:**
   - Check browser console for errors, warnings, or issues
   - Look for React errors, module loading errors, runtime errors
   - Verify no infinite loops or performance issues
   - Check network requests for API errors (4xx/5xx)
   - Check backend server logs for errors

5. **Debug and fix frontend issues:**
   - If errors found, analyze stack traces
   - Fix import paths, component logic, hook dependencies
   - Re-test after fixes
   - Continue until all issues resolved

6. **Debug and fix backend issues:**
   - If API requests fail (4xx/5xx errors), check backend server logs
   - Verify backend server is running on expected port (from branch-based port config)
   - Check backend health endpoint: `http://localhost:{HTTP_PORT}/health`
   - If backend not running, start it: `npm run dev:http` (in background)
   - For 500 errors, check:
     - Database connection (Supabase configuration)
     - Environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY)
     - File upload configuration (multer, storage buckets)
     - Authentication/authorization (bearer token validation)
   - For 404 errors, verify:
     - API endpoint path matches backend routes
     - Vite proxy configuration is correct
     - API base URL includes `/api` prefix if needed
   - For 401/403 errors, verify:
     - Bearer token is correctly set and passed
     - Public key registry is working
     - Encryption service is initialized
   - Fix backend issues and re-test
   - Continue until all issues resolved

7. **Verify functionality:**
   - Confirm the specific feature/change works as expected
   - Test both happy path and error scenarios
   - Ensure no regressions in related functionality
   - Verify frontend and backend integration works end-to-end

## Implementation

### Server Management
- **Get ports**: `node scripts/get-branch-ports.js` or use `VITE_PORT`/`HTTP_PORT` env vars
- **Start frontend**: `npm run dev:ui` (in background if not running)
- **Start backend**: `npm run dev:http` (in background if not running)
- **Check health**: `http://localhost:{HTTP_PORT}/health` for backend
- **Wait for readiness**: Retry health checks with exponential backoff (up to 10 seconds)

### Browser Automation Tools
Use browser MCP extension tools:
- `browser_navigate` - Navigate to frontend URL
- `browser_snapshot` - Capture page state
- `browser_click` - Click elements
- `browser_type` - Type into inputs
- `browser_console_messages` - Check console errors
- `browser_network_requests` - Check API calls
- Take screenshots if errors occur for debugging

### Testing Approach
- **Determine what changed**: Analyze modified files to identify affected functionality
- **Test adaptively**: Focus on actual changes, not a fixed checklist
- **Test end-to-end**: Verify frontend-backend integration works

## Error Handling

- If dev server fails to start, report error and suggest manual start
- If backend server fails to start, check port conflicts and environment variables
- If browser automation fails, try alternative methods or report limitation
- Always provide clear error messages and fix suggestions
- Clean up any background processes after testing
- For backend errors, check server logs and database connectivity before reporting

### Common Error Patterns
- **404 errors**: Check API paths, Vite proxy config, `/api` prefix
- **401/403 errors**: Check bearer token, public key registry, encryption service
- **500 errors**: Check database connection, env vars, file upload config
- **Frontend errors**: Check browser console, React DevTools, module loading
- **Backend errors**: Check server logs, network requests, health endpoint

## Reporting

After testing, report:
- What was tested
- Test results (pass/fail)
- Any issues found and how they were fixed (frontend and backend)
- Confirmation that functionality works correctly
- Note any backend issues that were resolved

This ensures user-facing changes are verified before being considered complete, including proper frontend-backend integration.

