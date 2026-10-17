import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parse } from "yaml";

it.each([
  ["eval_scenarios", "npm run eval:scenarios"],
  ["eval_combined", "npm run eval:combined"],
])("%s builds the real CLI dependency before replay", (lane, replayCommand) => {
  const workflow = parse(readFileSync(".github/workflows/ci_test_lanes.yml", "utf8"));
  const steps = workflow.jobs[lane].steps as Array<Record<string, unknown>>;
  const install = steps.findIndex((step) => step.run === "npm ci");
  const build = steps.findIndex((step) => step.run === "npm run build:server");
  const replay = steps.findIndex((step) => step.run === replayCommand);
  expect(install).toBeGreaterThanOrEqual(0);
  expect(build).toBeGreaterThan(install);
  expect(replay).toBeGreaterThan(build);
  expect(steps[build].if).toBeUndefined();
  expect(steps[build]["continue-on-error"]).not.toBe(true);
});
