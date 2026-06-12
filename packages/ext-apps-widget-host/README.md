# @neotoma/ext-apps-widget-host

MCP ext-apps widget host. Resolves `ui://neotoma/turn-summary?...` resource URIs emitted by the [`neotoma_turn_summary`](../../docs/developer/mcp/instructions.md) MCP tool (FU-2026-05-002) into inline widget descriptors that supporting MCP clients render in the chat interface.

This package is host-agnostic. It parses the URI, fetches authoritative state from the Neotoma API, and returns a normalized descriptor. MCP clients adapt the descriptor to their UI (React component, HTML fragment, native view, etc.).

Clients that do not load this package fall back to the plain-text `status_line` returned alongside `widget_uri` from `neotoma_turn_summary`.

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

## URI scheme

```
ui://neotoma/turn-summary?conversation_id={id}&turn={N}&stored={K}&retrieved={L}&issues={J}
```

All parameters are non-negative integers (except `conversation_id`). Authoritative state is fetched from the Neotoma API; URI-embedded counts are a fallback when the fetch fails.
