/**
 * Tests for the shared production-environment detector (`src/shared/environment.ts`).
 *
 * Neotoma's own dev/prod switch is `NEOTOMA_ENV`; historically `NODE_ENV` was
 * deliberately ignored (see `src/config.ts`) so that a host process's
 * `NODE_ENV` could not silently override Neotoma's own choice when Neotoma
 * runs embedded (e.g. as an MCP server inside another Node workspace).
 *
 * That isolation left a gap: a deploy that sets only `NODE_ENV=production`
 * (e.g. a bare Dockerfile with no NEOTOMA_ENV) was treated as development by
 * every production-gated check, including the `/mcp` local-caller gate this
 * repairs. This suite locks in the fix: `NODE_ENV=production` now also
 * counts as production, but only when `NEOTOMA_ENV` is not explicitly set to
 * something else — an explicit `NEOTOMA_ENV=development` still wins.
 */

import { describe, it, expect } from "vitest";
import { isProductionEnvironment } from "../../src/shared/environment.ts";

describe("isProductionEnvironment", () => {
  it("is false by default (no env vars set)", () => {
    expect(isProductionEnvironment({})).toBe(false);
  });

  it("is true when NEOTOMA_ENV=production", () => {
    expect(isProductionEnvironment({ NEOTOMA_ENV: "production" })).toBe(true);
  });

  it("is true when NEOTOMA_ENV=prod", () => {
    expect(isProductionEnvironment({ NEOTOMA_ENV: "prod" })).toBe(true);
  });

  it("is true when only NODE_ENV=production is set (bare Docker deploy shape)", () => {
    expect(isProductionEnvironment({ NODE_ENV: "production" })).toBe(true);
  });

  it("is false when NODE_ENV=development", () => {
    expect(isProductionEnvironment({ NODE_ENV: "development" })).toBe(false);
  });

  it("is false when NODE_ENV=test (vitest's own default)", () => {
    expect(isProductionEnvironment({ NODE_ENV: "test" })).toBe(false);
  });

  it("an explicit NEOTOMA_ENV=development wins over NODE_ENV=production", () => {
    // A host workspace's NODE_ENV must never override an operator's explicit
    // NEOTOMA_ENV choice — this is the isolation config.ts documents.
    expect(
      isProductionEnvironment({ NEOTOMA_ENV: "development", NODE_ENV: "production" })
    ).toBe(false);
  });

  it("NEOTOMA_ENV=production wins regardless of NODE_ENV", () => {
    expect(
      isProductionEnvironment({ NEOTOMA_ENV: "production", NODE_ENV: "development" })
    ).toBe(true);
  });

  it("is case-insensitive and trims whitespace for both variables", () => {
    expect(isProductionEnvironment({ NEOTOMA_ENV: " PRODUCTION " })).toBe(true);
    expect(isProductionEnvironment({ NODE_ENV: " PRODUCTION " })).toBe(true);
  });

  it("defaults to process.env when no argument is given", () => {
    // Smoke test only: just confirm it doesn't throw and returns a boolean.
    expect(typeof isProductionEnvironment()).toBe("boolean");
  });
});
