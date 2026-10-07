/**
 * Client-supplied conversation-turn identity for write events
 * (docs/subsystems/write_events.md; turn-key convention #2440, reads #2261).
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
 * Precedence on an MCP tool call: if the call's `_meta` carries ANY usable
 * identifier, the `_meta` identity replaces the header identity as a whole —
 * the two carriers are never merged field by field, because a conversation id
 * from one and a turn key from the other may describe different turns. So a
 * `_meta` with only `io.neotoma/conversation_id` yields an identity with that
 * conversation id and no turn key, even when a turn-key header was sent.
 *
 * The values are self-reported and unverified, exactly like `clientInfo`: a
 * caller can tag its writes with another caller's turn key. They are
 * identifiers, never content: anything that is not a short token is dropped
 * rather than stored, and the drop is logged at debug level with its reason
 * (never the value) so a harness author can see why a key did not land.
 */

import { logger } from "../../utils/logger.js";

export const TURN_HEADER_CONVERSATION_ID = "x-neotoma-conversation-id";
export const TURN_HEADER_TURN_KEY = "x-neotoma-turn-key";

export const MCP_META_CONVERSATION_ID = "io.neotoma/conversation_id";
export const MCP_META_TURN_KEY = "io.neotoma/turn_key";

/** Upper bound on a stored identifier. Turn keys are `{session}:{turn}`. */
export const TURN_IDENTIFIER_MAX_LENGTH = 200;

/**
 * Identifier charset: ASCII letters and digits plus the separators real turn
 * keys use (`:` between session and turn, `-` in UUIDs, `.`, `_`, `/`, `@`,
 * `#`). No whitespace and no comma, so prose — and a repeated header, which
 * Node joins with ", " — cannot pass.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:@#/-]+$/;

export type TurnIdentitySource = "header" | "mcp_meta";

export interface TurnIdentity {
  conversation_id?: string;
  turn_key?: string;
  /** Which carrier supplied the identity. */
  source: TurnIdentitySource;
}

/** Why a supplied identifier was not used. */
export type TurnIdentifierDropReason =
  | "not_a_string"
  | "empty"
  | "too_long"
  | "invalid_characters"
  | "repeated_header";

export type TurnIdentifierCheck =
  | { ok: true; value: string }
  | { ok: false; reason: TurnIdentifierDropReason };

/**
 * Classify one supplied identifier. `undefined` / `null` mean "not supplied"
 * and are reported as `empty`; callers only log drops for values that were
 * actually supplied.
 */
export function checkTurnIdentifier(raw: unknown): TurnIdentifierCheck {
  if (raw === undefined || raw === null) return { ok: false, reason: "empty" };
  if (Array.isArray(raw)) return { ok: false, reason: "repeated_header" };
  if (typeof raw !== "string") return { ok: false, reason: "not_a_string" };
  const value = raw.trim();
  if (value.length === 0) return { ok: false, reason: "empty" };
  // Node joins a repeated request header into one "a, b" string. Two values
  // for one turn are ambiguous, so neither is used.
  if (value.includes(",")) return { ok: false, reason: "repeated_header" };
  if (value.length > TURN_IDENTIFIER_MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (!IDENTIFIER_PATTERN.test(value)) return { ok: false, reason: "invalid_characters" };
  return { ok: true, value };
}

/** Normalise one identifier; undefined when it is not usable. */
export function sanitizeTurnIdentifier(raw: unknown): string | undefined {
  const check = checkTurnIdentifier(raw);
  return check.ok ? check.value : undefined;
}

function logDrop(
  source: TurnIdentitySource,
  field: "conversation_id" | "turn_key",
  raw: unknown,
  reason: TurnIdentifierDropReason
): void {
  // Reason and length only: the value is client-controlled and may not be an id.
  logger.debug("[write_events] ignored client turn identifier", {
    source,
    field,
    reason,
    length: typeof raw === "string" ? raw.length : undefined,
  });
}

function pick(
  raw: unknown,
  source: TurnIdentitySource,
  field: "conversation_id" | "turn_key"
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const check = checkTurnIdentifier(raw);
  if (check.ok) return check.value;
  logDrop(source, field, raw, check.reason);
  return undefined;
}

function build(
  conversationRaw: unknown,
  turnKeyRaw: unknown,
  source: TurnIdentitySource
): TurnIdentity | null {
  const conversation_id = pick(conversationRaw, source, "conversation_id");
  const turn_key = pick(turnKeyRaw, source, "turn_key");
  if (!conversation_id && !turn_key) return null;
  const out: TurnIdentity = { source };
  if (conversation_id) out.conversation_id = conversation_id;
  if (turn_key) out.turn_key = turn_key;
  return out;
}

/**
 * Read turn identity from HTTP request headers (Node lower-cases header
 * names). Returns null when neither header carries a usable identifier. A
 * repeated header is dropped, not resolved to its first value.
 */
export function turnIdentityFromHeaders(
  headers: Record<string, unknown> | null | undefined
): TurnIdentity | null {
  if (!headers) return null;
  return build(headers[TURN_HEADER_CONVERSATION_ID], headers[TURN_HEADER_TURN_KEY], "header");
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
 * Pick the identity for one MCP tool call: the call's own `_meta` identity
 * when it carries any usable identifier (replacing the inherited one as a
 * whole), otherwise whatever the enclosing HTTP request carried.
 */
export function resolveToolCallTurnIdentity(
  meta: unknown,
  inherited: TurnIdentity | null | undefined
): TurnIdentity | null {
  return turnIdentityFromMcpMeta(meta) ?? inherited ?? null;
}
