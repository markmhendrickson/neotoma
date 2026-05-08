/**
 * Contract tests for the `observation_source` enum on write-path
 * action schemas (fleet-general write integrity layer —
 * item-1-observation-source).
 *
 * The enum is the public classification of *what kind of write* produced
 * an observation (sensor, llm_summary, workflow_state, human, import, sync).
 * This test file locks the exact enum membership, case sensitivity, and
 * optional-by-default semantics so a future schema edit cannot silently
 * change the wire contract used by fleet agents and the CLI.
 */

import { describe, expect, it } from "vitest";
import {
  OBSERVATION_SOURCE_VALUES,
  ObservationSourceSchema,
  StoreRequestSchema,
  StoreStructuredRequestSchema,
} from "../../src/shared/action_schemas.js";

describe("ObservationSource enum contract", () => {
  it("locks the documented membership in the documented order", () => {
    // This ordering also backs `DEFAULT_OBSERVATION_SOURCE_PRIORITY` in
    // the reducer. Any edit here requires a matching edit in
    // `openapi.yaml`, `schema_registry.ts`, and the release notes.
    expect([...OBSERVATION_SOURCE_VALUES]).toEqual([
      "sensor",
      "llm_summary",
      "workflow_state",
      "human",
      "import",
      "sync",
    ]);
  });

  it("accepts every documented value", () => {
    for (const value of OBSERVATION_SOURCE_VALUES) {
      const parsed = ObservationSourceSchema.safeParse(value);
      expect(parsed.success, `rejected ${value}`).toBe(true);
    }
  });

  it("rejects unknown kinds and case variants", () => {
    for (const value of ["agent", "human_input", "Sensor", "LLM_SUMMARY", ""]) {
      expect(ObservationSourceSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("StoreStructuredRequestSchema observation_source", () => {
  const baseRequest = {
    entities: [{ entity_type: "note", content: "hello" }],
    idempotency_key: "test-key-1",
  };

  it("is optional (classification defaults applied server-side)", () => {
    const parsed = StoreStructuredRequestSchema.safeParse(baseRequest);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.observation_source).toBeUndefined();
    }
  });

  it("accepts each enum value", () => {
    for (const value of OBSERVATION_SOURCE_VALUES) {
      const parsed = StoreStructuredRequestSchema.safeParse({
        ...baseRequest,
        observation_source: value,
      });
      expect(parsed.success, `rejected ${value}`).toBe(true);
    }
  });

  it("rejects unknown observation_source values", () => {
    const parsed = StoreStructuredRequestSchema.safeParse({
      ...baseRequest,
      observation_source: "robot",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("StoreRequestSchema observation_source", () => {
  const structuredRequest = {
    entities: [{ entity_type: "note", content: "hello" }],
    idempotency_key: "test-key-2",
  };

  it("accepts observation_source on the combined store path", () => {
    const parsed = StoreRequestSchema.safeParse({
      ...structuredRequest,
      observation_source: "sensor",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // StoreRequestSchema is a discriminated-ish union; just confirm the
      // field round-trips when supplied.
      expect((parsed.data as { observation_source?: string }).observation_source).toBe(
        "sensor",
      );
    }
  });

  it("stays optional on the combined store path", () => {
    const parsed = StoreRequestSchema.safeParse(structuredRequest);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid observation_source on the combined store path", () => {
    const parsed = StoreRequestSchema.safeParse({
      ...structuredRequest,
      observation_source: "unknown_kind",
    });
    expect(parsed.success).toBe(false);
  });
});
