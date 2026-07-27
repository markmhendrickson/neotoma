/**
 * #1943: the CLI must preserve the server's structured error, not flatten it.
 *
 * Regression guard for a silent-data-loss bug caught by the ux lens on PR #1946.
 * The server rejects a stale cursor with `error_code: INVALID_CURSOR` and a flat
 * `details.hint`. The CLI used to run that envelope through `formatApiError`
 * (which extracts only `.message` as a string) and `throw new Error(msg)`,
 * dropping both fields.
 *
 * Why that was worse than cosmetic: the documented pagination loop in
 * docs/developer/cli_agent_instructions.md branches on `.hint.code` and treats an
 * absent `.next_cursor` as "listing exhausted". With the code stripped, an agent
 * hitting a REJECTED cursor saw no code AND no next_cursor — so it read a
 * rejection as a COMPLETED walk, silently processed a partial dataset, and
 * reported success. Exactly the failure mode `cursor` exists to make impossible.
 *
 * These test the extraction seam directly. The end-to-end proof (real CLI ->
 * real server -> `--json`) is in the PR thread; this keeps the contract pinned.
 */
import { describe, it, expect } from "vitest";
import { errorCodeOf, hintOf } from "../../src/cli/index.ts";

describe("#1943 CLI preserves the server's structured error envelope", () => {
  // The exact shape src/actions.ts buildErrorEnvelope emits for a bad cursor.
  const cursorRejection = {
    error_code: "INVALID_CURSOR",
    message: "cursor is malformed (not a valid pagination token)",
    details: {
      code: "INVALID_CURSOR",
      message: "cursor is malformed (not a valid pagination token)",
      hint: "drop the `cursor` parameter and re-paginate from the start",
    },
    timestamp: "2026-07-17T00:00:00.000Z",
  };

  it("extracts error_code so an agent can branch on hint.code", () => {
    expect(errorCodeOf(cursorRejection)).toBe("INVALID_CURSOR");
  });

  it("extracts the flat details.hint carrying the recovery path", () => {
    expect(hintOf(cursorRejection)).toMatch(/drop the `cursor`/);
  });

  it("extracts the R4 structured hint's text form", () => {
    // errors.md R4: hint may be `{ text, ...metadata }` rather than a string.
    const structured = {
      error_code: "ERR_X",
      details: { hint: { text: "do the thing", required_identity_fields: ["a"] } },
    };
    expect(hintOf(structured)).toBe("do the thing");
  });

  it("returns undefined for non-envelope errors so they keep the plain-Error path", () => {
    // Network/parse failures have no error_code — they must not be coerced into
    // a CliHintError with a bogus code.
    expect(errorCodeOf(new Error("socket hang up"))).toBeUndefined();
    expect(errorCodeOf("ECONNREFUSED")).toBeUndefined();
    expect(errorCodeOf(undefined)).toBeUndefined();
    expect(hintOf(new Error("socket hang up"))).toBeUndefined();
  });

  it("returns undefined when an envelope carries no hint", () => {
    expect(hintOf({ error_code: "ERR_X", details: {} })).toBeUndefined();
    expect(hintOf({ error_code: "ERR_X" })).toBeUndefined();
  });

  it("ignores an empty-string code rather than emitting hint.code: ''", () => {
    expect(errorCodeOf({ error_code: "" })).toBeUndefined();
  });
});
