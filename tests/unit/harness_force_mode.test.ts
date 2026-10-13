import { afterEach, describe, expect, it } from "vitest";
import { resolveHarnessForceMode } from "../../src/shared/harness_force_mode.js";

/**
 * Effect: harnesses that bind loopback-only must still see LOCAL_DEV_USER_ID
 * for unauthenticated bookkeeping unless an explicit FORCE_MODE override is
 * set. Without the default "refuse" pin, the sandbox resolver activates
 * local_sandbox and CI lanes (eval_scenarios, graph_render_smoke) fail with
 * user_id mismatch / zero entities.
 */
describe("resolveHarnessForceMode", () => {
  const prev = process.env.NEOTOMA_FORCE_MODE;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.NEOTOMA_FORCE_MODE;
    } else {
      process.env.NEOTOMA_FORCE_MODE = prev;
    }
  });

  it("defaults to refuse when FORCE_MODE is unset (identity parity for loopback bind)", () => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.NEOTOMA_FORCE_MODE;
    expect(resolveHarnessForceMode(env)).toBe("refuse");
  });

  it("preserves an explicit FORCE_MODE override", () => {
    expect(resolveHarnessForceMode({ NEOTOMA_FORCE_MODE: "local_sandbox" })).toBe("local_sandbox");
  });
});
