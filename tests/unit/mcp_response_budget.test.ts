/**
 * Tests for the MCP response-size guard (#2432).
 *
 * The defect being fixed: nothing bounded an MCP tool result. Every `MAX_`
 * constant in the query path is a ROW count, so a small number of large rows
 * passed every existing limit, and `buildTextResponse` serialized straight to
 * `JSON.stringify` with no size check. #1669 recorded real responses of
 * 105,066 and 83,773 characters reaching clients.
 *
 * Because MCP results persist in the client's context for the rest of the
 * session, an oversized response is re-sent on every later turn rather than
 * paid once — so these tests care about two things: that the over-limit path
 * actually truncates, and that resolution of the limit FAILS TOWARD THE
 * SMALLER RESULT when the configured value is absent or malformed.
 */

import { describe, expect, it } from "vitest";

import {
  applyResponseBudget,
  resolveMaxResponseChars,
  DEFAULT_MAX_RESPONSE_CHARS,
  MIN_CONFIGURABLE_RESPONSE_CHARS,
} from "../../src/mcp_response_budget.js";

describe("applyResponseBudget (#2432)", () => {
  it("passes an under-limit payload through byte-for-byte", () => {
    // The guard must be invisible to the overwhelming majority of responses.
    // A guard that rewrites ordinary results is a behaviour change, not a cap.
    const payload = JSON.stringify({ entities: [{ id: "ent_1" }] });
    const result = applyResponseBudget(payload, 1_000);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(payload);
    expect(result.originalChars).toBe(payload.length);
  });

  it("passes a payload exactly at the limit (boundary is inclusive)", () => {
    // Off-by-one here would truncate a response that exactly fits, which is
    // the kind of boundary bug that only shows up under production sizes.
    const payload = "x".repeat(500);
    const result = applyResponseBudget(payload, 500);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(payload);
  });

  it("withholds a payload one character over the limit", () => {
    const payload = "x".repeat(501);
    const result = applyResponseBudget(payload, 500);
    expect(result.truncated).toBe(true);
    expect(result.text).not.toBe(payload);
  });

  it("replaces an oversized payload with a structured, parseable envelope", () => {
    // Truncated JSON is invalid JSON. If the guard cut the original string at
    // N characters, a client would get a syntax error that says nothing about
    // why, and an agent might read a partial list as a complete one. So the
    // envelope must parse, and must say what happened.
    const payload = JSON.stringify({ rows: Array.from({ length: 5_000 }, (_, i) => ({ i })) });
    expect(payload.length).toBeGreaterThan(10_000);

    const result = applyResponseBudget(payload, 10_000);
    expect(result.truncated).toBe(true);

    const parsed = JSON.parse(result.text) as Record<string, unknown>;
    expect(parsed.error).toBe("RESPONSE_TOO_LARGE");
    expect(parsed.original_size_chars).toBe(payload.length);
    expect(parsed.limit_chars).toBe(10_000);
    expect(String(parsed.hint)).toMatch(/include_snapshots|limit|cursor/);
  });

  it("returns an envelope far smaller than the payload it replaced", () => {
    // The guard exists to stop large results reaching the context window. An
    // envelope that were itself large would defeat its own purpose.
    const payload = "x".repeat(400_000);
    const result = applyResponseBudget(payload, 100_000);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(2_000);
  });

  it("reports the ORIGINAL size, not the envelope's, when truncating", () => {
    // The caller needs to know how far over it went in order to narrow the
    // query usefully. Reporting the envelope's size would be useless and
    // would also silently understate the problem in logs.
    const payload = "x".repeat(250_000);
    const result = applyResponseBudget(payload, 100_000);
    expect(result.originalChars).toBe(250_000);
  });
});

describe("resolveMaxResponseChars — fails toward the smaller result (#2432)", () => {
  it("uses the default when unset", () => {
    expect(resolveMaxResponseChars(undefined)).toBe(DEFAULT_MAX_RESPONSE_CHARS);
  });

  it("uses an explicitly configured value", () => {
    expect(resolveMaxResponseChars("50000")).toBe(50_000);
  });

  it.each([
    ["empty string", ""],
    ["whitespace", "   "],
    ["non-numeric", "lots"],
    ["NaN-producing", "12abc"],
    ["infinity", "Infinity"],
    ["fractional", "1000.5"],
  ])("falls back to the default for a %s value", (_label, raw) => {
    // The failure this guards is a typo in an env var silently restoring
    // unbounded responses. Every malformed spelling must take the RESTRICTIVE
    // branch, so there is deliberately no value that disables the guard by
    // being wrong — removing the ceiling requires a large number on purpose.
    expect(resolveMaxResponseChars(raw)).toBe(DEFAULT_MAX_RESPONSE_CHARS);
  });

  it.each([
    ["zero", "0"],
    ["negative", "-1"],
    ["implausibly small", "10"],
  ])("falls back to the default for a %s value rather than truncating everything", (_label, raw) => {
    // The opposite failure: a ceiling small enough to truncate every response
    // would be an outage, so an implausible value is treated as
    // misconfiguration rather than honoured literally.
    expect(resolveMaxResponseChars(raw)).toBe(DEFAULT_MAX_RESPONSE_CHARS);
  });

  it("accepts a value exactly at the minimum", () => {
    expect(resolveMaxResponseChars(String(MIN_CONFIGURABLE_RESPONSE_CHARS))).toBe(
      MIN_CONFIGURABLE_RESPONSE_CHARS
    );
  });

  it("defaults below the smaller response #1669 observed, so that case is caught", () => {
    // Anchors the default to the evidence that motivated the guard rather than
    // to a round number: if someone raises it above 83,773, the responses this
    // issue exists to bound would pass through again.
    expect(DEFAULT_MAX_RESPONSE_CHARS).toBeLessThan(83_773);
  });
});

describe("RetrieveRelatedEntitiesSchema limit (#2432)", () => {
  it("defaults to 200 when the caller supplies no limit", async () => {
    // This traversal had NO bound of any kind: each hop ran `.select("*")`
    // with no `.limit()`, and `max_hops` multiplied that rather than capping
    // it, so a hub entity returned every edge it had. The default is the
    // whole point — an unbounded default is the defect.
    const { RetrieveRelatedEntitiesSchema } = await import("../../src/shared/action_schemas.js");
    const parsed = RetrieveRelatedEntitiesSchema.parse({ entity_id: "ent_abc" });
    expect(parsed.limit).toBe(200);
  });

  it("accepts an explicit larger limit up to the ceiling", async () => {
    const { RetrieveRelatedEntitiesSchema } = await import("../../src/shared/action_schemas.js");
    expect(RetrieveRelatedEntitiesSchema.parse({ entity_id: "ent_abc", limit: 1000 }).limit).toBe(
      1000
    );
  });

  it("rejects a limit above the ceiling rather than honouring it", async () => {
    const { RetrieveRelatedEntitiesSchema } = await import("../../src/shared/action_schemas.js");
    expect(() =>
      RetrieveRelatedEntitiesSchema.parse({ entity_id: "ent_abc", limit: 5000 })
    ).toThrow();
  });

  it("rejects a zero or negative limit", async () => {
    const { RetrieveRelatedEntitiesSchema } = await import("../../src/shared/action_schemas.js");
    expect(() => RetrieveRelatedEntitiesSchema.parse({ entity_id: "ent_abc", limit: 0 })).toThrow();
    expect(() => RetrieveRelatedEntitiesSchema.parse({ entity_id: "ent_abc", limit: -5 })).toThrow();
  });
});
