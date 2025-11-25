# Playwright Test Coverage

This document describes the Playwright end-to-end test coverage for the Neotoma UI. All tests use the coverage map defined in `playwright/tests/coverage-map.json` to ensure comprehensive testing of UI components and user interactions.

## Test Files

### 1. records-lifecycle.spec.ts

**Description**: Records table end-to-end CRUD, filtering, uploads, quota surfaces, and empty states.

**Components Covered**:
- RecordsTable
- RecordDetailsPanel
- EmptyPlaceholder
- useDatastore
- useStorageQuota

**Test States**:
- Empty datastore rendering
- Seeded records (multiple types)
- Drag-and-drop upload
- Manual upload button
- Multi-select delete
- Quota threshold > 90%
- Empty state button interactions (upload, connect app)
- Learn more sections expand/collapse
- Filtered empty state (no matches)

**Key Features Tested**:
- Record filtering by search query and type
- Record selection and bulk deletion
- File upload via button
- Empty state interactions
- Storage quota display and warnings

### 2. record-details.spec.ts

**Description**: Record details side panel interactions and file affordances.

**Components Covered**:
- RecordDetailsPanel
- RecordsTable

**Test States**:
- Panel opened via table row click
- Status badge transitions
- File links (local + remote)
- Panel dismissal persistence

**Key Features Tested**:
- Opening record details by clicking table rows
- Viewing record metadata and files
- Panel state persistence

### 3. chat-panel.spec.ts

**Description**: Chat message persistence, uploads, error handling, and inline record references.

**Components Covered**:
- ChatPanel
- useKeys
- useSettings
- useDatastore

**Test States**:
- Intro message seed
- Encrypted history (keys ready)
- File upload success
- File upload failure + retry
- Recent records sidebar
- Upload network failures
- Upload server errors
- Error message formatting
- Multiple concurrent upload failures

**Key Features Tested**:
- Chat message sending via mock API
- Chat history persistence (encrypted)
- File upload in chat panel
- Upload failure scenarios (network, server errors)
- Retry mechanisms for failed uploads
- Error message display
- Concurrent upload handling

### 4. settings-keys.spec.ts

**Description**: Floating settings button, key management dialog, import/export flows, and Supabase toggles.

**Components Covered**:
- FloatingSettingsButton
- KeyManagementDialog
- useSettings
- useKeys

**Test States**:
- Generate keys
- Export keys
- Import keys
- Cloud toggle on/off
- Bearer token validation
- Invalid key import handling
- Key management persistence

**Key Features Tested**:
- Opening settings dialog
- Toggling cloud storage
- Key regeneration with confirmation
- Key export to file
- Key import from file
- Invalid key handling
- Bearer token validation
- Settings persistence across reloads

### 5. storage-schema.spec.ts

**Description**: Seed helpers, schema migrations, worker health, and quota banners.

**Components Covered**:
- store
- worker
- useStorageQuota
- seedLocalRecords utilities

**Test States**:
- First-run schema init
- Seeded records via helper
- Quota usage < 50%
- Quota usage > 90%
- Background sync in-progress

**Key Features Tested**:
- Database schema initialization
- Seeding sample records
- Storage quota calculation and display
- Background sync operations

### 6. records-table-columns.spec.ts

**Description**: Column management - visibility toggles, drag-and-drop reordering, resizing, sorting, and localStorage persistence.

**Components Covered**:
- RecordsTable
- ColumnHeader
- DropdownMenu

**Test States**:
- Column visibility toggle via dropdown
- Column reordering via drag-and-drop
- Column resizing via resize handles
- Column sorting via sort buttons
- Persistence across page reloads
- Column state with filtering

**Key Features Tested**:
- Toggling column visibility via Columns dropdown
- Drag-and-drop column reordering
- Column resizing with mouse drag
- Column sorting (ascending/descending)
- Persistence of column state in localStorage
- Column state maintenance during filtering

### 7. error-handling.spec.ts

**Description**: Error handling for uploads, quota exceeded, decryption failures, and datastore initialization.

**Components Covered**:
- RecordsTable
- useDatastore
- useStorageQuota
- useKeys

**Test States**:
- File upload network failure
- File upload server error (500)
- Quota exceeded warning
- Decryption error toast
- Datastore initialization failure
- Error message differentiation
- Transient error recovery
- Error state persistence

**Key Features Tested**:
- Network failure handling during upload
- Server error handling (5xx responses)
- Quota exceeded warnings and display
- Decryption error messages
- Graceful datastore initialization failure
- Different error message types
- Retry mechanisms for transient errors
- Error state persistence across reloads

### 8. header.spec.ts

**Description**: Header component with branding and key display.

**Components Covered**:
- Header
- useKeys

**Test States**:
- Title and branding display
- Masked private key display
- Loading state (key hidden)
- Key loaded state

**Key Features Tested**:
- Neotoma title rendering
- Header positioning and styling
- Masked private key format
- Key visibility during/after loading

### 9. json-viewer.spec.ts

**Description**: JSON viewer with expand/collapse functionality for record properties.

**Components Covered**:
- JsonViewer

**Test States**:
- Primitive values display (strings, numbers, booleans)
- Object expand/collapse
- Array display with indices
- Null/undefined handling

**Key Features Tested**:
- Primitive value formatting
- Nested object expansion/collapse
- Array rendering with index labels
- Graceful null/undefined display

### 10. floating-settings-button.spec.ts

**Description**: Floating action button for settings access with positioning and visibility.

**Components Covered**:
- FloatingSettingsButton
- KeyManagementDialog

**Test States**:
- Button visibility and positioning
- Opens settings dialog
- Loading state (button hidden)
- Loaded state (button visible)

**Key Features Tested**:
- Bottom-right positioning
- Circular button styling with shadow
- Settings dialog opening
- Visibility during loading states

### 11. integration.spec.ts

**Description**: End-to-end integration tests and edge cases across all features.

**Components Covered**:
- RecordsTable
- RecordDetailsPanel
- ChatPanel
- FloatingSettingsButton
- useDatastore
- useKeys
- useSettings

**Test States**:
- Complete record lifecycle (upload to delete)
- Key rotation scenarios
- Offline/online transitions
- Rapid successive operations
- Storage near capacity handling

**Key Features Tested**:
- Full CRUD lifecycle
- Key regeneration with existing records
- Offline functionality and online recovery
- Concurrent operations and race condition handling
- Graceful degradation near storage limits

## Test Helpers

The following helper functions are available in `playwright/tests/helpers.ts`:

### Core Helpers
- `clearClientState(page, origin)` - Clears localStorage, sessionStorage, and IndexedDB
- `primeLocalSettings(page, overrides)` - Sets up initial localStorage settings
- `seedSampleRecordsInApp(page, options)` - Seeds sample records via window function
- `readLocalStorageValue(page, key)` - Reads a value from localStorage
- `uploadFileFromRecordsTable(page, filePath)` - Uploads a file via records table
- `getToastMessages(page)` - Gets all visible toast messages
- `waitForRecordsToRender(page)` - Waits for records to appear in table
- `attachBrowserLogging(page)` - Attaches console/error logging
- `routeChatThroughMock(page, mockApiOrigin)` - Routes chat API through mock server

### Column Management Helpers
- `toggleColumnVisibility(page, columnId)` - Toggles column visibility via dropdown
- `reorderColumn(page, sourceColumnId, targetColumnId)` - Reorders columns via drag-and-drop
- `resizeColumn(page, columnId, deltaX)` - Resizes column by dragging resize handle

### Error Simulation Helpers
- `simulateUploadFailure(page, errorType)` - Simulates upload failures (timeout, network, server)
- `setQuotaExceeded(page, exceeded)` - Simulates quota exceeded state
- `simulateError(page, errorType)` - Simulates various error types (decryption, datastore, sync)

### Integration & Advanced Helpers
- `simulateOffline(page, offline)` - Toggles offline/online state
- `fillStorageQuota(page, percentage)` - Mocks storage quota to specific percentage
- `createDragEvent(page, filePath)` - Creates DataTransfer for drag-and-drop tests
- `waitForSync(page, timeout)` - Waits for background sync indicators
- `getStatusBadgeText(page, recordId)` - Gets status badge text for a record

## Coverage Enforcement

### Pre-commit Hooks

The project uses Husky to enforce test coverage checks before commits:

1. **Coverage Map Validation** (`npm run validate:coverage`)
   - Verifies coverage-map.json structure
   - Ensures all spec files are referenced
   - Checks test.describe names match coverage map keys

2. **Playwright Coverage Check** (`npm run check:pw-coverage`)
   - Detects UI file changes
   - Requires corresponding test updates
   - Exempts CSS-only and documentation changes

### Manual Commands

Run these commands manually to check coverage:

```bash
# Validate coverage map
npm run validate:coverage

# Check Playwright coverage for changes
npm run check:pw-coverage

# Run all Playwright tests
npm run test:e2e
```

## Coverage Map

The coverage map (`playwright/tests/coverage-map.json`) defines:

- **Description**: What the test file covers
- **Components**: UI components and hooks tested
- **States**: Specific UI states and interactions covered
- **specFile**: The test file name

All test files must be registered in the coverage map and follow the naming convention: `{key} coverage` for test.describe blocks.

## Adding New Tests

When adding new UI features or modifying existing ones:

1. **Add/Update Test File**: Create or modify the appropriate spec file
2. **Update Coverage Map**: Add or update the entry in `playwright/tests/coverage-map.json`
3. **Add data-testid Attributes**: Add data-testid attributes to new UI elements for easier testing
4. **Run Validation**: Run `npm run validate:coverage` to ensure coverage map is valid
5. **Commit**: The pre-commit hook will automatically run coverage checks

## Test Data

Sample test data and fixtures are located in:
- `playwright/tests/fixtures/` - Test files for upload testing
- `seedSampleRecordsInApp()` helper - Generates sample records in-app

## Best Practices

1. **Use data-testid attributes**: Prefer data-testid over CSS selectors for stability
2. **Test user flows**: Focus on realistic user interactions, not implementation details
3. **Handle async operations**: Use proper waitFor patterns and timeouts
4. **Clean up state**: Each test should start with a clean state via `clearClientState()`
5. **Test error states**: Include tests for error handling and edge cases
6. **Document test intent**: Use descriptive test names and comments
7. **Maintain coverage map**: Keep coverage-map.json up-to-date with all changes

## Running Tests

### Local Development

```bash
# Run all tests
npm run test:e2e

# Run specific test file
npx playwright test records-lifecycle.spec.ts

# Run tests in headed mode
npx playwright test --headed

# Run tests in debug mode
npx playwright test --debug

# View test report
npx playwright show-report
```

### CI/CD

Tests run automatically on pull requests via the configured CI workflow. Failed tests block merges.

## Coverage Status

As of the latest update:

- ✅ Records lifecycle (CRUD, filtering, empty states, drag-and-drop)
- ✅ Record details panel (status transitions, file links, persistence, multiple types)
- ✅ Chat panel (with error handling)
- ✅ Settings and key management (with import/export)
- ✅ Storage and schema (initialization, quota thresholds, sync)
- ✅ Column management (visibility, reordering, resizing, sorting)
- ✅ Error handling (uploads, quota, decryption, datastore)
- ✅ Header component (branding, key display, loading states)
- ✅ JSON viewer (primitives, expand/collapse, arrays, null handling)
- ✅ Floating settings button (positioning, visibility, dialog)
- ✅ Integration tests (end-to-end flows, edge cases)

**Coverage Metrics:**
- Total test files: 11
- Total test cases: 65
- Functional coverage: 100%
- State coverage: 100%
- Component coverage: 100%
- Coverage enforcement: Active via pre-commit hooks

