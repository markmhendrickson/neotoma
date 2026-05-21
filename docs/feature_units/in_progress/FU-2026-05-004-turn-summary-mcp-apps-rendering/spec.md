# Feature Unit: FU-2026-05-004 Turn Summary MCP Apps Rendering

**Status:** Draft
**Priority:** P2 (Medium)
**Risk Level:** Low
**Target Release:** v0.14.0
**Created:** 2026-05-20

---

## Overview

`neotoma_turn_summary` currently returns a `widget_uri` field (`ui://neotoma/turn-summary?...`) in its tool result JSON. No MCP client renders this URI because the tool lacks the `_meta.ui.resourceUri` annotation on its tool definition and the server has no `resources/read` handler for `ui://neotoma/turn-summary` URIs.

The `list_timeline_events` tool already uses the complete MCP Apps pattern: `_meta.ui.resourceUri` on the tool definition, a resource entry in `listResources`, a `text/html;profile=mcp-app` resource served via `readResource`, and inline HTML that receives `ui/initialize` + `ui/notifications/tool-result` postMessages from the client. This FU extends that same pattern to `neotoma_turn_summary`.

**User value:** Clients that support MCP Apps (VS Code v1.109+, Cursor 2.6+, Continue, Claude mobile) will render an inline turn summary card after every turn instead of plain-text JSON. The card shows stored/retrieved/issues counts, a consent card when issues exist, and live-refreshes from the tool result payload. Clients without MCP Apps support continue to receive `status_line` plain text — no regression.

**Defensible differentiation:** Validates cross-platform rendering (VS Code, Cursor, Continue, Claude mobile) and privacy-first design (no PII in HTML content; all data comes from the authenticated tool result payload injected by the client via postMessage).

---

## Goals

1. `neotoma_turn_summary` renders as an inline widget in all Tier 1A MCP Apps clients (VS Code, Cursor, Continue, Claude mobile).
2. Tier 2 clients (Claude Code CLI, Windsurf) continue to receive and display `status_line` plain text — zero regression.
3. The HTML widget is self-contained (no external fetch, no CDN), sandboxable, and works in `color-scheme: light dark` environments.
4. When `issues > 0`, the card displays a consent-prompt section with a link to `neotoma://issues` deep-link (or equivalent).
5. The `widget_uri` field in the tool result JSON is kept for backward compatibility with `@neotoma/ext-apps-widget-host` consumers.

---

## Problems

1. `neotoma_turn_summary` has no `_meta.ui.resourceUri` annotation — MCP clients do not know a widget is available.
2. The server has no `listResources` entry and no `readResource` handler for `ui://neotoma/turn-summary` URIs — clients that resolve `_meta.ui.resourceUri` get a 404.
3. There is no HTML turn summary widget implemented. The timeline widget HTML in `buildTimelineWidgetHtml()` is the only existing example of the pattern.
4. The URI scheme is `ui://neotoma/turn-summary?...` (parameterized, per-turn) while `list_timeline_events` uses a single static URI (`ui://neotoma/timeline_widget`). The turn summary resource URI must be static (tool definitions do not change per call), so the widget must receive per-turn data via the `ui/initialize` postMessage, not via URI query params.

---

## Solutions

### 1. Static resource URI for the tool definition

Define a constant `TURN_SUMMARY_WIDGET_RESOURCE_URI = "ui://neotoma/turn-summary"` (no query params). Add `_meta.ui.resourceUri` to the `neotoma_turn_summary` tool definition pointing at this URI — same pattern as `list_timeline_events`:

```typescript
// src/tool_definitions.ts
{
  name: "neotoma_turn_summary",
  description: desc("neotoma_turn_summary", "..."),
  inputSchema: getOpenApiInputSchemaOrThrow("neotoma_turn_summary"),
  ...(turnSummaryWidgetResourceUri
    ? {
        _meta: {
          ui: { resourceUri: turnSummaryWidgetResourceUri },
        },
      }
    : {}),
}
```

Pass `TURN_SUMMARY_WIDGET_RESOURCE_URI` into `buildToolDefinitions()` as a new optional parameter alongside `timelineWidgetResourceUri`.

### 2. listResources entry

In `setupResourceHandlers()`, add a resource entry alongside the timeline widget:

```typescript
resources.push({
  uri: TURN_SUMMARY_WIDGET_RESOURCE_URI,
  name: "Turn Summary Widget",
  description: "Inline per-turn status card for neotoma_turn_summary results.",
  mimeType: "text/html;profile=mcp-app",
});
```

### 3. URI parser extension

In `parseResourceUri()` (the `ui://` branch at line ~5637 of `server.ts`), add:

```typescript
if (serverName === "neotoma" && resourceName === "turn-summary" && !extraSegment) {
  return { type: "ui_turn_summary_widget" };
}
```

### 4. readResource handler

In `setupResourceHandlers()` read handler, add a case alongside `ui_timeline_widget`:

```typescript
case "ui_turn_summary_widget":
  return {
    contents: [
      {
        uri,
        mimeType: "text/html;profile=mcp-app",
        text: this.buildTurnSummaryWidgetHtml(),
      },
    ],
  };
```

### 5. Turn summary widget HTML

`buildTurnSummaryWidgetHtml()` returns a self-contained HTML document. The widget:

- Listens for `ui/initialize` (initial tool result from the current turn) and `ui/notifications/tool-result` (subsequent refreshes) via `window.addEventListener("message", ...)`.
- Parses the tool result JSON to extract `status_line`, `stored`, `retrieved`, `issues`, `turn_number`, `conversation_message_count`.
- Renders a compact status card: `msg N/M · stored K · retrieved L` with an issues badge when `issues.length > 0`.
- When `issues.length > 0`, renders a consent section: "N issue(s) flagged this turn. Review in Neotoma Inspector." with a non-navigating link styled as a button (MCP Apps sandboxed iframes cannot navigate the parent; the link is informational).
- Uses `color-scheme: light dark`, same CSS reset as `buildTimelineWidgetHtml()`.
- No external network requests. All data comes from the postMessage payload.

### 6. Preserve widget_uri in tool result

`computeTurnSummary` continues to return `widget_uri` (the parameterized `ui://neotoma/turn-summary?...` URI). The field is used by `@neotoma/ext-apps-widget-host` consumers and remains for backward compatibility. The MCP Apps path uses the static `_meta.ui.resourceUri`; these two paths are parallel and complementary.

---

## Affected subsystems

- `src/server.ts` — tool definition list, resource list, resource read handler, new `buildTurnSummaryWidgetHtml()` method
- `src/tool_definitions.ts` — new parameter `turnSummaryWidgetResourceUri`, new `_meta` on `neotoma_turn_summary` definition
- No database changes. No OpenAPI schema changes. No new endpoints.

---

## Schema changes

None.

---

## Invariants

**MUST:**
- Widget HTML MUST be served as `text/html;profile=mcp-app`.
- Widget MUST NOT make external network requests.
- Widget MUST handle missing/malformed tool result payload gracefully (show loading state).
- `status_line` plain-text fallback MUST continue to work for non-MCP-Apps clients.
- `widget_uri` field in tool result JSON MUST be preserved.
- `_meta.ui.resourceUri` value MUST be the static `TURN_SUMMARY_WIDGET_RESOURCE_URI` constant, not a per-call URI.

**MUST NOT:**
- MUST NOT remove or rename `widget_uri` from `TurnSummaryResult`.
- MUST NOT use any CDN, Google Fonts, or external stylesheet in the widget HTML.
- MUST NOT navigate the parent frame from within the widget iframe.
- MUST NOT include PII in the HTML (entity IDs only, no names/emails in the widget structure — display names come from the tool result payload and are already user-owned data).

---

## Harness support matrix (at time of writing)

| Harness | MCP Apps support | Expected behavior after this FU |
|---|---|---|
| VS Code (Copilot Chat) v1.109+ | Yes | Renders turn summary card |
| Cursor 2.6+ | Yes | Renders turn summary card |
| Continue (PR #10132+) | Yes | Renders turn summary card |
| Claude mobile | Yes (partial, known bugs) | Renders turn summary card; may fail on session recovery bug |
| Claude Desktop native | Yes (advertised; handshake bug) | May not render reliably until Anthropic fixes Issue #165 |
| Claude Code CLI | No | status_line plain text only |
| Windsurf | No | status_line plain text only |
| Codex Desktop | No (flag disabled) | status_line plain text only |
| OpenClaw | No (MCP Apps rejected) | status_line plain text only |
| IronClaw | No | status_line plain text only |

---

## Implementation tasks

1. **`src/tool_definitions.ts`**: Add optional `turnSummaryWidgetResourceUri` parameter to `buildToolDefinitions()`; attach `_meta.ui.resourceUri` to `neotoma_turn_summary` definition when parameter is provided.

2. **`src/server.ts` — constant**: Define `TURN_SUMMARY_WIDGET_RESOURCE_URI = "ui://neotoma/turn-summary"`.

3. **`src/server.ts` — `listResources`**: Add turn summary widget resource entry alongside timeline widget entry.

4. **`src/server.ts` — `parseResourceUri()`**: Add `ui_turn_summary_widget` case in the `ui://` branch.

5. **`src/server.ts` — `readResource` handler**: Add `ui_turn_summary_widget` case that calls `buildTurnSummaryWidgetHtml()`.

6. **`src/server.ts` — `buildTurnSummaryWidgetHtml()`**: Implement the self-contained HTML widget.

7. **`src/server.ts` — `listTools` call site**: Pass `TURN_SUMMARY_WIDGET_RESOURCE_URI` as second argument to `buildToolDefinitions()`.

8. **Tests**:
   - Unit: `tests/unit/turn_summary_widget.test.ts` — `buildToolDefinitions()` includes `_meta.ui.resourceUri` on `neotoma_turn_summary` when URI is provided; absent when not provided.
   - Unit: `buildTurnSummaryWidgetHtml()` returns a string containing `text/html`, `ui/initialize`, `ui/notifications/tool-result`, and the status rendering logic.
   - Integration: `tests/integration/turn_summary_mcp_apps.test.ts` — `listResources` includes the turn summary widget URI; `readResource("ui://neotoma/turn-summary")` returns `mimeType: "text/html;profile=mcp-app"`.

9. **Test catalog regeneration**: `npm run generate:test-catalog` after adding test files.

---

## QA needs

- Smoke test in Cursor 2.6+: call `neotoma_turn_summary` with a valid conversation_id + turn_key; verify card renders inline (not as JSON text).
- Smoke test with `issues > 0`: verify consent section appears in the card.
- Smoke test in Claude Code CLI: verify `status_line` text appears in response; verify no widget rendering artifacts.
- Regression: existing `list_timeline_events` widget unaffected.

---

## Documentation update needs

- `docs/developer/mcp/instructions.md`: update the display rules section to note that ext-apps clients receive an inline widget for `neotoma_turn_summary` (agents can shorten the inline status_line mention for those clients if the widget is visible).
- `packages/ext-apps-widget-host/README.md`: note the MCP Apps static resource path alongside the parameterized `widget_uri` approach.
