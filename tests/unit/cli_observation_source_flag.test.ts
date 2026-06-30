/**
 * Unit tests for the CLI `--observation-source` flag validator
 * (`normalizeObservationSourceFlag` in src/cli/index.ts).
 *
 * Issue #1841: `observation_source` was tightened from arbitrary strings
 * (v0.17) to a closed enum (v0.18.x). This test pins:
 *   1. The CLI enum matches the API/OpenAPI enum EXACTLY, including `sync`
 *      (the value that previously drifted — CLI rejected it, API accepted it).
 *   2. An invalid value's error message lists the valid values AND tells the
 *      user to put custom v0.17 labels in the `data_source` field.
 */

import { describe, expect, it } from "vitest";

import {
  OBSERVATION_SOURCE_CLI_VALUES,
  normalizeObservationSourceFlag,
} from "../../src/cli/index.ts";
import { OBSERVATION_SOURCE_VALUES } from "../../src/shared/action_schemas.ts";

describe("#1841 CLI --observation-source enum", () => {
  it("CLI enum matches the canonical API/schema enum exactly", () => {
    // The canonical enum lives in action_schemas.ts and openapi.yaml.
    // CLI parity is the whole point of the fix — drift here re-breaks #1841.
    expect([...OBSERVATION_SOURCE_CLI_VALUES].sort()).toEqual(
      [...OBSERVATION_SOURCE_VALUES].sort()
    );
  });

  it.each([...OBSERVATION_SOURCE_VALUES])(
    "accepts the API-accepted value %s",
    (value) => {
      expect(normalizeObservationSourceFlag(value)).toBe(value);
    }
  );

  it("now accepts `sync` (was the CLI/API drift in #1841)", () => {
    expect(OBSERVATION_SOURCE_CLI_VALUES).toContain("sync");
    expect(normalizeObservationSourceFlag("sync")).toBe("sync");
  });

  it("normalizes case and hyphens to the canonical underscore form", () => {
    expect(normalizeObservationSourceFlag("LLM-SUMMARY")).toBe("llm_summary");
    expect(normalizeObservationSourceFlag(" workflow-state ")).toBe(
      "workflow_state"
    );
  });

  it("rejects a custom v0.17 string with a data_source migration hint", () => {
    let caught: Error | undefined;
    try {
      normalizeObservationSourceFlag("cboe_live");
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    const message = caught!.message;
    // Lists the value that was rejected and the valid values.
    expect(message).toContain('"cboe_live"');
    expect(message).toContain("sync");
    expect(message).toContain("llm_summary");
    // Tells the user where custom v0.17 labels now belong.
    expect(message).toContain("data_source");
  });
});
