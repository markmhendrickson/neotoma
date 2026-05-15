# Conversational UX Architecture — MCP-First Design Decision

## Decision

**Neotoma MUST NOT embed its own chat UI or conversational interfaces.**

Neotoma is a deterministic State Layer. All conversational interactions are externalized to MCP-compatible agents (ChatGPT, Cursor, Claude). The `frontend/src/components/ChatPanel.tsx` embedded chat UI violates this boundary and is scheduled for removal.

See the canonical version of this document in the main Neotoma branch at `docs/architecture/conversational_ux_architecture.md` for full architectural rationale.

## Deprecation Record (this branch)

The `feat/visualization-e2e-hardening` branch added visualization features on top of the deprecated ChatPanel surface. This cleanup PR records what was done:

### Removed from `/chat` handler (`src/actions.ts`)

- `suggest_visualization` LLM function-calling tool (schema, function object, handler branch, response field).
- Visualization guidance text from the system prompt.
- `normalizeVisualizationSuggestion` helper function and `VisualizationSuggestionSchema`.
- `visualization` field from both `/chat` response shapes.

The `/chat` endpoint itself is not removed — it serves the deprecated ChatPanel. It now only exposes `retrieve_records` as a function-calling tool.

### Deprecated (marked, not deleted)

- `frontend/src/components/ChatPanel.tsx` — `@deprecated` JSDoc + `console.warn` on mount.
- `frontend/src/components/GraphPanel.tsx` — `@deprecated` JSDoc + `console.warn` on mount.
- `frontend/src/store/visualizations.ts` — `@deprecated` JSDoc.

### Preserved for potential reuse

- `frontend/src/utils/canVisualize.ts` — Pure field-type to chart-type validation with no UI or chat dependencies. Preserved with a note pointing to potential reuse in a future MCP-native visualization path (e.g., an MCP tool that validates a suggested chart before returning it to an external agent).

### Deleted

- `playwright/tests/chat-panel.spec.ts` — E2E tests for the deprecated ChatPanel/visualization flow. Testing a surface being removed has no value.

## Migration Path

1. Remove `ChatPanel` and its imports from `frontend/src/App.tsx`.
2. Remove `GraphPanel`, `visualizations` store, and `types/visualization.ts`.
3. Remove the `/chat` endpoint from `src/actions.ts` entirely.
4. Update `docs/ui-playwright-coverage.md` to remove chat coverage entries.
5. Evaluate `canVisualize.ts` for reuse in a future MCP tool.
