/**
 * Unit tests for `src/services/schema_mode.ts`.
 *
 * Covers parsing of the `NEOTOMA_SCHEMA_MODE` env var:
 *
 *   - Unset / empty -> default ("evolving")
 *   - "guided" / "locked" -> respective canonical values
 *   - Invalid value -> default with a structured warning
 *   - Case-insensitive matching ("LOCKED", "Guided" -> "locked", "guided")
 *
 * Plan: ent_089da2ecebc3bd804d63dcf2 (Bundles m1 PR C).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSchemaMode, resetSchemaModeCacheForTesting } from "../../src/services/schema_mode.js";
import { logger } from "../../src/utils/logger.js";

describe("getSchemaMode", () => {
  const originalValue = process.env.NEOTOMA_SCHEMA_MODE;

  beforeEach(() => {
    delete process.env.NEOTOMA_SCHEMA_MODE;
    resetSchemaModeCacheForTesting();
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.NEOTOMA_SCHEMA_MODE;
    } else {
      process.env.NEOTOMA_SCHEMA_MODE = originalValue;
    }
    resetSchemaModeCacheForTesting();
    vi.restoreAllMocks();
  });

  it("returns 'evolving' when env var is unset", () => {
    expect(getSchemaMode()).toBe("evolving");
  });

  it("returns 'evolving' when env var is empty string", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "";
    expect(getSchemaMode()).toBe("evolving");
  });

  it("returns 'evolving' when env var is whitespace only", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "   ";
    expect(getSchemaMode()).toBe("evolving");
  });

  it("returns 'guided' when env var = 'guided'", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "guided";
    expect(getSchemaMode()).toBe("guided");
  });

  it("returns 'locked' when env var = 'locked'", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "locked";
    expect(getSchemaMode()).toBe("locked");
  });

  it("returns 'evolving' explicitly when env var = 'evolving'", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "evolving";
    expect(getSchemaMode()).toBe("evolving");
  });

  it("falls back to 'evolving' and logs a warning when env var is invalid", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    process.env.NEOTOMA_SCHEMA_MODE = "garbage";

    expect(getSchemaMode()).toBe("evolving");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain("NEOTOMA_SCHEMA_MODE");
    expect(message).toContain("garbage");
    expect(message).toContain("evolving");
  });

  it("does not throw on invalid values (startup must not break)", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "not-a-mode";
    expect(() => getSchemaMode()).not.toThrow();
  });

  it("matches case-insensitively for 'LOCKED'", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    process.env.NEOTOMA_SCHEMA_MODE = "LOCKED";
    expect(getSchemaMode()).toBe("locked");
  });

  it("matches case-insensitively for mixed case 'Guided'", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    process.env.NEOTOMA_SCHEMA_MODE = "Guided";
    expect(getSchemaMode()).toBe("guided");
  });

  it("trims surrounding whitespace before matching", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "  locked  ";
    expect(getSchemaMode()).toBe("locked");
  });

  it("caches the resolved value across calls", () => {
    process.env.NEOTOMA_SCHEMA_MODE = "guided";
    expect(getSchemaMode()).toBe("guided");

    // Mutating the env after the first call should not change the cached value.
    process.env.NEOTOMA_SCHEMA_MODE = "locked";
    expect(getSchemaMode()).toBe("guided");

    // Resetting the cache picks up the new value.
    resetSchemaModeCacheForTesting();
    expect(getSchemaMode()).toBe("locked");
  });
});
