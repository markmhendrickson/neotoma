/**
 * Client-supplied conversation-turn identity (write events, #2508 lane 6).
 *
 * A harness that knows which conversation turn caused a request can say so,
 * and the server stamps that identity onto every write the request makes.
 * This lets an activity view or a server-rendered turn summary answer "what
 * did this turn write" from the server's own record instead of from what the
 * model chose to report.
 *
 * Two carriers, one shape:
 *
 * - HTTP headers `X-Neotoma-Conversation-Id` / `X-Neotoma-Turn-Key`, read by
 *   the attribution middleware for every REST route and the `/mcp` route.
 * - MCP request `params._meta` keys `io.neotoma/conversation_id` /
 *   `io.neotoma/turn_key`. The 2026-07-28 stateless protocol carries all
 *   per-request client state in `_meta`, so this is the carrier that needs no
 *   session; legacy-session clients can send it too.
 *
 * When both are present on an MCP tool call, `_meta` wins: it is scoped to the
 * one call, while a header may be a static per-connection setting.
 *
 * The values are self-reported and unverified, exactly like `clientInfo`.
 * They are identifiers, never content: anything that is not a short token is
 * dropped rather than stored, so a client cannot smuggle message text into the
 * write record through this channel.
 */

export const TURN_HEADER_CONVERSATION_ID = "x-neotoma-conversation-id";
export const TURN_HEADER_TURN_KEY = "x-neotoma-turn-key";

export const MCP_META_CONVERSATION_ID = "io.neotoma/conversation_id";
export const MCP_META_TURN_KEY = "io.neotoma/turn_key";

/** Upper bound on a stored identifier. Turn keys are `{session}:{turn}`. */
export const TURN_IDENTIFIER_MAX_LENGTH = 200;

/**
 * Identifier charset: letters, digits and the separators real turn keys use
 * (`:` between session and turn, `-` in UUIDs, `.`, `_`, `/`, `@`, `#`).
 * No whitespace, so prose cannot pass.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:@#/-]+$/;

export type TurnIdentitySource = "header" | "mcp_meta";

export interface TurnIdentity {
  conversation_id?: string;
  turn_key?: string;
  /** Which carrier supplied the identity. */
  source: TurnIdentitySource;
}

/**
 * Normalise one identifier. Returns undefined for anything that is not a
 * non-empty, bounded token in the identifier charset.
 */
export function sanitizeTurnIdentifier(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (value.length === 0 || value.length > TURN_IDENTIFIER_MAX_LENGTH) return undefined;
  if (!IDENTIFIER_PATTERN.test(value)) return undefined;
  return value;
}

function build(
  conversationRaw: unknown,
  turnKeyRaw: unknown,
  source: TurnIdentitySource
): TurnIdentity | null {
  const conversation_id = sanitizeTurnIdentifier(conversationRaw);
  const turn_key = sanitizeTurnIdentifier(turnKeyRaw);
  if (!conversation_id && !turn_key) return null;
  const out: TurnIdentity = { source };
  if (conversation_id) out.conversation_id = conversation_id;
  if (turn_key) out.turn_key = turn_key;
  return out;
}

function firstHeader(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Read turn identity from HTTP request headers (Node lower-cases header
 * names). Returns null when neither header carries a usable identifier.
 */
export function turnIdentityFromHeaders(
  headers: Record<string, unknown> | null | undefined
): TurnIdentity | null {
  if (!headers) return null;
  return build(
    firstHeader(headers[TURN_HEADER_CONVERSATION_ID]),
    firstHeader(headers[TURN_HEADER_TURN_KEY]),
    "header"
  );
}

/**
 * Read turn identity from an MCP request's `params._meta`. Returns null when
 * `_meta` is absent or carries no usable identifier.
 */
export function turnIdentityFromMcpMeta(meta: unknown): TurnIdentity | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  return build(m[MCP_META_CONVERSATION_ID], m[MCP_META_TURN_KEY], "mcp_meta");
}

/**
 * Pick the identity for one MCP tool call: the call's own `_meta` first, then
 * whatever the enclosing HTTP request carried.
 */
export function resolveToolCallTurnIdentity(
  meta: unknown,
  inherited: TurnIdentity | null | undefined
): TurnIdentity | null {
  return turnIdentityFromMcpMeta(meta) ?? inherited ?? null;
}
