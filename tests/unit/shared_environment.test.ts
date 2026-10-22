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
 * repairs. This suite locks in the fix and its follow-up hardening: the
 * detector now returns `true` whenever EITHER variable says production —
 * `NEOTOMA_ENV` no longer overrides `NODE_ENV` in the permissive direction,
 * per the repo's fail-closed rule (when a value is absent, unrecognized, or
 * conflicting, the default is the restrictive branch). A `NEOTOMA_ENV` set
 * to any value outside the recognized set (`development`, `dev`, `test`,
 * `production`, `prod`) is itself treated as production rather than
 * silently falling through to `NODE_ENV`.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
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

  describe("precedence: EITHER variable saying production wins (fail-closed)", () => {
    // Table-driven over every combination of {unset, development, production,
    // staging (unrecognized)} for NEOTOMA_ENV crossed with {unset, development,
    // production} for NODE_ENV. Asserts the restrictive (production) outcome
    // wherever either variable says production, or NEOTOMA_ENV is unrecognized.
    const NEOTOMA_ENV_CASES: (string | undefined)[] = [
      undefined,
      "development",
      "production",
      "staging",
    ];
    const NODE_ENV_CASES: (string | undefined)[] = [undefined, "development", "production"];

    function expectedProduction(neotomaEnv: string | undefined, nodeEnv: string | undefined): boolean {
      if (neotomaEnv === "production") return true;
      if (neotomaEnv === "staging") return true; // unrecognized -> fail closed
      // neotomaEnv is undefined or "development": falls through to NODE_ENV
      return nodeEnv === "production";
    }

    for (const neotomaEnv of NEOTOMA_ENV_CASES) {
      for (const nodeEnv of NODE_ENV_CASES) {
        const expected = expectedProduction(neotomaEnv, nodeEnv);
        const label = `NEOTOMA_ENV=${neotomaEnv ?? "<unset>"}, NODE_ENV=${nodeEnv ?? "<unset>"} -> ${expected ? "production" : "non-production"}`;
        it(label, () => {
          const env: NodeJS.ProcessEnv = {};
          if (neotomaEnv !== undefined) env.NEOTOMA_ENV = neotomaEnv;
          if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
          expect(isProductionEnvironment(env)).toBe(expected);
        });
      }
    }

    it("an explicit NEOTOMA_ENV=development no longer overrides NODE_ENV=production", () => {
      // This is the reversal from the previous behavior: NEOTOMA_ENV=development
      // used to win unconditionally. It no longer does — either variable saying
      // production is now sufficient, per the fail-closed precedence rule.
      expect(
        isProductionEnvironment({ NEOTOMA_ENV: "development", NODE_ENV: "production" })
      ).toBe(true);
    });

    it("NEOTOMA_ENV=dev (short form) also falls through to NODE_ENV", () => {
      expect(isProductionEnvironment({ NEOTOMA_ENV: "dev", NODE_ENV: "production" })).toBe(true);
      expect(isProductionEnvironment({ NEOTOMA_ENV: "dev", NODE_ENV: "development" })).toBe(
        false
      );
    });

    it("NEOTOMA_ENV=test also falls through to NODE_ENV", () => {
      expect(isProductionEnvironment({ NEOTOMA_ENV: "test", NODE_ENV: "production" })).toBe(true);
      expect(isProductionEnvironment({ NEOTOMA_ENV: "test" })).toBe(false);
    });
  });

  describe("unrecognized NEOTOMA_ENV values resolve to production (fail closed)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("NEOTOMA_ENV=staging with NODE_ENV=production is production", () => {
      expect(isProductionEnvironment({ NEOTOMA_ENV: "staging", NODE_ENV: "production" })).toBe(
        true
      );
    });

    it("NEOTOMA_ENV=staging alone (no NODE_ENV) is production", () => {
      expect(isProductionEnvironment({ NEOTOMA_ENV: "staging" })).toBe(true);
    });

    it("NEOTOMA_ENV=staging with NODE_ENV=development is still production — unrecognized NEOTOMA_ENV does not fall through", () => {
      expect(isProductionEnvironment({ NEOTOMA_ENV: "staging", NODE_ENV: "development" })).toBe(
        true
      );
    });

    it("an unrecognized NEOTOMA_ENV (a typo) resolves to production, not development", () => {
      expect(isProductionEnvironment({ NEOTOMA_ENV: "produciton" })).toBe(true);
    });

    it("warns to stderr once, naming the unrecognized value and the recognized set", () => {
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      isProductionEnvironment({ NEOTOMA_ENV: "staging-unique-warn-test" });
      expect(writeSpy).toHaveBeenCalled();
      const message = writeSpy.mock.calls.map((call) => String(call[0])).join("");
      expect(message).toContain("staging-unique-warn-test");
      expect(message).toContain("development");
      expect(message).toContain("production");
    });
  });
});
