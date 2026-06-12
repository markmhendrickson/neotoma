/**
 * @neotoma/ext-apps-widget-host
 *
 * MCP ext-apps widget host. Resolves `ui://neotoma/turn-summary?...` resource
 * URIs emitted by `neotoma_turn_summary` (FU-2026-05-002) into inline widget
 * descriptors that supporting MCP clients render in the chat interface.
 *
 * This package is host-agnostic: it parses the URI, fetches authoritative
 * state from the Neotoma API, and returns a normalized widget descriptor.
 * MCP clients adapt the descriptor to their UI (React component, HTML
 * fragment, native view, etc.).
 *
 * Clients that do not load this package fall back to the plain-text
 * `status_line` returned alongside `widget_uri` from `neotoma_turn_summary`.
 */

export const WIDGET_URI_SCHEME = "ui://neotoma/turn-summary";

export type TurnSummaryWidgetParams = {
  conversationId: string;
  turn: number;
  stored: number;
  retrieved: number;
  issues: number;
};

export type TurnSummaryWidgetDescriptor = {
  kind: "turn_summary";
  conversationId: string;
  turn: number;
  stored: number;
  retrieved: number;
  issues: number;
  /** Plain-text status line for fallback rendering. */
  statusLine: string;
  /** True when a consent card should be rendered inline. */
  showConsentCard: boolean;
};

export class WidgetUriError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Parse a `ui://neotoma/turn-summary?...` URI into typed parameters.
 *
 * Throws WidgetUriError when the URI is not the expected scheme/path or when
 * required parameters are missing or malformed.
 */
export function parseTurnSummaryUri(uri: string): TurnSummaryWidgetParams {
  if (!uri.startsWith(WIDGET_URI_SCHEME)) {
    throw new WidgetUriError(
      "ERR_WIDGET_URI_SCHEME",
      `URI is not a turn-summary widget URI: ${uri}`
    );
  }
  const queryIndex = uri.indexOf("?");
  const query = queryIndex >= 0 ? uri.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  const conversationId = params.get("conversation_id");
  if (!conversationId) {
    throw new WidgetUriError(
      "ERR_WIDGET_URI_MISSING_FIELD",
      "conversation_id is required in widget URI"
    );
  }
  const parseInt = (key: string): number => {
    const raw = params.get(key);
    if (raw === null) {
      throw new WidgetUriError("ERR_WIDGET_URI_MISSING_FIELD", `${key} is required in widget URI`);
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new WidgetUriError(
        "ERR_WIDGET_URI_BAD_VALUE",
        `${key} must be a non-negative integer (got "${raw}")`
      );
    }
    return n;
  };
  return {
    conversationId,
    turn: parseInt("turn"),
    stored: parseInt("stored"),
    retrieved: parseInt("retrieved"),
    issues: parseInt("issues"),
  };
}

/**
 * Build the plain-text status line that matches what `neotoma_turn_summary`
 * returns as `status_line`. Available for client-side fallback rendering when
 * authoritative state has not yet loaded.
 */
export function buildStatusLine(params: TurnSummaryWidgetParams, totalMessages: number): string {
  const base = `msg ${params.turn}/${totalMessages}, stored ${params.stored}, retrieved ${params.retrieved}`;
  return params.issues > 0 ? `${base}, issues ${params.issues}` : base;
}

/**
 * Resolve a widget URI into a renderable descriptor. The widget host fetches
 * the latest authoritative turn summary from the Neotoma API so the displayed
 * state stays accurate if the agent's snapshot drifted (e.g. an issue was
 * resolved between emission and render).
 *
 * Callers supply a `fetchTurnSummary` callback so this package stays free of
 * a hardcoded API client; the consuming host injects the Neotoma client it
 * already uses.
 */
export async function resolveTurnSummaryWidget(
  uri: string,
  fetchTurnSummary: (params: { conversationId: string; turnKey?: string }) => Promise<{
    status_line: string;
    turn_number: number;
    conversation_message_count: number;
    stored: unknown[];
    retrieved: unknown[];
    issues: unknown[];
  }>
): Promise<TurnSummaryWidgetDescriptor> {
  const params = parseTurnSummaryUri(uri);
  let authoritative: Awaited<ReturnType<typeof fetchTurnSummary>> | null = null;
  try {
    authoritative = await fetchTurnSummary({ conversationId: params.conversationId });
  } catch {
    // Fall back to URI-embedded counts when the API fetch fails. The descriptor
    // still renders; counts may be slightly stale.
  }
  const stored = authoritative?.stored.length ?? params.stored;
  const retrieved = authoritative?.retrieved.length ?? params.retrieved;
  const issues = authoritative?.issues.length ?? params.issues;
  const turn = authoritative?.turn_number ?? params.turn;
  const total = authoritative?.conversation_message_count ?? turn;
  const statusLine =
    authoritative?.status_line ??
    buildStatusLine({ ...params, turn, stored, retrieved, issues }, total);
  return {
    kind: "turn_summary",
    conversationId: params.conversationId,
    turn,
    stored,
    retrieved,
    issues,
    statusLine,
    showConsentCard: issues > 0,
  };
}
