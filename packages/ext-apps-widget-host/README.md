# @neotoma/ext-apps-widget-host

MCP ext-apps widget host. Resolves `widget_uri` values emitted by the [`neotoma_turn_summary`](../../docs/developer/mcp/instructions.md) MCP tool into inline widget descriptors that supporting MCP clients render in the chat interface.

This package covers the **`widget_uri` delivery path** (parameterized `ui://neotoma/turn-summary?…` URIs). For the MCP Apps static resource path (`ui://neotoma/turn-summary`, `text/html;profile=mcp-app`), see [MCP Apps delivery](#mcp-apps-delivery-fu-2026-05-004) below.

## Delivery paths

### `widget_uri` path (this package)

Clients that load `@neotoma/ext-apps-widget-host` parse the parameterized `widget_uri`, fetch authoritative state from the Neotoma API, and receive a normalized descriptor they render in their own UI (React component, HTML fragment, native view).

Clients that do not load this package fall back to the plain-text `status_line` returned alongside `widget_uri` from `neotoma_turn_summary`.

### MCP Apps delivery (FU-2026-05-004)

Tier 1A clients (VS Code ≥ 1.109, Cursor ≥ 2.6, Continue, Claude mobile) that support the MCP Apps protocol receive a static resource URI `ui://neotoma/turn-summary` on the `neotoma_turn_summary` tool definition `_meta.ui.resourceUri`. The client fetches it once as an MCP resource (`text/html;profile=mcp-app`) and renders the returned self-contained HTML in a sandboxed iframe. Per-turn data is delivered via `ui/initialize` and `ui/notifications/tool-result` postMessages — not via URI query params.

Tier 2 clients (Claude Code CLI, Windsurf, Codex Desktop) do not render the MCP Apps widget; `status_line` from the tool result is the user-visible output.

The two paths are independent. This package is not used by the MCP Apps path.

## Usage

```ts
import { resolveTurnSummaryWidget } from "@neotoma/ext-apps-widget-host";

const descriptor = await resolveTurnSummaryWidget(widgetUri, async ({ conversationId }) => {
  // Inject the host's existing Neotoma client.
  return await neotomaClient.fetchLatestTurnSummary(conversationId);
});

if (descriptor.showConsentCard) {
  renderConsentCard(descriptor);
} else {
  renderStatusLine(descriptor.statusLine);
}
```

## Widget descriptor shape

```ts
type TurnSummaryWidgetDescriptor = {
  kind: "turn_summary";
  conversationId: string;
  turn: number;
  stored: number;
  retrieved: number;
  issues: number;
  statusLine: string;        // exact `status_line` returned by neotoma_turn_summary
  showConsentCard: boolean;  // true when issues > 0
};
```

## URI scheme (`widget_uri` path)

```
ui://neotoma/turn-summary?conversation_id={id}&turn={N}&stored={K}&retrieved={L}&issues={J}
```

All parameters are non-negative integers (except `conversation_id`). Authoritative state is fetched from the Neotoma API; URI-embedded counts are a fallback when the fetch fails.
