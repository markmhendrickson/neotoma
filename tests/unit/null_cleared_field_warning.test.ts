/**
 * Unit tests for the NULL_CLEARED_FIELD write-time warning (#1839).
 *
 * Tests the pure helper `buildNullClearedFieldWarning` in
 * `src/services/null_cleared_field_warning.ts` that drives the warning logic in
 * `src/actions.ts`.
 *
 * Under `highest_priority`, a null observation is an explicit tombstone that
 * clears a field when it wins selection. The clear is by design, but #1839 asks
 * that it stop being silent: warn when an incoming null clears a prior non-null
 * value under highest_priority. Warn-only — no semantic change.
 */

import { describe, it, expect } from "vitest";
import { buildNullClearedFieldWarning } from "../../src/services/null_cleared_field_warning.js";

describe("buildNullClearedFieldWarning", () => {
  const base = {
    field: "value",
    // new_value: undefined models the common case where the null cleared the
    // field (the field is absent from the recomputed snapshot). Individual
    // cases override it where the field was NOT actually cleared.
    new_value: undefined as unknown,
    observation_index: 0,
    entity_type: "null_test",
    entity_id: "ent_0123456789abcdef01234567",
  };

  it("fires when an incoming null clears a prior non-null value under highest_priority", () => {
    const warn = buildNullClearedFieldWarning({
      ...base,
      strategy: "highest_priority",
      prior_value: 0.18,
      incoming_value: null,
      new_value: undefined,
    });
    expect(warn).not.toBeNull();
    expect(warn?.code).toBe("NULL_CLEARED_FIELD");
    expect(warn?.entity_type).toBe("null_test");
    expect(warn?.entity_id).toBe(base.entity_id);
    expect(warn?.observation_index).toBe(0);
    expect(warn?.message).toContain('"value"');
    expect(warn?.message).toContain("highest_priority");
  });

  it("does not fire when the incoming value is not null (a real value, no clear)", () => {
    expect(
      buildNullClearedFieldWarning({
        ...base,
        strategy: "highest_priority",
        prior_value: 0.18,
        incoming_value: 0.42,
      })
    ).toBeNull();
  });

  it("does not fire when the incoming value is undefined (field omitted, reducer ignores it)", () => {
    expect(
      buildNullClearedFieldWarning({
        ...base,
        strategy: "highest_priority",
        prior_value: 0.18,
        incoming_value: undefined,
      })
    ).toBeNull();
  });

  it("does not fire when there was no prior value (prior null — nothing lost)", () => {
    expect(
      buildNullClearedFieldWarning({
        ...base,
        strategy: "highest_priority",
        prior_value: null,
        incoming_value: null,
      })
    ).toBeNull();
  });

  it("does not fire when there was no prior value (prior undefined — field absent before)", () => {
    expect(
      buildNullClearedFieldWarning({
        ...base,
        strategy: "highest_priority",
        prior_value: undefined,
        incoming_value: null,
      })
    ).toBeNull();
  });

  it("does not fire for last_write (scope is limited to highest_priority)", () => {
    expect(
      buildNullClearedFieldWarning({
        ...base,
        strategy: "last_write",
        prior_value: 0.18,
        incoming_value: null,
      })
    ).toBeNull();
  });

  it("does not fire when the field has no declared merge policy strategy", () => {
    expect(
      buildNullClearedFieldWarning({
        ...base,
        strategy: undefined,
        prior_value: 0.18,
        incoming_value: null,
      })
    ).toBeNull();
  });

  it("fires when clearing a falsy-but-non-null prior value (0)", () => {
    const warn = buildNullClearedFieldWarning({
      ...base,
      strategy: "highest_priority",
      prior_value: 0,
      incoming_value: null,
      new_value: undefined,
    });
    expect(warn).not.toBeNull();
    expect(warn?.code).toBe("NULL_CLEARED_FIELD");
  });

  it("does not fire when the field was not actually cleared (null stripped, prior value retained)", () => {
    // Some store paths strip a typed-field null before it becomes an
    // observation, so the prior value survives. No real clear → no warning,
    // even though the caller passed null.
    expect(
      buildNullClearedFieldWarning({
        ...base,
        strategy: "highest_priority",
        prior_value: 0.18,
        incoming_value: null,
        new_value: 0.18,
      })
    ).toBeNull();
  });
});
