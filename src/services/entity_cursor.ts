// #1943: Keyset (cursor) pagination for queryEntities.
//
// Offset pagination on the entities listing was O(offset): the chunked scan in
// entity_queries.ts re-scanned and discarded `offset` visible rows in JS on
// every page, with a per-chunk deleted-id round-trip, so deep pages froze the
// single Node event loop (observed 4.8-7.5s at offset:1300). A stable keyset
// cursor lets each page start immediately after the previous page's last row
// (a `WHERE entity_id > :last` seek), so cost is O(page size) at any depth.
//
// SCOPE (interim quick win, #1943 step 7 of plan ent_a0e1d525e6ce8484086e49ed):
// cursor pagination is offered for the default `entity_id` sort only. That sort
// has a unique, SQL-comparable, index-backed key, so the seek is a single-column
// `>` / `<` with no tiebreaker ambiguity — which is exactly the reported case (a
// client paginating all contacts under the default ordering). Non-default sorts
// (`canonical_name`, `observation_count`, snapshot fields) and search paths keep
// bounded offset; extending keyset to the compound `(canonical_name, entity_id)`
// key is deferred to the concurrent-backend rework.
//
// The cursor is an opaque base64url token. Callers MUST treat it as opaque and
// pass it back verbatim; the encoded shape below is an implementation detail and
// may change. It carries the query's sort contract (`sort_order`) so a cursor
// minted under one ordering cannot be silently replayed against a different one
// — a mismatch returns a structured error rather than a wrong page.

export interface CursorPayload {
  /**
   * Cursor format version, so the encoding can evolve without silently
   * misreading old tokens.
   *
   * Bump policy (arch lens, #1946): a `v` bump is a TIGHTENING, not a grace
   * period — an old token starts returning `INVALID_CURSOR` immediately, and
   * `decodeCursor` rejects any unrecognized version rather than guessing. That
   * is safe because a cursor is ephemeral (valid only for the duration of one
   * walk) and the documented recovery is already "drop it and restart from the
   * first page". So a bump needs the structured `hint` per
   * docs/subsystems/errors.md § Tightening-change hint obligation, but NOT a
   * dual-read compatibility window.
   */
  v: 1;
  /** Only the `entity_id` keyset is supported in this interim fix. */
  sort_by: "entity_id";
  sort_order: "asc" | "desc";
  /** The last row of the page this cursor advances past (the unique seek key). */
  entity_id: string;
}

/**
 * Structured error thrown when a pagination cursor is malformed or was minted
 * under a different sort contract than the current request. HTTP handlers
 * surface this as a 400 with `code: "INVALID_CURSOR"` (see `src/actions.ts`);
 * the MCP handler surfaces it as `InvalidParams` (see `src/server.ts`).
 */
export class CursorError extends Error {
  readonly code = "INVALID_CURSOR" as const;
  readonly statusCode = 400;
  readonly hint: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "CursorError";
    this.hint = hint ?? "drop the `cursor` parameter and re-paginate from the start";
  }

  toErrorEnvelope(): {
    code: string;
    message: string;
    hint: string;
  } {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
    };
  }
}

/**
 * Keyset pagination is only sound for the default `entity_id` sort, whose key is
 * unique and directly SQL-comparable. Callers gate cursor minting/consumption on
 * this; every other sort (and any `search`) keeps bounded offset.
 *
 * `undefined` counts as eligible because `entity_id` is the schema default.
 */
export function isCursorEligibleSort(sortBy: string | undefined): boolean {
  return sortBy === undefined || sortBy === "entity_id";
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decode + validate a cursor against the current query's sort contract. Throws
 * {@link CursorError} (surfaced as a 400 / InvalidParams) when the token is
 * malformed or was minted under a different ordering than the current request,
 * so a stale cursor can never silently return a wrong page.
 */
export function decodeCursor(
  token: string,
  expected: { sortOrder: "asc" | "desc" }
): CursorPayload {
  let parsed: unknown;
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch {
    throw new CursorError("cursor is malformed (not a valid pagination token)");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CursorError("cursor is malformed (not a valid pagination token)");
  }
  const p = parsed as Record<string, unknown>;
  if (p.v !== 1) {
    throw new CursorError("cursor version is unsupported");
  }
  if (p.sort_by !== "entity_id") {
    throw new CursorError("cursor is malformed (unsupported sort_by)");
  }
  if (p.sort_order !== "asc" && p.sort_order !== "desc") {
    throw new CursorError("cursor is malformed (unknown sort_order)");
  }
  if (typeof p.entity_id !== "string" || p.entity_id.length === 0) {
    throw new CursorError("cursor is malformed (missing entity_id)");
  }

  // A cursor is only valid for the exact ordering it was minted under. Replaying
  // it against the opposite order would seek the wrong direction and skip rows.
  if (p.sort_order !== expected.sortOrder) {
    throw new CursorError(
      "cursor is only valid for the sort_order it was issued under; drop the cursor when changing sort"
    );
  }

  return {
    v: 1,
    sort_by: "entity_id",
    sort_order: p.sort_order,
    entity_id: p.entity_id,
  };
}
