# Manual Regression Checklist

## Purpose

This checklist documents the product areas that still require manual verification after the automated suites pass. Use it for pre-release checks, risky refactors, and any change that touches auth, storage, routing, or deployment behavior.

## How to use

1. Run the automated lanes first.
2. Use the sections below only for the areas affected by your change.
3. Record anything surprising before release or merge.

## Automated lanes to run first

- `npm test`
- `npm run test:frontend`
- `npm run validate:routes`
- `npm run build:ui`
- `npm run validate:locales`
- `npm run build:site:pages`
- `npm run validate:site-export`
- `npm run test:remote:critical` when remote-dependent behavior changed

## Authentication and OAuth

### Automated coverage

- Local auth/session shim tests cover frontend auth state transitions.
- OAuth and auth service tests cover many backend validation paths.
- Tunnel auth tests cover host classification and bearer enforcement rules.

### Manual verification

- Sign in from the real UI and confirm the app transitions from guest to authenticated state.
- Sign out and confirm the app returns to a usable guest session.
- If OAuth settings changed, run the real provider flow end to end and verify callback handling.
- Verify cross-tab behavior if session handling changed.

### Retest when

- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/lib/auth.ts`
- `src/services/__tests__/mcp_oauth.test.ts`
- `src/actions.ts`
- `src/server.ts`

## Remote MCP, store, schema, and resource flows

### Automated coverage

- Default Vitest covers local SQLite and many integration paths.
- `npm run test:remote:critical` covers the highest-value remote-only MCP/resource/store/schema suites.

### Manual verification

- Store a structured payload through the real client path and confirm the created entities appear in UI and retrieval.
- Upload an unstructured file and verify source creation, deduplication, and interpretation behavior.
- Exercise at least one schema update or recommendation flow if schema logic changed.
- Verify resource reads from a live environment if URI/resource handling changed.

### Retest when

- `tests/integration/mcp_*`
- `src/server.ts`
- `src/actions.ts`
- `src/services/observation_ingestion.ts`
- `src/services/schema_*`

## Backup, restore, and recovery

### Automated coverage

- CLI smoke and command tests cover some infra and backup-related command surfaces.

### Manual verification

- Run the real backup flow and confirm artifacts are created where expected.
- Restore from a known-good backup and verify the app starts cleanly with recovered data.
- Confirm key-dependent or encrypted data remains readable after restore if that area changed.

### Retest when

- `src/cli/`
- storage, backup, or key-management logic changes

## Frontend stateful behavior

### Automated coverage

- Frontend unit tests now cover idempotency, local auth, realtime provider state, realtime entity/timeline hooks, and WebSocket bridge behavior.
- Route parity and static export validations cover public site routing and exported HTML.

### Manual verification

- Navigate the main UI flows that depend on shared state and confirm lists update correctly after create/update/delete operations.
- Verify bridge-backed flows in a real browser when changing WebSocket, settings, or auth wiring.
- Check error and reconnect behavior for realtime or bridge failures if those code paths changed.

### Retest when

- `frontend/src/hooks/`
- `frontend/src/contexts/`
- `frontend/src/bridge/`
- `frontend/src/lib/`

## Static site and deploy verification

### Automated coverage

- `validate:routes`, `validate:locales`, `build:site:pages`, and `validate:site-export`
- GitHub Actions site and CI test lane workflows

### Manual verification

- Open the built or deployed homepage and at least one nested docs/marketing route.
- Verify title, description, canonical tags, and visible content for any changed page.
- Confirm 404 behavior and one locale-prefixed route when routing or SEO metadata changed.

### Retest when

- `frontend/src/components/MainApp.tsx`
- `frontend/src/site/`
- `scripts/build_github_pages_site.tsx`
- `.github/workflows/`

## Security and transport edges

### Automated coverage

- Middleware tests cover encrypted response wrapping and failure fallback.
- WebSocket bridge tests cover request/response handling, timeouts, and response decryption.

### Manual verification

- Exercise one real encrypted or bearer-protected path if request/response transport changed.
- Confirm the bridge starts, connects, and handles one real request in the browser if WebSocket transport changed.

### Retest when

- `src/middleware/encrypt_response.ts`
- `src/mcp_ws_bridge.ts`
- `frontend/src/bridge/websocket.ts`
