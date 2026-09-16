/**
 * Response-size guard for MCP tool results (#2432).
 *
 * WHY THIS EXISTS
 *
 * MCP tool results stay in the client's context window for the remainder of
 * the session. An oversized response is therefore not paid once — it is
 * re-sent on every subsequent turn until compaction. That makes an unbounded
 * read a compounding cost rather than a one-off one.
 *
 * Nothing bounded it. `NeotomaMCPServer.buildTextResponse` serialized straight
 * to `JSON.stringify` with no byte guard, no length check and no truncation,
 * and every `MAX_` constant in the query path is a ROW count rather than a
 * size — so a small number of large rows passed every existing limit. #1669
 * records real `store` responses of 105,066 and 83,773 characters reaching
 * clients this way.
 *
 * WHY HERE
 *
 * `buildTextResponse` is the single choke point through which all 87 MCP tool
 * result sites serialize. Guarding it binds every tool at once and cannot be
 * bypassed by a tool that forgets to opt in. A per-tool guard would have to be
 * remembered 87 times and by every tool added later.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not make responses smaller — it stops them being unbounded. Reducing
 * what each call returns by default (projection, snapshot opt-outs, `store`
 * response trimming) is tracked separately in #1883, #1884, #1887, #1888 and
 * #1669. This is the ceiling those live under.
 */

/**
 * Default ceiling for a serialized MCP tool result, in characters.
 *
 * 80,000 chars is roughly 17,300 tokens at the ~4.63 chars/token ratio
 * measured for this codebase's payloads.
 *
 * The value is anchored to the evidence rather than to a round number: it sits
 * just BELOW the smaller of the two oversized responses recorded in #1669
 * (105,066 and 83,773 chars), so BOTH cases that motivated the guard are
 * caught. A default of 100,000 would have bounded only the larger one and let
 * the 83,773-char response through — which is the mistake the accompanying
 * test exists to stop anyone repeating, and which it caught during this
 * change.
 *
 * This is a ceiling on pathology, not a target. A result that legitimately
 * needs to be large should be narrowed by the caller, which is what the
 * truncation envelope tells them to do.
 */
export const DEFAULT_MAX_RESPONSE_CHARS = 80_000;

/**
 * Lower bound for a configured limit. A ceiling small enough to truncate every
 * response would turn the guard into an outage, so a configured value below
 * this is treated as misconfiguration and the default is used instead.
 */
export const MIN_CONFIGURABLE_RESPONSE_CHARS = 1_000;

export interface ResponseBudgetResult {
  /** The text to return to the client — either the original or an envelope. */
  text: string;
  /** True when the payload exceeded the limit and was replaced. */
  truncated: boolean;
  /** Size of the original serialized payload, in characters. */
  originalChars: number;
}

/**
 * Resolve the configured response ceiling.
 *
 * FAILS TOWARD THE SMALLER RESULT. An absent, unparseable, non-numeric,
 * zero, negative, or implausibly small value all take the DEFAULT branch
 * rather than the permissive one. The failure this guards against is a typo
 * in an env var silently restoring unbounded responses — so there is
 * deliberately no value that disables the guard by being malformed. Removing
 * the ceiling requires setting it to a large number on purpose.
 */
export function resolveMaxResponseChars(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_RESPONSE_CHARS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_RESPONSE_CHARS;
  if (!Number.isInteger(parsed)) return DEFAULT_MAX_RESPONSE_CHARS;
  if (parsed < MIN_CONFIGURABLE_RESPONSE_CHARS) return DEFAULT_MAX_RESPONSE_CHARS;
  return parsed;
}

/**
 * Build the envelope returned in place of an oversized payload.
 *
 * It is deliberately a STRUCTURED, self-describing object rather than the
 * original payload cut at N characters. Truncated JSON is invalid JSON: a
 * client parsing it gets a syntax error that says nothing about why, and an
 * agent reading it may silently treat a partial list as a complete one. The
 * envelope instead states the limit, the actual size, and what the caller
 * should do — so an over-limit read is a legible instruction to narrow the
 * query rather than a corrupt result.
 */
function buildTruncationEnvelope(originalChars: number, limit: number): string {
  return JSON.stringify({
    error: "RESPONSE_TOO_LARGE",
    message:
      `This result serialized to ${originalChars} characters, over the ${limit}-character ` +
      `response limit, and was withheld rather than returned truncated. MCP tool results stay ` +
      `in the context window for the rest of the session, so an oversized result is re-sent on ` +
      `every later turn.`,
    original_size_chars: originalChars,
    limit_chars: limit,
    hint:
      "Narrow the request and retry: lower `limit`, set `include_snapshots: false`, " +
      "filter by `entity_type`, or page with `cursor`.",
  });
}

/**
 * Apply the response budget to an already-serialized payload.
 *
 * Takes the serialized string rather than the object so the caller keeps
 * ownership of serialization (including its BigInt replacer) and so this
 * function stays synchronous, pure, and directly testable.
 */
export function applyResponseBudget(serialized: string, limit: number): ResponseBudgetResult {
  const originalChars = serialized.length;
  if (originalChars <= limit) {
    return { text: serialized, truncated: false, originalChars };
  }
  return {
    text: buildTruncationEnvelope(originalChars, limit),
    truncated: true,
    originalChars,
  };
}
