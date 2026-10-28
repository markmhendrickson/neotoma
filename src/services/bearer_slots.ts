/**
 * Configured-bearer matching with a bounded handover slot.
 *
 * The server's static bearer (`NEOTOMA_BEARER_TOKEN`) is the owner credential
 * for every daemon and interactive session that talks to a hosted instance.
 * Rotating it used to be a hard cut: the instant the value changed, every
 * consumer still holding the old one got 401.
 *
 * The handover slot closes that gap. During a rotation the operator sets:
 *
 *   NEOTOMA_BEARER_TOKEN                     the NEW bearer (primary)
 *   NEOTOMA_BEARER_TOKEN_PREVIOUS            the bearer being retired
 *   NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT absolute ISO-8601 instant, with an
 *                                            explicit offset, at most
 *                                            MAX_HANDOVER_WINDOW_MS ahead
 *
 * Both values authenticate until the expiry instant; after it, or as soon as
 * the PREVIOUS variable is unset (explicit retire), only the primary does.
 * The window bounds the life of the credential being retired, so a rotation
 * that is forgotten half-way ends with the old value dead, not alive.
 *
 * Invariants (each one is asserted by tests/unit/bearer_slots.test.ts or
 * tests/integration/bearer_handover_slot.test.ts):
 *
 *  - Same principal, same grants. A match on either slot is reported to the
 *    caller as a match; the auth gates take the identical branch they take for
 *    the primary. The slot never widens scope. (The OAuth key-auth preflight
 *    does not accept the previous slot at all: a retiring credential must not
 *    mint a durable OAuth connection that outlives it.)
 *  - Constant time. Each configured value is compared through SHA-256 digests
 *    and `timingSafeEqual`, so neither the value nor its length leaks through
 *    timing, and both slots are always compared — a primary match does not
 *    short-circuit the previous comparison.
 *  - Fail closed. A previous value with no expiry, an unparseable or
 *    offset-less expiry, an expiry beyond the maximum window, a value that is
 *    empty, contains whitespace or control characters, or equals the primary,
 *    or a previous value configured without a primary, disables the slot. The
 *    server keeps accepting the primary only and logs the reason at ERROR.
 *  - No values in logs or errors. Nothing here logs, returns, or throws a
 *    configured value or any digest of one. The audit event for a use of the
 *    previous slot records only where it was used and by what client.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "../utils/logger.js";

export const BEARER_PRIMARY_ENV = "NEOTOMA_BEARER_TOKEN";
export const BEARER_PREVIOUS_ENV = "NEOTOMA_BEARER_TOKEN_PREVIOUS";
export const BEARER_PREVIOUS_EXPIRES_AT_ENV = "NEOTOMA_BEARER_TOKEN_PREVIOUS_EXPIRES_AT";

/** Longest handover window the server accepts: seven days. */
export const MAX_HANDOVER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum interval between two audit events for the same client. */
export const PREVIOUS_SLOT_AUDIT_INTERVAL_MS = 60 * 1000;

const AUDIT_CLIENT_CAP = 512;

export type BearerSlot = "primary" | "previous";

export type HandoverDisabledReason =
  | "primary_unset"
  | "expiry_missing"
  | "expiry_malformed"
  | "expiry_beyond_max_window"
  | "value_missing"
  | "value_malformed"
  | "value_equals_primary";

export type HandoverStatus =
  | { status: "absent" }
  | { status: "active"; expiresAtMs: number }
  | { status: "expired"; expiresAtMs: number }
  | { status: "disabled"; reason: HandoverDisabledReason };

interface ParsedHandover {
  /** Status as of parse time; `expired` vs `active` is re-evaluated per request. */
  status: HandoverStatus;
  /** Retiring value; present only when the slot passed every check. */
  previousValue: string | null;
  expiresAtMs: number | null;
}

type Env = Record<string, string | undefined>;

// Full date-time with an explicit offset. A bare date or a local time is
// ambiguous across hosts, so it is rejected rather than guessed.
const ISO_INSTANT_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

// Whitespace or ASCII control characters anywhere in the value.
// eslint-disable-next-line no-control-regex
const MALFORMED_VALUE = /[\s\u0000-\u001f\u007f]/;

const REASON_DETAIL: Record<HandoverDisabledReason, string> = {
  primary_unset: `${BEARER_PREVIOUS_ENV} is set but ${BEARER_PRIMARY_ENV} is not; a handover slot needs a primary`,
  expiry_missing: `${BEARER_PREVIOUS_EXPIRES_AT_ENV} is not set; the handover window must be bounded`,
  expiry_malformed: `${BEARER_PREVIOUS_EXPIRES_AT_ENV} is not an ISO-8601 instant with an explicit offset (e.g. 2026-11-01T12:00:00Z)`,
  expiry_beyond_max_window: `${BEARER_PREVIOUS_EXPIRES_AT_ENV} is more than ${MAX_HANDOVER_WINDOW_MS / 3_600_000} hours ahead`,
  value_missing: `${BEARER_PREVIOUS_EXPIRES_AT_ENV} is set but ${BEARER_PREVIOUS_ENV} is empty`,
  value_malformed: `${BEARER_PREVIOUS_ENV} contains whitespace or control characters`,
  value_equals_primary: `${BEARER_PREVIOUS_ENV} equals ${BEARER_PRIMARY_ENV}; stage a new primary before setting the previous slot`,
};

/**
 * Pure parse of the handover configuration. Never logs; never returns a value
 * except `previousValue`, which callers must treat as secret.
 */
export function parseBearerHandover(env: Env, nowMs: number): ParsedHandover {
  const primary = env[BEARER_PRIMARY_ENV] ?? "";
  const rawPrevious = env[BEARER_PREVIOUS_ENV];
  const rawExpiry = env[BEARER_PREVIOUS_EXPIRES_AT_ENV];
  const previousSet = rawPrevious !== undefined && rawPrevious !== "";
  const expirySet = rawExpiry !== undefined && rawExpiry.trim() !== "";

  const disabled = (reason: HandoverDisabledReason): ParsedHandover => ({
    status: { status: "disabled", reason },
    previousValue: null,
    expiresAtMs: null,
  });

  if (!previousSet) {
    if (expirySet) return disabled("value_missing");
    return { status: { status: "absent" }, previousValue: null, expiresAtMs: null };
  }
  if (!primary) return disabled("primary_unset");
  if (MALFORMED_VALUE.test(rawPrevious)) return disabled("value_malformed");
  if (digestEquals(rawPrevious, primary)) return disabled("value_equals_primary");
  if (!expirySet) return disabled("expiry_missing");

  const expiryText = rawExpiry!.trim();
  if (!ISO_INSTANT_WITH_OFFSET.test(expiryText)) return disabled("expiry_malformed");
  const expiresAtMs = Date.parse(expiryText);
  if (!Number.isFinite(expiresAtMs)) return disabled("expiry_malformed");
  if (expiresAtMs - nowMs > MAX_HANDOVER_WINDOW_MS) return disabled("expiry_beyond_max_window");

  return {
    status:
      expiresAtMs > nowMs ? { status: "active", expiresAtMs } : { status: "expired", expiresAtMs },
    previousValue: rawPrevious,
    expiresAtMs,
  };
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time equality that leaks neither content nor length. */
function digestEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

// Memoised on the raw configuration so the status line is logged once per
// distinct configuration rather than once per request.
let memo: { key: string; parsed: ParsedHandover } | null = null;

function configKey(env: Env): string {
  // Kept in memory only, exactly like process.env itself; never logged.
  return JSON.stringify([
    env[BEARER_PRIMARY_ENV] ?? null,
    env[BEARER_PREVIOUS_ENV] ?? null,
    env[BEARER_PREVIOUS_EXPIRES_AT_ENV] ?? null,
  ]);
}

function loadHandover(env: Env, nowMs: number): ParsedHandover {
  const key = configKey(env);
  if (memo && memo.key === key) return memo.parsed;
  const parsed = parseBearerHandover(env, nowMs);
  memo = { key, parsed };
  logHandoverStatus(parsed.status, nowMs);
  return parsed;
}

function logHandoverStatus(status: HandoverStatus, nowMs: number): void {
  switch (status.status) {
    case "absent":
      return;
    case "active":
      logger.warn(
        JSON.stringify({
          event: "auth_bearer_handover_active",
          expires_at: new Date(status.expiresAtMs).toISOString(),
          seconds_remaining: Math.max(0, Math.round((status.expiresAtMs - nowMs) / 1000)),
          message:
            `Bearer handover window open: the previous bearer is accepted alongside ` +
            `${BEARER_PRIMARY_ENV} until expires_at, then rejected. Unset ${BEARER_PREVIOUS_ENV} ` +
            `to retire it sooner.`,
        })
      );
      return;
    case "expired":
      logger.warn(
        JSON.stringify({
          event: "auth_bearer_handover_expired",
          expires_at: new Date(status.expiresAtMs).toISOString(),
          message:
            `Bearer handover window has closed; the previous bearer is rejected. ` +
            `Unset ${BEARER_PREVIOUS_ENV} and ${BEARER_PREVIOUS_EXPIRES_AT_ENV}.`,
        })
      );
      return;
    case "disabled":
      logger.error(
        JSON.stringify({
          event: "auth_bearer_handover_disabled",
          reason: status.reason,
          detail: REASON_DETAIL[status.reason],
          accepted: "primary_only",
          message:
            `Bearer handover slot is misconfigured and has been DISABLED (fail closed). ` +
            `Only ${BEARER_PRIMARY_ENV} is accepted; consumers still on the previous bearer will get 401.`,
        })
      );
      return;
  }
}

/**
 * Report the handover status at boot. Safe to call more than once; the
 * status line is emitted once per distinct configuration.
 */
export function announceBearerHandoverStatus(
  env: Env = process.env,
  nowMs: number = Date.now()
): HandoverStatus {
  const parsed = loadHandover(env, nowMs);
  if (parsed.expiresAtMs !== null && parsed.previousValue !== null) {
    return parsed.expiresAtMs > nowMs
      ? { status: "active", expiresAtMs: parsed.expiresAtMs }
      : { status: "expired", expiresAtMs: parsed.expiresAtMs };
  }
  return parsed.status;
}

/**
 * Match a presented bearer against the configured static bearer and, while
 * the handover window is open, the retiring one.
 *
 * Returns which slot matched, or null. Callers that accept a match must take
 * the same branch for either slot (same principal, same grants).
 */
export function matchConfiguredBearer(
  presented: string,
  env: Env = process.env,
  nowMs: number = Date.now()
): BearerSlot | null {
  const primary = env[BEARER_PRIMARY_ENV];
  if (!primary || typeof presented !== "string") return null;

  const handover = loadHandover(env, nowMs);
  // Both comparisons always run when both slots are configured, so the
  // timing does not reveal which slot (if any) matched.
  const primaryMatch = digestEquals(presented, primary);
  const previousMatch =
    handover.previousValue !== null ? digestEquals(presented, handover.previousValue) : false;

  if (primaryMatch) return "primary";
  if (previousMatch && handover.expiresAtMs !== null && nowMs < handover.expiresAtMs) {
    return "previous";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Audit event for uses of the previous slot
// ---------------------------------------------------------------------------

export interface PreviousSlotUse {
  surface: "rest" | "mcp";
  method: string;
  path: string;
  userAgent?: string | string[];
  clientName?: string | string[];
}

const auditState = new Map<string, { lastEmitMs: number; suppressed: number }>();

function cleanClientLabel(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = first
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Emit the audit event for a request authenticated by the previous slot.
 *
 * The event says the retiring bearer is still in use, where, and by which
 * client — the signal an operator needs to find the consumers that have not
 * switched yet. It is throttled per client so a polling daemon produces one
 * line a minute, with a count of the uses folded into it.
 */
export function recordPreviousBearerUse(use: PreviousSlotUse, nowMs: number = Date.now()): void {
  const userAgent = cleanClientLabel(use.userAgent);
  const clientName = cleanClientLabel(use.clientName);
  const key = `${use.surface}\u0000${userAgent ?? ""}\u0000${clientName ?? ""}`;

  const entry = auditState.get(key);
  if (entry && nowMs - entry.lastEmitMs < PREVIOUS_SLOT_AUDIT_INTERVAL_MS) {
    entry.suppressed += 1;
    return;
  }
  if (!entry && auditState.size >= AUDIT_CLIENT_CAP) auditState.clear();

  const expiresAtMs = memo?.parsed.expiresAtMs ?? null;
  logger.warn(
    JSON.stringify({
      event: "auth_bearer_previous_slot_used",
      surface: use.surface,
      method: use.method,
      path: use.path,
      user_agent: userAgent,
      client_name: clientName,
      expires_at: expiresAtMs !== null ? new Date(expiresAtMs).toISOString() : null,
      seconds_remaining:
        expiresAtMs !== null ? Math.max(0, Math.round((expiresAtMs - nowMs) / 1000)) : null,
      uses_since_last_event: (entry?.suppressed ?? 0) + 1,
    })
  );
  auditState.set(key, { lastEmitMs: nowMs, suppressed: 0 });
}

/** Test hook: forget memoised configuration and audit throttling. */
export function __resetBearerSlotsForTests(): void {
  memo = null;
  auditState.clear();
}
