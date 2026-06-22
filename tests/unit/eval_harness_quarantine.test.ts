/**
 * #1704 — eval-harness quarantine.
 *
 * A scenario carrying meta.quarantine must be SKIPPED (not failed) by the
 * runner, so the eval_scenarios CI lane stays green on a clean main while a
 * known-broken scenario is tracked + fixed. Guards against a regression that
 * silently drops the quarantine check (which would let CI go red on the three
 * quarantined scenarios — neotoma#1726).
 */
import { describe, expect, it } from "vitest";
import { runScenarios } from "../../packages/eval-harness/src/index.js";
import type { ScenarioFile } from "../../packages/eval-harness/src/types.js";

function quarantinedScenario(): ScenarioFile {
  return {
    meta: {
      id: "unit_quarantine_probe",
      description: "Quarantine unit probe — never runs.",
      quarantine: "test#0: deliberately quarantined for the unit test.",
    },
    user_prompt: "noop",
    host_tools: [],
    // A stub model whose cassette does not exist — if quarantine did NOT
    // short-circuit, this would surface as a skip (missing cassette) anyway,
    // but the reason must be the QUARANTINE reason, proving the branch ran.
    models: [{ provider: "stub", model: "replay-only" }],
    expected: [],
  };
}

describe("#1704 eval-harness quarantine", () => {
  it("skips a quarantined scenario (not failed) with a quarantine reason", async () => {
    const summary = await runScenarios({
      scenarios: [quarantinedScenario()],
      mode: "replay",
    });
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.passed).toBe(0);
    const cell = summary.cells[0];
    expect(cell.skipped?.reason.startsWith("quarantined:")).toBe(true);
    expect(cell.skipped?.reason).toContain("test#0");
  });
});
